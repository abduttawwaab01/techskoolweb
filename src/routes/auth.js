const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { normalizeEmail, validateSignup } = require('../utils/helpers');

const router = express.Router();

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    role: user.role,
  };
}

router.post(
  '/signup',
  asyncHandler(async (req, res) => {
    const { displayName, email, password } = req.body || {};
    const parsed = validateSignup({
      displayName,
      email,
      password,
      confirmPassword: (req.body || {}).confirmPassword,
    });
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    const { displayName: name, email: mail } = parsed.value;
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [mail]);
    if (existing.rowCount) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }

    const passwordHash = await bcrypt.hash(parsed.value.password, 12);
    const { rows } = await pool.query(
      `INSERT INTO users (email, display_name, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, email, display_name, role, created_at`,
      [mail, name, passwordHash]
    );

    const user = publicUser(rows[0]);
    req.session.user = user;
    res.status(201).json({ user });
  })
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const email = normalizeEmail((req.body || {}).email);
    const password = (req.body || {}).password;

    if (!email || typeof password !== 'string' || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const { rows } = await pool.query(
      'SELECT id, email, display_name, password_hash, role, is_active FROM users WHERE email = $1',
      [email]
    );
    const found = rows[0];
    const valid = found && (await bcrypt.compare(password, found.password_hash));

    if (!valid) return res.status(401).json({ error: 'Invalid email or password.' });
    if (!found.is_active) return res.status(403).json({ error: 'This account has been disabled.' });

    await new Promise((resolve, reject) => {
      req.session.regenerate((err) => (err ? reject(err) : resolve()));
    });

    req.session.user = publicUser(found);
    res.json({ user: req.session.user });
  })
);

router.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('techskool.sid');
    res.json({ ok: true });
  });
});

router.get('/me', (req, res) => {
  res.json({ user: req.session && req.session.user ? req.session.user : null });
});

module.exports = router;
