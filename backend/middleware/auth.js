// middleware/auth.js
// Route guards that verify the Bearer token in the Authorization header
// and attach the decoded identity to the request object.

const { verifyUserToken, verifyAdminToken } = require('../utils/jwt');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const userModel = require('../models/userModel');
const adminModel = require('../models/adminModel');

/**
 * extractBearerToken
 * Pulls the raw token string out of "Authorization: Bearer <token>".
 */
function extractBearerToken(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}

/**
 * requireCustomerAuth
 * Verifies a customer JWT and attaches req.user = { id, email, role: 'customer' }.
 * Rejects with 401 if the token is missing, invalid, expired, or the user
 * no longer exists / is blocked.
 */
const requireCustomerAuth = asyncHandler(async (req, res, next) => {
  const token = extractBearerToken(req);
  if (!token) throw new ApiError(401, 'Authentication token is required.');

  let decoded;
  try {
    decoded = verifyUserToken(token);
  } catch (err) {
    throw new ApiError(401, 'Invalid or expired authentication token.');
  }

  const user = await userModel.findById(decoded.id);
  if (!user) throw new ApiError(401, 'Account no longer exists.');
  if (user.status === 'blocked') throw new ApiError(403, 'Your account has been blocked.');

  req.user = user;
  next();
});

/**
 * requireAdminAuth
 * Verifies an admin JWT and attaches req.admin = { id, email, role, ... }.
 */
const requireAdminAuth = asyncHandler(async (req, res, next) => {
  const token = extractBearerToken(req);
  if (!token) throw new ApiError(401, 'Authentication token is required.');

  let decoded;
  try {
    decoded = verifyAdminToken(token);
  } catch (err) {
    throw new ApiError(401, 'Invalid or expired authentication token.');
  }

  const admin = await adminModel.findById(decoded.id);
  if (!admin) throw new ApiError(401, 'Account no longer exists.');
  if (admin.status === 'inactive') throw new ApiError(403, 'Your admin account has been deactivated.');

  req.admin = admin;
  next();
});

/**
 * optionalCustomerAuth
 * Does NOT reject the request if there's no/invalid token — used on public
 * routes (e.g. GET /api/products) that behave slightly differently for a
 * logged-in customer (is_in_cart / is_in_wishlist flags) but must still
 * work for anonymous visitors.
 */
const optionalCustomerAuth = asyncHandler(async (req, res, next) => {
  const token = extractBearerToken(req);
  if (!token) return next();

  try {
    const decoded = verifyUserToken(token);
    const user = await userModel.findById(decoded.id);
    if (user && user.status !== 'blocked') {
      req.user = user;
    }
  } catch (err) {
    // Invalid/expired token on a public route just means "treat as anonymous".
  }
  next();
});

/**
 * requireAnyAuth
 * Accepts EITHER a customer or an admin token and attaches whichever it
 * found (req.user or req.admin). Used by routes that both roles hit but
 * see different data through — e.g. GET /api/orders returns the customer's
 * own orders, or every order when called by an admin.
 * Controllers must branch on `req.admin` to decide scope.
 */
const requireAnyAuth = asyncHandler(async (req, res, next) => {
  const token = extractBearerToken(req);
  if (!token) throw new ApiError(401, 'Authentication token is required.');

  // Try admin first (different signing secret, so this can't be spoofed
  // by a customer token).
  try {
    const decoded = verifyAdminToken(token);
    const admin = await adminModel.findById(decoded.id);
    if (admin && admin.status !== 'inactive') {
      req.admin = admin;
      return next();
    }
  } catch (err) {
    // Not an admin token — fall through to the customer check.
  }

  try {
    const decoded = verifyUserToken(token);
    const user = await userModel.findById(decoded.id);
    if (user) {
      if (user.status === 'blocked') throw new ApiError(403, 'Your account has been blocked.');
      req.user = user;
      return next();
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
  }

  throw new ApiError(401, 'Invalid or expired authentication token.');
});

module.exports = {
  requireCustomerAuth,
  requireAdminAuth,
  requireAnyAuth,
  optionalCustomerAuth,
  extractBearerToken
};
