// routes/productRoutes.js
const express = require('express');
const router = express.Router();

const productController = require('../controllers/productController');
const { requireAdminAuth, optionalCustomerAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { createUploader } = require('../config/multer');
const {
  createProductValidator,
  updateProductValidator,
  productIdValidator,
  listProductsValidator
} = require('../validators/productValidators');

const upload = createUploader('products', 'product');

// ----- Public routes (auth optional) -----
// optionalCustomerAuth lets anonymous visitors browse, while logged-in
// customers additionally get is_in_cart / is_in_wishlist flags.
router.get(
  '/',
  optionalCustomerAuth,
  listProductsValidator,
  validate,
  productController.getAllProducts
);

// Must be registered BEFORE '/:id', otherwise Express would treat
// 'filters' as an :id value.
router.get('/filters', productController.getFilterOptions);

router.get(
  '/:id',
  optionalCustomerAuth,
  productIdValidator,
  validate,
  productController.getProductById
);

// ----- Admin-only routes -----
router.post(
  '/',
  requireAdminAuth,
  upload.single('image'),
  createProductValidator,
  validate,
  productController.createProduct
);

router.put(
  '/:id',
  requireAdminAuth,
  upload.single('image'),
  updateProductValidator,
  validate,
  productController.updateProduct
);

router.delete(
  '/:id',
  requireAdminAuth,
  productIdValidator,
  validate,
  productController.deleteProduct
);

module.exports = router;
