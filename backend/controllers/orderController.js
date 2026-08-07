// controllers/orderController.js
// Checkout and order management.
//
// GET /api/orders and GET /api/orders/:id serve BOTH roles via requireAnyAuth:
// a customer sees only their own orders, an admin sees everything. The scoping
// is done by passing req.user.id (or null for admins) into the model, so
// ownership is enforced in SQL rather than by filtering after the fact.

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const { buildFileUrl } = require('../utils/helpers');
const orderModel = require('../models/orderModel');
const paymentModel = require('../models/paymentModel');
const orderService = require('../services/orderService');

/**
 * Allowed forward transitions. An order moves down the fulfilment chain, and
 * can be cancelled from anywhere before delivery — but it can never move
 * backwards, and Delivered/Cancelled are terminal. Without this, an admin
 * mis-click could "un-deliver" or "un-cancel" an order, and un-cancelling
 * would silently double-decrement stock.
 */
const ALLOWED_TRANSITIONS = {
  Pending: ['Confirmed', 'Packed', 'Cancelled'],
  Confirmed: ['Packed', 'Shipped', 'Cancelled'],
  Packed: ['Shipped', 'Cancelled'],
  Shipped: ['Out for Delivery', 'Delivered', 'Cancelled'],
  'Out for Delivery': ['Delivered', 'Cancelled'],
  Delivered: [],
  Cancelled: []
};

/**
 * toApiOrderItem
 */
function toApiOrderItem(row) {
  return {
    id: row.id,
    product_id: row.product_id, // null if the product was later deleted
    product_name: row.product_name,
    // Prefer the snapshot taken at order time; fall back to the live image.
    product_image: buildFileUrl(row.product_image || row.current_image, 'products'),
    quantity: Number(row.quantity),
    price: Number(row.price),
    subtotal: Number(row.subtotal),
    // Convenience alias so the frontend can read item.product.name too.
    product: {
      id: row.product_id,
      name: row.product_name,
      image: buildFileUrl(row.product_image || row.current_image, 'products')
    }
  };
}

/**
 * toApiOrder
 */
function toApiOrder(row, items = []) {
  return {
    id: row.id,
    order_number: row.order_number,
    status: row.status,
    total_amount: Number(row.total_amount),
    payment_method: row.payment_method,
    payment_status: row.payment_status || 'Pending',
    transaction_id: row.transaction_id || null,
    shipping_name: row.shipping_name,
    shipping_phone: row.shipping_phone,
    shipping_address: row.shipping_address,
    shipping_city: row.shipping_city,
    notes: row.notes,
    cancelled_reason: row.cancelled_reason,
    // Lets the frontend show/hide the Cancel button without duplicating rules.
    can_cancel: orderModel.CUSTOMER_CANCELLABLE.includes(row.status),
    items,
    items_count: items.length,
    user: {
      id: row.customer_id,
      name: row.customer_name,
      email: row.customer_email,
      phone: row.customer_phone
    },
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

/**
 * attachItems
 * Fetches items for a set of orders in ONE query and groups them, rather
 * than issuing a query per order.
 */
async function attachItems(orderRows) {
  if (!orderRows.length) return [];

  const orderIds = orderRows.map((o) => o.id);
  const itemRows = await orderModel.findItemsByOrderIds(orderIds);

  const grouped = new Map();
  itemRows.forEach((item) => {
    if (!grouped.has(item.order_id)) grouped.set(item.order_id, []);
    grouped.get(item.order_id).push(toApiOrderItem(item));
  });

  return orderRows.map((row) => toApiOrder(row, grouped.get(row.id) || []));
}

/**
 * POST /api/orders
 * Customer only. Creates the order atomically (see services/orderService.js).
 *
 * Body: shipping_name, shipping_phone, shipping_address, shipping_city?,
 *       payment_method, notes?, items?
 * When `items` is omitted the order is built from the cart and the cart is
 * cleared; when present ("Buy Now") the cart is left untouched.
 */
const createOrder = asyncHandler(async (req, res) => {
  const orderId = await orderService.placeOrder(req.user.id, {
    shipping_name: req.body.shipping_name,
    shipping_phone: req.body.shipping_phone,
    shipping_address: req.body.shipping_address,
    shipping_city: req.body.shipping_city,
    payment_method: req.body.payment_method,
    notes: req.body.notes,
    items: req.body.items
  });

  const order = await orderModel.findById(orderId, req.user.id);
  const [withItems] = await attachItems([order]);

  return sendSuccess(res, 201, 'Order placed successfully.', withItems);
});

/**
 * GET /api/orders
 * Customers see their own orders; admins see all of them.
 */
const getOrders = asyncHandler(async (req, res) => {
  const isAdmin = Boolean(req.admin);

  const filters = {
    // The ownership scope: null for admins, the customer's id otherwise.
    userId: isAdmin ? null : req.user.id,
    status: req.query.status,
    payment_method: req.query.payment_method,
    // Free-text search is an admin-only affordance.
    search: isAdmin ? req.query.search : undefined,
    from: req.query.from,
    to: req.query.to
  };

  const perPage = req.query.limit ? Number.parseInt(req.query.limit, 10) : 50;
  const currentPage = req.query.page ? Number.parseInt(req.query.page, 10) : 1;

  const rows = await orderModel.findAll(filters, {
    limit: perPage,
    offset: (currentPage - 1) * perPage
  });
  const total = await orderModel.countAll(filters);
  const orders = await attachItems(rows);

  return res.status(200).json({
    success: true,
    message: 'Orders fetched successfully.',
    data: orders,
    meta: {
      total,
      page: currentPage,
      limit: perPage,
      total_pages: Math.ceil(total / perPage) || 1
    }
  });
});

/**
 * GET /api/orders/:id
 */
const getOrderById = asyncHandler(async (req, res) => {
  const isAdmin = Boolean(req.admin);
  const order = await orderModel.findById(req.params.id, isAdmin ? null : req.user.id);

  // A customer requesting someone else's order gets the same 404 as a
  // genuinely missing one — no information leaked about what exists.
  if (!order) {
    throw new ApiError(404, 'Order not found.');
  }

  const [withItems] = await attachItems([order]);
  return sendSuccess(res, 200, 'Order fetched successfully.', withItems);
});

/**
 * PUT /api/orders/:id/cancel
 * Customer-initiated cancellation. Only allowed while the order is still
 * Pending or Confirmed — once it's packed, cancelling becomes an admin call.
 * Restores stock.
 */
const cancelOrder = asyncHandler(async (req, res) => {
  const isAdmin = Boolean(req.admin);
  const order = await orderModel.findById(req.params.id, isAdmin ? null : req.user.id);

  if (!order) {
    throw new ApiError(404, 'Order not found.');
  }

  if (order.status === 'Cancelled') {
    throw new ApiError(400, 'This order has already been cancelled.');
  }
  if (order.status === 'Delivered') {
    throw new ApiError(400, 'A delivered order cannot be cancelled. Please request a return instead.');
  }
  if (!isAdmin && !orderModel.CUSTOMER_CANCELLABLE.includes(order.status)) {
    throw new ApiError(
      400,
      `This order is already ${order.status.toLowerCase()} and can no longer be cancelled online. Please contact support.`
    );
  }

  // Put the stock back before flipping the status, so a failure here leaves
  // the order still active rather than cancelled-but-not-restocked.
  await orderService.restoreStock(order.id);
  await orderModel.updateStatus(order.id, 'Cancelled', undefined, req.body.reason || 'Cancelled by customer');

  // An unpaid order becomes moot; a paid one now needs a refund.
  const payment = await paymentModel.findByOrderId(order.id);
  if (payment && payment.payment_status === 'Paid') {
    await paymentModel.updateStatus(order.id, { payment_status: 'Refunded' });
  }

  const updated = await orderModel.findById(order.id, isAdmin ? null : req.user.id);
  const [withItems] = await attachItems([updated]);

  return sendSuccess(res, 200, 'Order cancelled successfully.', withItems);
});

/**
 * PUT /api/orders/:id/status
 * Admin only. Enforces the ALLOWED_TRANSITIONS map above.
 */
const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const order = await orderModel.findById(req.params.id);

  if (!order) {
    throw new ApiError(404, 'Order not found.');
  }

  if (order.status === status) {
    throw new ApiError(400, `This order is already marked as ${status}.`);
  }

  const allowed = ALLOWED_TRANSITIONS[order.status] || [];
  if (!allowed.includes(status)) {
    throw new ApiError(
      400,
      orderModel.TERMINAL_STATUSES.includes(order.status)
        ? `This order is ${order.status.toLowerCase()} and its status can no longer be changed.`
        : `Cannot change status from ${order.status} to ${status}. Allowed next steps: ${allowed.join(', ')}.`
    );
  }

  // Cancelling from the admin side must also return the stock.
  if (status === 'Cancelled') {
    await orderService.restoreStock(order.id);

    const payment = await paymentModel.findByOrderId(order.id);
    if (payment && payment.payment_status === 'Paid') {
      await paymentModel.updateStatus(order.id, { payment_status: 'Refunded' });
    }
  }

  // Cash on delivery is settled the moment it's delivered.
  if (status === 'Delivered' && order.payment_method === 'COD') {
    await paymentModel.updateStatus(order.id, { payment_status: 'Paid' });
  }

  await orderModel.updateStatus(
    order.id,
    status,
    undefined,
    req.body.cancelled_reason || 'Cancelled by admin'
  );

  const updated = await orderModel.findById(order.id);
  const [withItems] = await attachItems([updated]);

  return sendSuccess(res, 200, `Order status updated to ${status}.`, withItems);
});

/**
 * DELETE /api/orders/:id
 * Admin only. Deliberately restricted to Cancelled orders: deleting a live
 * order would destroy sales history and leave stock permanently decremented.
 */
const deleteOrder = asyncHandler(async (req, res) => {
  const order = await orderModel.findById(req.params.id);

  if (!order) {
    throw new ApiError(404, 'Order not found.');
  }

  if (order.status !== 'Cancelled') {
    throw new ApiError(
      400,
      `Only cancelled orders can be deleted. Cancel this order first (it is currently ${order.status}).`
    );
  }

  await orderModel.remove(order.id);
  return sendSuccess(res, 200, 'Order deleted successfully.', {});
});

module.exports = {
  createOrder,
  getOrders,
  getOrderById,
  cancelOrder,
  updateOrderStatus,
  deleteOrder,
  ALLOWED_TRANSITIONS,
  toApiOrder
};
