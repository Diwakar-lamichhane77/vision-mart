// routes/cartRoutes.js
const express = require('express');
const router = express.Router();

const cartController = require('../controllers/cartController');
const { requireCustomerAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
  addToCartValidator,
  updateCartValidator,
  cartProductIdValidator
} = require('../validators/cartValidators');

// Every cart route belongs to a specific logged-in customer.
router.use(requireCustomerAuth);

router.get('/', cartController.getCart);

// Registered before '/:productId' so 'count' isn't parsed as an id.
router.get('/count', cartController.getCartCount);

router.post('/', addToCartValidator, validate, cartController.addToCart);

// Clear the entire cart. Declared before the parameterised DELETE so the
// two don't collide.
router.delete('/', cartController.clearCart);

// NOTE: :productId is the PRODUCT id, not the cart_item id — this matches
// how the frontend addresses cart lines.
router.put('/:productId', updateCartValidator, validate, cartController.updateCartItem);
router.delete('/:productId', cartProductIdValidator, validate, cartController.removeCartItem);

module.exports = router;
