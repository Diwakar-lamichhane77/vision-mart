// models/wishlistModel.js
// Data-access layer for the `wishlist` table.
// The schema has UNIQUE(user_id, product_id), so a product can only appear
// once per user — the controller relies on that for idempotent adds.

const { pool } = require('../config/db');

/**
 * findByUserId
 * Returns the user's wishlist joined with live product data, plus an
 * `is_in_cart` flag so the UI can show "Already in cart" on wishlist rows.
 */
async function findByUserId(userId) {
  const [rows] = await pool.query(
    `SELECT w.id, w.created_at,
            p.id AS product_id, p.name AS product_name, p.brand AS product_brand,
            p.price AS product_price, p.discount_price AS product_discount_price,
            COALESCE(p.discount_price, p.price) AS effective_price,
            p.image AS product_image, p.stock AS product_stock,
            p.status AS product_status,
            c.id AS category_id, c.name AS category_name,
            COALESCE(AVG(r.rating), 0) AS rating,
            EXISTS(
              SELECT 1 FROM cart_items ci
              JOIN cart ct ON ct.id = ci.cart_id
              WHERE ci.product_id = p.id AND ct.user_id = :userId
            ) AS is_in_cart
     FROM wishlist w
     JOIN products p ON p.id = w.product_id
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN reviews r ON r.product_id = p.id
     WHERE w.user_id = :userId
     GROUP BY w.id
     ORDER BY w.created_at DESC`,
    { userId }
  );
  return rows;
}

/**
 * findItem
 * Checks whether a specific product is already on the user's wishlist.
 */
async function findItem(userId, productId) {
  const [rows] = await pool.query(
    'SELECT id, user_id, product_id, created_at FROM wishlist WHERE user_id = :userId AND product_id = :productId LIMIT 1',
    { userId, productId }
  );
  return rows[0] || null;
}

/**
 * addItem
 * INSERT IGNORE makes this safe to call repeatedly: adding a product that's
 * already wishlisted is a no-op rather than a duplicate-key error.
 * @returns {Promise<boolean>} true if a new row was actually inserted
 */
async function addItem(userId, productId) {
  const [result] = await pool.query(
    'INSERT IGNORE INTO wishlist (user_id, product_id) VALUES (:userId, :productId)',
    { userId, productId }
  );
  return result.affectedRows > 0;
}

/**
 * removeItem
 * @returns {Promise<boolean>} false when the product wasn't on the wishlist
 */
async function removeItem(userId, productId) {
  const [result] = await pool.query(
    'DELETE FROM wishlist WHERE user_id = :userId AND product_id = :productId',
    { userId, productId }
  );
  return result.affectedRows > 0;
}

/**
 * clearWishlist
 * @returns {Promise<number>} number of rows removed
 */
async function clearWishlist(userId) {
  const [result] = await pool.query('DELETE FROM wishlist WHERE user_id = :userId', { userId });
  return result.affectedRows;
}

/**
 * countItems
 * Lightweight count for a header badge.
 */
async function countItems(userId) {
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS total FROM wishlist WHERE user_id = :userId',
    { userId }
  );
  return Number(rows[0].total);
}

module.exports = {
  findByUserId,
  findItem,
  addItem,
  removeItem,
  clearWishlist,
  countItems
};
