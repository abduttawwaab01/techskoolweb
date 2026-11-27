const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { isValidUuid, cleanText } = require('../utils/helpers');

const router = express.Router();
router.use(requireAuth);

function parseAfter(value) {
  const n = Number.parseInt(value, 10);
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
}

function parseLimit(value, fallback, max) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : fallback;
}

async function fetchMessages({ conversationId = null, after = 0, limit = 50, userId }) {
  const select = `SELECT m.id, m.body, m.created_at, m.edited_at, m.user_id, u.display_name, u.role`;
  let sql;
  let params;

  if (after > 0) {
    sql = `${select}
      FROM messages m
      JOIN users u ON u.id = m.user_id
      WHERE m.conversation_id IS NOT DISTINCT FROM $1
        AND m.deleted_at IS NULL AND m.id > $2
      ORDER BY m.id ASC LIMIT $3`;
    params = [conversationId, after, limit];
  } else {
    sql = `${select}
      FROM (
        SELECT * FROM messages
        WHERE conversation_id IS NOT DISTINCT FROM $1 AND deleted_at IS NULL
        ORDER BY id DESC LIMIT $2
      ) m
      JOIN users u ON u.id = m.user_id
      ORDER BY m.id ASC`;
    params = [conversationId, limit];
  }

  const { rows } = await pool.query(sql, params);
  return rows.map((row) => ({
    id: String(row.id),
    body: row.body,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    mine: row.user_id === userId,
    author: { id: row.user_id, displayName: row.display_name, role: row.role },
  }));
}

async function getConversation(id, userId) {
  if (!isValidUuid(id)) return null;
  const { rows } = await pool.query(
    `SELECT c.id, u.id AS "otherId", u.display_name AS "otherName", u.is_active AS "otherActive"
     FROM conversations c
     JOIN users u ON u.id = CASE WHEN c.user_low = $2 THEN c.user_high ELSE c.user_low END
     WHERE c.id = $1 AND (c.user_low = $2 OR c.user_high = $2)`,
    [id, userId]
  );
  return rows[0] || null;
}

router.get(
  '/messages',
  asyncHandler(async (req, res) => {
    const messages = await fetchMessages({
      after: parseAfter(req.query.after),
      limit: parseLimit(req.query.limit, 50, 100),
      userId: req.session.user.id,
    });
    res.json({ messages });
  })
);

router.post(
  '/messages',
  asyncHandler(async (req, res) => {
    const body = cleanText((req.body || {}).body, 2000);
    if (!body) return res.status(400).json({ error: 'Message cannot be empty.' });

    const { rows } = await pool.query(
      `INSERT INTO messages (user_id, conversation_id, body)
       VALUES ($1, NULL, $2)
       RETURNING id, body, created_at`,
      [req.session.user.id, body]
    );
    res.status(201).json({
      message: {
        id: String(rows[0].id),
        body: rows[0].body,
        createdAt: rows[0].created_at,
        mine: true,
        author: {
          id: req.session.user.id,
          displayName: req.session.user.displayName,
          role: req.session.user.role,
        },
      },
    });
  })
);

router.get(
  '/users',
  asyncHandler(async (req, res) => {
    const q = cleanText(req.query.q, 60) || '%';
    const { rows } = await pool.query(
      `SELECT id, display_name, role, last_seen
       FROM users
       WHERE id <> $1 AND is_active = TRUE AND display_name ILIKE $2
       ORDER BY display_name ASC LIMIT 200`,
      [req.session.user.id, `%${q}%`]
    );
    res.json({
      users: rows.map((row) => ({
        id: row.id,
        displayName: row.display_name,
        role: row.role,
        lastSeen: row.last_seen,
      })),
    });
  })
);

router.get(
  '/conversations',
  asyncHandler(async (req, res) => {
    const me = req.session.user.id;
    const { rows } = await pool.query(
      `SELECT c.id, u.id AS "otherId", u.display_name AS "otherName",
              last.body AS "lastBody", last.created_at AS "lastAt"
       FROM conversations c
       JOIN users u ON u.id = CASE WHEN c.user_low = $1 THEN c.user_high ELSE c.user_low END
       LEFT JOIN LATERAL (
         SELECT body, created_at FROM messages m
         WHERE m.conversation_id = c.id AND m.deleted_at IS NULL
         ORDER BY m.id DESC LIMIT 1
       ) last ON TRUE
       WHERE c.user_low = $1 OR c.user_high = $1
       ORDER BY last.created_at DESC NULLS LAST, c.created_at DESC`,
      [me]
    );
    res.json({
      conversations: rows.map((row) => ({
        id: row.id,
        otherId: row.otherId,
        otherName: row.otherName,
        lastBody: row.lastBody,
        lastAt: row.lastAt,
      })),
    });
  })
);

router.post(
  '/conversations',
  asyncHandler(async (req, res) => {
    const otherId = (req.body || {}).userId;
    const me = req.session.user.id;

    if (!isValidUuid(otherId)) return res.status(400).json({ error: 'Invalid user.' });
    if (otherId === me) return res.status(400).json({ error: 'You cannot message yourself.' });

    const other = await pool.query(
      'SELECT id FROM users WHERE id = $1 AND is_active = TRUE',
      [otherId]
    );
    if (!other.rowCount) return res.status(404).json({ error: 'User not found.' });

    const [low, high] = [me, otherId].sort();
    await pool.query(
      `INSERT INTO conversations (user_low, user_high) VALUES ($1, $2)
       ON CONFLICT (user_low, user_high) DO NOTHING`,
      [low, high]
    );

    const found = await pool.query(
      `SELECT id FROM conversations WHERE user_low = $1 AND user_high = $2`,
      [low, high]
    );
    const conversation = await getConversation(found.rows[0].id, me);
    res.status(201).json({ conversation });
  })
);

router.get(
  '/conversations/:id/messages',
  asyncHandler(async (req, res) => {
    const conversation = await getConversation(req.params.id, req.session.user.id);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });

    const messages = await fetchMessages({
      conversationId: conversation.id,
      after: parseAfter(req.query.after),
      limit: parseLimit(req.query.limit, 50, 100),
      userId: req.session.user.id,
    });
    res.json({ conversation, messages });
  })
);

router.post(
  '/conversations/:id/messages',
  asyncHandler(async (req, res) => {
    const conversation = await getConversation(req.params.id, req.session.user.id);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });

    const body = cleanText((req.body || {}).body, 2000);
    if (!body) return res.status(400).json({ error: 'Message cannot be empty.' });

    const { rows } = await pool.query(
      `INSERT INTO messages (user_id, conversation_id, body)
       VALUES ($1, $2, $3)
       RETURNING id, body, created_at`,
      [req.session.user.id, conversation.id, body]
    );
    res.status(201).json({
      message: {
        id: String(rows[0].id),
        body: rows[0].body,
        createdAt: rows[0].created_at,
        mine: true,
        author: {
          id: req.session.user.id,
          displayName: req.session.user.displayName,
          role: req.session.user.role,
        },
      },
    });
  })
);

module.exports = router;
