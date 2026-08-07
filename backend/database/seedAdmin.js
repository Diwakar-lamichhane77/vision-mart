// database/seedAdmin.js
// One-off CLI script to create the first admin account, since there is
// deliberately no public POST /api/admin/register endpoint (you don't want
// strangers self-registering as admins).
//
// Usage:
//   node database/seedAdmin.js "Admin Name" admin@visionmart.com "StrongPass123"

require('dotenv').config();
const { pool } = require('../config/db');
const { hashPassword } = require('../utils/password');

async function seedAdmin() {
  const [, , name, email, password] = process.argv;

  if (!name || !email || !password) {
    console.error('Usage: node database/seedAdmin.js "Admin Name" admin@example.com "StrongPass123"');
    process.exit(1);
  }

  try {
    const [existingRows] = await pool.query('SELECT id FROM admins WHERE email = :email', { email });
    if (existingRows.length > 0) {
      console.error(`❌ An admin with email "${email}" already exists.`);
      process.exit(1);
    }

    const passwordHash = await hashPassword(password);

    await pool.query(
      'INSERT INTO admins (name, email, password, role) VALUES (:name, :email, :password, :role)',
      { name, email, password: passwordHash, role: 'super_admin' }
    );

    console.log(`✅ Admin account created: ${email}`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to seed admin:', error.message);
    process.exit(1);
  }
}

seedAdmin();
