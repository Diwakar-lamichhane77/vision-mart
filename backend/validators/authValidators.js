// validators/authValidators.js
// express-validator rule chains for every /api/auth and /api/admin auth route.
// These run before the controller; middleware/validate.js turns any failure
// into the standard { success:false, message, errors } response.

const { body } = require('express-validator');

const registerValidator = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required.')
    .isLength({ min: 3 }).withMessage('Name must be at least 3 characters.'),
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required.')
    .isEmail().withMessage('Must be a valid email address.')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required.')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
    .matches(/\d/).withMessage('Password must contain at least one number.')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter.'),
  body('phone').optional({ checkFalsy: true }).isString(),
  body('address').optional({ checkFalsy: true }).isString()
];

const loginValidator = [
  body('email').trim().notEmpty().withMessage('Email is required.').isEmail().withMessage('Must be a valid email address.'),
  body('password').notEmpty().withMessage('Password is required.')
];

const adminLoginValidator = [
  body('email').trim().notEmpty().withMessage('Email is required.').isEmail().withMessage('Must be a valid email address.'),
  body('password').notEmpty().withMessage('Password is required.')
];

const updateProfileValidator = [
  body('name').optional({ checkFalsy: true }).trim().isLength({ min: 3 }).withMessage('Name must be at least 3 characters.'),
  body('phone').optional({ checkFalsy: true }).isString(),
  body('address').optional({ checkFalsy: true }).isString(),
  body('city').optional({ checkFalsy: true }).isString()
];

const changePasswordValidator = [
  body('current_password').notEmpty().withMessage('Current password is required.'),
  body('new_password')
    .notEmpty().withMessage('New password is required.')
    .isLength({ min: 8 }).withMessage('New password must be at least 8 characters.')
    .matches(/\d/).withMessage('New password must contain at least one number.')
    .matches(/[A-Z]/).withMessage('New password must contain at least one uppercase letter.')
];

module.exports = {
  registerValidator,
  loginValidator,
  adminLoginValidator,
  updateProfileValidator,
  changePasswordValidator
};
