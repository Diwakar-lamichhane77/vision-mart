// validators/productValidators.js
// Validation chains for product endpoints. These run against multipart bodies
// (Multer populates req.body for text fields before validation).

const { body, param, query } = require('express-validator');
const { SORT_OPTIONS } = require('../models/productModel');

const createProductValidator = [
  body('category_id')
    .notEmpty().withMessage('Category is required.')
    .isInt({ min: 1 }).withMessage('Category id must be a positive integer.'),
  body('name')
    .trim()
    .notEmpty().withMessage('Product name is required.')
    .isLength({ min: 2, max: 200 }).withMessage('Product name must be between 2 and 200 characters.'),
  body('price')
    .notEmpty().withMessage('Price is required.')
    .isFloat({ min: 0 }).withMessage('Price must be a non-negative number.'),
  body('discount_price')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 }).withMessage('Discount price must be a non-negative number.')
    // A discount above the list price is almost always a data-entry mistake,
    // and it would make effective_price sorting nonsensical.
    .custom((value, { req }) => {
      if (req.body.price !== undefined && Number(value) > Number(req.body.price)) {
        throw new Error('Discount price cannot be greater than the regular price.');
      }
      return true;
    }),
  body('stock')
    .optional({ checkFalsy: true })
    .isInt({ min: 0 }).withMessage('Stock must be a non-negative integer.'),
  body('description').optional({ checkFalsy: true }).trim(),
  body('brand').optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
  body('frame_type').optional({ checkFalsy: true }).trim().isLength({ max: 50 }),
  body('frame_material').optional({ checkFalsy: true }).trim().isLength({ max: 50 }),
  body('lens_type').optional({ checkFalsy: true }).trim().isLength({ max: 50 }),
  body('color').optional({ checkFalsy: true }).trim().isLength({ max: 50 }),
  body('sku').optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
  body('status')
    .optional({ checkFalsy: true })
    .isIn(['active', 'inactive']).withMessage("Status must be either 'active' or 'inactive'.")
];

const updateProductValidator = [
  param('id').isInt({ min: 1 }).withMessage('Product id must be a positive integer.'),
  body('category_id').optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage('Category id must be a positive integer.'),
  body('name')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 200 }).withMessage('Product name must be between 2 and 200 characters.'),
  body('price').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('Price must be a non-negative number.'),
  body('discount_price')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 }).withMessage('Discount price must be a non-negative number.'),
  body('stock').optional({ checkFalsy: true }).isInt({ min: 0 }).withMessage('Stock must be a non-negative integer.'),
  body('description').optional({ checkFalsy: true }).trim(),
  body('brand').optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
  body('frame_type').optional({ checkFalsy: true }).trim().isLength({ max: 50 }),
  body('frame_material').optional({ checkFalsy: true }).trim().isLength({ max: 50 }),
  body('lens_type').optional({ checkFalsy: true }).trim().isLength({ max: 50 }),
  body('color').optional({ checkFalsy: true }).trim().isLength({ max: 50 }),
  body('sku').optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
  body('status')
    .optional({ checkFalsy: true })
    .isIn(['active', 'inactive']).withMessage("Status must be either 'active' or 'inactive'.")
];

const productIdValidator = [
  param('id').isInt({ min: 1 }).withMessage('Product id must be a positive integer.')
];

const listProductsValidator = [
  query('category_id').optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage('category_id must be a positive integer.'),
  query('min_price').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('min_price must be a non-negative number.'),
  query('max_price').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('max_price must be a non-negative number.'),
  query('limit').optional({ checkFalsy: true }).isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100.'),
  query('page').optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage('page must be a positive integer.'),
  query('sort')
    .optional({ checkFalsy: true })
    .isIn(Object.keys(SORT_OPTIONS))
    .withMessage(`sort must be one of: ${Object.keys(SORT_OPTIONS).join(', ')}.`)
];

module.exports = {
  createProductValidator,
  updateProductValidator,
  productIdValidator,
  listProductsValidator
};
