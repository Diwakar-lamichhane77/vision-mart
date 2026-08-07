// models/reviewModel.js
// Data-access layer for the `reviews` table.
//
// The schema enforces UNIQUE(user_id, product_id) — one review per customer
// per product. Editing an existing review is a PUT, not a second POST.

const { pool } = require('../config/db');

/**
 * findByProductId
 * Reviews for one product, newest first.
 * `verified_purchase` is computed by checking whether the reviewer actually
 * has a delivered order containing this product — a useful trust signal
 * that costs nothing extra here since it's a correlated subquery.
 */
async function findByProductId(productId, { limit = null, offset = 0 } = {}) {
  const safeLimit = limit ? Math.max(1, Number.parseInt(limit, 10)) : null;
  const safeOffset = Math.max(0, Number.parseInt(offset, 10) || 0);
  const limitClause = safeLimit ? `LIMIT ${safeLimit} OFFSET ${safeOffset}` : '';

  const [rows] = await pool.query(
    `SELECT r.id, r.rating, r.comment, r.created_at, r.updated_at,
            u.id AS user_id, u.name AS user_name,
            EXISTS(
              SELECT 1 FROM order_items oi
              JOIN orders o ON o.id = oi.order_id
              WHERE oi.product_id = r.product_id
                AND o.user_id = r.user_id
                AND o.status = 'Delivered'
            ) AS verified_purchase
     FROM reviews r
     JOIN users u ON u.id = r.user_id
     WHERE r.product_id = :productId
     ORDER BY r.created_at DESC
     ${limitClause}`,
    { productId }
  );
  return rows;
}

/**
 * findById
 */
async function findById(id) {
  const [rows] = await pool.query(
    `SELECT r.*, u.name AS user_name, p.name AS product_name
     FROM reviews r
     JOIN users u ON u.id = r.user_id
     JOIN products p ON p.id = r.product_id
     WHERE r.id = :id
     LIMIT 1`,
    { id }
  );
  return rows[0] || null;
}

/**
 * findByUserAndProduct
 * Used to detect a duplicate review before hitting the UNIQUE constraint,
 * so the customer gets a helpful message instead of a raw key error.
 */
async function findByUserAndProduct(userId, productId) {
  const [rows] = await pool.query(
    'SELECT * FROM reviews WHERE user_id = :userId AND product_id = :productId LIMIT 1',
    { userId, productId }
  );
  return rows[0] || null;
}

/**
 * findByUserId
 * Every review a customer has written (for a "my reviews" page).
 */
async function findByUserId(userId) {
  const [rows] = await pool.query(
    `SELECT r.id, r.rating, r.comment, r.created_at, r.updated_at,
            p.id AS product_id, p.name AS product_name, p.image AS product_image
     FROM reviews r
     JOIN products p ON p.id = r.product_id
     WHERE r.user_id = :userId
     ORDER BY r.created_at DESC`,
    { userId }
  );
  return rows;
}

/**
 * hasPurchased
 * True when the customer has a DELIVERED order containing this product.
 * Used both for the verified badge and (optionally) to gate reviewing —
 * see REVIEWS_REQUIRE_PURCHASE in the controller.
 */
async function hasPurchased(userId, productId) {
  const [rows] = await pool.query(
    `SELECT 1
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.user_id = :userId
       AND oi.product_id = :productId
       AND o.status = 'Delivered'
     LIMIT 1`,
    { userId, productId }
  );
  return rows.length > 0;
}

/**
 * create
 * @returns {Promise<number>} insertId
 */
async function create({ userId, productId, rating, comment }) {
  const [result] = await pool.query(
    `INSERT INTO reviews (user_id, product_id, rating, comment)
     VALUES (:userId, :productId, :rating, :comment)`,
    { userId, productId, rating, comment: comment || null }
  );
  return result.insertId;
}

/**
 * update
 * Partial: omitted fields keep their current value.
 */
async function update(id, { rating, comment }) {
  await pool.query(
    `UPDATE reviews SET
       rating = COALESCE(:rating, rating),
       comment = COALESCE(:comment, comment)
     WHERE id = :id`,
    { id, rating: rating ?? null, comment: comment ?? null }
  );
  return findById(id);
}

/**
 * remove
 */
async function remove(id) {
  const [result] = await pool.query('DELETE FROM reviews WHERE id = :id', { id });
  return result.affectedRows > 0;
}

/**
 * getProductRatingSummary
 * Average rating plus a 1–5 star breakdown, so a product page can render the
 * familiar rating-distribution bars without pulling every review.
 */
async function getProductRatingSummary(productId) {
  const [rows] = await pool.query(
    `SELECT
       COUNT(*) AS total,
       COALESCE(AVG(rating), 0) AS average,
       SUM(rating = 5) AS five_star,
       SUM(rating = 4) AS four_star,
       SUM(rating = 3) AS three_star,
       SUM(rating = 2) AS two_star,
       SUM(rating = 1) AS one_star
     FROM reviews
     WHERE product_id = :productId`,
    { productId }
  );

  const row = rows[0];
  return {
    total: Number(row.total),
    average: Number(Number(row.average || 0).toFixed(2)),
    breakdown: {
      5: Number(row.five_star || 0),
      4: Number(row.four_star || 0),
      3: Number(row.three_star || 0),
      2: Number(row.two_star || 0),
      1: Number(row.one_star || 0)
    }
  };
}

/**
 * findAll
 * Admin moderation view across every product.
 */
async function findAll({ productId, rating, limit = 50, offset = 0 } = {}) {
  const conditions = [];
  const params = {};

  if (productId) {
    conditions.push('r.product_id = :productId');
    params.productId = productId;
  }
  if (rating) {
    conditions.push('r.rating = :rating');
    params.rating = rating;
  }

  const clause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const safeLimit = Math.max(1, Number.parseInt(limit, 10) || 50);
  const safeOffset = Math.max(0, Number.parseInt(offset, 10) || 0);

  const [rows] = await pool.query(
    `SELECT r.id, r.rating, r.comment, r.created_at, r.updated_at,
            u.id AS user_id, u.name AS user_name, u.email AS user_email,
            p.id AS product_id, p.name AS product_name, p.image AS product_image
     FROM reviews r
     JOIN users u ON u.id = r.user_id
     JOIN products p ON p.id = r.product_id
     ${clause}
     ORDER BY r.created_at DESC
     LIMIT ${safeLimit} OFFSET ${safeOffset}`,
    params
  );
  return rows;
}

/**
 * countAll
 */
async function countAll({ productId, rating } = {}) {
  const conditions = [];
  const params = {};

  if (productId) {
    conditions.push('product_id = :productId');
    params.productId = productId;
  }
  if (rating) {
    conditions.push('rating = :rating');
    params.rating = rating;
  }

  const clause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await pool.query(`SELECT COUNT(*) AS total FROM reviews ${clause}`, params);
  return Number(rows[0].total);
}

module.exports = {
  findByProductId,
  findById,
  findByUserAndProduct,
  findByUserId,
  hasPurchased,
  create,
  update,
  remove,
  getProductRatingSummary,
  findAll,
  countAll
};
