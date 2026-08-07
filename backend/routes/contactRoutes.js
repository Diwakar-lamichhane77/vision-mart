// routes/contactRoutes.js
const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');

const contactController = require('../controllers/contactController');
const { requireAdminAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { MESSAGE_STATUSES } = require('../models/contactModel');

// ----- Public: anyone can send a message -----
router.post(
  '/',
  [
    body('name')
      .trim()
      .notEmpty().withMessage('Name is required.')
      .isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters.'),
    body('email')
      .trim()
      .notEmpty().withMessage('Email is required.')
      .isEmail().withMessage('Please provide a valid email address.')
      .normalizeEmail(),
    body('subject').optional({ checkFalsy: true }).trim().isLength({ max: 200 }),
    body('message')
      .trim()
      .notEmpty().withMessage('Message is required.')
      .isLength({ min: 10, max: 5000 }).withMessage('Message must be between 10 and 5000 characters.')
  ],
  validate,
  contactController.createMessage
);

// ----- Admin inbox -----
router.get(
  '/',
  requireAdminAuth,
  [
    query('status').optional({ checkFalsy: true }).isIn(MESSAGE_STATUSES).withMessage(`status must be one of: ${MESSAGE_STATUSES.join(', ')}.`),
    query('limit').optional({ checkFalsy: true }).isInt({ min: 1, max: 200 }).withMessage('limit must be between 1 and 200.'),
    query('page').optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage('page must be a positive integer.')
  ],
  validate,
  contactController.getMessages
);

router.get(
  '/:id',
  requireAdminAuth,
  [param('id').isInt({ min: 1 }).withMessage('Message id must be a positive integer.')],
  validate,
  contactController.getMessageById
);

router.put(
  '/:id/status',
  requireAdminAuth,
  [
    param('id').isInt({ min: 1 }).withMessage('Message id must be a positive integer.'),
    body('status')
      .notEmpty().withMessage('Status is required.')
      .isIn(MESSAGE_STATUSES).withMessage(`Status must be one of: ${MESSAGE_STATUSES.join(', ')}.`)
  ],
  validate,
  contactController.updateMessageStatus
);

router.delete(
  '/:id',
  requireAdminAuth,
  [param('id').isInt({ min: 1 }).withMessage('Message id must be a positive integer.')],
  validate,
  contactController.deleteMessage
);

module.exports = router;
