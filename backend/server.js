// server.js
// Entry point of the Vision Mart Eyewear E-commerce backend API.
// Sets up Express, security middleware, logging, static file serving,
// route mounting, and centralized error handling.

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const { testConnection } = require('./config/db');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

// ------------------------------------------------------------------
// Security Middleware
// ------------------------------------------------------------------
app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin"
    }
  })
); // sets secure HTTP headers
app.use(
  cors({
    origin: process.env.FRONTEND_URL || '*', // Bazario frontend URL
    credentials: true
  })
);

// ------------------------------------------------------------------
// Logging
// ------------------------------------------------------------------
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ------------------------------------------------------------------
// Body Parsers
// ------------------------------------------------------------------
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ------------------------------------------------------------------
// Static Files - serve uploaded product images
// ------------------------------------------------------------------
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ------------------------------------------------------------------
// Health Check
// ------------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Vision Mart API is running',
    data: { timestamp: new Date().toISOString() }
  });
});

// ------------------------------------------------------------------
// API Routes
// ------------------------------------------------------------------
// NOTE: Routes are mounted incrementally, module by module.
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/admin', require('./routes/adminAuthRoutes'));
app.use('/api/categories', require('./routes/categoryRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/cart', require('./routes/cartRoutes'));
app.use('/api/wishlist', require('./routes/wishlistRoutes'));
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes'));
app.use('/api/reviews', require('./routes/reviewRoutes'));

// Admin dashboard, reports and customer management.
// NOTE: these must be mounted AFTER '/api/admin' (adminAuthRoutes) — Express
// matches in order, and the more specific paths need to win.
const { dashboardRouter, reportRouter, adminUserRouter } = require('./routes/adminRoutes');
app.use('/api/admin/dashboard', dashboardRouter);
app.use('/api/admin/users', adminUserRouter);
app.use('/api/reports', reportRouter);
app.use('/api/contact', require('./routes/contactRoutes'));

// ------------------------------------------------------------------
// 404 + Centralized Error Handling (must be registered last)
// ------------------------------------------------------------------
app.use(notFound);
app.use(errorHandler);

// ------------------------------------------------------------------
// Start Server
// ------------------------------------------------------------------
const PORT = process.env.PORT || 5000;

async function startServer() {
  await testConnection(); // fail fast if DB is misconfigured
  app.listen(PORT, () => {
    console.log(`🚀 Vision Mart API running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  });
}

startServer();

module.exports = app;
