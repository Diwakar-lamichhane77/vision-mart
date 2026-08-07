// utils/asyncHandler.js
// Wraps an async Express route/controller handler so that any rejected
// promise (thrown error) is automatically forwarded to next(err),
// avoiding repetitive try/catch blocks in every controller function.

/**
 * asyncHandler
 * @param {Function} fn - async (req, res, next) => {}
 * @returns {Function} wrapped Express handler
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
