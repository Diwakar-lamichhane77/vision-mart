// routes/adminAuthRoutes.js
const express = require('express');
const router = express.Router();

const adminAuthController = require('../controllers/adminAuthController');
const { requireAdminAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { adminLoginValidator } = require('../validators/authValidators');

router.post('/login', adminLoginValidator, validate, adminAuthController.login);
router.get('/profile', requireAdminAuth, adminAuthController.getProfile);

module.exports = router;
