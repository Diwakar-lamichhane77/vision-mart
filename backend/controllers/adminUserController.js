// controllers/adminUserController.js
// Customer management for the admin panel.
//
// Admins can view customers and block/unblock accounts, but there is
// deliberately NO delete endpoint: `orders.user_id` is ON DELETE RESTRICT,
// so removing a customer with order history would either fail or destroy
// sales records. Blocking achieves the intent without losing data.

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const userModel = require('../models/userModel');
const orderModel = require('../models/orderModel');

/**
 * toApiCustomer
 */
function toApiCustomer(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    city: row.city,
    status: row.status,
    order_count: Number(row.order_count || 0),
    total_spent: Number(row.total_spent || 0),
    last_order_at: row.last_order_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

/**
 * GET /api/admin/users
 * Filters: ?search=&status=active|blocked&limit=&page=
 */
const getAllUsers = asyncHandler(async (req, res) => {
  const perPage = req.query.limit ? Number.parseInt(req.query.limit, 10) : 100;
  const currentPage = req.query.page ? Number.parseInt(req.query.page, 10) : 1;

  const filters = {
    search: req.query.search || null,
    status: req.query.status || null
  };

  const rows = await userModel.findAllForAdmin({
    ...filters,
    limit: perPage,
    offset: (currentPage - 1) * perPage
  });
  const total = await userModel.countForAdmin(filters);

  return res.status(200).json({
    success: true,
    message: 'Users fetched successfully.',
    data: rows.map(toApiCustomer),
    meta: {
      total,
      page: currentPage,
      limit: perPage,
      total_pages: Math.ceil(total / perPage) || 1
    }
  });
});

/**
 * GET /api/admin/users/:id
 * Single customer with their recent orders.
 */
const getUserById = asyncHandler(async (req, res) => {
  const user = await userModel.findById(req.params.id);
  if (!user) {
    throw new ApiError(404, 'Customer not found.');
  }

  const orders = await orderModel.findAll({ userId: user.id }, { limit: 20 });

  return sendSuccess(res, 200, 'Customer fetched successfully.', {
    ...user,
    orders: orders.map((o) => ({
      id: o.id,
      order_number: o.order_number,
      status: o.status,
      total_amount: Number(o.total_amount),
      payment_method: o.payment_method,
      payment_status: o.payment_status || 'Pending',
      created_at: o.created_at
    }))
  });
});

/**
 * PUT /api/admin/users/:id/status
 * Body: { status: 'active' | 'blocked' }
 * A blocked customer's existing token stops working on their next request,
 * because requireCustomerAuth re-checks account status every time.
 */
const updateUserStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  const user = await userModel.findById(req.params.id);
  if (!user) {
    throw new ApiError(404, 'Customer not found.');
  }

  if (user.status === status) {
    throw new ApiError(400, `This customer is already ${status}.`);
  }

  await userModel.updateStatus(user.id, status);
  const updated = await userModel.findById(user.id);

  return sendSuccess(
    res,
    200,
    status === 'blocked' ? 'Customer account blocked.' : 'Customer account reactivated.',
    updated
  );
});

module.exports = { getAllUsers, getUserById, updateUserStatus, toApiCustomer };
