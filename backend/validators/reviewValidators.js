// validators/reviewValidators.js

const { body, param, query } = require('express-validator');

const createReviewValidator = [
  body('product_id')
    .notEmpty().withMessage('Product id is required.')
    .isInt({ min: 1 }).withMessage('Product id must be a positive integer.'),
  body('rating')
    .notEmpty().withMessage('Rating is required.')
    .isInt({ min: 1, max: 5 }).withMessage('Rating must be a whole number between 1 and 5.'),
  body('comment')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 2000 }).withMessage('Comment must be 2000 characters or fewer.')
];

const updateReviewValidator = [
  param('id').isInt({ min: 1 }).withMessage('Review id must be a positive integer.'),
  // Both optional on update, but at least one must be present — otherwise
  // the request is a no-op and almost certainly a client bug.
  body('rating')
    .optional({ nullable: true })
    .isInt({ min: 1, max: 5 }).withMessage('Rating must be a whole number between 1 and 5.'),
  body('comment')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 2000 }).withMessage('Comment must be 2000 characters or fewer.'),
  body().custom((value) => {
    if (value.rating === undefined && value.comment === undefined) {
      throw new Error('Provide a rating or a comment to update.');
    }
    return true;
  })
];

const reviewIdValidator = [
  param('id').isInt({ min: 1 }).withMessage('Review id must be a positive integer.')
];

const productIdParamValidator = [
  param('productId').isInt({ min: 1 }).withMessage('Product id must be a positive integer.')
];

const listReviewsValidator = [
  query('rating').optional({ checkFalsy: true }).isInt({ min: 1, max: 5 }).withMessage('Rating filter must be between 1 and 5.'),
  query('product_id').optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage('product_id must be a positive integer.'),
  query('limit').optional({ checkFalsy: true }).isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100.'),
  query('page').optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage('page must be a positive integer.')
];

module.exports = {
  createReviewValidator,
  updateReviewValidator,
  reviewIdValidator,
  productIdParamValidator,
  listReviewsValidator
};
