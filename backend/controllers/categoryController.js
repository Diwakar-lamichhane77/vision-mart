// controllers/categoryController.js
// CRUD for product categories.
// Read endpoints are public (the storefront needs them); create/update/delete
// require an admin token (enforced in routes/categoryRoutes.js).

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const { buildFileUrl, slugify } = require('../utils/helpers');
const { deleteUploadedFile } = require('../config/multer');
const categoryModel = require('../models/categoryModel');

const UPLOAD_SUBFOLDER = 'categories';

/**
 * toApiCategory
 * Shapes a DB row into the response format the frontend expects.
 * Critically, `image` is converted from a stored filename into an absolute
 * URL, because the frontend assigns it straight to <img src>.
 */
function toApiCategory(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    image: buildFileUrl(row.image, UPLOAD_SUBFOLDER),
    status: row.status,
    products_count: Number(row.products_count || 0),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

/**
 * generateUniqueSlug
 * Builds a slug from the name and appends a numeric suffix if that slug is
 * already taken, so the UNIQUE constraint on `categories.slug` can't blow up
 * on two similarly-named categories.
 */
async function generateUniqueSlug(name, excludeId = null) {
  const baseSlug = slugify(name) || 'category';
  let candidate = baseSlug;
  let suffix = 2;

  // Loop until we find a slug nobody else is using.
  // eslint-disable-next-line no-await-in-loop
  while (await categoryModel.findBySlug(candidate, excludeId)) {
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

/**
 * GET /api/categories
 * Public. Supports ?status=active to hide disabled categories.
 */
const getAllCategories = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const rows = await categoryModel.findAll({ status });
  const categories = rows.map(toApiCategory);
  return sendSuccess(res, 200, 'Categories fetched successfully.', categories);
});

/**
 * GET /api/categories/:id
 * Public.
 */
const getCategoryById = asyncHandler(async (req, res) => {
  const category = await categoryModel.findById(req.params.id);
  if (!category) {
    throw new ApiError(404, 'Category not found.');
  }
  return sendSuccess(res, 200, 'Category fetched successfully.', toApiCategory(category));
});

/**
 * POST /api/categories
 * Admin only. Accepts multipart/form-data with an optional `image` file.
 */
const createCategory = asyncHandler(async (req, res) => {
  const { name, description, status } = req.body;

  // Friendly duplicate check before hitting the UNIQUE constraint.
  const existing = await categoryModel.findByName(name.trim());
  if (existing) {
    // The file was already written to disk by Multer; clean it up so a
    // rejected request doesn't leave an orphan behind.
    if (req.file) deleteUploadedFile(UPLOAD_SUBFOLDER, req.file.filename);
    throw new ApiError(409, 'A category with this name already exists.');
  }

  const slug = await generateUniqueSlug(name);

  const categoryId = await categoryModel.create({
    name: name.trim(),
    slug,
    description: description || null,
    image: req.file ? req.file.filename : null,
    status: status || 'active'
  });

  const category = await categoryModel.findById(categoryId);
  return sendSuccess(res, 201, 'Category created successfully.', toApiCategory(category));
});

/**
 * PUT /api/categories/:id
 * Admin only. Any omitted field is left unchanged.
 */
const updateCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, description, status } = req.body;

  const existing = await categoryModel.findById(id);
  if (!existing) {
    if (req.file) deleteUploadedFile(UPLOAD_SUBFOLDER, req.file.filename);
    throw new ApiError(404, 'Category not found.');
  }

  // Only check for a name clash if the name is actually changing.
  if (name && name.trim() !== existing.name) {
    const duplicate = await categoryModel.findByName(name.trim(), id);
    if (duplicate) {
      if (req.file) deleteUploadedFile(UPLOAD_SUBFOLDER, req.file.filename);
      throw new ApiError(409, 'A category with this name already exists.');
    }
  }

  // Regenerate the slug only when the name changed.
  const slug = name && name.trim() !== existing.name ? await generateUniqueSlug(name, id) : null;

  const updated = await categoryModel.update(id, {
    name: name ? name.trim() : null,
    slug,
    description: description ?? null,
    image: req.file ? req.file.filename : null,
    status: status || null
  });

  // Replacing the image? Remove the old file so uploads/ doesn't grow forever.
  if (req.file && existing.image) {
    deleteUploadedFile(UPLOAD_SUBFOLDER, existing.image);
  }

  return sendSuccess(res, 200, 'Category updated successfully.', toApiCategory(updated));
});

/**
 * DELETE /api/categories/:id
 * Admin only. Refuses to delete a category that still has products attached,
 * since `products.category_id` is ON DELETE RESTRICT — this returns a clear
 * message instead of a raw foreign-key error.
 */
const deleteCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existing = await categoryModel.findById(id);
  if (!existing) {
    throw new ApiError(404, 'Category not found.');
  }

  const productCount = await categoryModel.countProducts(id);
  if (productCount > 0) {
    throw new ApiError(
      400,
      `Cannot delete this category because ${productCount} product(s) are still assigned to it. Reassign or delete those products first.`
    );
  }

  await categoryModel.remove(id);

  // Only clean up the image once the row is definitely gone.
  if (existing.image) {
    deleteUploadedFile(UPLOAD_SUBFOLDER, existing.image);
  }

  return sendSuccess(res, 200, 'Category deleted successfully.', {});
});

module.exports = {
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  toApiCategory
};
