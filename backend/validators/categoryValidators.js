// validators/categoryValidators.js
// Validation chains for the category endpoints.
// Note: these run on multipart/form-data bodies (Multer populates req.body
// for text fields before validation runs), so the rules are the same as
// they'd be for JSON.

const { body, param } = require('express-validator');

const createCategoryValidator = [
  body('name')
    .trim()
    .notEmpty().withMessage('Category name is required.')
    .isLength({ min: 2, max: 100 }).withMessage('Category name must be between 2 and 100 characters.'),
  body('description')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 1000 }).withMessage('Description must be 1000 characters or fewer.'),
  body('status')
    .optional({ checkFalsy: true })
    .isIn(['active', 'inactive']).withMessage("Status must be either 'active' or 'inactive'.")
];

const updateCategoryValidator = [
  param('id').isInt({ min: 1 }).withMessage('Category id must be a positive integer.'),
  body('name')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('Category name must be between 2 and 100 characters.'),
  body('description')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 1000 }).withMessage('Description must be 1000 characters or fewer.'),
  body('status')
    .optional({ checkFalsy: true })
    .isIn(['active', 'inactive']).withMessage("Status must be either 'active' or 'inactive'.")
];

const categoryIdValidator = [
  param('id').isInt({ min: 1 }).withMessage('Category id must be a positive integer.')
];

module.exports = { createCategoryValidator, updateCategoryValidator, categoryIdValidator };
