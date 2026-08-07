// routes/paymentRoutes.js
const express = require('express');
const router = express.Router();

const paymentController = require('../controllers/paymentController');
const { requireCustomerAuth, requireAdminAuth, requireAnyAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
  initiatePaymentValidator,
  verifyPaymentValidator,
  orderIdParamValidator,
  updatePaymentStatusValidator
} = require('../validators/paymentValidators');

// Public: which payment methods this deployment supports.
router.get('/methods', paymentController.getPaymentMethods);

// eSewa browser redirect targets. Unauthenticated by necessity — the customer
// arrives here from eSewa's domain with no Authorization header. These only
// REPORT the outcome; nothing is settled until /verify confirms server-side.
router.get('/esewa/success', paymentController.esewaSuccessCallback);
router.get('/esewa/failure', paymentController.esewaFailureCallback);

// Customer payment actions.
router.post('/initiate', requireCustomerAuth, initiatePaymentValidator, validate, paymentController.initiatePayment);
router.post('/verify', requireCustomerAuth, verifyPaymentValidator, validate, paymentController.verifyPayment);

// Readable by the owning customer or any admin.
router.get('/order/:orderId', requireAnyAuth, orderIdParamValidator, validate, paymentController.getPaymentByOrder);

// Admin-only manual reconciliation.
router.put(
  '/:orderId/status',
  requireAdminAuth,
  updatePaymentStatusValidator,
  validate,
  paymentController.updatePaymentStatus
);

module.exports = router;
