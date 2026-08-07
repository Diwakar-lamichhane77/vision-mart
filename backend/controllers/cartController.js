// controllers/cartController.js
// Shopping cart for logged-in customers. Every route here requires a
// customer token, and every query is scoped by req.user.id — a customer can
// only ever read or mutate their own cart.
//
// Stock is validated on add/update but NOT decremented here; stock only moves
// at checkout (Module 7). Reserving stock in the cart would let anyone empty
// the catalogue just by filling a cart they never buy.

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const { buildFileUrl } = require('../utils/helpers');
const cartModel = require('../models/cartModel');
const productModel = require('../models/productModel');

/**
 * toApiCartItem
 * Shapes a cart row into the structure the frontend reads:
 * `item.product.price`, `item.product.image`, `item.quantity`.
 * DECIMAL columns arrive as strings from MySQL, so they're cast to numbers —
 * otherwise the frontend's `price * quantity` would concatenate strings.
 */
function toApiCartItem(row) {
  const unitPrice = Number(row.effective_price);
  return {
    id: row.id,
    quantity: Number(row.quantity),
    unit_price: unitPrice,
    subtotal: Number((unitPrice * Number(row.quantity)).toFixed(2)),
    price_at_add: Number(row.price_at_add),
    product: {
      id: row.product_id,
      name: row.product_name,
      brand: row.product_brand,
      // `price` is the effective (discounted) price, since that's what the
      // frontend multiplies out for the line subtotal and cart total.
      price: unitPrice,
      original_price: Number(row.product_price),
      discount_price: row.product_discount_price === null ? null : Number(row.product_discount_price),
      image: buildFileUrl(row.product_image, 'products'),
      stock: Number(row.product_stock),
      status: row.product_status,
      category: row.category_id ? { id: row.category_id, name: row.category_name } : null
    },
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

/**
 * buildCartMeta
 * Summary totals plus any per-line problems the customer needs to resolve
 * before checkout (product went out of stock, quantity now exceeds stock,
 * or the product was deactivated while sitting in the cart).
 */
function buildCartMeta(items) {
  const total = items.reduce((sum, item) => sum + item.subtotal, 0);
  const totalUnits = items.reduce((sum, item) => sum + item.quantity, 0);

  const issues = [];
  items.forEach((item) => {
    if (item.product.status !== 'active') {
      issues.push({
        product_id: item.product.id,
        type: 'unavailable',
        message: `${item.product.name} is no longer available.`
      });
    } else if (item.product.stock === 0) {
      issues.push({
        product_id: item.product.id,
        type: 'out_of_stock',
        message: `${item.product.name} is out of stock.`
      });
    } else if (item.quantity > item.product.stock) {
      issues.push({
        product_id: item.product.id,
        type: 'insufficient_stock',
        message: `Only ${item.product.stock} left of ${item.product.name}; your cart has ${item.quantity}.`
      });
    }
  });

  return {
    total_items: items.length,
    total_units: totalUnits,
    subtotal: Number(total.toFixed(2)),
    total: Number(total.toFixed(2)),
    issues,
    checkout_ready: issues.length === 0 && items.length > 0
  };
}

/**
 * GET /api/cart
 * Returns the flat array of cart lines the frontend iterates over, with
 * summary totals in `meta`.
 */
const getCart = asyncHandler(async (req, res) => {
  const rows = await cartModel.findItemsByUserId(req.user.id);
  const items = rows.map(toApiCartItem);

  return res.status(200).json({
    success: true,
    message: 'Cart fetched successfully.',
    data: items,
    meta: buildCartMeta(items)
  });
});

/**
 * POST /api/cart
 * Body: { product_id, quantity? }  (quantity defaults to 1)
 * Adding a product that's already in the cart increments its quantity.
 */
const addToCart = asyncHandler(async (req, res) => {
  const { product_id: productId } = req.body;
  const quantity = req.body.quantity ? Number(req.body.quantity) : 1;

  const product = await productModel.findById(productId);
  if (!product) {
    throw new ApiError(404, 'Product not found.');
  }
  if (product.status !== 'active') {
    throw new ApiError(400, 'This product is no longer available.');
  }

  const existingItem = await cartModel.findItem(req.user.id, productId);
  const currentQty = existingItem ? existingItem.quantity : 0;
  const requestedTotal = currentQty + quantity;

  // Check against the TOTAL that would end up in the cart, not just the
  // amount being added — otherwise repeated adds could sail past stock.
  if (product.stock === 0) {
    throw new ApiError(400, `${product.name} is currently out of stock.`);
  }
  if (requestedTotal > product.stock) {
    throw new ApiError(
      400,
      `Only ${product.stock} unit(s) of ${product.name} available.${
        currentQty > 0 ? ` You already have ${currentQty} in your cart.` : ''
      }`
    );
  }

  const effectivePrice = Number(product.effective_price);
  await cartModel.addItem(req.user.id, productId, quantity, effectivePrice);

  const rows = await cartModel.findItemsByUserId(req.user.id);
  const items = rows.map(toApiCartItem);

  return res.status(201).json({
    success: true,
    message: 'Product added to cart.',
    data: items,
    meta: buildCartMeta(items)
  });
});

/**
 * PUT /api/cart/:productId
 * Body: { quantity }
 * Sets an absolute quantity (the frontend's +/- buttons send the new value).
 */
const updateCartItem = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const quantity = Number(req.body.quantity);

  const existingItem = await cartModel.findItem(req.user.id, productId);
  if (!existingItem) {
    throw new ApiError(404, 'This product is not in your cart.');
  }

  const product = await productModel.findById(productId);
  if (!product) {
    throw new ApiError(404, 'Product not found.');
  }
  if (quantity > product.stock) {
    throw new ApiError(400, `Only ${product.stock} unit(s) of ${product.name} available.`);
  }

  await cartModel.updateItemQuantity(req.user.id, productId, quantity, Number(product.effective_price));

  const rows = await cartModel.findItemsByUserId(req.user.id);
  const items = rows.map(toApiCartItem);

  return res.status(200).json({
    success: true,
    message: 'Cart updated successfully.',
    data: items,
    meta: buildCartMeta(items)
  });
});

/**
 * DELETE /api/cart/:productId
 * Removes a single line from the cart.
 */
const removeCartItem = asyncHandler(async (req, res) => {
  const { productId } = req.params;

  const removed = await cartModel.removeItem(req.user.id, productId);
  if (!removed) {
    throw new ApiError(404, 'This product is not in your cart.');
  }

  const rows = await cartModel.findItemsByUserId(req.user.id);
  const items = rows.map(toApiCartItem);

  return res.status(200).json({
    success: true,
    message: 'Item removed from cart.',
    data: items,
    meta: buildCartMeta(items)
  });
});

/**
 * DELETE /api/cart
 * Empties the whole cart.
 */
const clearCart = asyncHandler(async (req, res) => {
  const removedCount = await cartModel.clearCart(req.user.id);
  return sendSuccess(res, 200, 'Cart cleared successfully.', {
    removed_items: removedCount
  });
});

/**
 * GET /api/cart/count
 * Lightweight endpoint for the header cart badge — avoids fetching the
 * whole cart just to render a number.
 */
const getCartCount = asyncHandler(async (req, res) => {
  const counts = await cartModel.countItems(req.user.id);
  return sendSuccess(res, 200, 'Cart count fetched successfully.', counts);
});

module.exports = {
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
  getCartCount,
  toApiCartItem,
  buildCartMeta
};
