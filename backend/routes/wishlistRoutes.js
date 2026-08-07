// routes/wishlistRoutes.js
const express = require('express');
const router = express.Router();

const wishlistController = require('../controllers/wishlistController');
const { requireCustomerAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
  addToWishlistValidator,
  wishlistProductIdValidator
} = require('../validators/wishlistValidators');

// Every wishlist route belongs to a specific logged-in customer.
router.use(requireCustomerAuth);

router.get('/', wishlistController.getWishlist);

// Static paths must be registered before '/:productId' so they aren't
// swallowed as route params.
router.get('/count', wishlistController.getWishlistCount);
router.post('/toggle', addToWishlistValidator, validate, wishlistController.toggleWishlist);

router.post('/', addToWishlistValidator, validate, wishlistController.addToWishlist);

// Clear everything — declared before the parameterised DELETE.
router.delete('/', wishlistController.clearWishlist);

// NOTE: :productId is the PRODUCT id, not the wishlist row id.
router.delete(
  '/:productId',
  wishlistProductIdValidator,
  validate,
  wishlistController.removeFromWishlist
);

module.exports = router;
