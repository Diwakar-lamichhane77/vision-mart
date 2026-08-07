// controllers/authController.js
// Customer-facing authentication: register, login, profile, change-password,
// plus the unified token-verify endpoint used by the frontend's route guards.

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const { hashPassword, comparePassword } = require('../utils/password');
const { signUserToken, signAdminToken, verifyUserToken, verifyAdminToken } = require('../utils/jwt');
const { extractBearerToken } = require('../middleware/auth');
const userModel = require('../models/userModel');
const adminModel = require('../models/adminModel');

/**
 * Strips the password hash (and any other internal-only fields) before a
 * user record is ever sent back in an API response.
 */
function toPublicUser(user) {
  // eslint-disable-next-line no-unused-vars
  const { password, ...publicUser } = user;
  return publicUser;
}

/**
 * POST /api/auth/register
 * Creates a new customer account and immediately logs them in (returns a token).
 */
const register = asyncHandler(async (req, res) => {
  const { name, email, password, phone, address } = req.body;

  const existing = await userModel.findByEmail(email);
  if (existing) {
    throw new ApiError(409, 'An account with this email already exists.');
  }

  const passwordHash = await hashPassword(password);
  const userId = await userModel.create({ name, email, password: passwordHash, phone, address });
  const user = await userModel.findById(userId);

  const token = signUserToken({ id: user.id, email: user.email });

  return sendSuccess(res, 201, 'Registration successful.', { user, token });
});

/**
 * POST /api/auth/login
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await userModel.findByEmail(email);
  if (!user) {
    throw new ApiError(401, 'Invalid email or password.');
  }

  const passwordMatches = await comparePassword(password, user.password);
  if (!passwordMatches) {
    throw new ApiError(401, 'Invalid email or password.');
  }

  if (user.status === 'blocked') {
    throw new ApiError(403, 'Your account has been blocked. Please contact support.');
  }

  const token = signUserToken({ id: user.id, email: user.email });

  return sendSuccess(res, 200, 'Login successful.', { user: toPublicUser(user), token });
});

/**
 * GET /api/auth/verify
 * Accepts EITHER a customer or an admin JWT (they use different secrets)
 * and reports which kind of account it belongs to. Powers the frontend's
 * single login-guard/redirect-if-auth logic for both account types.
 */
const verify = asyncHandler(async (req, res) => {
  const token = extractBearerToken(req);
  if (!token) throw new ApiError(401, 'Authentication token is required.');

  // Try as an admin token first.
  try {
    const decoded = verifyAdminToken(token);
    const admin = await adminModel.findById(decoded.id);
    if (admin) {
      return sendSuccess(res, 200, 'Token valid.', { is_admin: true, user: admin });
    }
  } catch (err) {
    // Not a valid admin token — fall through and try as a customer token.
  }

  // Try as a customer token.
  try {
    const decoded = verifyUserToken(token);
    const user = await userModel.findById(decoded.id);
    if (user) {
      return sendSuccess(res, 200, 'Token valid.', { is_admin: false, user });
    }
  } catch (err) {
    // Not a valid customer token either.
  }

  throw new ApiError(401, 'Invalid or expired authentication token.');
});

/**
 * GET /api/auth/profile
 * req.user is already attached (public fields only) by requireCustomerAuth.
 */
const getProfile = asyncHandler(async (req, res) => {
  return sendSuccess(res, 200, 'Profile fetched successfully.', { user: req.user });
});

/**
 * PUT /api/auth/profile
 */
const updateProfile = asyncHandler(async (req, res) => {
  const { name, phone, address, city } = req.body;
  const updatedUser = await userModel.updateProfile(req.user.id, { name, phone, address, city });
  return sendSuccess(res, 200, 'Profile updated successfully.', { user: updatedUser });
});

/**
 * PUT /api/auth/change-password
 */
const changePassword = asyncHandler(async (req, res) => {
  const { current_password: currentPassword, new_password: newPassword } = req.body;

  // req.user only has public fields — re-fetch the full row to get the hash.
  const fullUser = await userModel.findByEmail(req.user.email);
  const matches = await comparePassword(currentPassword, fullUser.password);
  if (!matches) {
    throw new ApiError(401, 'Current password is incorrect.');
  }

  const newHash = await hashPassword(newPassword);
  await userModel.updatePassword(req.user.id, newHash);

  return sendSuccess(res, 200, 'Password changed successfully.', {});
});

module.exports = { register, login, verify, getProfile, updateProfile, changePassword, toPublicUser };
