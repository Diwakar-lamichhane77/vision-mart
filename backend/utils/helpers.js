// utils/helpers.js
// Small shared helpers used across modules.

/**
 * buildFileUrl
 * The frontend drops API values straight into <img src="...">, so the API
 * must return an absolute URL rather than a bare filename. The database
 * stores only the filename (per the spec), and this converts it on the
 * way out.
 * @param {string|null} filename - stored filename, e.g. 'category-123.jpg'
 * @param {string} subfolder - e.g. 'categories' or 'products'
 * @returns {string|null} absolute URL, or null when there's no image
 */
function buildFileUrl(filename, subfolder) {
  if (!filename) return null;
  // Already a full URL (e.g. seeded/external image) — pass through untouched.
  if (/^https?:\/\//i.test(filename)) return filename;

  const base = (process.env.API_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '');
  return `${base}/uploads/${subfolder}/${filename}`;
}

/**
 * slugify
 * Converts a display name into a URL-safe slug for the `categories.slug`
 * column (which is NOT NULL UNIQUE in the schema).
 * @param {string} text
 * @returns {string}
 */
function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '') // strip punctuation
    .replace(/\s+/g, '-') // spaces -> hyphens
    .replace(/-+/g, '-') // collapse repeats
    .replace(/^-|-$/g, ''); // trim leading/trailing hyphens
}

/**
 * parsePositiveInt
 * Safely parses a query/route value into a positive integer, or returns
 * the fallback. Guards against NaN and negative values reaching SQL.
 */
function parsePositiveInt(value, fallback = null) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) return fallback;
  return parsed;
}

module.exports = { buildFileUrl, slugify, parsePositiveInt };
