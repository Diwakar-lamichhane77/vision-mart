// models/contactModel.js
// Data-access layer for `contact_messages` — the storefront's contact form.

const { pool } = require('../config/db');

const MESSAGE_STATUSES = ['unread', 'read', 'replied'];

/**
 * create
 * @returns {Promise<number>} insertId
 */
async function create({ name, email, subject, message }) {
  const [result] = await pool.query(
    `INSERT INTO contact_messages (name, email, subject, message)
     VALUES (:name, :email, :subject, :message)`,
    { name, email, subject: subject || null, message }
  );
  return result.insertId;
}

/**
 * findAll
 * Admin inbox, newest first.
 */
async function findAll({ status = null, search = null, limit = 50, offset = 0 } = {}) {
  const conditions = [];
  const params = { status: null, search: null };

  if (status) {
    conditions.push('status = :status');
    params.status = status;
  }
  if (search) {
    conditions.push('(name LIKE :search OR email LIKE :search OR subject LIKE :search OR message LIKE :search)');
    params.search = `%${search}%`;
  }

  const clause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const safeLimit = Math.max(1, Number.parseInt(limit, 10) || 50);
  const safeOffset = Math.max(0, Number.parseInt(offset, 10) || 0);

  const [rows] = await pool.query(
    `SELECT * FROM contact_messages ${clause}
     ORDER BY created_at DESC
     LIMIT ${safeLimit} OFFSET ${safeOffset}`,
    params
  );
  return rows;
}

/**
 * countAll
 */
async function countAll({ status = null, search = null } = {}) {
  const conditions = [];
  const params = { status: null, search: null };

  if (status) {
    conditions.push('status = :status');
    params.status = status;
  }
  if (search) {
    conditions.push('(name LIKE :search OR email LIKE :search OR subject LIKE :search OR message LIKE :search)');
    params.search = `%${search}%`;
  }

  const clause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await pool.query(`SELECT COUNT(*) AS total FROM contact_messages ${clause}`, params);
  return Number(rows[0].total);
}

/**
 * findById
 */
async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM contact_messages WHERE id = :id LIMIT 1', { id });
  return rows[0] || null;
}

/**
 * updateStatus
 */
async function updateStatus(id, status) {
  const [result] = await pool.query(
    'UPDATE contact_messages SET status = :status WHERE id = :id',
    { id, status }
  );
  return result.affectedRows > 0;
}

/**
 * remove
 */
async function remove(id) {
  const [result] = await pool.query('DELETE FROM contact_messages WHERE id = :id', { id });
  return result.affectedRows > 0;
}

/**
 * countUnread
 */
async function countUnread() {
  const [rows] = await pool.query("SELECT COUNT(*) AS total FROM contact_messages WHERE status = 'unread'");
  return Number(rows[0].total);
}

module.exports = {
  MESSAGE_STATUSES,
  create,
  findAll,
  countAll,
  findById,
  updateStatus,
  remove,
  countUnread
};
