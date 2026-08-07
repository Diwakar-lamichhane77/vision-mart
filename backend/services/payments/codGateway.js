// services/payments/codGateway.js
// Cash on Delivery — no external gateway involved.
//
// COD has no "initiate" step to redirect to and nothing to verify against a
// third party. The payment simply stays Pending until the order is marked
// Delivered, at which point Module 7's order controller flips it to Paid.

/**
 * Every gateway in this folder implements the same shape:
 *   { name, label, requiresRedirect, initiate(ctx), verify(ctx) }
 * so paymentController never has to branch on the specific provider.
 */
module.exports = {
  name: 'COD',
  label: 'Cash on Delivery',
  // No browser redirect — the order is simply placed.
  requiresRedirect: false,

  /**
   * initiate
   * Nothing to hand off to. Returns a descriptor telling the frontend the
   * order is already placed and payment happens at the door.
   */
  async initiate({ order }) {
    return {
      method: 'COD',
      requires_redirect: false,
      order_number: order.order_number,
      amount: Number(order.total_amount),
      // COD is settled on delivery, not now.
      payment_status: 'Pending',
      message: 'Your order is confirmed. Please pay the courier on delivery.'
    };
  },

  /**
   * verify
   * There is no third party to verify against. Marking COD as paid is a
   * fulfilment action (order reaching "Delivered"), deliberately NOT
   * something a customer can trigger by calling an endpoint.
   */
  async verify() {
    const error = new Error('Cash on Delivery payments are settled when the order is delivered, not via verification.');
    error.statusCode = 400;
    throw error;
  }
};
