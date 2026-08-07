// controllers/reportController.js
// Admin reports: sales, inventory, customers, best sellers.
//
// All four accept optional ?from=YYYY-MM-DD&to=YYYY-MM-DD. `to` is treated
// as INCLUSIVE of that whole day (the model adds a day internally), because
// an admin asking for "1st to 31st" means through the end of the 31st.

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const { buildFileUrl } = require('../utils/helpers');
const dashboardModel = require('../models/dashboardModel');

const DEFAULT_LOW_STOCK_THRESHOLD = Number(process.env.LOW_STOCK_THRESHOLD) || 5;

/**
 * dateRange
 * Pulls from/to out of the query string, normalising empties to null.
 */
function dateRange(req) {
  return {
    from: req.query.from || null,
    to: req.query.to || null
  };
}

/**
 * GET /api/reports/sales
 * Day-by-day sales plus totals and a payment-method split.
 */
const getSalesReport = asyncHandler(async (req, res) => {
  const range = dateRange(req);

  const [dailyRows, summary, byPaymentMethod, monthly] = await Promise.all([
    dashboardModel.getSalesReport(range),
    dashboardModel.getRevenue(range),
    dashboardModel.getSalesByPaymentMethod(range),
    dashboardModel.getMonthlySales(12)
  ]);

  const daily = dailyRows.map((row) => ({
    date: row.date,
    order_count: Number(row.order_count),
    revenue: Number(row.revenue),
    collected: Number(row.collected),
    units_sold: Number(row.units_sold || 0)
  }));

  return sendSuccess(res, 200, 'Sales report generated successfully.', {
    period: { from: range.from, to: range.to },
    summary,
    daily,
    by_payment_method: byPaymentMethod.map((row) => ({
      payment_method: row.payment_method,
      order_count: Number(row.order_count),
      revenue: Number(row.revenue)
    })),
    monthly_sales: monthly,
    // Stated explicitly so nobody has to reverse-engineer the numbers.
    note: 'Cancelled orders are excluded. "revenue" is booked value; "collected" is settled payments only.'
  });
});

/**
 * GET /api/reports/inventory
 * Stock levels, valuation and health per product.
 */
const getInventoryReport = asyncHandler(async (req, res) => {
  const lowStockThreshold = req.query.low_stock_threshold
    ? Number.parseInt(req.query.low_stock_threshold, 10)
    : DEFAULT_LOW_STOCK_THRESHOLD;

  const [rows, summary] = await Promise.all([
    dashboardModel.getInventoryReport({ lowStockThreshold }),
    dashboardModel.getInventorySummary({ lowStockThreshold })
  ]);

  const products = rows.map((row) => ({
    id: row.id,
    name: row.name,
    brand: row.brand,
    sku: row.sku,
    category_name: row.category_name,
    stock: Number(row.stock),
    price: Number(row.price),
    discount_price: row.discount_price === null ? null : Number(row.discount_price),
    stock_value: Number(Number(row.stock_value).toFixed(2)),
    stock_status: row.stock_status,
    sold_count: Number(row.sold_count),
    status: row.status
  }));

  return sendSuccess(res, 200, 'Inventory report generated successfully.', {
    low_stock_threshold: lowStockThreshold,
    summary,
    products,
    // Pre-filtered slices so the frontend doesn't have to re-derive them.
    out_of_stock: products.filter((p) => p.stock_status === 'out_of_stock'),
    low_stock: products.filter((p) => p.stock_status === 'low_stock')
  });
});

/**
 * GET /api/reports/customers
 * Per-customer spend and order counts, plus signup trend.
 */
const getCustomerReport = asyncHandler(async (req, res) => {
  const range = dateRange(req);
  const limit = req.query.limit ? Number.parseInt(req.query.limit, 10) : 100;

  const [rows, newCustomers, counts] = await Promise.all([
    dashboardModel.getCustomerReport({ ...range, limit }),
    dashboardModel.getNewCustomersByMonth(12),
    dashboardModel.getCounts()
  ]);

  const customers = rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    city: row.city,
    status: row.status,
    joined_at: row.joined_at,
    order_count: Number(row.order_count),
    total_spent: Number(row.total_spent),
    average_order_value: Number(Number(row.average_order_value).toFixed(2)),
    last_order_at: row.last_order_at
  }));

  const buyers = customers.filter((c) => c.order_count > 0);

  return sendSuccess(res, 200, 'Customer report generated successfully.', {
    period: { from: range.from, to: range.to },
    summary: {
      total_customers: Number(counts.total_users),
      active_customers: Number(counts.active_users),
      customers_with_orders: buyers.length,
      // Customers who registered but never ordered — a useful marketing signal.
      customers_without_orders: customers.length - buyers.length,
      total_customer_spend: Number(buyers.reduce((sum, c) => sum + c.total_spent, 0).toFixed(2))
    },
    customers,
    top_customers: customers.slice(0, 10),
    new_customers_by_month: newCustomers
  });
});

/**
 * GET /api/reports/best-selling
 * Ranked by units actually sold, derived from order_items.
 */
const getBestSellingReport = asyncHandler(async (req, res) => {
  const range = dateRange(req);
  const limit = req.query.limit ? Number.parseInt(req.query.limit, 10) : 20;

  const rows = await dashboardModel.getBestSellingProducts({ ...range, limit });

  const products = rows.map((row, index) => ({
    rank: index + 1,
    product_id: row.product_id, // null if the product was deleted after selling
    name: row.name,
    brand: row.brand,
    category_name: row.category_name,
    image: buildFileUrl(row.image, 'products'),
    current_stock: row.stock === null ? null : Number(row.stock),
    price: row.price === null ? null : Number(row.price),
    units_sold: Number(row.units_sold),
    revenue: Number(row.revenue),
    order_count: Number(row.order_count)
  }));

  return sendSuccess(res, 200, 'Best selling products report generated successfully.', {
    period: { from: range.from, to: range.to },
    total_units_sold: products.reduce((sum, p) => sum + p.units_sold, 0),
    total_revenue: Number(products.reduce((sum, p) => sum + p.revenue, 0).toFixed(2)),
    products
  });
});

module.exports = {
  getSalesReport,
  getInventoryReport,
  getCustomerReport,
  getBestSellingReport
};
