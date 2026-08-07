// services/payments/esewaGateway.js
// eSewa (Nepal) ePay integration.
//
// Flow:
//  1. initiate() returns the form fields the browser POSTs to eSewa's page.
//  2. The customer pays on eSewa, which redirects back to ESEWA_SUCCESS_URL
//     with a refId (transaction id) in the query string.
//  3. verify() calls eSewa's transaction-verification endpoint server-side to
//     confirm the payment is genuine. NEVER trust the redirect alone — anyone
//     can hit a success URL with a made-up refId.

const ApiError = require('../../utils/ApiError');

/**
 * isConfigured
 * True when a merchant id is present. Note that 'EPAYTEST' IS a valid value —
 * it's eSewa's official sandbox merchant code, so it counts as configured.
 */
function isConfigured() {
  return Boolean(process.env.ESEWA_MERCHANT_ID);
}

/**
 * mockMode
 * Explicitly opt into mock mode with PAYMENT_MOCK_MODE=true, or fall back to
 * it automatically when the gateway isn't configured at all. Mock mode lets
 * the full payment flow be exercised in development without live credentials.
 */
function mockMode() {
  if (String(process.env.PAYMENT_MOCK_MODE).toLowerCase() === 'true') return true;
  return !isConfigured();
}

module.exports = {
  name: 'eSewa',
  label: 'eSewa',
  requiresRedirect: true,

  /**
   * initiate
   * Returns everything the frontend needs to POST the customer to eSewa.
   * eSewa expects a classic HTML form post, so we hand back the target URL
   * plus the exact field names it requires.
   */
  async initiate({ order }) {
    const amount = Number(order.total_amount);

    // eSewa's field names are fixed by their spec:
    //   tAmt = total, amt = base amount, txAmt/psc/pdc = tax & charges,
    //   scd  = merchant code, pid = our unique product/order id
    const fields = {
      amt: amount,
      txAmt: 0,
      psc: 0,
      pdc: 0,
      tAmt: amount,
      scd: process.env.ESEWA_MERCHANT_ID || 'EPAYTEST',
      pid: order.order_number,
      su: process.env.ESEWA_SUCCESS_URL || 'http://localhost:5000/api/payments/esewa/success',
      fu: process.env.ESEWA_FAILURE_URL || 'http://localhost:5000/api/payments/esewa/failure'
    };

    return {
      method: 'eSewa',
      requires_redirect: true,
      // The frontend builds a form with these fields and submits it here.
      redirect_url: process.env.ESEWA_URL || 'https://uat.esewa.com.np/epay/main',
      redirect_method: 'POST',
      fields,
      order_number: order.order_number,
      amount,
      mock: mockMode()
    };
  },

  /**
   * verify
   * Server-to-server confirmation against eSewa.
   * @param {object} ctx - { order, payload: { transaction_id, amount } }
   */
  async verify({ order, payload }) {
    const referenceId = payload.transaction_id || payload.refId;
    if (!referenceId) {
      throw new ApiError(400, 'eSewa reference id (refId) is required to verify this payment.');
    }

    const amount = Number(order.total_amount);

    // Mock mode: simulate a successful verification so the end-to-end flow
    // can be tested without live credentials. Guarded so it can never be
    // reached in production (see the NODE_ENV check).
    if (mockMode()) {
      if (process.env.NODE_ENV === 'production') {
        throw new ApiError(500, 'Payment gateway is not configured. Refusing to mock a payment in production.');
      }
      return {
        verified: true,
        transaction_id: referenceId,
        raw: { mock: true, refId: referenceId, amount, note: 'Simulated eSewa verification (no live credentials configured).' }
      };
    }

    const verifyUrl = process.env.ESEWA_VERIFY_URL || 'https://uat.esewa.com.np/epay/transrec';

    const body = new URLSearchParams({
      amt: String(amount),
      scd: process.env.ESEWA_MERCHANT_ID || 'EPAYTEST',
      rid: referenceId,
      pid: order.order_number
    });

    let responseText;
    try {
      const response = await fetch(verifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
      });
      responseText = await response.text();
    } catch (error) {
      // Network failure talking to the gateway is NOT a failed payment —
      // it's an unknown state, so surface it rather than marking anything.
      throw new ApiError(502, 'Could not reach eSewa to verify this payment. Please try again shortly.');
    }

    // eSewa replies with a small XML document containing <response_code>.
    const verified = /success/i.test(responseText);

    return {
      verified,
      transaction_id: referenceId,
      raw: { response: responseText.slice(0, 1000) }
    };
  },

  isConfigured,
  mockMode
};
