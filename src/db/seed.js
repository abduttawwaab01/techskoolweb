require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./pool');

async function seed() {
  const email = (process.env.ADMIN_EMAIL || 'admin@techskool.com').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'techskool123';
  const displayName = process.env.ADMIN_DISPLAY_NAME || 'Techskool Admin';
  const passwordHash = await bcrypt.hash(password, 12);

  const { rows } = await pool.query(
    `INSERT INTO users (email, display_name, password_hash, role, is_active)
     VALUES ($1, $2, $3, 'admin', TRUE)
     ON CONFLICT (email) DO UPDATE
       SET display_name = EXCLUDED.display_name,
           password_hash = EXCLUDED.password_hash,
           role = 'admin',
           is_active = TRUE
     RETURNING id, email, display_name, role`,
    [email, displayName, passwordHash]
  );

  console.log('Admin account ready:', rows[0]);
}

seed()
  .catch((err) => {
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
