const express = require('express');
const pool = require('../db/pool');
const { requireAdmin } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { isValidUuid } = require('../utils/helpers');

const router = express.Router();
router.use(requireAdmin);

const SENSITIVE_COLUMNS = new Set([
  'password',
  'password_hash',
  'sess',
  'sid',
  'secret',
  'token',
]);

function quoteIdent(name) {
  return `"${name}"`;
}

async function logAction(adminId, action, target, details) {
  await pool.query(
    'INSERT INTO audit_log (admin_id, action, target, details) VALUES ($1, $2, $3, $4)',
    [adminId, action, target || null, details ? JSON.stringify(details) : null]
  );
}

async function publicTables() {
  const { rows } = await pool.query(
    `SELECT t.table_name
     FROM information_schema.tables t
     WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
     ORDER BY t.table_name`
  );
  return rows.map((row) => row.table_name);
}

router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT
        (SELECT count(*)::int FROM users) AS users,
        (SELECT count(*)::int FROM users WHERE is_active = TRUE) AS active_users,
        (SELECT count(*)::int FROM messages) AS messages,
        (SELECT count(*)::int FROM messages WHERE conversation_id IS NULL) AS global_messages,
        (SELECT count(*)::int FROM messages WHERE conversation_id IS NOT NULL) AS direct_messages,
        (SELECT count(*)::int FROM messages WHERE deleted_at IS NOT NULL) AS deleted_messages,
        (SELECT count(*)::int FROM messages WHERE created_at > now() - interval '1 day') AS messages_today,
        (SELECT count(*)::int FROM conversations) AS conversations,
        (SELECT count(*)::int FROM sessions WHERE expire > now()) AS active_sessions`
    );
    res.json({ stats: rows[0] });
  })
);

router.get(
  '/users',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.display_name, u.role, u.is_active, u.last_seen, u.created_at,
              (SELECT count(*)::int FROM messages m WHERE m.user_id = u.id) AS message_count
       FROM users u
       ORDER BY u.created_at DESC LIMIT 200`
    );
    res.json({ users: rows });
  })
);

router.get(
  '/messages',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number.parseInt(req.query.limit, 10) || 50, 100);
    const { rows } = await pool.query(
      `SELECT m.id, m.body, m.created_at, m.deleted_at, m.conversation_id,
              u.display_name AS author, u.email AS author_email,
              CASE WHEN m.conversation_id IS NULL THEN 'general' ELSE 'direct' END AS channel
       FROM messages m JOIN users u ON u.id = m.user_id
       ORDER BY m.id DESC LIMIT $1`,
      [limit]
    );
    res.json({ messages: rows });
  })
);

router.get(
  '/audit',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT a.id, a.action, a.target, a.details, a.created_at, u.display_name AS admin
       FROM audit_log a JOIN users u ON u.id = a.admin_id
       ORDER BY a.id DESC LIMIT 100`
    );
    res.json({ entries: rows });
  })
);

router.delete(
  '/messages/:id',
  asyncHandler(async (req, res) => {
    if (!isValidUuid(req.params.id) && !/^\d+$/.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid message id.' });
    }
    const { rows } = await pool.query(
      `UPDATE messages SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Message not found or already deleted.' });

    await logAction(req.session.user.id, 'delete_message', `message ${req.params.id}`, {
      reason: 'Admin moderation',
    });
    res.json({ ok: true });
  })
);

router.patch(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!isValidUuid(id)) return res.status(400).json({ error: 'Invalid user id.' });
    if (id === req.session.user.id) {
      return res.status(400).json({ error: 'You cannot change your own account status.' });
    }
    if (typeof (req.body || {}).isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive must be a boolean.' });
    }

    const { rows } = await pool.query(
      `UPDATE users SET is_active = $2 WHERE id = $1 RETURNING id, email, is_active`,
      [id, req.body.isActive]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found.' });

    await logAction(req.session.user.id, req.body.isActive ? 'enable_user' : 'disable_user', rows[0].email);
    res.json({ user: rows[0] });
  })
);

router.get(
  '/tables',
  asyncHandler(async (req, res) => {
    const names = await publicTables();
    const tables = [];

    for (const name of names) {
      const { rows } = await pool.query(
        `SELECT count(*)::int AS count FROM ${quoteIdent(name)}`
      );
      tables.push({ name, rowCount: rows[0].count });
    }

    res.json({ tables });
  })
);

router.get(
  '/tables/:name/rows',
  asyncHandler(async (req, res) => {
    const name = req.params.name;
    const names = await publicTables();
    if (!names.includes(name)) return res.status(404).json({ error: 'Table not found.' });

    const limit = Math.min(Number.parseInt(req.query.limit, 10) || 25, 100);
    const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);

    const columnsResult = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
      [name]
    );
    const columns = columnsResult.rows.map((row) => row.column_name);
    if (!columns.length) return res.json({ columns: [], rows: [], total: 0, limit, offset });

    const pkResult = await pool.query(
      `SELECT a.attname AS name
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
       WHERE i.indrelid = $1::regclass AND i.indisprimary`,
      [`public.${quoteIdent(name)}`]
    );
    const orderColumns = pkResult.rows.length
      ? pkResult.rows.map((row) => quoteIdent(row.name))
      : columns.slice(0, 1).map(quoteIdent);

    const [totalResult, rowsResult] = await Promise.all([
      pool.query(`SELECT count(*)::int AS count FROM ${quoteIdent(name)}`),
      pool.query(
        `SELECT ${columns.map(quoteIdent).join(', ')} FROM ${quoteIdent(name)}
         ORDER BY ${orderColumns.join(', ')} LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
    ]);

    const rows = rowsResult.rows.map((row) => {
      const safe = {};
      for (const column of columns) {
        safe[column] = SENSITIVE_COLUMNS.has(column.toLowerCase())
          ? '[redacted]'
          : row[column] instanceof Date
            ? row[column].toISOString()
            : row[column];
      }
      return safe;
    });

    res.json({ columns, rows, total: totalResult.rows[0].count, limit, offset });
  })
);

module.exports = router;
