const pool = require('../db/pool');

function currentUser(req) {
  return req.session && req.session.user ? req.session.user : null;
}

function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Please log in to continue.' });

  // Throttle last_seen writes so polling doesn't hit the database every 2 seconds.
  const now = Date.now();
  if (!user.lastSeenAt || now - user.lastSeenAt > 60000) {
    req.session.user.lastSeenAt = now;
    pool.query('UPDATE users SET last_seen = now() WHERE id = $1', [user.id]).catch((err) => {
      console.error('Could not update last_seen:', err.message);
    });
  }

  next();
}

function requireAdmin(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Please log in to continue.' });
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
  next();
}

function redirectIfLoggedOut(req, res, next) {
  if (!currentUser(req)) return res.redirect('/login');
  next();
}

function redirectIfLoggedIn(req, res, next) {
  if (currentUser(req)) return res.redirect('/');
  next();
}

function redirectIfNotAdmin(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.redirect('/login');
  if (user.role !== 'admin') return res.redirect('/');
  next();
}

module.exports = {
  currentUser,
  requireAuth,
  requireAdmin,
  redirectIfLoggedOut,
  redirectIfLoggedIn,
  redirectIfNotAdmin,
};
