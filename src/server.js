require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const rateLimit = require('express-rate-limit');

const pool = require('./db/pool');
const {
  redirectIfLoggedOut,
  redirectIfLoggedIn,
  redirectIfNotAdmin,
} = require('./middleware/auth');

const app = express();
const publicDir = path.join(__dirname, '..', 'public');

app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: false, limit: '32kb' }));

const store = new PgSession({
  pool,
  tableName: 'sessions',
  createTableIfMissing: false,
  pruneSessionInterval: 15 * 60,
});

app.use(
  session({
    name: 'techskool.sid',
    secret: process.env.SESSION_SECRET || 'techskool-development-secret-change-me',
    store,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

app.use(express.static(publicDir, { index: false }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in a few minutes.' },
});
app.use('/api/auth', authLimiter);

app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/chat'));
app.use('/api/admin', require('./routes/admin'));

const pages = {
  '/': 'index.html',
  '/login': 'login.html',
  '/signup': 'signup.html',
  '/admin': 'admin.html',
};

app.get('/', redirectIfLoggedOut, (req, res) => res.sendFile(path.join(publicDir, pages['/'])));
app.get('/login', redirectIfLoggedIn, (req, res) => res.sendFile(path.join(publicDir, pages['/login'])));
app.get('/signup', redirectIfLoggedIn, (req, res) => res.sendFile(path.join(publicDir, pages['/signup'])));
app.get('/admin', redirectIfNotAdmin, (req, res) => res.sendFile(path.join(publicDir, pages['/admin'])));

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Endpoint not found.' });
  res.status(404).sendFile(path.join(publicDir, '404.html'));
});

app.use((err, req, res, next) => {
  console.error('Request error:', err);
  if (res.headersSent) return next(err);
  const status = Number.isInteger(err.status) ? err.status : 500;
  res.status(status).json({
    error: status === 500 ? 'Something went wrong on the server. Please try again.' : err.message,
  });
});

async function start() {
  try {
    await pool.query('SELECT 1');
    const port = Number.parseInt(process.env.PORT, 10) || 3000;
    app.listen(port, () => {
      console.log(`Techskool Chat is running at http://localhost:${port}`);
    });
  } catch (err) {
    console.error('Could not connect to the database:', err.message);
    process.exit(1);
  }
}

start();
