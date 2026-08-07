// routes/reviewRoutes.js
const express = require('express');
const router = express.Router();

const reviewController = require('../controllers/reviewController');
const { requireCustomerAuth, requireAdminAuth, requireAnyAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
  createReviewValidator,
  updateReviewValidator,
  reviewIdValidator,
  productIdParamValidator,
  listReviewsValidator
} = require('../validators/reviewValidators');

// Public: reviews for a product (paginated, with a rating breakdown).
router.get(
  '/product/:productId',
  productIdParamValidator,
  listReviewsValidator,
  validate,
  reviewController.getProductReviews
);

// Customer's own reviews. Registered before '/:id' so 'my' isn't read as an id.
router.get('/my', requireCustomerAuth, reviewController.getMyReviews);

// Admin moderation list.
router.get('/', requireAdminAuth, listReviewsValidator, validate, reviewController.getAllReviews);

// Write operations — customers only.
router.post('/', requireCustomerAuth, createReviewValidator, validate, reviewController.createReview);
router.put('/:id', requireCustomerAuth, updateReviewValidator, validate, reviewController.updateReview);

// Delete: the owning customer OR an admin (moderation), so this accepts
// either token type and the controller decides.
router.delete('/:id', requireAnyAuth, reviewIdValidator, validate, reviewController.deleteReview);

module.exports = router;
