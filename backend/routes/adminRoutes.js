// routes/adminRoutes.js
// Admin-only dashboard, reports and customer management.
// Mounted under /api/admin (dashboard, users) and /api/reports.

const express = require('express');
const { query, param, body } = require('express-validator');

const dashboardController = require('../controllers/dashboardController');
const reportController = require('../controllers/reportController');
const adminUserController = require('../controllers/adminUserController');
const { requireAdminAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');

// ---------------------------------------------------------------
// Shared validators
// ---------------------------------------------------------------
const dateRangeValidator = [
  query('from').optional({ checkFalsy: true }).isISO8601().withMessage('from must be a valid date (YYYY-MM-DD).'),
  query('to').optional({ checkFalsy: true }).isISO8601().withMessage('to must be a valid date (YYYY-MM-DD).'),
  query('limit').optional({ checkFalsy: true }).isInt({ min: 1, max: 500 }).withMessage('limit must be between 1 and 500.')
];

const thresholdValidator = [
  query('low_stock_threshold')
    .optional({ checkFalsy: true })
    .isInt({ min: 0, max: 10000 })
    .withMessage('low_stock_threshold must be a non-negative integer.')
];

// ---------------------------------------------------------------
// Dashboard router  ->  mounted at /api/admin/dashboard
// ---------------------------------------------------------------
const dashboardRouter = express.Router();
dashboardRouter.use(requireAdminAuth);

dashboardRouter.get(
  '/',
  [
    ...thresholdValidator,
    query('months').optional({ checkFalsy: true }).isInt({ min: 1, max: 36 }).withMessage('months must be between 1 and 36.'),
    query('recent_limit').optional({ checkFalsy: true }).isInt({ min: 1, max: 50 }).withMessage('recent_limit must be between 1 and 50.')
  ],
  validate,
  dashboardController.getDashboard
);

// ---------------------------------------------------------------
// Reports router  ->  mounted at /api/reports
// ---------------------------------------------------------------
const reportRouter = express.Router();
reportRouter.use(requireAdminAuth);

reportRouter.get('/sales', dateRangeValidator, validate, reportController.getSalesReport);
reportRouter.get('/inventory', thresholdValidator, validate, reportController.getInventoryReport);
reportRouter.get('/customers', dateRangeValidator, validate, reportController.getCustomerReport);
reportRouter.get('/best-selling', dateRangeValidator, validate, reportController.getBestSellingReport);

// ---------------------------------------------------------------
// Admin users router  ->  mounted at /api/admin/users
// ---------------------------------------------------------------
const adminUserRouter = express.Router();
adminUserRouter.use(requireAdminAuth);

adminUserRouter.get(
  '/',
  [
    query('status').optional({ checkFalsy: true }).isIn(['active', 'blocked']).withMessage("status must be 'active' or 'blocked'."),
    query('limit').optional({ checkFalsy: true }).isInt({ min: 1, max: 500 }).withMessage('limit must be between 1 and 500.'),
    query('page').optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage('page must be a positive integer.')
  ],
  validate,
  adminUserController.getAllUsers
);

adminUserRouter.get(
  '/:id',
  [param('id').isInt({ min: 1 }).withMessage('Customer id must be a positive integer.')],
  validate,
  adminUserController.getUserById
);

adminUserRouter.put(
  '/:id/status',
  [
    param('id').isInt({ min: 1 }).withMessage('Customer id must be a positive integer.'),
    body('status')
      .notEmpty().withMessage('Status is required.')
      .isIn(['active', 'blocked']).withMessage("Status must be 'active' or 'blocked'.")
  ],
  validate,
  adminUserController.updateUserStatus
);

module.exports = { dashboardRouter, reportRouter, adminUserRouter };
