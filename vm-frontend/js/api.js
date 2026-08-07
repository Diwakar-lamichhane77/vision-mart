/**
 * api.js
 * ---------------------------------------------------------------------------
 * The only file that talks to the network. Every page calls into the *API
 * objects below and receives plain JavaScript data back — no page ever calls
 * fetch() directly, and no page needs to know the response envelope.
 *
 * The backend answers in a consistent shape:
 *   success -> { success: true,  message, data, meta? }
 *   error   -> { success: false, message, errors: [{ field, message }] }
 * ---------------------------------------------------------------------------
 */

/** Thrown for every failed request so callers can branch on `status`. */
class ApiError extends Error {
  constructor(message, status, fieldErrors) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors || null;
  }
}

/** Builds "?a=1&b=2", dropping empty values. Returns "" when nothing is set. */
function buildQuery(params = {}) {
  const usp = new URLSearchParams(
    Object.entries(params).filter(
      ([, v]) => v !== undefined && v !== null && v !== ""
    )
  ).toString();
  return usp ? `?${usp}` : "";
}

/** Human-readable defaults so a caller that ignores `status` still says something useful. */
const STATUS_MESSAGES = {
  0: "Can't reach the server. Check your connection and try again.",
  400: "That request couldn't be completed.",
  401: "Your session has ended. Sign in to continue.",
  403: "You don't have access to that.",
  404: "We couldn't find what you were looking for.",
  409: "That already exists.",
  422: "Check the highlighted fields and try again.",
  500: "Something went wrong on our end. Try again shortly.",
};

/**
 * Core request helper.
 *
 * @param {string} path      Endpoint path, e.g. "/products"
 * @param {object} options
 * @param {string} options.method
 * @param {object|FormData} options.body
 * @param {boolean} options.auth       attach the stored JWT
 * @param {boolean} options.isFormData send as multipart (for file uploads)
 */
async function apiRequest(path, options = {}) {
  const {
    method = "GET",
    body,
    auth = false,
    isFormData = false,
    headers = {},
    // Some endpoints answer 401 for a reason that has nothing to do with the
    // token — /auth/change-password returns it when the CURRENT PASSWORD is
    // wrong. Treating that as an expired session would sign the customer out
    // for a typo, so those callers opt out.
    clearSessionOn401 = true,
  } = options;

  // For multipart we must NOT set Content-Type — the browser has to write it
  // itself so it can include the multipart boundary.
  const finalHeaders = isFormData
    ? { ...headers }
    : { "Content-Type": "application/json", ...headers };

  if (auth) {
    const token = localStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN);
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
  }

  let requestBody;
  if (body === undefined) requestBody = undefined;
  else if (isFormData) requestBody = body;
  else requestBody = JSON.stringify(body);

  let response;
  try {
    response = await fetch(`${CONFIG.API_BASE_URL}${path}`, {
      method,
      headers: finalHeaders,
      body: requestBody,
    });
  } catch {
    throw new ApiError(STATUS_MESSAGES[0], 0);
  }

  const isJson = (response.headers.get("content-type") || "").includes("application/json");
  const payload = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    // An expired or tampered token is worth clearing immediately, so the UI
    // stops pretending the visitor is signed in — but only when the 401 is
    // actually about the token (see clearSessionOn401 above).
    if (response.status === 401 && auth && clearSessionOn401) Session.clear();

    throw new ApiError(
      (payload && payload.message) || STATUS_MESSAGES[response.status] ||
        `Request failed (${response.status})`,
      response.status,
      payload && payload.errors
    );
  }

  return payload;
}

/* ======================= Product query translation ======================== */

/**
 * The UI speaks in friendly names ("newest", "price: low to high"); the API
 * expects its own keys. Translating in one place keeps that knowledge out of
 * every page.
 */
const SORT_MAP = {
  newest: "newest",
  oldest: "oldest",
  price_low: "price_low",
  price_high: "price_high",
  popularity: "popularity",
  rating: "rating",
  name_asc: "name_asc",
  name_desc: "name_desc",
};

const PARAM_KEY_MAP = {
  category: "category_id",
  categoryId: "category_id",
  minPrice: "min_price",
  maxPrice: "max_price",
  frameType: "frame_type",
  frameMaterial: "frame_material",
  lensType: "lens_type",
  inStock: "in_stock",
};

function mapProductParams(params = {}) {
  const out = {};
  Object.entries(params).forEach(([key, value]) => {
    out[PARAM_KEY_MAP[key] || key] = value;
  });
  if (out.sort) out.sort = SORT_MAP[out.sort] || "newest";
  return out;
}

/** Always hand pages a plain array, whatever the envelope looks like. */
function toList(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

/* ================================= AUTH ================================== */
const AuthAPI = {
  register({ name, email, password, phone, address }) {
    return apiRequest("/auth/register", {
      method: "POST",
      body: { name, email, password, phone, address },
    });
  },
  login({ email, password }) {
    return apiRequest("/auth/login", { method: "POST", body: { email, password } });
  },
  /** Confirms the stored token and reports whether it belongs to an admin. */
  verify() {
    return apiRequest("/auth/verify", { method: "GET", auth: true });
  },
  getProfile() {
    return apiRequest("/auth/profile", { method: "GET", auth: true });
  },
  updateProfile(payload) {
    return apiRequest("/auth/profile", { method: "PUT", auth: true, body: payload });
  },
  changePassword({ currentPassword, newPassword }) {
    // Mapped to the snake_case the API expects.
    // clearSessionOn401: false — here a 401 means "wrong current password",
    // not "your session ended". Signing the user out over a typo would be
    // both confusing and destructive.
    return apiRequest("/auth/change-password", {
      method: "PUT",
      auth: true,
      clearSessionOn401: false,
      body: { current_password: currentPassword, new_password: newPassword },
    });
  },
};

/* =============================== CATEGORIES ============================== */
const CategoryAPI = {
  async getAll(params = {}) {
    const res = await apiRequest(`/categories${buildQuery(params)}`, { method: "GET" });
    return toList(res);
  },
  getById(id) {
    return apiRequest(`/categories/${id}`, { method: "GET" });
  },
};

/* ================================ PRODUCTS =============================== */
const ProductAPI = {
  /**
   * @param {object} params search, category, minPrice, maxPrice, sort, page, limit
   * @returns {Promise<{items: Array, total: number, page: number, totalPages: number}>}
   */
  async getAll(params = {}) {
    const res = await apiRequest(`/products${buildQuery(mapProductParams(params))}`, {
      method: "GET",
      auth: Session.isLoggedIn(),
    });
    const meta = (res && res.meta) || {};
    return {
      items: toList(res),
      total: meta.total ?? toList(res).length,
      page: meta.page ?? 1,
      totalPages: meta.total_pages ?? 1,
    };
  },

  async getById(id) {
    const res = await apiRequest(`/products/${id}`, {
      method: "GET",
      auth: Session.isLoggedIn(),
    });
    return (res && res.data) || res;
  },

  /** Distinct brands, colours, frame types and the price range in stock. */
  async getFilters() {
    const res = await apiRequest("/products/filters", { method: "GET" });
    return (res && res.data) || {};
  },
};

/* ================================== CART ================================= */
const CartAPI = {
  async getAll() {
    const res = await apiRequest("/cart", { method: "GET", auth: true });
    return { items: toList(res), meta: (res && res.meta) || {} };
  },
  add(productId, quantity = 1) {
    return apiRequest("/cart", {
      method: "POST",
      auth: true,
      body: { product_id: productId, quantity },
    });
  },
  /** Cart lines are addressed by PRODUCT id, not by the cart row id. */
  update(productId, quantity) {
    return apiRequest(`/cart/${productId}`, { method: "PUT", auth: true, body: { quantity } });
  },
  remove(productId) {
    return apiRequest(`/cart/${productId}`, { method: "DELETE", auth: true });
  },
  clear() {
    return apiRequest("/cart", { method: "DELETE", auth: true });
  },
  async count() {
    const res = await apiRequest("/cart/count", { method: "GET", auth: true });
    return (res && res.data) || { lines: 0, units: 0 };
  },
};

/* ================================ WISHLIST =============================== */
const WishlistAPI = {
  async getAll() {
    const res = await apiRequest("/wishlist", { method: "GET", auth: true });
    return toList(res);
  },
  add(productId) {
    return apiRequest("/wishlist", { method: "POST", auth: true, body: { product_id: productId } });
  },
  /** Adds when absent, removes when present. Returns { in_wishlist, total_items }. */
  async toggle(productId) {
    const res = await apiRequest("/wishlist/toggle", {
      method: "POST",
      auth: true,
      body: { product_id: productId },
    });
    return (res && res.data) || {};
  },
  remove(productId) {
    return apiRequest(`/wishlist/${productId}`, { method: "DELETE", auth: true });
  },
  async count() {
    const res = await apiRequest("/wishlist/count", { method: "GET", auth: true });
    return (res && res.data) || { total_items: 0 };
  },
};

/* ================================= ORDERS ================================ */
const OrderAPI = {
  async getAll(params = {}) {
    const res = await apiRequest(`/orders${buildQuery(params)}`, { method: "GET", auth: true });
    return { items: toList(res), meta: (res && res.meta) || {} };
  },
  async getById(id) {
    const res = await apiRequest(`/orders/${id}`, { method: "GET", auth: true });
    return (res && res.data) || res;
  },
  /** Omit `items` to buy the whole cart; include it to buy one product now. */
  create(payload) {
    return apiRequest("/orders", { method: "POST", auth: true, body: payload });
  },
  cancel(id, reason) {
    return apiRequest(`/orders/${id}/cancel`, { method: "PUT", auth: true, body: { reason } });
  },
};

/* ================================ REVIEWS ================================ */
const ReviewAPI = {
  async getByProduct(productId, params = {}) {
    const res = await apiRequest(`/reviews/product/${productId}${buildQuery(params)}`, {
      method: "GET",
    });
    return { items: toList(res), meta: (res && res.meta) || {} };
  },
  create({ productId, rating, comment }) {
    return apiRequest("/reviews", {
      method: "POST",
      auth: true,
      body: { product_id: productId, rating, comment },
    });
  },
  update(id, { rating, comment }) {
    return apiRequest(`/reviews/${id}`, { method: "PUT", auth: true, body: { rating, comment } });
  },
  remove(id) {
    return apiRequest(`/reviews/${id}`, { method: "DELETE", auth: true });
  },
};

/* =============================== PAYMENTS ================================ */
const PaymentAPI = {
  /** Which methods this deployment supports, and whether each is configured. */
  async getMethods() {
    const res = await apiRequest("/payments/methods", { method: "GET" });
    return toList(res);
  },

  /**
   * Returns a gateway-specific descriptor:
   *   COD    -> { requires_redirect:false, message }
   *   eSewa  -> { requires_redirect:true, redirect_url, redirect_method, fields }
   *   Khalti -> { amount_in_paisa, public_key, product_identity, product_name }
   */
  async initiate(orderId) {
    const res = await apiRequest("/payments/initiate", {
      method: "POST", auth: true, body: { order_id: orderId },
    });
    return (res && res.data) || {};
  },

  /**
   * The call that actually settles a payment — the backend confirms with the
   * gateway server-side. A redirect back from eSewa proves nothing on its own.
   */
  verify({ orderId, transactionId, token }) {
    const body = { order_id: orderId };
    if (transactionId) body.transaction_id = transactionId;
    if (token) body.token = token;
    return apiRequest("/payments/verify", { method: "POST", auth: true, body });
  },
};

/* ================================ CONTACT ================================ */
const ContactAPI = {
  send({ name, email, subject, message }) {
    return apiRequest("/contact", { method: "POST", body: { name, email, subject, message } });
  },
};
