// models/cartModel.js
// Data-access layer for the `cart` / `cart_items` tables.
//
// Design note: the schema gives each user exactly one cart row (UNIQUE on
// user_id), and cart_items has UNIQUE(cart_id, product_id). So "add to cart"
// for a product already in the cart is an increment, not a second row —
// handled with INSERT ... ON DUPLICATE KEY UPDATE.

const { pool } = require('../config/db');

/**
 * getOrCreateCartId
 * Returns the user's cart id, creating the cart row on first use so callers
 * never have to worry about whether it exists yet.
 * @param {number} userId
 * @param {object} [conn] - optional connection, to stay inside a transaction
 */
async function getOrCreateCartId(userId, conn = pool) {
  const [rows] = await conn.query('SELECT id FROM cart WHERE user_id = :userId LIMIT 1', { userId });
  if (rows.length > 0) return rows[0].id;

  const [result] = await conn.query('INSERT INTO cart (user_id) VALUES (:userId)', { userId });
  return result.insertId;
}

/**
 * findItemsByUserId
 * Returns the user's cart items joined with live product data.
 * `price` comes from the product table (current price), not the stored
 * snapshot, so a shopper always sees today's price before checking out.
 * The snapshot in cart_items.price is kept for reference/auditing.
 */
async function findItemsByUserId(userId) {
  const [rows] = await pool.query(
    `SELECT ci.id, ci.quantity, ci.price AS price_at_add,
            ci.created_at, ci.updated_at,
            p.id AS product_id, p.name AS product_name,
            p.price AS product_price, p.discount_price AS product_discount_price,
            COALESCE(p.discount_price, p.price) AS effective_price,
            p.image AS product_image, p.stock AS product_stock,
            p.brand AS product_brand, p.status AS product_status,
            c.id AS category_id, c.name AS category_name
     FROM cart_items ci
     JOIN cart ct ON ct.id = ci.cart_id
     JOIN products p ON p.id = ci.product_id
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE ct.user_id = :userId
     ORDER BY ci.created_at DESC`,
    { userId }
  );
  return rows;
}

/**
 * findItem
 * Looks up a single cart line by user + product.
 */
async function findItem(userId, productId) {
  const [rows] = await pool.query(
    `SELECT ci.id, ci.cart_id, ci.product_id, ci.quantity, ci.price
     FROM cart_items ci
     JOIN cart ct ON ct.id = ci.cart_id
     WHERE ct.user_id = :userId AND ci.product_id = :productId
     LIMIT 1`,
    { userId, productId }
  );
  return rows[0] || null;
}

/**
 * addItem
 * Adds a product to the cart, or increments the quantity if it's already
 * there. The price snapshot is refreshed on every add so it reflects the
 * price the customer most recently saw.
 * @returns {Promise<number>} the resulting quantity
 */
async function addItem(userId, productId, quantity, price) {
  const cartId = await getOrCreateCartId(userId);

  await pool.query(
    `INSERT INTO cart_items (cart_id, product_id, quantity, price)
     VALUES (:cartId, :productId, :quantity, :price)
     ON DUPLICATE KEY UPDATE
       quantity = quantity + VALUES(quantity),
       price = VALUES(price)`,
    { cartId, productId, quantity, price }
  );

  const item = await findItem(userId, productId);
  return item ? item.quantity : quantity;
}

/**
 * updateItemQuantity
 * Sets (not increments) the quantity for a product already in the cart.
 * @returns {Promise<boolean>} false when the product isn't in the cart
 */
async function updateItemQuantity(userId, productId, quantity, price = null) {
  const [result] = await pool.query(
    `UPDATE cart_items ci
     JOIN cart ct ON ct.id = ci.cart_id
     SET ci.quantity = :quantity,
         ci.price = COALESCE(:price, ci.price)
     WHERE ct.user_id = :userId AND ci.product_id = :productId`,
    { userId, productId, quantity, price }
  );
  return result.affectedRows > 0;
}

/**
 * removeItem
 * @returns {Promise<boolean>} false when there was nothing to remove
 */
async function removeItem(userId, productId) {
  const [result] = await pool.query(
    `DELETE ci FROM cart_items ci
     JOIN cart ct ON ct.id = ci.cart_id
     WHERE ct.user_id = :userId AND ci.product_id = :productId`,
    { userId, productId }
  );
  return result.affectedRows > 0;
}

/**
 * clearCart
 * Empties every line from the user's cart but keeps the cart row itself.
 * Also used by checkout once an order has been placed.
 * @param {object} [conn] - optional connection so checkout can call this
 *                          inside its transaction
 * @returns {Promise<number>} number of rows removed
 */
async function clearCart(userId, conn = pool) {
  const [result] = await conn.query(
    `DELETE ci FROM cart_items ci
     JOIN cart ct ON ct.id = ci.cart_id
     WHERE ct.user_id = :userId`,
    { userId }
  );
  return result.affectedRows;
}

/**
 * countItems
 * Total number of distinct products in the cart (for a header badge).
 */
async function countItems(userId) {
  // NOTE: `lines` is a reserved word in MySQL 8, hence `line_count`.
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS line_count, COALESCE(SUM(ci.quantity), 0) AS units
     FROM cart_items ci
     JOIN cart ct ON ct.id = ci.cart_id
     WHERE ct.user_id = :userId`,
    { userId }
  );
  return { lines: Number(rows[0].line_count), units: Number(rows[0].units) };
}

module.exports = {
  getOrCreateCartId,
  findItemsByUserId,
  findItem,
  addItem,
  updateItemQuantity,
  removeItem,
  clearCart,
  countItems
};
