// middleware/validate.js
// Runs after express-validator's check()/body()/query() chains on a route.
// If validation failed, responds immediately with the standard error shape.
// Otherwise calls next() and lets the controller run.

const { validationResult } = require('express-validator');

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map((e) => ({
        field: e.path,
        message: e.msg
      }))
    });
  }
  next();
}

module.exports = validate;
