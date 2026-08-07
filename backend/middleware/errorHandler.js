// middleware/errorHandler.js
// Centralized error handling middleware. Every thrown error (including
// ApiError instances, MySQL errors, JWT errors, Multer errors, and
// express-validator errors) is normalized into the standard error
// response shape: { success: false, message, errors }

const ApiError = require('../utils/ApiError');

/**
 * notFound
 * Handles requests to routes that do not exist (404).
 * Must be registered AFTER all valid routes.
 */
function notFound(req, res, next) {
  const error = new ApiError(404, `Route not found - ${req.originalUrl}`);
  next(error);
}

/**
 * errorHandler
 * Final Express error-handling middleware (4 arguments signature required by Express).
 * Normalizes all error types into a single consistent JSON response.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let errors = err.errors || [];

  // MySQL duplicate entry error
  if (err.code === 'ER_DUP_ENTRY') {
    statusCode = 409;
    message = 'Duplicate entry. This record already exists.';
  }

  // MySQL foreign key constraint errors
  if (err.code === 'ER_NO_REFERENCED_ROW' || err.code === 'ER_NO_REFERENCED_ROW_2') {
    statusCode = 400;
    message = 'Invalid reference: related record does not exist.';
  }

  if (err.code === 'ER_ROW_IS_REFERENCED' || err.code === 'ER_ROW_IS_REFERENCED_2') {
    statusCode = 400;
    message = 'Cannot delete: this record is referenced by other data.';
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid authentication token.';
  }
  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Authentication token has expired.';
  }

  // Multer file upload errors
  if (err.name === 'MulterError') {
    statusCode = 400;
    message = `File upload error: ${err.message}`;
  }

  // Log full error server-side (never leak internals to the client)
  if (statusCode === 500) {
    console.error('🔥 Unhandled Error:', err);
    // Raw driver messages can expose table names, column names and query
    // structure — useful to an attacker, useless to a legitimate user.
    // The real message stays in the server log above.
    message = 'Internal Server Error';
    errors = [];
  }

  res.status(statusCode).json({
    success: false,
    message,
    errors: Array.isArray(errors) ? errors : [errors]
  });
}

module.exports = { notFound, errorHandler };
