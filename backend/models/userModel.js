// models/userModel.js
// Data-access layer for the `users` table. All queries use parameterized
// placeholders (never string concatenation) to prevent SQL injection.

const { pool } = require('../config/db');

const PUBLIC_FIELDS =
  'id, name, email, phone, address, city, status, created_at, updated_at';

/**
 * create
 * Inserts a new customer row.
 * @returns {Promise<number>} insertId
 */
async function create({ name, email, password, phone = null, address = null }) {
  const [result] = await pool.query(
    'INSERT INTO users (name, email, password, phone, address) VALUES (:name, :email, :password, :phone, :address)',
    { name, email, password, phone, address }
  );
  return result.insertId;
}

/**
 * findByEmail
 * Returns the full row (including password hash) — used only for login,
 * where we need the hash to compare against.
 */
async function findByEmail(email) {
  const [rows] = await pool.query('SELECT * FROM users WHERE email = :email LIMIT 1', { email });
  return rows[0] || null;
}

/**
 * findById
 * Returns the public-safe profile fields only (no password hash).
 */
async function findById(id) {
  const [rows] = await pool.query(
    `SELECT ${PUBLIC_FIELDS} FROM users WHERE id = :id LIMIT 1`,
    { id }
  );
  return rows[0] || null;
}

/**
 * updateProfile
 * Partial update — only fields that are provided (non-undefined) are changed.
 */
async function updateProfile(id, { name, phone, address, city }) {
  await pool.query(
    `UPDATE users SET
       name = COALESCE(:name, name),
       phone = COALESCE(:phone, phone),
       address = COALESCE(:address, address),
       city = COALESCE(:city, city)
     WHERE id = :id`,
    { id, name, phone, address, city }
  );
  return findById(id);
}

/**
 * updatePassword
 * @param {number} id
 * @param {string} newHash - already-hashed password
 */
async function updatePassword(id, newHash) {
  await pool.query('UPDATE users SET password = :password WHERE id = :id', {
    id,
    password: newHash
  });
}

/**
 * findAllForAdmin
 * Customer list for the admin panel, with per-customer order stats.
 * Cancelled orders are excluded from the spend figures, consistent with
 * every other revenue number in the system.
 */
async function findAllForAdmin({ search = null, status = null, limit = 100, offset = 0 } = {}) {
  const conditions = [];
  const params = { search: null, status: null };

  if (search) {
    conditions.push('(u.name LIKE :search OR u.email LIKE :search OR u.phone LIKE :search)');
    params.search = `%${search}%`;
  }
  if (status) {
    conditions.push('u.status = :status');
    params.status = status;
  }

  const clause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const safeLimit = Math.max(1, Number.parseInt(limit, 10) || 100);
  const safeOffset = Math.max(0, Number.parseInt(offset, 10) || 0);

  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.email, u.phone, u.address, u.city, u.status,
            u.created_at, u.updated_at,
            COUNT(DISTINCT o.id) AS order_count,
            COALESCE(SUM(o.total_amount), 0) AS total_spent,
            MAX(o.created_at) AS last_order_at
     FROM users u
     LEFT JOIN orders o ON o.user_id = u.id AND o.status != 'Cancelled'
     ${clause}
     GROUP BY u.id
     ORDER BY u.created_at DESC
     LIMIT ${safeLimit} OFFSET ${safeOffset}`,
    params
  );
  return rows;
}

/**
 * countForAdmin
 */
async function countForAdmin({ search = null, status = null } = {}) {
  const conditions = [];
  const params = { search: null, status: null };

  if (search) {
    conditions.push('(name LIKE :search OR email LIKE :search OR phone LIKE :search)');
    params.search = `%${search}%`;
  }
  if (status) {
    conditions.push('status = :status');
    params.status = status;
  }

  const clause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await pool.query(`SELECT COUNT(*) AS total FROM users ${clause}`, params);
  return Number(rows[0].total);
}

/**
 * updateStatus
 * Blocks or unblocks a customer account. A blocked user's token is rejected
 * by requireCustomerAuth on their next request.
 */
async function updateStatus(id, status) {
  const [result] = await pool.query('UPDATE users SET status = :status WHERE id = :id', {
    id,
    status
  });
  return result.affectedRows > 0;
}

module.exports = {
  create,
  findByEmail,
  findById,
  updateProfile,
  updatePassword,
  findAllForAdmin,
  countForAdmin,
  updateStatus
};
