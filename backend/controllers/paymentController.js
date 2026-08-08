// controllers/paymentController.js
// Payment initiation and verification.
//
// Two rules drive the design here:
//  1. A payment is only ever marked Paid after a SERVER-SIDE confirmation
//     with the gateway. A browser redirect or a widget token proves nothing
//     on its own — anyone can call a success URL with an invented reference.
//  2. The amount is always taken from the order in our database, never from
//     the request. Otherwise a tampered payload could settle a 10,000 NPR
//     order by paying 10.

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const orderModel = require('../models/orderModel');
const paymentModel = require('../models/paymentModel');
const { getGateway, listGateways } = require('../services/payments');

/**
 * toApiPayment
 */
function toApiPayment(row) {
  if (!row) return null;
  let gatewayResponse = null;
  if (row.gateway_response) {
    try {
      gatewayResponse =
        typeof row.gateway_response === 'string' ? JSON.parse(row.gateway_response) : row.gateway_response;
    } catch (err) {
      gatewayResponse = null; // never let malformed stored JSON break a response
    }
  }

  return {
    id: row.id,
    order_id: row.order_id,
    transaction_id: row.transaction_id,
    payment_method: row.payment_method,
    payment_status: row.payment_status,
    amount: Number(row.amount),
    gateway_response: gatewayResponse,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

/**
 * loadOwnedOrder
 * Fetches an order, scoped to the caller. Admins may load any order;
 * a customer may only load their own — and gets a 404 (not 403) otherwise,
 * so order ids can't be probed.
 */
async function loadOwnedOrder(req, orderId) {
  const isAdmin = Boolean(req.admin);
  const order = await orderModel.findById(orderId, isAdmin ? null : req.user.id);
  if (!order) {
    throw new ApiError(404, 'Order not found.');
  }
  return order;
}

/**
 * GET /api/payments/methods
 * Public. Lets the checkout page render available methods from server
 * config rather than a hardcoded list.
 */
const getPaymentMethods = asyncHandler(async (req, res) => {
  return sendSuccess(res, 200, 'Payment methods fetched successfully.', listGateways());
});

/**
 * POST /api/payments/initiate
 * Body: { order_id }
 * Returns whatever the chosen gateway needs from the frontend to start
 * payment (redirect URL + form fields for eSewa, widget config for Khalti,
 * or a simple confirmation for COD).
 */
const initiatePayment = asyncHandler(async (req, res) => {
  const order = await loadOwnedOrder(req, req.body.order_id);

  if (order.status === 'Cancelled') {
    throw new ApiError(400, 'This order has been cancelled and can no longer be paid for.');
  }

  const payment = await paymentModel.findByOrderId(order.id);
  if (payment && payment.payment_status === 'Paid') {
    throw new ApiError(400, 'This order has already been paid for.');
  }

  const gateway = getGateway(order.payment_method);
  const descriptor = await gateway.initiate({ order });

  return sendSuccess(res, 200, 'Payment initiated.', descriptor);
});

/**
 * POST /api/payments/verify
 * Body: { order_id, transaction_id | token, ... }
 *
 * Confirms the payment with the gateway server-side, then records the result.
 * On success the order also advances Pending -> Confirmed, since a paid order
 * shouldn't sit in the same bucket as an unpaid one.
 */
const verifyPayment = asyncHandler(async (req, res) => {
  const order = await loadOwnedOrder(req, req.body.order_id);

  if (order.status === 'Cancelled') {
    throw new ApiError(400, 'This order has been cancelled and can no longer be paid for.');
  }

  const payment = await paymentModel.findByOrderId(order.id);
  if (!payment) {
    throw new ApiError(404, 'No payment record found for this order.');
  }

  // Idempotency: a customer double-clicking "verify", or the gateway calling
  // back twice, must not produce a second settlement.
  if (payment.payment_status === 'Paid') {
    return sendSuccess(res, 200, 'This payment has already been verified.', {
      payment: toApiPayment(payment),
      order_status: order.status,
      already_verified: true
    });
  }

  const gateway = getGateway(order.payment_method);
  const result = await gateway.verify({ order, payload: req.body });

  if (!result.verified) {
    await paymentModel.updateStatus(order.id, {
      payment_status: 'Failed',
      transaction_id: result.transaction_id,
      gateway_response: result.raw
    });

    throw new ApiError(400, 'Payment verification failed. You have not been charged. Please try again.');
  }

  await paymentModel.updateStatus(order.id, {
    payment_status: 'Paid',
    transaction_id: result.transaction_id,
    gateway_response: result.raw
  });

  // A successfully paid order moves out of Pending automatically.
  if (order.status === 'Pending') {
    await orderModel.updateStatus(order.id, 'Confirmed');
  }

  const updatedPayment = await paymentModel.findByOrderId(order.id);
  const updatedOrder = await orderModel.findById(order.id);

  return sendSuccess(res, 200, 'Payment verified successfully.', {
    payment: toApiPayment(updatedPayment),
    order_status: updatedOrder.status,
    already_verified: false
  });
});

/**
 * GET /api/payments/order/:orderId
 * Payment status for a single order (customer: own only; admin: any).
 */
const getPaymentByOrder = asyncHandler(async (req, res) => {
  const order = await loadOwnedOrder(req, req.params.orderId);
  const payment = await paymentModel.findByOrderId(order.id);

  if (!payment) {
    throw new ApiError(404, 'No payment record found for this order.');
  }

  return sendSuccess(res, 200, 'Payment fetched successfully.', toApiPayment(payment));
});

/**
 * GET /api/payments/esewa/success
 * eSewa redirects the customer's BROWSER here after payment, with oid/refId
 * in the query string.
 *
 * Deliberately does NOT settle the payment: this endpoint is unauthenticated
 * and trivially forgeable. It only reports what eSewa claimed, and the
 * frontend must still call POST /api/payments/verify (which checks with
 * eSewa server-side) before anything is marked Paid.
 */
const esewaSuccessCallback = asyncHandler(async (req, res) => {
  const { data } = req.query;

  if (!data) {
    return res.redirect(
      `${process.env.FRONTEND_URL}/vm-frontend/pages/orders.html?payment=failed`
    );
  }

  let paymentData;

  try {
    paymentData = JSON.parse(
      Buffer.from(data, "base64").toString("utf8")
    );
  } catch (error) {
    console.error("Invalid eSewa callback data:", error);

    return res.redirect(
      `${process.env.FRONTEND_URL}/vm-frontend/pages/orders.html?payment=failed`
    );
  }

  const transactionUuid =
    paymentData.transaction_uuid || "";

  const transactionCode =
    paymentData.transaction_code || "";

  return res.redirect(
    `${process.env.FRONTEND_URL}/vm-frontend/pages/orders.html` +
    `?payment=success` +
    `&transaction_uuid=${encodeURIComponent(transactionUuid)}` +
    `&transaction_code=${encodeURIComponent(transactionCode)}`
  );
});
/**
 * GET /api/payments/esewa/failure
 */
const esewaFailureCallback = asyncHandler(async (req, res) => {
  return res.redirect(
    `${process.env.FRONTEND_URL}/vm-frontend/pages/orders.html?payment=failed`
  );
});
/**
 * PUT /api/payments/:orderId/status
 * Admin only — manual reconciliation (e.g. recording an offline refund, or
 * fixing a payment the gateway reported late).
 */
const updatePaymentStatus = asyncHandler(async (req, res) => {
  const { payment_status: paymentStatus, transaction_id: transactionId } = req.body;

  const order = await orderModel.findById(req.params.orderId);
  if (!order) {
    throw new ApiError(404, 'Order not found.');
  }

  const payment = await paymentModel.findByOrderId(order.id);
  if (!payment) {
    throw new ApiError(404, 'No payment record found for this order.');
  }

  await paymentModel.updateStatus(order.id, {
    payment_status: paymentStatus,
    transaction_id: transactionId,
    gateway_response: {
      manual_update: true,
      by_admin_id: req.admin.id,
      at: new Date().toISOString(),
      previous_status: payment.payment_status
    }
  });

  const updated = await paymentModel.findByOrderId(order.id);
  return sendSuccess(res, 200, `Payment status updated to ${paymentStatus}.`, toApiPayment(updated));
});

module.exports = {
  getPaymentMethods,
  initiatePayment,
  verifyPayment,
  getPaymentByOrder,
  esewaSuccessCallback,
  esewaFailureCallback,
  updatePaymentStatus,
  toApiPayment
};
