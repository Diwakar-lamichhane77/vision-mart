// models/productModel.js
// Data-access layer for the `products` table.
//
// Two things worth noting about this file:
//  1. Filters are built dynamically, but every user-supplied VALUE goes through
//     a named placeholder. Only column/direction names are interpolated, and
//     those come from a fixed whitelist (SORT_OPTIONS) — never from raw input.
//  2. `rating`, `is_in_cart` and `is_in_wishlist` are computed in SQL rather
//     than in JS, so listing products stays a single round-trip.

const { pool } = require('../config/db');

// Whitelist of allowed sorts. The frontend sends the key; the value is the
// literal ORDER BY fragment. Anything not in this map falls back to 'newest',
// which is what makes interpolating it into the query safe.
const SORT_OPTIONS = {
  newest: 'p.created_at DESC',
  oldest: 'p.created_at ASC',
  price_low: 'effective_price ASC',
  price_high: 'effective_price DESC',
  popularity: 'p.sold_count DESC, p.created_at DESC',
  rating: 'rating DESC, p.created_at DESC',
  name_asc: 'p.name ASC',
  name_desc: 'p.name DESC'
};

// Columns selected for every product query. `effective_price` is the price the
// customer actually pays (discount when present), so price sorting and price
// filtering behave the way a shopper expects.
const PRODUCT_SELECT = `
  p.id, p.category_id, p.name, p.brand, p.description,
  p.price, p.discount_price, p.frame_type, p.frame_material,
  p.lens_type, p.color, p.stock, p.image, p.sku, p.sold_count,
  p.status, p.created_at, p.updated_at,
  COALESCE(p.discount_price, p.price) AS effective_price,
  c.id AS category_id_join, c.name AS category_name, c.slug AS category_slug,
  COALESCE(AVG(r.rating), 0) AS rating,
  COUNT(DISTINCT r.id) AS reviews_count
`;

/**
 * buildFilters
 * Translates the query-string filters into SQL conditions + named params.
 * Returns { clause, params } so both findAll and countAll can share it.
 */
function buildFilters(filters = {}) {
  const conditions = [];
  const params = {};

  // Free-text search across the fields a shopper would search by.
  if (filters.search) {
    conditions.push(
      '(p.name LIKE :search OR p.brand LIKE :search OR p.description LIKE :search OR p.color LIKE :search)'
    );
    params.search = `%${filters.search}%`;
  }

  if (filters.category_id) {
    conditions.push('p.category_id = :category_id');
    params.category_id = filters.category_id;
  }

  if (filters.brand) {
    conditions.push('p.brand = :brand');
    params.brand = filters.brand;
  }

  if (filters.color) {
    conditions.push('p.color = :color');
    params.color = filters.color;
  }

  if (filters.frame_type) {
    conditions.push('p.frame_type = :frame_type');
    params.frame_type = filters.frame_type;
  }

  if (filters.frame_material) {
    conditions.push('p.frame_material = :frame_material');
    params.frame_material = filters.frame_material;
  }

  if (filters.lens_type) {
    conditions.push('p.lens_type = :lens_type');
    params.lens_type = filters.lens_type;
  }

  // Price range filters compare against the discounted price when there is one.
  if (filters.min_price !== undefined && filters.min_price !== null) {
    conditions.push('COALESCE(p.discount_price, p.price) >= :min_price');
    params.min_price = filters.min_price;
  }

  if (filters.max_price !== undefined && filters.max_price !== null) {
    conditions.push('COALESCE(p.discount_price, p.price) <= :max_price');
    params.max_price = filters.max_price;
  }

  if (filters.status) {
    conditions.push('p.status = :status');
    params.status = filters.status;
  }

  // in_stock=true hides sold-out products from the storefront.
  if (filters.in_stock) {
    conditions.push('p.stock > 0');
  }

  const clause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return { clause, params };
}

/**
 * findAll
 * @param {object} filters - search/category_id/brand/color/price/etc.
 * @param {object} options - { sort, limit, offset, userId }
 *   userId (optional) drives the per-user is_in_cart / is_in_wishlist flags.
 */
async function findAll(filters = {}, options = {}) {
  const { sort = 'newest', limit = null, offset = 0, userId = null } = options;

  const { clause, params } = buildFilters(filters);

  // Whitelisted — never interpolated from raw user input.
  const orderBy = SORT_OPTIONS[sort] || SORT_OPTIONS.newest;

  // LIMIT/OFFSET are cast to integers before interpolation (placeholders in
  // LIMIT are unreliable across MySQL driver modes).
  const safeLimit = limit === null ? null : Math.max(1, Number.parseInt(limit, 10) || 20);
  const safeOffset = Math.max(0, Number.parseInt(offset, 10) || 0);
  const limitClause = safeLimit === null ? '' : `LIMIT ${safeLimit} OFFSET ${safeOffset}`;

  const [rows] = await pool.query(
    `SELECT ${PRODUCT_SELECT},
       EXISTS(
         SELECT 1 FROM cart_items ci
         JOIN cart ct ON ct.id = ci.cart_id
         WHERE ci.product_id = p.id AND ct.user_id = :userId
       ) AS is_in_cart,
       EXISTS(
         SELECT 1 FROM wishlist w
         WHERE w.product_id = p.id AND w.user_id = :userId
       ) AS is_in_wishlist
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN reviews r ON r.product_id = p.id
     ${clause}
     GROUP BY p.id
     ORDER BY ${orderBy}
     ${limitClause}`,
    { ...params, userId }
  );

  return rows;
}

/**
 * countAll
 * Total matching rows ignoring limit/offset — used for pagination metadata.
 */
async function countAll(filters = {}) {
  const { clause, params } = buildFilters(filters);
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total FROM products p ${clause}`,
    params
  );
  return Number(rows[0].total);
}

/**
 * findById
 * @param {number} id
 * @param {number|null} userId - for is_in_cart / is_in_wishlist
 */
async function findById(id, userId = null) {
  const [rows] = await pool.query(
    `SELECT ${PRODUCT_SELECT},
       EXISTS(
         SELECT 1 FROM cart_items ci
         JOIN cart ct ON ct.id = ci.cart_id
         WHERE ci.product_id = p.id AND ct.user_id = :userId
       ) AS is_in_cart,
       EXISTS(
         SELECT 1 FROM wishlist w
         WHERE w.product_id = p.id AND w.user_id = :userId
       ) AS is_in_wishlist
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN reviews r ON r.product_id = p.id
     WHERE p.id = :id
     GROUP BY p.id
     LIMIT 1`,
    { id, userId }
  );
  return rows[0] || null;
}

/**
 * findReviewsByProductId
 * Fetched separately from the product row because joining reviews inline
 * would multiply rows and break the aggregate columns.
 */
async function findReviewsByProductId(productId) {
  const [rows] = await pool.query(
    `SELECT r.id, r.rating, r.comment, r.created_at, r.updated_at,
            u.id AS user_id, u.name AS user_name
     FROM reviews r
     JOIN users u ON u.id = r.user_id
     WHERE r.product_id = :productId
     ORDER BY r.created_at DESC`,
    { productId }
  );
  return rows;
}

/**
 * create
 * @returns {Promise<number>} insertId
 */
async function create(data) {
  const [result] = await pool.query(
    `INSERT INTO products
       (category_id, name, brand, description, price, discount_price,
        frame_type, frame_material, lens_type, color, stock, image, sku, status)
     VALUES
       (:category_id, :name, :brand, :description, :price, :discount_price,
        :frame_type, :frame_material, :lens_type, :color, :stock, :image, :sku, :status)`,
    {
      category_id: data.category_id,
      name: data.name,
      brand: data.brand ?? null,
      description: data.description ?? null,
      price: data.price,
      discount_price: data.discount_price ?? null,
      frame_type: data.frame_type ?? null,
      frame_material: data.frame_material ?? null,
      lens_type: data.lens_type ?? null,
      color: data.color ?? null,
      stock: data.stock ?? 0,
      image: data.image ?? null,
      sku: data.sku ?? null,
      status: data.status ?? 'active'
    }
  );
  return result.insertId;
}

/**
 * update
 * Partial update. COALESCE keeps the existing value when null is passed,
 * EXCEPT for discount_price, where clearing it is a meaningful action — so
 * a caller sends the string 'null' (handled in the controller) to wipe it.
 */
async function update(id, data) {
  await pool.query(
    `UPDATE products SET
       category_id = COALESCE(:category_id, category_id),
       name = COALESCE(:name, name),
       brand = COALESCE(:brand, brand),
       description = COALESCE(:description, description),
       price = COALESCE(:price, price),
       discount_price = IF(:clear_discount, NULL, COALESCE(:discount_price, discount_price)),
       frame_type = COALESCE(:frame_type, frame_type),
       frame_material = COALESCE(:frame_material, frame_material),
       lens_type = COALESCE(:lens_type, lens_type),
       color = COALESCE(:color, color),
       stock = COALESCE(:stock, stock),
       image = COALESCE(:image, image),
       sku = COALESCE(:sku, sku),
       status = COALESCE(:status, status)
     WHERE id = :id`,
    {
      id,
      category_id: data.category_id ?? null,
      name: data.name ?? null,
      brand: data.brand ?? null,
      description: data.description ?? null,
      price: data.price ?? null,
      discount_price: data.discount_price ?? null,
      clear_discount: data.clear_discount ? 1 : 0,
      frame_type: data.frame_type ?? null,
      frame_material: data.frame_material ?? null,
      lens_type: data.lens_type ?? null,
      color: data.color ?? null,
      stock: data.stock ?? null,
      image: data.image ?? null,
      sku: data.sku ?? null,
      status: data.status ?? null
    }
  );
  return findById(id);
}

/**
 * remove
 */
async function remove(id) {
  const [result] = await pool.query('DELETE FROM products WHERE id = :id', { id });
  return result.affectedRows > 0;
}

/**
 * findBySku
 * Guards the UNIQUE sku column with a friendly error instead of a raw
 * duplicate-key failure.
 */
async function findBySku(sku, excludeId = null) {
  if (!sku) return null;
  const [rows] = await pool.query(
    `SELECT id FROM products
     WHERE sku = :sku AND (:excludeId IS NULL OR id != :excludeId)
     LIMIT 1`,
    { sku, excludeId }
  );
  return rows[0] || null;
}

/**
 * getFilterOptions
 * Returns the distinct values available for each filter, so the storefront
 * can render filter dropdowns without hardcoding eyewear attributes.
 */
async function getFilterOptions() {
  const [brands] = await pool.query(
    "SELECT DISTINCT brand FROM products WHERE brand IS NOT NULL AND brand != '' ORDER BY brand"
  );
  const [colors] = await pool.query(
    "SELECT DISTINCT color FROM products WHERE color IS NOT NULL AND color != '' ORDER BY color"
  );
  const [frameTypes] = await pool.query(
    "SELECT DISTINCT frame_type FROM products WHERE frame_type IS NOT NULL AND frame_type != '' ORDER BY frame_type"
  );
  const [frameMaterials] = await pool.query(
    "SELECT DISTINCT frame_material FROM products WHERE frame_material IS NOT NULL AND frame_material != '' ORDER BY frame_material"
  );
  const [lensTypes] = await pool.query(
    "SELECT DISTINCT lens_type FROM products WHERE lens_type IS NOT NULL AND lens_type != '' ORDER BY lens_type"
  );
  const [priceRange] = await pool.query(
    'SELECT MIN(COALESCE(discount_price, price)) AS min_price, MAX(COALESCE(discount_price, price)) AS max_price FROM products'
  );

  return {
    brands: brands.map((r) => r.brand),
    colors: colors.map((r) => r.color),
    frame_types: frameTypes.map((r) => r.frame_type),
    frame_materials: frameMaterials.map((r) => r.frame_material),
    lens_types: lensTypes.map((r) => r.lens_type),
    min_price: Number(priceRange[0].min_price || 0),
    max_price: Number(priceRange[0].max_price || 0)
  };
}

module.exports = {
  findAll,
  countAll,
  findById,
  findReviewsByProductId,
  create,
  update,
  remove,
  findBySku,
  getFilterOptions,
  SORT_OPTIONS
};
