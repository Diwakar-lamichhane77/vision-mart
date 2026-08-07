// controllers/dashboardController.js
// Admin dashboard summary.
//
// Everything here is admin-only (enforced in routes/dashboardRoutes.js).
// Note the two revenue figures: `total_revenue` is what's been booked,
// `collected_revenue` is what's actually been paid. Cancelled orders are
// excluded from both — see models/dashboardModel.js.

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const { buildFileUrl } = require('../utils/helpers');
const dashboardModel = require('../models/dashboardModel');

const DEFAULT_LOW_STOCK_THRESHOLD = Number(process.env.LOW_STOCK_THRESHOLD) || 5;

/**
 * GET /api/admin/dashboard
 * Everything the dashboard page needs in ONE request, so the frontend
 * doesn't fire six parallel calls to render a single screen.
 *
 * Query: ?low_stock_threshold=5&months=12&recent_limit=10
 */
const getDashboard = asyncHandler(async (req, res) => {
  const lowStockThreshold = req.query.low_stock_threshold
    ? Number.parseInt(req.query.low_stock_threshold, 10)
    : DEFAULT_LOW_STOCK_THRESHOLD;
  const months = req.query.months ? Number.parseInt(req.query.months, 10) : 12;
  const recentLimit = req.query.recent_limit ? Number.parseInt(req.query.recent_limit, 10) : 10;

  // Independent aggregates, so they're run concurrently rather than serially.
  const [counts, revenue, lowStockRows, recentOrderRows, monthlySales, bestSellers, ordersByStatus] =
    await Promise.all([
      dashboardModel.getCounts(),
      dashboardModel.getRevenue(),
      dashboardModel.getLowStockProducts(lowStockThreshold),
      dashboardModel.getRecentOrders(recentLimit),
      dashboardModel.getMonthlySales(months),
      dashboardModel.getBestSellingProducts({ limit: 5 }),
      dashboardModel.getOrdersByStatus()
    ]);

  const lowStockProducts = lowStockRows.map((row) => ({
    id: row.id,
    name: row.name,
    brand: row.brand,
    stock: Number(row.stock),
    price: Number(row.price),
    discount_price: row.discount_price === null ? null : Number(row.discount_price),
    image: buildFileUrl(row.image, 'products'),
    category_name: row.category_name,
    status: row.status
  }));

  const recentOrders = recentOrderRows.map((row) => ({
    id: row.id,
    order_number: row.order_number,
    total_amount: Number(row.total_amount),
    status: row.status,
    payment_method: row.payment_method,
    payment_status: row.payment_status || 'Pending',
    items_count: Number(row.items_count),
    user: { id: row.customer_id, name: row.customer_name, email: row.customer_email },
    created_at: row.created_at
  }));

  return sendSuccess(res, 200, 'Dashboard data fetched successfully.', {
    // Flat top-level fields matching the spec's required dashboard values.
    total_users: Number(counts.total_users),
    total_products: Number(counts.total_products),
    total_orders: Number(counts.total_orders),
    revenue: revenue.total_revenue,

    // Richer breakdown for a fuller dashboard.
    counts: {
      total_users: Number(counts.total_users),
      active_users: Number(counts.active_users),
      total_products: Number(counts.total_products),
      active_products: Number(counts.active_products),
      total_categories: Number(counts.total_categories),
      total_orders: Number(counts.total_orders),
      pending_orders: Number(counts.pending_orders),
      delivered_orders: Number(counts.delivered_orders),
      cancelled_orders: Number(counts.cancelled_orders),
      total_reviews: Number(counts.total_reviews),
      unread_messages: Number(counts.unread_messages)
    },
    revenue_summary: revenue,
    low_stock_products: lowStockProducts,
    low_stock_threshold: lowStockThreshold,
    recent_orders: recentOrders,
    monthly_sales: monthlySales,
    best_selling_products: bestSellers.map((row) => ({
      product_id: row.product_id,
      name: row.name,
      brand: row.brand,
      image: buildFileUrl(row.image, 'products'),
      units_sold: Number(row.units_sold),
      revenue: Number(row.revenue)
    })),
    orders_by_status: ordersByStatus.map((row) => ({
      status: row.status,
      count: Number(row.count),
      value: Number(row.value)
    }))
  });
});

module.exports = { getDashboard };
