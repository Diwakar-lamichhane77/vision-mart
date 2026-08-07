// services/payments/khaltiGateway.js
// Khalti (Nepal) integration.
//
// Flow:
//  1. initiate() returns the public key + amount in paisa for Khalti's widget.
//  2. The customer pays in the widget, which hands the frontend a token.
//  3. verify() posts that token + amount to Khalti server-side with the SECRET
//     key. The token alone proves nothing until Khalti confirms it — and the
//     secret key must never touch the browser.
//
// Note: Khalti works in PAISA (1 NPR = 100 paisa), so amounts are converted.

const ApiError = require('../../utils/ApiError');

function isConfigured() {
  const secret = process.env.KHALTI_SECRET_KEY;
  return Boolean(secret) && secret !== 'your_khalti_secret_key';
}

function mockMode() {
  if (String(process.env.PAYMENT_MOCK_MODE).toLowerCase() === 'true') return true;
  return !isConfigured();
}

module.exports = {
  name: 'Khalti',
  label: 'Khalti',
  requiresRedirect: false, // Khalti uses an in-page widget, not a redirect

  /**
   * initiate
   * Returns the config the Khalti checkout widget needs. Only the PUBLIC key
   * is exposed here — the secret key stays server-side for verification.
   */
  async initiate({ order }) {
    const amount = Number(order.total_amount);

    return {
      method: 'Khalti',
      requires_redirect: false,
      // Khalti expects paisa, so 1500.00 NPR -> 150000.
      amount_in_paisa: Math.round(amount * 100),
      amount,
      public_key: process.env.KHALTI_PUBLIC_KEY || '',
      product_identity: order.order_number,
      product_name: `Vision Mart Order ${order.order_number}`,
      order_number: order.order_number,
      mock: mockMode()
    };
  },

  /**
   * verify
   * @param {object} ctx - { order, payload: { token, amount } }
   */
  async verify({ order, payload }) {
    const token = payload.token || payload.transaction_id;
    if (!token) {
      throw new ApiError(400, 'Khalti payment token is required to verify this payment.');
    }

    const expectedPaisa = Math.round(Number(order.total_amount) * 100);

    if (mockMode()) {
      if (process.env.NODE_ENV === 'production') {
        throw new ApiError(500, 'Payment gateway is not configured. Refusing to mock a payment in production.');
      }
      return {
        verified: true,
        transaction_id: token,
        raw: { mock: true, token, amount: expectedPaisa, note: 'Simulated Khalti verification (no live credentials configured).' }
      };
    }

    let data;
    try {
      const response = await fetch(
        process.env.KHALTI_VERIFY_URL || 'https://khalti.com/api/v2/payment/verify/',
        {
          method: 'POST',
          headers: {
            Authorization: `Key ${process.env.KHALTI_SECRET_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ token, amount: expectedPaisa })
        }
      );
      data = await response.json();

      if (!response.ok) {
        return {
          verified: false,
          transaction_id: token,
          raw: data
        };
      }
    } catch (error) {
      throw new ApiError(502, 'Could not reach Khalti to verify this payment. Please try again shortly.');
    }

    // Khalti echoes back the amount it actually captured. Comparing it to the
    // order total stops a tampered client from paying 10 NPR for a 10,000 NPR
    // order by passing its own amount to the widget.
    const capturedAmount = Number(data.amount);
    if (Number.isFinite(capturedAmount) && capturedAmount !== expectedPaisa) {
      return {
        verified: false,
        transaction_id: data.idx || token,
        raw: { ...data, mismatch: `Expected ${expectedPaisa} paisa but Khalti captured ${capturedAmount}.` }
      };
    }

    return {
      verified: String(data.state?.name || '').toLowerCase() === 'completed' || Boolean(data.idx),
      transaction_id: data.idx || token,
      raw: data
    };
  },

  isConfigured,
  mockMode
};
