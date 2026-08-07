// models/paymentModel.js
// Data-access layer for the `payments` table.
// Module 8 (eSewa / Khalti gateways) builds on top of this; checkout creates
// the initial Pending record here.

const { pool } = require('../config/db');

const PAYMENT_METHODS = ['COD', 'eSewa', 'Khalti'];
const PAYMENT_STATUSES = ['Pending', 'Paid', 'Failed', 'Refunded'];

/**
 * create
 * @param {object} conn - transaction connection when called from checkout
 */
async function create(conn, data) {
  const [result] = await conn.query(
    `INSERT INTO payments (order_id, transaction_id, payment_method, payment_status, amount, gateway_response)
     VALUES (:order_id, :transaction_id, :payment_method, :payment_status, :amount, :gateway_response)`,
    {
      order_id: data.order_id,
      transaction_id: data.transaction_id || null,
      payment_method: data.payment_method,
      payment_status: data.payment_status || 'Pending',
      amount: data.amount,
      gateway_response: data.gateway_response ? JSON.stringify(data.gateway_response) : null
    }
  );
  return result.insertId;
}

/**
 * findByOrderId
 */
async function findByOrderId(orderId) {
  const [rows] = await pool.query(
    'SELECT * FROM payments WHERE order_id = :orderId LIMIT 1',
    { orderId }
  );
  return rows[0] || null;
}

/**
 * updateStatus
 * Records the outcome of a gateway interaction.
 */
async function updateStatus(orderId, { payment_status: paymentStatus, transaction_id: transactionId, gateway_response: gatewayResponse }, conn = pool) {
  const [result] = await conn.query(
    `UPDATE payments SET
       payment_status = COALESCE(:paymentStatus, payment_status),
       transaction_id = COALESCE(:transactionId, transaction_id),
       gateway_response = COALESCE(:gatewayResponse, gateway_response)
     WHERE order_id = :orderId`,
    {
      orderId,
      paymentStatus: paymentStatus || null,
      transactionId: transactionId || null,
      gatewayResponse: gatewayResponse ? JSON.stringify(gatewayResponse) : null
    }
  );
  return result.affectedRows > 0;
}

module.exports = { PAYMENT_METHODS, PAYMENT_STATUSES, create, findByOrderId, updateStatus };
