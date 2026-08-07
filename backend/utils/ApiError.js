// utils/ApiError.js
// Custom Error class that carries an HTTP status code and optional
// field-level errors array, so any controller can simply `throw new ApiError(...)`
// and let the centralized error handler middleware format the response.

class ApiError extends Error {
  /**
   * @param {number} statusCode - HTTP status code
   * @param {string} message - error message
   * @param {Array} errors - optional array of validation errors
   */
  constructor(statusCode, message, errors = []) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.success = false;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = ApiError;
