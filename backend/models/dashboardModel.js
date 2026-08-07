// models/dashboardModel.js
// Aggregate queries powering the admin dashboard and reports.
//
// Revenue definition (important, and applied consistently everywhere):
//   - Cancelled orders are ALWAYS excluded. Counting them would inflate
//     revenue with sales that never happened.
//   - `total_revenue`     = value of all live orders (booked, may not be paid yet)
//   - `collected_revenue` = value actually settled (payments.payment_status = 'Paid')
// Both are reported, because "we've sold NPR X" and "we've been paid NPR X"
// are different questions and conflating them hides a cash-flow problem.

const { pool } = require('../config/db');

// Orders in this state never count toward sales figures.
const EXCLUDED_STATUS = "'Cancelled'";

/**
 * getCounts
 * Headline totals for the dashboard cards.
 */
async function getCounts() {
  const [rows] = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM users) AS total_users,
      (SELECT COUNT(*) FROM users WHERE status = 'active') AS active_users,
      (SELECT COUNT(*) FROM products) AS total_products,
      (SELECT COUNT(*) FROM products WHERE status = 'active') AS active_products,
      (SELECT COUNT(*) FROM categories) AS total_categories,
      (SELECT COUNT(*) FROM orders) AS total_orders,
      (SELECT COUNT(*) FROM orders WHERE status = 'Pending') AS pending_orders,
      (SELECT COUNT(*) FROM orders WHERE status = 'Delivered') AS delivered_orders,
      (SELECT COUNT(*) FROM orders WHERE status = 'Cancelled') AS cancelled_orders,
      (SELECT COUNT(*) FROM reviews) AS total_reviews,
      (SELECT COUNT(*) FROM contact_messages WHERE status = 'unread') AS unread_messages
  `);
  return rows[0];
}

/**
 * getRevenue
 * @param {string|null} from - ISO date, optional
 * @param {string|null} to - ISO date, optional
 */
async function getRevenue({ from = null, to = null } = {}) {
  const [rows] = await pool.query(
    `SELECT
       COALESCE(SUM(o.total_amount), 0) AS total_revenue,
       COALESCE(SUM(CASE WHEN p.payment_status = 'Paid' THEN o.total_amount ELSE 0 END), 0) AS collected_revenue,
       COALESCE(SUM(CASE WHEN p.payment_status = 'Pending' THEN o.total_amount ELSE 0 END), 0) AS pending_revenue,
       COUNT(*) AS order_count,
       COALESCE(AVG(o.total_amount), 0) AS average_order_value
     FROM orders o
     LEFT JOIN payments p ON p.order_id = o.id
     WHERE o.status NOT IN (${EXCLUDED_STATUS})
       AND (:from IS NULL OR o.created_at >= :from)
       AND (:to IS NULL OR o.created_at < DATE_ADD(:to, INTERVAL 1 DAY))`,
    { from, to }
  );

  const row = rows[0];
  return {
    total_revenue: Number(row.total_revenue),
    collected_revenue: Number(row.collected_revenue),
    pending_revenue: Number(row.pending_revenue),
    order_count: Number(row.order_count),
    average_order_value: Number(Number(row.average_order_value).toFixed(2))
  };
}

/**
 * getLowStockProducts
 * @param {number} threshold - stock at or below this is "low"
 */
async function getLowStockProducts(threshold = 5, limit = 20) {
  const safeLimit = Math.max(1, Number.parseInt(limit, 10) || 20);
  const [rows] = await pool.query(
    `SELECT p.id, p.name, p.brand, p.stock, p.price, p.discount_price, p.image, p.status,
            c.name AS category_name
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.stock <= :threshold AND p.status = 'active'
     ORDER BY p.stock ASC, p.name ASC
     LIMIT ${safeLimit}`,
    { threshold }
  );
  return rows;
}

/**
 * getRecentOrders
 */
async function getRecentOrders(limit = 10) {
  const safeLimit = Math.max(1, Number.parseInt(limit, 10) || 10);
  const [rows] = await pool.query(
    `SELECT o.id, o.order_number, o.total_amount, o.status, o.payment_method, o.created_at,
            u.id AS customer_id, u.name AS customer_name, u.email AS customer_email,
            pay.payment_status,
            (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS items_count
     FROM orders o
     JOIN users u ON u.id = o.user_id
     LEFT JOIN payments pay ON pay.order_id = o.id
     ORDER BY o.created_at DESC
     LIMIT ${safeLimit}`
  );
  return rows;
}

/**
 * getMonthlySales
 * Sales grouped by month for the last N months.
 *
 * A plain GROUP BY would omit months with zero orders, which makes a chart
 * lie by compressing quiet periods. A calendar table is generated first and
 * LEFT JOINed so empty months appear as zeros.
 */
async function getMonthlySales(months = 12) {
  const safeMonths = Math.min(36, Math.max(1, Number.parseInt(months, 10) || 12));

  const [rows] = await pool.query(
    `WITH RECURSIVE calendar AS (
       SELECT DATE_FORMAT(CURDATE(), '%Y-%m-01') AS month_start, 0 AS n
       UNION ALL
       SELECT DATE_SUB(month_start, INTERVAL 1 MONTH), n + 1
       FROM calendar
       WHERE n < ${safeMonths - 1}
     )
     SELECT
       DATE_FORMAT(cal.month_start, '%Y-%m') AS month,
       DATE_FORMAT(cal.month_start, '%b %Y') AS label,
       COALESCE(COUNT(o.id), 0) AS order_count,
       COALESCE(SUM(o.total_amount), 0) AS revenue
     FROM calendar cal
     LEFT JOIN orders o
       ON DATE_FORMAT(o.created_at, '%Y-%m') = DATE_FORMAT(cal.month_start, '%Y-%m')
       AND o.status NOT IN (${EXCLUDED_STATUS})
     GROUP BY cal.month_start
     ORDER BY cal.month_start ASC`
  );

  return rows.map((row) => ({
    month: row.month,
    label: row.label,
    order_count: Number(row.order_count),
    revenue: Number(row.revenue)
  }));
}

/**
 * getBestSellingProducts
 * Ranked by units actually sold (from order_items), not by the denormalised
 * sold_count column, so the figure stays correct even if that counter drifts.
 */
async function getBestSellingProducts({ limit = 10, from = null, to = null } = {}) {
  const safeLimit = Math.max(1, Number.parseInt(limit, 10) || 10);
  const [rows] = await pool.query(
    `SELECT
       oi.product_id,
       COALESCE(p.name, oi.product_name) AS name,
       p.brand, p.image, p.stock, p.price,
       c.name AS category_name,
       SUM(oi.quantity) AS units_sold,
       SUM(oi.subtotal) AS revenue,
       COUNT(DISTINCT oi.order_id) AS order_count
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     LEFT JOIN products p ON p.id = oi.product_id
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE o.status NOT IN (${EXCLUDED_STATUS})
       AND (:from IS NULL OR o.created_at >= :from)
       AND (:to IS NULL OR o.created_at < DATE_ADD(:to, INTERVAL 1 DAY))
     GROUP BY oi.product_id, name, p.brand, p.image, p.stock, p.price, c.name
     ORDER BY units_sold DESC
     LIMIT ${safeLimit}`,
    { from, to }
  );
  return rows;
}

/**
 * getSalesReport
 * Day-by-day breakdown for a date range.
 */
async function getSalesReport({ from = null, to = null } = {}) {
  const [rows] = await pool.query(
    `SELECT
       DATE(o.created_at) AS date,
       COUNT(o.id) AS order_count,
       SUM(o.total_amount) AS revenue,
       SUM(CASE WHEN pay.payment_status = 'Paid' THEN o.total_amount ELSE 0 END) AS collected,
       SUM((SELECT COALESCE(SUM(oi.quantity),0) FROM order_items oi WHERE oi.order_id = o.id)) AS units_sold
     FROM orders o
     LEFT JOIN payments pay ON pay.order_id = o.id
     WHERE o.status NOT IN (${EXCLUDED_STATUS})
       AND (:from IS NULL OR o.created_at >= :from)
       AND (:to IS NULL OR o.created_at < DATE_ADD(:to, INTERVAL 1 DAY))
     GROUP BY DATE(o.created_at)
     ORDER BY date DESC`,
    { from, to }
  );
  return rows;
}

/**
 * getSalesByPaymentMethod
 */
async function getSalesByPaymentMethod({ from = null, to = null } = {}) {
  const [rows] = await pool.query(
    `SELECT o.payment_method,
            COUNT(*) AS order_count,
            SUM(o.total_amount) AS revenue
     FROM orders o
     WHERE o.status NOT IN (${EXCLUDED_STATUS})
       AND (:from IS NULL OR o.created_at >= :from)
       AND (:to IS NULL OR o.created_at < DATE_ADD(:to, INTERVAL 1 DAY))
     GROUP BY o.payment_method
     ORDER BY revenue DESC`,
    { from, to }
  );
  return rows;
}

/**
 * getOrdersByStatus
 * Fulfilment pipeline snapshot.
 */
async function getOrdersByStatus() {
  const [rows] = await pool.query(
    `SELECT status, COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS value
     FROM orders
     GROUP BY status`
  );
  return rows;
}

/**
 * getInventoryReport
 * Stock valuation and health per product.
 */
async function getInventoryReport({ lowStockThreshold = 5 } = {}) {
  const [rows] = await pool.query(
    `SELECT p.id, p.name, p.brand, p.sku, p.stock, p.price, p.discount_price,
            p.status, p.sold_count,
            c.name AS category_name,
            (p.stock * COALESCE(p.discount_price, p.price)) AS stock_value,
            CASE
              WHEN p.stock = 0 THEN 'out_of_stock'
              WHEN p.stock <= :lowStockThreshold THEN 'low_stock'
              ELSE 'in_stock'
            END AS stock_status
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     ORDER BY p.stock ASC, p.name ASC`,
    { lowStockThreshold }
  );
  return rows;
}

/**
 * getInventorySummary
 */
async function getInventorySummary({ lowStockThreshold = 5 } = {}) {
  const [rows] = await pool.query(
    `SELECT
       COUNT(*) AS total_products,
       COALESCE(SUM(stock), 0) AS total_units,
       COALESCE(SUM(stock * COALESCE(discount_price, price)), 0) AS total_stock_value,
       SUM(stock = 0) AS out_of_stock_count,
       SUM(stock > 0 AND stock <= :lowStockThreshold) AS low_stock_count,
       SUM(stock > :lowStockThreshold) AS healthy_stock_count
     FROM products`,
    { lowStockThreshold }
  );

  const row = rows[0];
  return {
    total_products: Number(row.total_products),
    total_units: Number(row.total_units),
    total_stock_value: Number(Number(row.total_stock_value).toFixed(2)),
    out_of_stock_count: Number(row.out_of_stock_count || 0),
    low_stock_count: Number(row.low_stock_count || 0),
    healthy_stock_count: Number(row.healthy_stock_count || 0)
  };
}

/**
 * getCustomerReport
 * Per-customer purchasing behaviour, ordered by spend.
 */
async function getCustomerReport({ from = null, to = null, limit = 100 } = {}) {
  const safeLimit = Math.max(1, Number.parseInt(limit, 10) || 100);
  const [rows] = await pool.query(
    `SELECT
       u.id, u.name, u.email, u.phone, u.city, u.status, u.created_at AS joined_at,
       COUNT(DISTINCT o.id) AS order_count,
       COALESCE(SUM(o.total_amount), 0) AS total_spent,
       COALESCE(AVG(o.total_amount), 0) AS average_order_value,
       MAX(o.created_at) AS last_order_at
     FROM users u
     LEFT JOIN orders o
       ON o.user_id = u.id
       AND o.status NOT IN (${EXCLUDED_STATUS})
       AND (:from IS NULL OR o.created_at >= :from)
       AND (:to IS NULL OR o.created_at < DATE_ADD(:to, INTERVAL 1 DAY))
     GROUP BY u.id
     ORDER BY total_spent DESC, u.created_at DESC
     LIMIT ${safeLimit}`,
    { from, to }
  );
  return rows;
}

/**
 * getNewCustomersByMonth
 */
async function getNewCustomersByMonth(months = 12) {
  const safeMonths = Math.min(36, Math.max(1, Number.parseInt(months, 10) || 12));
  const [rows] = await pool.query(
    `WITH RECURSIVE calendar AS (
       SELECT DATE_FORMAT(CURDATE(), '%Y-%m-01') AS month_start, 0 AS n
       UNION ALL
       SELECT DATE_SUB(month_start, INTERVAL 1 MONTH), n + 1
       FROM calendar
       WHERE n < ${safeMonths - 1}
     )
     SELECT DATE_FORMAT(cal.month_start, '%Y-%m') AS month,
            DATE_FORMAT(cal.month_start, '%b %Y') AS label,
            COUNT(u.id) AS new_customers
     FROM calendar cal
     LEFT JOIN users u
       ON DATE_FORMAT(u.created_at, '%Y-%m') = DATE_FORMAT(cal.month_start, '%Y-%m')
     GROUP BY cal.month_start
     ORDER BY cal.month_start ASC`
  );
  return rows.map((r) => ({
    month: r.month,
    label: r.label,
    new_customers: Number(r.new_customers)
  }));
}

module.exports = {
  getCounts,
  getRevenue,
  getLowStockProducts,
  getRecentOrders,
  getMonthlySales,
  getBestSellingProducts,
  getSalesReport,
  getSalesByPaymentMethod,
  getOrdersByStatus,
  getInventoryReport,
  getInventorySummary,
  getCustomerReport,
  getNewCustomersByMonth
};
