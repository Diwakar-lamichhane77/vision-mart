// routes/authRoutes.js
const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const { requireCustomerAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
  registerValidator,
  loginValidator,
  updateProfileValidator,
  changePasswordValidator
} = require('../validators/authValidators');

router.post('/register', registerValidator, validate, authController.register);
router.post('/login', loginValidator, validate, authController.login);

// Unified token check — accepts either a customer or an admin JWT.
router.get('/verify', authController.verify);

router.get('/profile', requireCustomerAuth, authController.getProfile);
router.put('/profile', requireCustomerAuth, updateProfileValidator, validate, authController.updateProfile);
router.put(
  '/change-password',
  requireCustomerAuth,
  changePasswordValidator,
  validate,
  authController.changePassword
);

module.exports = router;
