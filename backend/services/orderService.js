// services/orderService.js
// The transactional heart of checkout.
//
// Why a transaction with row locks:
// Creating an order touches four tables (orders, order_items, products.stock,
// cart_items) plus payments. If any step fails halfway, we must not be left
// with an order whose stock was never decremented, or decremented stock with
// no order. Everything below runs inside ONE transaction that either fully
// commits or fully rolls back.
//
// Why SELECT ... FOR UPDATE:
// Reading stock, checking it, then writing it is a classic read-modify-write
// race. Two shoppers buying the last frame simultaneously would both read
// stock=1, both pass the check, and both decrement — overselling to -1.
// FOR UPDATE locks the product rows for the duration of the transaction, so
// the second checkout waits and then correctly sees stock=0.

const { pool } = require('../config/db');
const ApiError = require('../utils/ApiError');
const orderModel = require('../models/orderModel');
const paymentModel = require('../models/paymentModel');
const cartModel = require('../models/cartModel');

const MAX_ORDER_NUMBER_ATTEMPTS = 5;

/**
 * resolveUniqueOrderNumber
 * Generates an order number, retrying on the (rare) collision.
 */
async function resolveUniqueOrderNumber(conn) {
  for (let attempt = 0; attempt < MAX_ORDER_NUMBER_ATTEMPTS; attempt += 1) {
    const candidate = orderModel.generateOrderNumber();
    // eslint-disable-next-line no-await-in-loop
    const exists = await orderModel.orderNumberExists(candidate, conn);
    if (!exists) return candidate;
  }
  throw new ApiError(500, 'Could not generate a unique order number. Please try again.');
}

/**
 * loadRequestedLines
 * Works out what's actually being ordered.
 *  - "Buy Now" sends an explicit `items` array.
 *  - Cart checkout sends nothing, so we read the user's cart instead.
 * Returns [{ product_id, quantity }].
 */
async function loadRequestedLines(conn, userId, items) {
  if (Array.isArray(items) && items.length > 0) {
    // Merge duplicate product_ids so someone can't slip past the stock
    // check by sending the same product as two separate lines.
    const merged = new Map();
    items.forEach((item) => {
      const productId = Number(item.product_id);
      const quantity = Number(item.quantity) || 1;
      merged.set(productId, (merged.get(productId) || 0) + quantity);
    });
    return Array.from(merged, ([productId, quantity]) => ({
      product_id: productId,
      quantity
    }));
  }

  const [cartRows] = await conn.query(
    `SELECT ci.product_id, ci.quantity
     FROM cart_items ci
     JOIN cart ct ON ct.id = ci.cart_id
     WHERE ct.user_id = :userId`,
    { userId }
  );

  if (cartRows.length === 0) {
    throw new ApiError(400, 'Your cart is empty.');
  }

  return cartRows.map((row) => ({
    product_id: row.product_id,
    quantity: Number(row.quantity)
  }));
}

/**
 * lockAndValidateProducts
 * Locks the product rows and verifies every line is actually purchasable.
 * Returns a Map of productId -> product row.
 */
async function lockAndValidateProducts(conn, lines) {
  const productIds = lines.map((line) => line.product_id);

  // FOR UPDATE — see the note at the top of this file.
  const [products] = await conn.query(
    `SELECT id, name, price, discount_price, stock, image, status
     FROM products
     WHERE id IN (?)
     FOR UPDATE`,
    [productIds]
  );

  const productMap = new Map(products.map((p) => [p.id, p]));

  lines.forEach((line) => {
    const product = productMap.get(line.product_id);

    if (!product) {
      throw new ApiError(400, `One of the products in your order no longer exists.`);
    }
    if (product.status !== 'active') {
      throw new ApiError(400, `${product.name} is no longer available.`);
    }
    if (line.quantity < 1) {
      throw new ApiError(400, `Invalid quantity for ${product.name}.`);
    }
    if (product.stock < line.quantity) {
      throw new ApiError(
        400,
        `Insufficient stock for ${product.name}. Only ${product.stock} left, you requested ${line.quantity}.`
      );
    }
  });

  return productMap;
}

/**
 * placeOrder
 * Runs the entire checkout atomically.
 *
 * @param {number} userId
 * @param {object} payload - shipping details, payment_method, notes, items?
 * @returns {Promise<number>} the new order id
 */
async function placeOrder(userId, payload) {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // 1. Determine what's being bought (explicit items, or the cart).
    const lines = await loadRequestedLines(conn, userId, payload.items);

    // 2. Lock those product rows and validate availability.
    const productMap = await lockAndValidateProducts(conn, lines);

    // 3. Build order lines from CURRENT server-side prices.
    //    Prices are never taken from the client payload — otherwise a
    //    tampered request could set its own price.
    let totalAmount = 0;
    const orderItems = lines.map((line) => {
      const product = productMap.get(line.product_id);
      const unitPrice = Number(product.discount_price ?? product.price);
      const subtotal = Number((unitPrice * line.quantity).toFixed(2));
      totalAmount += subtotal;

      return {
        product_id: product.id,
        product_name: product.name,
        product_image: product.image,
        quantity: line.quantity,
        price: unitPrice,
        subtotal
      };
    });
    totalAmount = Number(totalAmount.toFixed(2));

    // 4. Create the order header.
    const orderNumber = await resolveUniqueOrderNumber(conn);
    const orderId = await orderModel.createOrder(conn, {
      user_id: userId,
      order_number: orderNumber,
      total_amount: totalAmount,
      status: 'Pending',
      payment_method: payload.payment_method,
      shipping_name: payload.shipping_name,
      shipping_phone: payload.shipping_phone,
      shipping_address: payload.shipping_address,
      shipping_city: payload.shipping_city,
      notes: payload.notes
    });

    // 5. Insert line items and decrement stock.
    //    The `AND stock >= :quantity` guard is a belt-and-braces check: even
    //    if something slipped past step 2, the UPDATE affects 0 rows and we
    //    abort rather than driving stock negative.
    for (const item of orderItems) {
      // eslint-disable-next-line no-await-in-loop
      await orderModel.createOrderItem(conn, orderId, item);

      // eslint-disable-next-line no-await-in-loop
      const [stockResult] = await conn.query(
        `UPDATE products
         SET stock = stock - :quantity,
             sold_count = sold_count + :quantity
         WHERE id = :productId AND stock >= :quantity`,
        { productId: item.product_id, quantity: item.quantity }
      );

      if (stockResult.affectedRows === 0) {
        throw new ApiError(400, `Insufficient stock for ${item.product_name}.`);
      }
    }

    // 6. Record the payment intent.
    //    COD is Pending until delivery; online methods stay Pending until
    //    the gateway confirms in Module 8.
    await paymentModel.create(conn, {
      order_id: orderId,
      payment_method: payload.payment_method,
      payment_status: 'Pending',
      amount: totalAmount
    });

    // 7. Clear the cart.
    //    Only for a full cart checkout — a "Buy Now" on a single product
    //    shouldn't wipe out everything else the shopper had saved.
    if (!Array.isArray(payload.items) || payload.items.length === 0) {
      await cartModel.clearCart(userId, conn);
    }

    await conn.commit();
    return orderId;
  } catch (error) {
    // Any failure above undoes every write, including stock decrements.
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/**
 * restoreStock
 * Puts stock back when an order is cancelled, and rolls back sold_count so
 * popularity rankings aren't inflated by cancelled orders.
 * Runs in its own transaction.
 */
async function restoreStock(orderId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [items] = await conn.query(
      'SELECT product_id, quantity FROM order_items WHERE order_id = :orderId',
      { orderId }
    );

    for (const item of items) {
      // product_id is NULL when the product was deleted after ordering —
      // there's nothing to restore in that case.
      if (item.product_id === null) continue;

      // eslint-disable-next-line no-await-in-loop
      await conn.query(
        `UPDATE products
         SET stock = stock + :quantity,
             sold_count = GREATEST(0, sold_count - :quantity)
         WHERE id = :productId`,
        { productId: item.product_id, quantity: item.quantity }
      );
    }

    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

module.exports = { placeOrder, restoreStock };
