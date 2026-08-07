// config/multer.js
// Reusable Multer configuration factory. Both the category module and the
// product module upload a single image, so the storage/filter/limit logic
// lives here once and each module just asks for its own subfolder.

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ApiError = require('../utils/ApiError');

const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB) || 5;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

/**
 * ensureDirectory
 * Creates the destination folder if it doesn't exist yet, so a fresh clone
 * of the repo (where empty upload folders aren't tracked by git) still works.
 */
function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * createUploader
 * Builds a configured Multer instance that writes to uploads/<subfolder>.
 * @param {string} subfolder - e.g. 'products' or 'categories'
 * @param {string} [filePrefix] - prefix for generated filenames.
 *   Defaults to the subfolder name; pass a singular form for nicer filenames
 *   (naive de-pluralization would turn 'categories' into 'categorie').
 * @returns {import('multer').Multer}
 */
function createUploader(subfolder, filePrefix = subfolder) {
  const destination = path.join(__dirname, '..', 'uploads', subfolder);
  ensureDirectory(destination);

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, destination),
    filename: (req, file, cb) => {
      // Unique, collision-proof, and keeps the original extension.
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${filePrefix}-${uniqueSuffix}${ext}`);
    }
  });

  /**
   * fileFilter
   * Rejects anything that isn't an allowed image type. Relying on mimetype
   * alone isn't bulletproof, so the extension is checked as well.
   */
  const fileFilter = (req, file, cb) => {
    const extIsAllowed = /\.(jpe?g|png|webp|gif)$/i.test(file.originalname);
    if (ALLOWED_MIME_TYPES.includes(file.mimetype) && extIsAllowed) {
      return cb(null, true);
    }
    return cb(new ApiError(400, 'Only image files (jpg, jpeg, png, webp, gif) are allowed.'));
  };

  return multer({
    storage,
    fileFilter,
    limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 }
  });
}

/**
 * deleteUploadedFile
 * Best-effort removal of an image file from disk. Used when a record is
 * deleted or its image is replaced, so orphaned files don't pile up.
 * Never throws — a missing file should not fail the request.
 * @param {string} subfolder
 * @param {string} filename - stored filename (not a full URL)
 */
function deleteUploadedFile(subfolder, filename) {
  if (!filename) return;
  try {
    const filePath = path.join(__dirname, '..', 'uploads', subfolder, path.basename(filename));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error(`Failed to delete upload ${subfolder}/${filename}:`, error.message);
  }
}

module.exports = { createUploader, deleteUploadedFile };
