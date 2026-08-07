// controllers/contactController.js
// Storefront contact form + admin inbox.
//
// POST is intentionally PUBLIC — visitors must be able to get in touch
// without an account. Everything else is admin-only.

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const contactModel = require('../models/contactModel');

/**
 * toApiMessage
 */
function toApiMessage(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    subject: row.subject,
    message: row.message,
    status: row.status,
    created_at: row.created_at
  };
}

/**
 * POST /api/contact
 * Public. Body: { name, email, subject?, message }
 */
const createMessage = asyncHandler(async (req, res) => {
  const { name, email, subject, message } = req.body;

  const id = await contactModel.create({
    name: name.trim(),
    email: email.trim(),
    subject,
    message: message.trim()
  });

  // Only the id is echoed back — a public endpoint shouldn't reflect the
  // whole stored record, and the sender already knows what they wrote.
  return sendSuccess(res, 201, 'Thank you for reaching out. We will get back to you shortly.', {
    id,
    submitted: true
  });
});

/**
 * GET /api/contact
 * Admin inbox. Filters: ?status=unread|read|replied&search=&limit=&page=
 */
const getMessages = asyncHandler(async (req, res) => {
  const perPage = req.query.limit ? Number.parseInt(req.query.limit, 10) : 50;
  const currentPage = req.query.page ? Number.parseInt(req.query.page, 10) : 1;

  const filters = {
    status: req.query.status || null,
    search: req.query.search || null
  };

  const rows = await contactModel.findAll({
    ...filters,
    limit: perPage,
    offset: (currentPage - 1) * perPage
  });
  const total = await contactModel.countAll(filters);
  const unread = await contactModel.countUnread();

  return res.status(200).json({
    success: true,
    message: 'Messages fetched successfully.',
    data: rows.map(toApiMessage),
    meta: {
      total,
      unread,
      page: currentPage,
      limit: perPage,
      total_pages: Math.ceil(total / perPage) || 1
    }
  });
});

/**
 * GET /api/contact/:id
 * Admin. Opening a message marks it read, which is what an inbox should do.
 */
const getMessageById = asyncHandler(async (req, res) => {
  const message = await contactModel.findById(req.params.id);
  if (!message) {
    throw new ApiError(404, 'Message not found.');
  }

  if (message.status === 'unread') {
    await contactModel.updateStatus(message.id, 'read');
    message.status = 'read';
  }

  return sendSuccess(res, 200, 'Message fetched successfully.', toApiMessage(message));
});

/**
 * PUT /api/contact/:id/status
 * Admin. Body: { status: 'unread' | 'read' | 'replied' }
 */
const updateMessageStatus = asyncHandler(async (req, res) => {
  const message = await contactModel.findById(req.params.id);
  if (!message) {
    throw new ApiError(404, 'Message not found.');
  }

  await contactModel.updateStatus(message.id, req.body.status);
  const updated = await contactModel.findById(message.id);

  return sendSuccess(res, 200, `Message marked as ${req.body.status}.`, toApiMessage(updated));
});

/**
 * DELETE /api/contact/:id
 * Admin.
 */
const deleteMessage = asyncHandler(async (req, res) => {
  const message = await contactModel.findById(req.params.id);
  if (!message) {
    throw new ApiError(404, 'Message not found.');
  }

  await contactModel.remove(message.id);
  return sendSuccess(res, 200, 'Message deleted successfully.', {});
});

module.exports = {
  createMessage,
  getMessages,
  getMessageById,
  updateMessageStatus,
  deleteMessage
};
