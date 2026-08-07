// routes/orderRoutes.js
const express = require('express');
const router = express.Router();

const orderController = require('../controllers/orderController');
const { requireCustomerAuth, requireAdminAuth, requireAnyAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
  createOrderValidator,
  updateStatusValidator,
  cancelOrderValidator,
  orderIdValidator,
  listOrdersValidator
} = require('../validators/orderValidators');

// Checkout — customers only (an admin has no cart to check out).
router.post('/', requireCustomerAuth, createOrderValidator, validate, orderController.createOrder);

// Listing and detail serve both roles; the controller scopes the data.
router.get('/', requireAnyAuth, listOrdersValidator, validate, orderController.getOrders);
router.get('/:id', requireAnyAuth, orderIdValidator, validate, orderController.getOrderById);

// Cancellation: customers may cancel their own early-stage orders; admins
// may cancel any order. Both paths restore stock.
router.put('/:id/cancel', requireAnyAuth, cancelOrderValidator, validate, orderController.cancelOrder);

// Admin-only fulfilment controls.
router.put('/:id/status', requireAdminAuth, updateStatusValidator, validate, orderController.updateOrderStatus);
router.delete('/:id', requireAdminAuth, orderIdValidator, validate, orderController.deleteOrder);

module.exports = router;
