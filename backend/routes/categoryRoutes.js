// routes/categoryRoutes.js
const express = require('express');
const router = express.Router();

const categoryController = require('../controllers/categoryController');
const { requireAdminAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { createUploader } = require('../config/multer');
const {
  createCategoryValidator,
  updateCategoryValidator,
  categoryIdValidator
} = require('../validators/categoryValidators');

// Category images live in uploads/categories and are served at
// /uploads/categories/<filename> by the static handler in server.js.
const upload = createUploader('categories', 'category');

// ----- Public routes (storefront needs these without a login) -----
router.get('/', categoryController.getAllCategories);
router.get('/:id', categoryIdValidator, validate, categoryController.getCategoryById);

// ----- Admin-only routes -----
// Order matters: auth first (reject early), then Multer parses the multipart
// body, then validation runs against the parsed fields.
router.post(
  '/',
  requireAdminAuth,
  upload.single('image'),
  createCategoryValidator,
  validate,
  categoryController.createCategory
);

router.put(
  '/:id',
  requireAdminAuth,
  upload.single('image'),
  updateCategoryValidator,
  validate,
  categoryController.updateCategory
);

router.delete(
  '/:id',
  requireAdminAuth,
  categoryIdValidator,
  validate,
  categoryController.deleteCategory
);

module.exports = router;
