// models/orderModel.js
// Data-access layer for `orders` / `order_items`.
//
// Several functions accept an optional `conn` so the checkout service can run
// them inside a single transaction. When omitted they fall back to the pool.

const { pool } = require('../config/db');

// The lifecycle a Vision Mart order moves through.
const ORDER_STATUSES = [
  'Pending',
  'Confirmed',
  'Packed',
  'Shipped',
  'Out for Delivery',
  'Delivered',
  'Cancelled'
];

// Statuses a customer is still allowed to cancel from. Once an order is
// packed it's physically being handled, so cancellation becomes an admin
// decision rather than a self-service action.
const CUSTOMER_CANCELLABLE = ['Pending', 'Confirmed'];

// Terminal states — nothing moves out of these.
const TERMINAL_STATUSES = ['Delivered', 'Cancelled'];

/**
 * generateOrderNumber
 * Human-friendly, sortable, and unlikely to collide:
 *   VM-20260805-4821
 * Uniqueness is still enforced by the UNIQUE constraint on order_number;
 * the caller retries on the rare clash.
 */
function generateOrderNumber() {
  const now = new Date();
  const datePart = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('');
  const randomPart = String(Math.floor(1000 + Math.random() * 9000));
  return `VM-${datePart}-${randomPart}`;
}

/**
 * createOrder
 * @param {object} conn - transaction connection (required for checkout)
 * @returns {Promise<number>} insertId
 */
async function createOrder(conn, data) {
  const [result] = await conn.query(
    `INSERT INTO orders
       (user_id, order_number, total_amount, status, payment_method,
        shipping_name, shipping_phone, shipping_address, shipping_city, notes)
     VALUES
       (:user_id, :order_number, :total_amount, :status, :payment_method,
        :shipping_name, :shipping_phone, :shipping_address, :shipping_city, :notes)`,
    {
      user_id: data.user_id,
      order_number: data.order_number,
      total_amount: data.total_amount,
      status: data.status || 'Pending',
      payment_method: data.payment_method,
      shipping_name: data.shipping_name,
      shipping_phone: data.shipping_phone,
      shipping_address: data.shipping_address,
      shipping_city: data.shipping_city || null,
      notes: data.notes || null
    }
  );
  return result.insertId;
}

/**
 * createOrderItem
 * Stores name/image/price SNAPSHOTS alongside the product_id, so historical
 * orders stay readable even after a product is renamed, repriced or deleted.
 */
async function createOrderItem(conn, orderId, item) {
  await conn.query(
    `INSERT INTO order_items
       (order_id, product_id, product_name, product_image, quantity, price, subtotal)
     VALUES
       (:order_id, :product_id, :product_name, :product_image, :quantity, :price, :subtotal)`,
    {
      order_id: orderId,
      product_id: item.product_id,
      product_name: item.product_name,
      product_image: item.product_image || null,
      quantity: item.quantity,
      price: item.price,
      subtotal: item.subtotal
    }
  );
}

/**
 * findAll
 * @param {object} filters - { userId, status, search, from, to }
 *   userId scopes to a single customer; omit it for the admin view.
 */
async function findAll(filters = {}, options = {}) {
  const conditions = [];
  const params = {};

  if (filters.userId) {
    conditions.push('o.user_id = :userId');
    params.userId = filters.userId;
  }
  if (filters.status) {
    conditions.push('o.status = :status');
    params.status = filters.status;
  }
  if (filters.payment_method) {
    conditions.push('o.payment_method = :payment_method');
    params.payment_method = filters.payment_method;
  }
  if (filters.search) {
    conditions.push('(o.order_number LIKE :search OR o.shipping_name LIKE :search OR u.email LIKE :search)');
    params.search = `%${filters.search}%`;
  }
  if (filters.from) {
    conditions.push('o.created_at >= :from');
    params.from = filters.from;
  }
  if (filters.to) {
    // Inclusive of the whole end day.
    conditions.push('o.created_at < DATE_ADD(:to, INTERVAL 1 DAY)');
    params.to = filters.to;
  }

  const clause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const safeLimit = options.limit ? Math.max(1, Number.parseInt(options.limit, 10)) : null;
  const safeOffset = Math.max(0, Number.parseInt(options.offset, 10) || 0);
  const limitClause = safeLimit ? `LIMIT ${safeLimit} OFFSET ${safeOffset}` : '';

  const [rows] = await pool.query(
    `SELECT o.*,
            u.id AS customer_id, u.name AS customer_name, u.email AS customer_email,
            u.phone AS customer_phone,
            pay.transaction_id, pay.payment_status, pay.id AS payment_id
     FROM orders o
     JOIN users u ON u.id = o.user_id
     LEFT JOIN payments pay ON pay.order_id = o.id
     ${clause}
     ORDER BY o.created_at DESC
     ${limitClause}`,
    params
  );
  return rows;
}

/**
 * countAll
 */
async function countAll(filters = {}) {
  const conditions = [];
  const params = {};

  if (filters.userId) {
    conditions.push('o.user_id = :userId');
    params.userId = filters.userId;
  }
  if (filters.status) {
    conditions.push('o.status = :status');
    params.status = filters.status;
  }
  if (filters.payment_method) {
    conditions.push('o.payment_method = :payment_method');
    params.payment_method = filters.payment_method;
  }
  if (filters.search) {
    conditions.push('(o.order_number LIKE :search OR o.shipping_name LIKE :search OR u.email LIKE :search)');
    params.search = `%${filters.search}%`;
  }
  if (filters.from) {
    conditions.push('o.created_at >= :from');
    params.from = filters.from;
  }
  if (filters.to) {
    conditions.push('o.created_at < DATE_ADD(:to, INTERVAL 1 DAY)');
    params.to = filters.to;
  }

  const clause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total FROM orders o JOIN users u ON u.id = o.user_id ${clause}`,
    params
  );
  return Number(rows[0].total);
}

/**
 * findById
 * @param {number|null} userId - when given, the order must belong to this
 *   customer. This is the ownership check that stops one customer reading
 *   another's order by guessing an id.
 */
async function findById(id, userId = null) {
  const [rows] = await pool.query(
    `SELECT o.*,
            u.id AS customer_id, u.name AS customer_name, u.email AS customer_email,
            u.phone AS customer_phone,
            pay.transaction_id, pay.payment_status, pay.id AS payment_id
     FROM orders o
     JOIN users u ON u.id = o.user_id
     LEFT JOIN payments pay ON pay.order_id = o.id
     WHERE o.id = :id AND (:userId IS NULL OR o.user_id = :userId)
     LIMIT 1`,
    { id, userId }
  );
  return rows[0] || null;
}

/**
 * findItemsByOrderIds
 * Batched lookup so a list of orders needs one extra query, not one per order.
 */
async function findItemsByOrderIds(orderIds) {
  if (!orderIds.length) return [];
  const [rows] = await pool.query(
    `SELECT oi.*, p.image AS current_image, p.status AS product_status
     FROM order_items oi
     LEFT JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id IN (?)
     ORDER BY oi.id ASC`,
    [orderIds]
  );
  return rows;
}

/**
 * updateStatus
 */
async function updateStatus(id, status, conn = pool, cancelledReason = null) {
  const [result] = await conn.query(
    `UPDATE orders
     SET status = :status,
         cancelled_reason = IF(:status = 'Cancelled', :cancelledReason, cancelled_reason)
     WHERE id = :id`,
    { id, status, cancelledReason }
  );
  return result.affectedRows > 0;
}

/**
 * remove
 * order_items cascade automatically via the FK.
 */
async function remove(id) {
  const [result] = await pool.query('DELETE FROM orders WHERE id = :id', { id });
  return result.affectedRows > 0;
}

/**
 * orderNumberExists
 * Used to retry generation on the rare collision.
 */
async function orderNumberExists(orderNumber, conn = pool) {
  const [rows] = await conn.query(
    'SELECT id FROM orders WHERE order_number = :orderNumber LIMIT 1',
    { orderNumber }
  );
  return rows.length > 0;
}

module.exports = {
  ORDER_STATUSES,
  CUSTOMER_CANCELLABLE,
  TERMINAL_STATUSES,
  generateOrderNumber,
  createOrder,
  createOrderItem,
  findAll,
  countAll,
  findById,
  findItemsByOrderIds,
  updateStatus,
  remove,
  orderNumberExists
};
