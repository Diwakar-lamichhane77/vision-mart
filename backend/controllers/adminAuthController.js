// controllers/adminAuthController.js
// Admin-facing authentication. There is intentionally no public
// "register admin" endpoint — see database/seedAdmin.js for provisioning
// the first admin account directly against the database.

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const { comparePassword } = require('../utils/password');
const { signAdminToken } = require('../utils/jwt');
const adminModel = require('../models/adminModel');

function toPublicAdmin(admin) {
  // eslint-disable-next-line no-unused-vars
  const { password, ...publicAdmin } = admin;
  return publicAdmin;
}

/**
 * POST /api/admin/login
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const admin = await adminModel.findByEmail(email);
  if (!admin) {
    throw new ApiError(401, 'Invalid email or password.');
  }

  const passwordMatches = await comparePassword(password, admin.password);
  if (!passwordMatches) {
    throw new ApiError(401, 'Invalid email or password.');
  }

  if (admin.status === 'inactive') {
    throw new ApiError(403, 'This admin account has been deactivated.');
  }

  const token = signAdminToken({ id: admin.id, email: admin.email });

  return sendSuccess(res, 200, 'Login successful.', { admin: toPublicAdmin(admin), token });
});

/**
 * GET /api/admin/profile
 * req.admin is already attached (public fields only) by requireAdminAuth.
 */
const getProfile = asyncHandler(async (req, res) => {
  return sendSuccess(res, 200, 'Profile fetched successfully.', { admin: req.admin });
});

module.exports = { login, getProfile };
