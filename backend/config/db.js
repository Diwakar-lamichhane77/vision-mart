// config/db.js
// Reusable MySQL connection pool using mysql2/promise.
// Exposes a single pool instance used across the entire application (models/services).

const mysql = require('mysql2/promise');
require('dotenv').config();

/**
 * Create a connection pool.
 * Pools automatically manage connection reuse and are the recommended
 * way to talk to MySQL from a Node.js/Express application.
 */
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'vision_mart',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 10,
  queueLimit: 0,
  namedPlaceholders: true,
  dateStrings: true
});

/**
 * testConnection
 * Verifies the pool can reach the database. Called once on server startup
 * so that configuration issues fail fast with a clear log message.
 */
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('✅ MySQL connected successfully to database:', process.env.DB_NAME);
    connection.release();
  } catch (error) {
    console.error('❌ Failed to connect to MySQL database:', error.message);
    process.exit(1);
  }
}

module.exports = { pool, testConnection };
