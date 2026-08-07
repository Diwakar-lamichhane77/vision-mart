// validators/cartValidators.js

const { body, param } = require('express-validator');

const addToCartValidator = [
  body('product_id')
    .notEmpty().withMessage('Product id is required.')
    .isInt({ min: 1 }).withMessage('Product id must be a positive integer.'),
  // `optional({ checkFalsy: true })` would treat quantity 0 as "not supplied"
  // and silently default it to 1, so 0 / negatives are validated explicitly.
  // An omitted or empty quantity still legitimately means "1".
  body('quantity')
    .optional({ nullable: true })
    .custom((value) => {
      if (value === '') return true; // omitted -> controller defaults to 1
      const num = Number(value);
      if (!Number.isInteger(num) || num < 1 || num > 999) {
        throw new Error('Quantity must be a whole number between 1 and 999.');
      }
      return true;
    })
];

const updateCartValidator = [
  // NOTE: this is the PRODUCT id, not the cart_item id — the frontend
  // addresses cart lines by product.
  param('productId').isInt({ min: 1 }).withMessage('Product id must be a positive integer.'),
  body('quantity')
    .notEmpty().withMessage('Quantity is required.')
    .isInt({ min: 1, max: 999 }).withMessage('Quantity must be between 1 and 999.')
];

const cartProductIdValidator = [
  param('productId').isInt({ min: 1 }).withMessage('Product id must be a positive integer.')
];

module.exports = { addToCartValidator, updateCartValidator, cartProductIdValidator };
