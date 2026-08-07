// models/adminModel.js
// Data-access layer for the `admins` table.
// Note: there is deliberately no public "register admin" endpoint —
// admin accounts are provisioned via the database seed script, by a
// super_admin directly in MySQL. See database/seedAdmin.js.

const { pool } = require('../config/db');

const PUBLIC_FIELDS = 'id, name, email, role, status, created_at, updated_at';

/**
 * findByEmail
 * Returns the full row (including password hash) — used only for login.
 */
async function findByEmail(email) {
  const [rows] = await pool.query('SELECT * FROM admins WHERE email = :email LIMIT 1', { email });
  return rows[0] || null;
}

/**
 * findById
 * Returns the public-safe profile fields only (no password hash).
 */
async function findById(id) {
  const [rows] = await pool.query(
    `SELECT ${PUBLIC_FIELDS} FROM admins WHERE id = :id LIMIT 1`,
    { id }
  );
  return rows[0] || null;
}

module.exports = { findByEmail, findById };
