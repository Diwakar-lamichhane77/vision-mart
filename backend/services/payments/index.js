// services/payments/index.js
// Payment gateway registry.
//
// This is the "payment service" the spec asks for: adding a new provider
// (Stripe, IMEPay, ConnectIPS…) means dropping in one file that implements
// the same interface and registering it here. No controller, route or model
// changes are needed.
//
// Gateway interface:
//   {
//     name,              // must match the payments.payment_method ENUM
//     label,             // human-readable
//     requiresRedirect,  // does the browser leave the site to pay?
//     initiate({ order }),        -> descriptor for the frontend
//     verify({ order, payload }), -> { verified, transaction_id, raw }
//     isConfigured?(), mockMode?()
//   }

const ApiError = require('../../utils/ApiError');
const codGateway = require('./codGateway');
const esewaGateway = require('./esewaGateway');
const khaltiGateway = require('./khaltiGateway');

const gateways = {
  COD: codGateway,
  eSewa: esewaGateway,
  Khalti: khaltiGateway
};

/**
 * getGateway
 * @param {string} method - value from the payments.payment_method ENUM
 * @throws {ApiError} 400 when the method isn't supported
 */
function getGateway(method) {
  const gateway = gateways[method];
  if (!gateway) {
    throw new ApiError(400, `Unsupported payment method: ${method}. Supported: ${Object.keys(gateways).join(', ')}.`);
  }
  return gateway;
}

/**
 * listGateways
 * Powers a "which payment methods can I use?" endpoint so the checkout page
 * renders options from server config instead of a hardcoded list.
 */
function listGateways() {
  return Object.values(gateways).map((gateway) => ({
    method: gateway.name,
    label: gateway.label,
    requires_redirect: gateway.requiresRedirect,
    // COD needs no credentials, so it's always available.
    configured: typeof gateway.isConfigured === 'function' ? gateway.isConfigured() : true,
    mock: typeof gateway.mockMode === 'function' ? gateway.mockMode() : false
  }));
}

module.exports = { getGateway, listGateways, gateways };
