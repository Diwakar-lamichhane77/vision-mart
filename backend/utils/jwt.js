// utils/jwt.js
// JWT helpers for Vision Mart's dual-token scheme:
// customers are signed/verified with JWT_SECRET, admins with JWT_ADMIN_SECRET.
// Keeping the two completely separate means a leaked customer token can
// never be replayed as an admin token, and vice versa.

const jwt = require('jsonwebtoken');

/**
 * signUserToken
 * Signs a JWT for a customer (users table).
 * @param {{id:number, email:string}} payload
 */
function signUserToken(payload) {
  return jwt.sign({ id: payload.id, email: payload.email, role: 'customer' }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
}

/**
 * signAdminToken
 * Signs a JWT for an admin (admins table).
 * @param {{id:number, email:string}} payload
 */
function signAdminToken(payload) {
  return jwt.sign({ id: payload.id, email: payload.email, role: 'admin' }, process.env.JWT_ADMIN_SECRET, {
    expiresIn: process.env.JWT_ADMIN_EXPIRES_IN || '1d'
  });
}

/**
 * verifyUserToken - throws if invalid/expired or not a customer token.
 */
function verifyUserToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

/**
 * verifyAdminToken - throws if invalid/expired or not an admin token.
 */
function verifyAdminToken(token) {
  return jwt.verify(token, process.env.JWT_ADMIN_SECRET);
}

module.exports = { signUserToken, signAdminToken, verifyUserToken, verifyAdminToken };
