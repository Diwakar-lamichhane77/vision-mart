// models/categoryModel.js
// Data-access layer for the `categories` table.
// All queries use named placeholders — no string concatenation of user input.

const { pool } = require('../config/db');

/**
 * findAll
 * Returns all categories, newest first, each with a live count of how many
 * active products reference it (useful for the storefront and admin UI).
 * @param {{ status?: string }} filters
 */
async function findAll({ status } = {}) {
  const [rows] = await pool.query(
    `SELECT c.id, c.name, c.slug, c.description, c.image, c.status,
            c.created_at, c.updated_at,
            COUNT(p.id) AS products_count
     FROM categories c
     LEFT JOIN products p ON p.category_id = c.id AND p.status = 'active'
     WHERE (:status IS NULL OR c.status = :status)
     GROUP BY c.id
     ORDER BY c.created_at DESC`,
    { status: status || null }
  );
  return rows;
}

/**
 * findById
 */
async function findById(id) {
  const [rows] = await pool.query(
    `SELECT c.id, c.name, c.slug, c.description, c.image, c.status,
            c.created_at, c.updated_at,
            COUNT(p.id) AS products_count
     FROM categories c
     LEFT JOIN products p ON p.category_id = c.id AND p.status = 'active'
     WHERE c.id = :id
     GROUP BY c.id
     LIMIT 1`,
    { id }
  );
  return rows[0] || null;
}

/**
 * findByName
 * Used to enforce the unique-name rule with a friendly error message
 * instead of leaking a raw MySQL duplicate-key error.
 * @param {string} name
 * @param {number|null} excludeId - ignore this row (used when updating)
 */
async function findByName(name, excludeId = null) {
  const [rows] = await pool.query(
    `SELECT id FROM categories
     WHERE name = :name AND (:excludeId IS NULL OR id != :excludeId)
     LIMIT 1`,
    { name, excludeId }
  );
  return rows[0] || null;
}

/**
 * findBySlug
 * Same idea as findByName, but for the unique slug column.
 */
async function findBySlug(slug, excludeId = null) {
  const [rows] = await pool.query(
    `SELECT id FROM categories
     WHERE slug = :slug AND (:excludeId IS NULL OR id != :excludeId)
     LIMIT 1`,
    { slug, excludeId }
  );
  return rows[0] || null;
}

/**
 * create
 * @returns {Promise<number>} insertId
 */
async function create({ name, slug, description = null, image = null, status = 'active' }) {
  const [result] = await pool.query(
    `INSERT INTO categories (name, slug, description, image, status)
     VALUES (:name, :slug, :description, :image, :status)`,
    { name, slug, description, image, status }
  );
  return result.insertId;
}

/**
 * update
 * Partial update — COALESCE leaves a column untouched when the value is null,
 * so callers only need to send the fields that actually changed.
 */
async function update(id, { name, slug, description, image, status }) {
  await pool.query(
    `UPDATE categories SET
       name = COALESCE(:name, name),
       slug = COALESCE(:slug, slug),
       description = COALESCE(:description, description),
       image = COALESCE(:image, image),
       status = COALESCE(:status, status)
     WHERE id = :id`,
    {
      id,
      name: name ?? null,
      slug: slug ?? null,
      description: description ?? null,
      image: image ?? null,
      status: status ?? null
    }
  );
  return findById(id);
}

/**
 * remove
 * Note: `products.category_id` is ON DELETE RESTRICT, so MySQL refuses to
 * delete a category that still has products. countProducts() below lets the
 * controller return a clear 400 instead of a raw FK error.
 */
async function remove(id) {
  const [result] = await pool.query('DELETE FROM categories WHERE id = :id', { id });
  return result.affectedRows > 0;
}

/**
 * countProducts
 * Counts ALL products in a category (any status), since even an inactive
 * product still holds a foreign-key reference.
 */
async function countProducts(id) {
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS total FROM products WHERE category_id = :id',
    { id }
  );
  return Number(rows[0].total);
}

module.exports = {
  findAll,
  findById,
  findByName,
  findBySlug,
  create,
  update,
  remove,
  countProducts
};
