// validators/orderValidators.js

const { body, param, query } = require('express-validator');
const { ORDER_STATUSES } = require('../models/orderModel');
const { PAYMENT_METHODS } = require('../models/paymentModel');

const createOrderValidator = [
  body('shipping_name')
    .trim()
    .notEmpty().withMessage('Shipping name is required.')
    .isLength({ min: 2, max: 100 }).withMessage('Shipping name must be between 2 and 100 characters.'),
  body('shipping_phone')
    .trim()
    .notEmpty().withMessage('Shipping phone is required.')
    .isLength({ min: 7, max: 20 }).withMessage('Please provide a valid phone number.'),
  body('shipping_address')
    .trim()
    .notEmpty().withMessage('Shipping address is required.')
    .isLength({ min: 5, max: 255 }).withMessage('Shipping address must be between 5 and 255 characters.'),
  body('shipping_city').optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
  body('payment_method')
    .notEmpty().withMessage('Payment method is required.')
    .isIn(PAYMENT_METHODS).withMessage(`Payment method must be one of: ${PAYMENT_METHODS.join(', ')}.`),
  body('notes').optional({ checkFalsy: true }).trim().isLength({ max: 500 }),

  // `items` is optional: when omitted the order is built from the user's cart.
  body('items').optional().isArray().withMessage('Items must be an array.'),
  body('items.*.product_id')
    .if(body('items').exists())
    .notEmpty().withMessage('Each item needs a product_id.')
    .isInt({ min: 1 }).withMessage('product_id must be a positive integer.'),
  body('items.*.quantity')
    .if(body('items').exists())
    .optional()
    .isInt({ min: 1, max: 999 }).withMessage('Item quantity must be between 1 and 999.')
];

const updateStatusValidator = [
  param('id').isInt({ min: 1 }).withMessage('Order id must be a positive integer.'),
  body('status')
    .notEmpty().withMessage('Status is required.')
    .isIn(ORDER_STATUSES).withMessage(`Status must be one of: ${ORDER_STATUSES.join(', ')}.`),
  body('cancelled_reason').optional({ checkFalsy: true }).trim().isLength({ max: 255 })
];

const cancelOrderValidator = [
  param('id').isInt({ min: 1 }).withMessage('Order id must be a positive integer.'),
  body('reason').optional({ checkFalsy: true }).trim().isLength({ max: 255 })
];

const orderIdValidator = [
  param('id').isInt({ min: 1 }).withMessage('Order id must be a positive integer.')
];

const listOrdersValidator = [
  query('status').optional({ checkFalsy: true }).isIn(ORDER_STATUSES).withMessage('Invalid status filter.'),
  query('payment_method').optional({ checkFalsy: true }).isIn(PAYMENT_METHODS).withMessage('Invalid payment method filter.'),
  query('limit').optional({ checkFalsy: true }).isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100.'),
  query('page').optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage('page must be a positive integer.'),
  query('from').optional({ checkFalsy: true }).isISO8601().withMessage('from must be a valid date (YYYY-MM-DD).'),
  query('to').optional({ checkFalsy: true }).isISO8601().withMessage('to must be a valid date (YYYY-MM-DD).')
];

module.exports = {
  createOrderValidator,
  updateStatusValidator,
  cancelOrderValidator,
  orderIdValidator,
  listOrdersValidator
};
