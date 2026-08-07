// validators/paymentValidators.js

const { body, param } = require('express-validator');
const { PAYMENT_STATUSES } = require('../models/paymentModel');

const initiatePaymentValidator = [
  body('order_id')
    .notEmpty().withMessage('Order id is required.')
    .isInt({ min: 1 }).withMessage('Order id must be a positive integer.')
];

const verifyPaymentValidator = [
  body('order_id')
    .notEmpty().withMessage('Order id is required.')
    .isInt({ min: 1 }).withMessage('Order id must be a positive integer.'),
  // Either a transaction_id (eSewa refId) or a token (Khalti) must be
  // present; which one depends on the gateway, so the gateway itself
  // enforces the specific requirement with a clearer message.
  body().custom((value) => {
    if (!value.transaction_id && !value.token && !value.refId) {
      throw new Error('A transaction_id (eSewa) or token (Khalti) is required.');
    }
    return true;
  }),
  // Note: an `amount` in the body is deliberately IGNORED by the controller —
  // the charge is always taken from the order record.
  body('transaction_id').optional({ checkFalsy: true }).trim().isLength({ max: 150 }),
  body('token').optional({ checkFalsy: true }).trim().isLength({ max: 150 })
];

const orderIdParamValidator = [
  param('orderId').isInt({ min: 1 }).withMessage('Order id must be a positive integer.')
];

const updatePaymentStatusValidator = [
  param('orderId').isInt({ min: 1 }).withMessage('Order id must be a positive integer.'),
  body('payment_status')
    .notEmpty().withMessage('Payment status is required.')
    .isIn(PAYMENT_STATUSES).withMessage(`Payment status must be one of: ${PAYMENT_STATUSES.join(', ')}.`),
  body('transaction_id').optional({ checkFalsy: true }).trim().isLength({ max: 150 })
];

module.exports = {
  initiatePaymentValidator,
  verifyPaymentValidator,
  orderIdParamValidator,
  updatePaymentStatusValidator
};
