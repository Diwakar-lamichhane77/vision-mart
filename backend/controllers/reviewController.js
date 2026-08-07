// controllers/reviewController.js
// Product reviews.
//
// Ownership rule: a customer may edit or delete ONLY their own review.
// An admin may delete any review (moderation) but deliberately cannot edit
// one — silently rewriting a customer's words would be worse than removing
// an abusive review outright.

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const { buildFileUrl } = require('../utils/helpers');
const reviewModel = require('../models/reviewModel');
const productModel = require('../models/productModel');

/**
 * Set REVIEWS_REQUIRE_PURCHASE=true to only allow reviews from customers who
 * actually received the product. Left OFF by default because the storefront
 * lets anyone logged in review from the product page, and flipping this on
 * would make that button fail for most visitors. Either way, reviews carry a
 * `verified_purchase` flag so the UI can distinguish them.
 */
const REQUIRE_PURCHASE = String(process.env.REVIEWS_REQUIRE_PURCHASE).toLowerCase() === 'true';

/**
 * toApiReview
 */
function toApiReview(row) {
  return {
    id: row.id,
    rating: Number(row.rating),
    comment: row.comment,
    verified_purchase: Boolean(row.verified_purchase),
    user: { id: row.user_id, name: row.user_name },
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

/**
 * GET /api/reviews/product/:productId
 * Public. A standalone list endpoint alongside the nested `reviews` array on
 * GET /api/products/:id, so a product page can paginate reviews separately
 * instead of always shipping every review with the product.
 */
const getProductReviews = asyncHandler(async (req, res) => {
  const { productId } = req.params;

  const product = await productModel.findById(productId);
  if (!product) {
    throw new ApiError(404, 'Product not found.');
  }

  const perPage = req.query.limit ? Number.parseInt(req.query.limit, 10) : 20;
  const currentPage = req.query.page ? Number.parseInt(req.query.page, 10) : 1;

  const rows = await reviewModel.findByProductId(productId, {
    limit: perPage,
    offset: (currentPage - 1) * perPage
  });
  const summary = await reviewModel.getProductRatingSummary(productId);

  return res.status(200).json({
    success: true,
    message: 'Reviews fetched successfully.',
    data: rows.map(toApiReview),
    meta: {
      ...summary,
      page: currentPage,
      limit: perPage,
      total_pages: Math.ceil(summary.total / perPage) || 1
    }
  });
});

/**
 * GET /api/reviews/my
 * Every review the logged-in customer has written.
 */
const getMyReviews = asyncHandler(async (req, res) => {
  const rows = await reviewModel.findByUserId(req.user.id);

  const reviews = rows.map((row) => ({
    id: row.id,
    rating: Number(row.rating),
    comment: row.comment,
    product: {
      id: row.product_id,
      name: row.product_name,
      image: buildFileUrl(row.product_image, 'products')
    },
    created_at: row.created_at,
    updated_at: row.updated_at
  }));

  return sendSuccess(res, 200, 'Your reviews fetched successfully.', reviews);
});

/**
 * POST /api/reviews
 * Body: { product_id, rating, comment? }
 */
const createReview = asyncHandler(async (req, res) => {
  const { product_id: productId, rating, comment } = req.body;

  const product = await productModel.findById(productId);
  if (!product) {
    throw new ApiError(404, 'Product not found.');
  }

  // One review per customer per product — enforced by a UNIQUE key, but
  // checked here so the response explains what to do instead.
  const existing = await reviewModel.findByUserAndProduct(req.user.id, productId);
  if (existing) {
    throw new ApiError(
      409,
      'You have already reviewed this product. Edit your existing review instead.'
    );
  }

  if (REQUIRE_PURCHASE) {
    const purchased = await reviewModel.hasPurchased(req.user.id, productId);
    if (!purchased) {
      throw new ApiError(403, 'Only customers who have received this product can review it.');
    }
  }

  const reviewId = await reviewModel.create({
    userId: req.user.id,
    productId,
    rating: Number(rating),
    comment
  });

  const created = await reviewModel.findById(reviewId);
  const verified = await reviewModel.hasPurchased(req.user.id, productId);
  const summary = await reviewModel.getProductRatingSummary(productId);

  return res.status(201).json({
    success: true,
    message: 'Review submitted successfully.',
    data: toApiReview({ ...created, verified_purchase: verified }),
    // The product's aggregate rating changes with every review, so returning
    // it saves the frontend an extra round-trip to refresh the star display.
    meta: { product_rating: summary }
  });
});

/**
 * PUT /api/reviews/:id
 * Owner only. Admins cannot edit customer reviews (see file header).
 */
const updateReview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rating, comment } = req.body;

  const review = await reviewModel.findById(id);
  if (!review) {
    throw new ApiError(404, 'Review not found.');
  }

  // Same 404-not-403 approach used elsewhere: don't confirm the review
  // exists to someone who has no business seeing it.
  if (review.user_id !== req.user.id) {
    throw new ApiError(404, 'Review not found.');
  }

  const updated = await reviewModel.update(id, {
    rating: rating !== undefined ? Number(rating) : null,
    comment: comment !== undefined ? comment : null
  });

  const verified = await reviewModel.hasPurchased(req.user.id, review.product_id);
  const summary = await reviewModel.getProductRatingSummary(review.product_id);

  return res.status(200).json({
    success: true,
    message: 'Review updated successfully.',
    data: toApiReview({ ...updated, verified_purchase: verified }),
    meta: { product_rating: summary }
  });
});

/**
 * DELETE /api/reviews/:id
 * The owning customer, or any admin (moderation).
 */
const deleteReview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const isAdmin = Boolean(req.admin);

  const review = await reviewModel.findById(id);
  if (!review) {
    throw new ApiError(404, 'Review not found.');
  }

  if (!isAdmin && review.user_id !== req.user.id) {
    throw new ApiError(404, 'Review not found.');
  }

  await reviewModel.remove(id);
  const summary = await reviewModel.getProductRatingSummary(review.product_id);

  return res.status(200).json({
    success: true,
    message: 'Review deleted successfully.',
    data: {},
    meta: { product_rating: summary }
  });
});

/**
 * GET /api/reviews
 * Admin moderation list across all products.
 */
const getAllReviews = asyncHandler(async (req, res) => {
  const perPage = req.query.limit ? Number.parseInt(req.query.limit, 10) : 50;
  const currentPage = req.query.page ? Number.parseInt(req.query.page, 10) : 1;

  const filters = {
    productId: req.query.product_id,
    rating: req.query.rating
  };

  const rows = await reviewModel.findAll({
    ...filters,
    limit: perPage,
    offset: (currentPage - 1) * perPage
  });
  const total = await reviewModel.countAll(filters);

  const reviews = rows.map((row) => ({
    id: row.id,
    rating: Number(row.rating),
    comment: row.comment,
    user: { id: row.user_id, name: row.user_name, email: row.user_email },
    product: {
      id: row.product_id,
      name: row.product_name,
      image: buildFileUrl(row.product_image, 'products')
    },
    created_at: row.created_at,
    updated_at: row.updated_at
  }));

  return res.status(200).json({
    success: true,
    message: 'Reviews fetched successfully.',
    data: reviews,
    meta: {
      total,
      page: currentPage,
      limit: perPage,
      total_pages: Math.ceil(total / perPage) || 1
    }
  });
});

module.exports = {
  getProductReviews,
  getMyReviews,
  createReview,
  updateReview,
  deleteReview,
  getAllReviews,
  toApiReview
};
