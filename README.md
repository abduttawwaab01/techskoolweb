# Techskool Chat

A small full-stack chat app built with Node.js, Express, vanilla HTML/CSS/JS and Neon PostgreSQL.

## Features

- Email signup and login with bcrypt-hashed passwords and database-backed sessions
- Log out
- Global chat room plus private one-to-one direct messages
- Live updates via polling (every 2.5 seconds)
- Admin-only console at `/admin` with:
  - platform statistics
  - user management (disable / enable accounts)
  - message moderation (soft delete)
  - audit log of admin actions
  - a viewer for every table in the Neon `public` schema, with paginated rows and sensitive columns redacted

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env` from `.env.example` and set your Neon `DATABASE_URL`, a long random `SESSION_SECRET`, and admin credentials.

3. Apply the schema and create the admin account:

   ```bash
   npm run db:setup
   ```

4. Start the server:

   ```bash
   npm start
   ```

   Then open <http://localhost:3000>.

Admin login: `admin@techskool.com` / `techskool123` (configurable through `ADMIN_EMAIL` and `ADMIN_PASSWORD`).

## Database tables

| Table | Purpose |
| --- | --- |
| `users` | Accounts, roles and status |
| `conversations` | Canonical pairs of users for DMs |
| `messages` | Global and direct messages with soft-delete support |
| `sessions` | Express session store |
| `audit_log` | Admin action history |

## Scripts

- `npm start` — run the server
- `npm run dev` — run with auto-restart on file changes
- `npm run db:migrate` — apply `db/schema.sql` to Neon
- `npm run db:seed` — create/update the admin account
- `npm run db:setup` — migrate then seed

## Security notes

- The connection string and admin password live only in `.env`, which is git-ignored.
- Passwords are stored as bcrypt hashes; session cookies are httpOnly and same-site.
- Login and signup are rate limited, and admin endpoints are protected server-side.
- Rotate any database credential that has been shared publicly.
