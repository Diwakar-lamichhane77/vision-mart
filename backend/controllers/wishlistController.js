// controllers/wishlistController.js
// Wishlist for logged-in customers. Every query is scoped to req.user.id,
// so a customer can only ever touch their own wishlist.
//
// Design note on POST: the frontend's heart button calls this every time it's
// clicked, and it has no way to know the item is already saved. Returning 409
// would make the UI flash an error for a perfectly reasonable action, so the
// add is IDEMPOTENT — re-adding an existing item succeeds quietly. The
// `already_existed` flag in the response lets a caller tell the difference.

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const { buildFileUrl } = require('../utils/helpers');
const wishlistModel = require('../models/wishlistModel');
const productModel = require('../models/productModel');

/**
 * toApiWishlistItem
 * Shapes a row into what the frontend reads: `item.product.name`,
 * `item.product.price`, `item.product.image`.
 * DECIMAL columns come back as strings from MySQL, so they're cast.
 */
function toApiWishlistItem(row) {
  return {
    id: row.id,
    added_at: row.created_at,
    // Convenience flag so a wishlist row can render "Already in cart".
    is_in_cart: Boolean(row.is_in_cart),
    product: {
      id: row.product_id,
      name: row.product_name,
      brand: row.product_brand,
      // Effective (discounted) price — what the frontend displays.
      price: Number(row.effective_price),
      original_price: Number(row.product_price),
      discount_price: row.product_discount_price === null ? null : Number(row.product_discount_price),
      image: buildFileUrl(row.product_image, 'products'),
      stock: Number(row.product_stock),
      status: row.product_status,
      in_stock: Number(row.product_stock) > 0 && row.product_status === 'active',
      rating: Number(Number(row.rating || 0).toFixed(2)),
      category: row.category_id ? { id: row.category_id, name: row.category_name } : null
    }
  };
}

/**
 * GET /api/wishlist
 */
const getWishlist = asyncHandler(async (req, res) => {
  const rows = await wishlistModel.findByUserId(req.user.id);
  const items = rows.map(toApiWishlistItem);

  return res.status(200).json({
    success: true,
    message: 'Wishlist fetched successfully.',
    data: items,
    meta: {
      total_items: items.length,
      // Handy for an "add all available to cart" button.
      available_items: items.filter((i) => i.product.in_stock).length
    }
  });
});

/**
 * POST /api/wishlist
 * Body: { product_id }
 * Idempotent — see the note at the top of this file.
 */
const addToWishlist = asyncHandler(async (req, res) => {
  const { product_id: productId } = req.body;

  const product = await productModel.findById(productId);
  if (!product) {
    throw new ApiError(404, 'Product not found.');
  }

  // Out-of-stock products are deliberately allowed: saving something for
  // later is exactly what a wishlist is for. Inactive (delisted) products
  // are not, since they're gone for good.
  if (product.status !== 'active') {
    throw new ApiError(400, 'This product is no longer available.');
  }

  const inserted = await wishlistModel.addItem(req.user.id, productId);

  const rows = await wishlistModel.findByUserId(req.user.id);
  const items = rows.map(toApiWishlistItem);

  return res.status(inserted ? 201 : 200).json({
    success: true,
    message: inserted ? 'Product added to wishlist.' : 'Product is already in your wishlist.',
    data: items,
    meta: {
      total_items: items.length,
      already_existed: !inserted
    }
  });
});

/**
 * DELETE /api/wishlist/:productId
 */
const removeFromWishlist = asyncHandler(async (req, res) => {
  const { productId } = req.params;

  const removed = await wishlistModel.removeItem(req.user.id, productId);
  if (!removed) {
    throw new ApiError(404, 'This product is not in your wishlist.');
  }

  const rows = await wishlistModel.findByUserId(req.user.id);
  const items = rows.map(toApiWishlistItem);

  return res.status(200).json({
    success: true,
    message: 'Product removed from wishlist.',
    data: items,
    meta: { total_items: items.length }
  });
});

/**
 * POST /api/wishlist/toggle
 * Body: { product_id }
 * Adds the product if absent, removes it if present — the natural fit for a
 * heart icon that should un-save on a second click. Returns `in_wishlist`
 * so the UI knows which state to render.
 */
const toggleWishlist = asyncHandler(async (req, res) => {
  const { product_id: productId } = req.body;

  const product = await productModel.findById(productId);
  if (!product) {
    throw new ApiError(404, 'Product not found.');
  }

  const existing = await wishlistModel.findItem(req.user.id, productId);

  let inWishlist;
  if (existing) {
    await wishlistModel.removeItem(req.user.id, productId);
    inWishlist = false;
  } else {
    if (product.status !== 'active') {
      throw new ApiError(400, 'This product is no longer available.');
    }
    await wishlistModel.addItem(req.user.id, productId);
    inWishlist = true;
  }

  const total = await wishlistModel.countItems(req.user.id);

  return sendSuccess(
    res,
    200,
    inWishlist ? 'Product added to wishlist.' : 'Product removed from wishlist.',
    { in_wishlist: inWishlist, total_items: total }
  );
});

/**
 * DELETE /api/wishlist
 * Clears the whole wishlist.
 */
const clearWishlist = asyncHandler(async (req, res) => {
  const removedCount = await wishlistModel.clearWishlist(req.user.id);
  return sendSuccess(res, 200, 'Wishlist cleared successfully.', {
    removed_items: removedCount
  });
});

/**
 * GET /api/wishlist/count
 * Lightweight endpoint for a header badge.
 */
const getWishlistCount = asyncHandler(async (req, res) => {
  const total = await wishlistModel.countItems(req.user.id);
  return sendSuccess(res, 200, 'Wishlist count fetched successfully.', { total_items: total });
});

module.exports = {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  toggleWishlist,
  clearWishlist,
  getWishlistCount,
  toApiWishlistItem
};
