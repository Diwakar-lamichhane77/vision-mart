// utils/apiResponse.js
// Centralized helpers to guarantee every endpoint in the API returns
// the exact same response shape, as required by the project spec:
// success: { success, message, data }
// error:   { success, message, errors }

/**
 * sendSuccess
 * Sends a standardized success response.
 * @param {import('express').Response} res
 * @param {number} statusCode - HTTP status code (default 200)
 * @param {string} message - human readable message
 * @param {any} data - payload (object, array, or null)
 */
function sendSuccess(res, statusCode = 200, message = 'Success', data = {}) {
  return res.status(statusCode).json({
    success: true,
    message,
    data
  });
}

/**
 * sendError
 * Sends a standardized error response.
 * @param {import('express').Response} res
 * @param {number} statusCode - HTTP status code (default 500)
 * @param {string} message - human readable error message
 * @param {Array} errors - array of validation/field errors (optional)
 */
function sendError(res, statusCode = 500, message = 'Something went wrong', errors = []) {
  return res.status(statusCode).json({
    success: false,
    message,
    errors
  });
}

module.exports = { sendSuccess, sendError };
