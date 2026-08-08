// services/payments/esewaGateway.js

const crypto = require("crypto");
const ApiError = require("../../utils/ApiError");

function isConfigured() {
  return Boolean(process.env.ESEWA_MERCHANT_ID);
}

function mockMode() {
  if (String(process.env.PAYMENT_MOCK_MODE).toLowerCase() === "true") {
    return true;
  }

  return !isConfigured();
}

/**
 * Generate eSewa HMAC-SHA256 signature.
 *
 * eSewa signs:
 * total_amount,transaction_uuid,product_code
 */
function generateSignature(totalAmount, transactionUuid, productCode) {
  const message =
    `total_amount=${totalAmount},` +
    `transaction_uuid=${transactionUuid},` +
    `product_code=${productCode}`;

  return crypto
    .createHmac("sha256", process.env.ESEWA_SECRET_KEY)
    .update(message)
    .digest("base64");
}

module.exports = {
  name: "eSewa",
  label: "eSewa",
  requiresRedirect: true,

  /**
   * Start eSewa payment.
   */
  async initiate({ order }) {
    const amount = Number(order.total_amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ApiError(400, "Invalid order amount.");
    }

    const productCode =
      process.env.ESEWA_MERCHANT_ID || "EPAYTEST";

    /*
     * eSewa requires transaction_uuid to be unique for every request.
     *
     * Only alphanumeric characters and hyphens are allowed.
     */
    const transactionUuid =
      `${order.order_number}-${Date.now()}`.replace(/[^a-zA-Z0-9-]/g, "-");

    const signedFieldNames =
      "total_amount,transaction_uuid,product_code";

    if (!process.env.ESEWA_SECRET_KEY && !mockMode()) {
      throw new ApiError(
        500,
        "eSewa secret key is not configured."
      );
    }

    const signature = mockMode()
      ? ""
      : generateSignature(
          amount.toFixed(2),
          transactionUuid,
          productCode
        );

    const fields = {
      amount: amount.toFixed(2),
      tax_amount: "0",
      total_amount: amount.toFixed(2),

      transaction_uuid: transactionUuid,

      product_code: productCode,

      product_service_charge: "0",
      product_delivery_charge: "0",

      success_url:
        process.env.ESEWA_SUCCESS_URL ||
        "http://localhost:5000/api/payments/esewa/success",

      failure_url:
        process.env.ESEWA_FAILURE_URL ||
        "http://localhost:5000/api/payments/esewa/failure",

      signed_field_names: signedFieldNames,
      signature
    };

    return {
      method: "eSewa",
      requires_redirect: true,

      redirect_url:
        process.env.ESEWA_URL ||
        "https://rc-epay.esewa.com.np/api/epay/main/v2/form",

      redirect_method: "POST",

      fields,

      order_number: order.order_number,

      amount,

      transaction_uuid: transactionUuid,

      mock: mockMode()
    };
  },

  /**
   * Verify payment with eSewa server-side.
   */
  async verify({ order, payload }) {
    const transactionUuid =
      payload.transaction_uuid ||
      payload.transaction_id ||
      payload.transaction_uuid;

    if (!transactionUuid) {
      throw new ApiError(
        400,
        "eSewa transaction UUID is required."
      );
    }

    const amount = Number(order.total_amount);

    /*
     * Development mock mode.
     */
    if (mockMode()) {
      if (process.env.NODE_ENV === "production") {
        throw new ApiError(
          500,
          "Payment gateway is not configured. Refusing to mock a payment in production."
        );
      }

      return {
        verified: true,
        transaction_id: transactionUuid,
        raw: {
          mock: true,
          transaction_uuid: transactionUuid,
          amount
        }
      };
    }

    const productCode =
      process.env.ESEWA_MERCHANT_ID || "EPAYTEST";

    const verifyUrl =
      process.env.ESEWA_VERIFY_URL ||
      "https://uat.esewa.com.np/api/epay/transaction/status/";

    const url = new URL(verifyUrl);

    url.searchParams.set("product_code", productCode);
    url.searchParams.set("total_amount", amount.toFixed(2));
    url.searchParams.set(
      "transaction_uuid",
      transactionUuid
    );

    let response;

    try {
      response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Accept: "application/json"
        }
      });
    } catch (error) {
      console.error("eSewa verification request failed:", error);

      throw new ApiError(
        502,
        "Could not reach eSewa to verify this payment. Please try again shortly."
      );
    }

    let data;

    try {
      data = await response.json();
    } catch (error) {
      throw new ApiError(
        502,
        "Invalid response received from eSewa."
      );
    }

    /*
     * eSewa returns COMPLETE when the transaction is successful.
     */
    const verified =
      response.ok &&
      String(data.status || "").toUpperCase() === "COMPLETE" &&
      String(data.transaction_uuid || "") ===
        String(transactionUuid);

    return {
      verified,

      transaction_id:
        data.ref_id ||
        data.reference_id ||
        transactionUuid,

      raw: data
    };
  },

  isConfigured,
  mockMode
};