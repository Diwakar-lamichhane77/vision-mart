// validators/wishlistValidators.js

const { body, param } = require('express-validator');

const addToWishlistValidator = [
  body('product_id')
    .notEmpty().withMessage('Product id is required.')
    .isInt({ min: 1 }).withMessage('Product id must be a positive integer.')
];

const wishlistProductIdValidator = [
  // As with the cart, this is the PRODUCT id — not the wishlist row id.
  param('productId').isInt({ min: 1 }).withMessage('Product id must be a positive integer.')
];

module.exports = { addToWishlistValidator, wishlistProductIdValidator };
