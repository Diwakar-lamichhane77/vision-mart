// controllers/productController.js
// Product CRUD plus the storefront's search / filter / sort endpoint.
//
// Read endpoints use `optionalCustomerAuth`: they work fine for anonymous
// visitors, but when a customer token IS present the response includes
// per-user `is_in_cart` / `is_in_wishlist` flags the frontend uses to render
// filled-in heart and cart icons.

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const { buildFileUrl } = require('../utils/helpers');
const { deleteUploadedFile } = require('../config/multer');
const productModel = require('../models/productModel');
const categoryModel = require('../models/categoryModel');

const UPLOAD_SUBFOLDER = 'products';

/**
 * toApiProduct
 * Shapes a DB row into the exact structure the frontend expects.
 * Numeric columns come back from MySQL as strings for DECIMAL types, so they
 * are explicitly cast — otherwise the frontend's arithmetic (subtotals,
 * price filters) would silently do string concatenation.
 */
function toApiProduct(row) {
  if (!row) return null;
  return {
    id: row.id,
    category_id: row.category_id,
    name: row.name,
    brand: row.brand,
    description: row.description,
    price: Number(row.price),
    discount_price: row.discount_price === null ? null : Number(row.discount_price),
    effective_price: Number(row.effective_price ?? row.price),
    frame_type: row.frame_type,
    frame_material: row.frame_material,
    lens_type: row.lens_type,
    color: row.color,
    stock: Number(row.stock),
    image: buildFileUrl(row.image, UPLOAD_SUBFOLDER),
    sku: row.sku,
    sold_count: Number(row.sold_count || 0),
    status: row.status,
    // Nested category object — the frontend reads `product.category.name`.
    category: row.category_id_join
      ? { id: row.category_id_join, name: row.category_name, slug: row.category_slug }
      : null,
    rating: Number(Number(row.rating || 0).toFixed(2)),
    reviews_count: Number(row.reviews_count || 0),
    // EXISTS() returns 1/0 in MySQL; the frontend expects real booleans.
    is_in_cart: Boolean(row.is_in_cart),
    is_in_wishlist: Boolean(row.is_in_wishlist),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

/**
 * toApiReview
 */
function toApiReview(row) {
  return {
    id: row.id,
    rating: Number(row.rating),
    comment: row.comment,
    created_at: row.created_at,
    updated_at: row.updated_at,
    user: { id: row.user_id, name: row.user_name }
  };
}

/**
 * GET /api/products
 * Public (auth optional). Supports:
 *   search, category_id, brand, color, frame_type, frame_material, lens_type,
 *   min_price, max_price, in_stock, status, sort, limit, page
 *
 * Returns a FLAT ARRAY in `data` (the frontend iterates `result.data`
 * directly), with pagination details in `meta`.
 */
const getAllProducts = asyncHandler(async (req, res) => {
  const {
    search,
    category_id: categoryId,
    brand,
    color,
    frame_type: frameType,
    frame_material: frameMaterial,
    lens_type: lensType,
    min_price: minPrice,
    max_price: maxPrice,
    in_stock: inStock,
    sort,
    limit,
    page
  } = req.query;

  // Admins may explicitly request inactive products; the storefront only
  // ever sees active ones.
  const status = req.query.status || (req.admin ? undefined : 'active');

  const filters = {
    search,
    category_id: categoryId,
    brand,
    color,
    frame_type: frameType,
    frame_material: frameMaterial,
    lens_type: lensType,
    min_price: minPrice !== undefined && minPrice !== '' ? Number(minPrice) : null,
    max_price: maxPrice !== undefined && maxPrice !== '' ? Number(maxPrice) : null,
    in_stock: inStock === 'true' || inStock === '1',
    status
  };

  const perPage = limit ? Number.parseInt(limit, 10) : 20;
  const currentPage = page ? Number.parseInt(page, 10) : 1;
  const offset = (currentPage - 1) * perPage;

  const rows = await productModel.findAll(filters, {
    sort: sort || 'newest',
    limit: perPage,
    offset,
    userId: req.user ? req.user.id : null
  });

  const total = await productModel.countAll(filters);
  const products = rows.map(toApiProduct);

  return res.status(200).json({
    success: true,
    message: 'Products fetched successfully.',
    data: products,
    meta: {
      total,
      page: currentPage,
      limit: perPage,
      total_pages: Math.ceil(total / perPage) || 1
    }
  });
});

/**
 * GET /api/products/filters
 * Returns the distinct brands/colors/frame types etc. currently in the
 * catalogue, so the storefront can build filter dropdowns dynamically.
 * Declared before the /:id route so 'filters' isn't parsed as an id.
 */
const getFilterOptions = asyncHandler(async (req, res) => {
  const options = await productModel.getFilterOptions();
  return sendSuccess(res, 200, 'Filter options fetched successfully.', options);
});

/**
 * GET /api/products/:id
 * Public (auth optional). Includes the nested reviews array.
 */
const getProductById = asyncHandler(async (req, res) => {
  const product = await productModel.findById(req.params.id, req.user ? req.user.id : null);
  if (!product) {
    throw new ApiError(404, 'Product not found.');
  }

  const reviewRows = await productModel.findReviewsByProductId(product.id);

  const payload = toApiProduct(product);
  payload.reviews = reviewRows.map(toApiReview);

  return sendSuccess(res, 200, 'Product fetched successfully.', payload);
});

/**
 * POST /api/products
 * Admin only. multipart/form-data with an optional `image` file.
 */
const createProduct = asyncHandler(async (req, res) => {
  const data = req.body;

  // The category must exist, otherwise the FK would fail with an opaque error.
  const category = await categoryModel.findById(data.category_id);
  if (!category) {
    if (req.file) deleteUploadedFile(UPLOAD_SUBFOLDER, req.file.filename);
    throw new ApiError(400, 'The selected category does not exist.');
  }

  if (data.sku) {
    const duplicateSku = await productModel.findBySku(data.sku);
    if (duplicateSku) {
      if (req.file) deleteUploadedFile(UPLOAD_SUBFOLDER, req.file.filename);
      throw new ApiError(409, 'A product with this SKU already exists.');
    }
  }

  const productId = await productModel.create({
    category_id: data.category_id,
    name: data.name.trim(),
    brand: data.brand || null,
    description: data.description || null,
    price: data.price,
    discount_price: data.discount_price || null,
    frame_type: data.frame_type || null,
    frame_material: data.frame_material || null,
    lens_type: data.lens_type || null,
    color: data.color || null,
    stock: data.stock || 0,
    image: req.file ? req.file.filename : null,
    sku: data.sku || null,
    status: data.status || 'active'
  });

  const product = await productModel.findById(productId);
  return sendSuccess(res, 201, 'Product created successfully.', toApiProduct(product));
});

/**
 * PUT /api/products/:id
 * Admin only. Omitted fields keep their current values.
 * Sending discount_price as an empty string or 'null' clears the discount.
 */
const updateProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const data = req.body;

  const existing = await productModel.findById(id);
  if (!existing) {
    if (req.file) deleteUploadedFile(UPLOAD_SUBFOLDER, req.file.filename);
    throw new ApiError(404, 'Product not found.');
  }

  if (data.category_id) {
    const category = await categoryModel.findById(data.category_id);
    if (!category) {
      if (req.file) deleteUploadedFile(UPLOAD_SUBFOLDER, req.file.filename);
      throw new ApiError(400, 'The selected category does not exist.');
    }
  }

  if (data.sku) {
    const duplicateSku = await productModel.findBySku(data.sku, id);
    if (duplicateSku) {
      if (req.file) deleteUploadedFile(UPLOAD_SUBFOLDER, req.file.filename);
      throw new ApiError(409, 'A product with this SKU already exists.');
    }
  }

  // Cross-field check: the new discount must not exceed the resulting price.
  const resultingPrice = data.price !== undefined && data.price !== '' ? Number(data.price) : Number(existing.price);
  if (data.discount_price && Number(data.discount_price) > resultingPrice) {
    if (req.file) deleteUploadedFile(UPLOAD_SUBFOLDER, req.file.filename);
    throw new ApiError(422, 'Discount price cannot be greater than the regular price.');
  }

  // Explicitly clearing the discount is a real action, distinct from
  // "leave it alone", so it needs its own signal.
  const clearDiscount = data.discount_price === '' || data.discount_price === 'null';

  const updated = await productModel.update(id, {
    category_id: data.category_id || null,
    name: data.name ? data.name.trim() : null,
    brand: data.brand || null,
    description: data.description || null,
    price: data.price || null,
    discount_price: clearDiscount ? null : data.discount_price || null,
    clear_discount: clearDiscount,
    frame_type: data.frame_type || null,
    frame_material: data.frame_material || null,
    lens_type: data.lens_type || null,
    color: data.color || null,
    stock: data.stock !== undefined && data.stock !== '' ? data.stock : null,
    image: req.file ? req.file.filename : null,
    sku: data.sku || null,
    status: data.status || null
  });

  // Swap in the new image only after the DB write succeeded.
  if (req.file && existing.image) {
    deleteUploadedFile(UPLOAD_SUBFOLDER, existing.image);
  }

  return sendSuccess(res, 200, 'Product updated successfully.', toApiProduct(updated));
});

/**
 * DELETE /api/products/:id
 * Admin only.
 *
 * `order_items.product_id` is ON DELETE SET NULL and stores name/image
 * snapshots, so deleting a product never corrupts historical orders.
 */
const deleteProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existing = await productModel.findById(id);
  if (!existing) {
    throw new ApiError(404, 'Product not found.');
  }

  await productModel.remove(id);

  if (existing.image) {
    deleteUploadedFile(UPLOAD_SUBFOLDER, existing.image);
  }

  return sendSuccess(res, 200, 'Product deleted successfully.', {});
});

module.exports = {
  getAllProducts,
  getFilterOptions,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  toApiProduct
};
