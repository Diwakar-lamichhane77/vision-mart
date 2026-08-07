/**
 * utils.js
 * ---------------------------------------------------------------------------
 * Shared helpers with no DOM ownership of their own: session storage,
 * formatting, image resolution, toasts, loading/empty states, validation.
 *
 * Load order on every page: config.js -> utils.js -> api.js -> components.js
 * (api.js calls Session.clear() on a 401, so Session must exist first.)
 * ---------------------------------------------------------------------------
 */

/* ================================ Session ================================ */
const Session = {
  save(token, user) {
    localStorage.setItem(CONFIG.STORAGE_KEYS.TOKEN, token);
    if (user) localStorage.setItem(CONFIG.STORAGE_KEYS.USER, JSON.stringify(user));
  },

  getToken() {
    return localStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN);
  },

  getUser() {
    try {
      return JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.USER) || "null");
    } catch {
      return null;
    }
  },

  isLoggedIn() {
    return Boolean(this.getToken());
  },

  clear() {
    Object.values(CONFIG.STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
  },

  signOut() {
    this.clear();
    window.location.href = resolvePath("index.html");
  },
};

/**
 * Pages live at the root (index.html) and in /pages/*.html, so the correct
 * relative path depends on where the current page sits.
 */
function resolvePath(name) {
  if (!name || name.startsWith("http") || name.startsWith("#")) return name || "#";
  const inPages = window.location.pathname.includes("/pages/");
  if (name === "index.html") return inPages ? "../index.html" : "index.html";
  return inPages ? name : `pages/${name}`;
}

/* =============================== Formatting ============================== */

/** Rs. 15,900 — grouped the way prices are written in Nepal/India. */
function formatPrice(value) {
  const n = Number(value || 0);
  return `${CONFIG.CURRENCY} ${n.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

/** Escapes anything interpolated into innerHTML. Every dynamic value uses this. */
function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Turns whatever the API gives us into a usable image URL.
 * Accepts a full URL, a relative path ("/uploads/products/x.jpg"), or a bare
 * filename ("x.jpg"). Falls back to the placeholder when there's nothing.
 *
 * @param {string} src
 * @param {"PRODUCTS"|"CATEGORIES"} kind which upload folder a bare filename belongs to
 */
function resolveImage(src, kind = "PRODUCTS") {
  if (Array.isArray(src)) src = src[0];
  if (!src || typeof src !== "string" || !src.trim()) return CONFIG.PLACEHOLDER_IMAGE;

  const value = src.trim();
  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("data:")) {
    return value;
  }
  if (value.startsWith("/")) return `${CONFIG.ASSET_BASE_URL}${value}`;
  return `${CONFIG.ASSET_BASE_URL}${CONFIG.UPLOAD_PATHS[kind]}${value}`;
}

/**
 * Attach to <img onerror> so a broken/missing file swaps to the placeholder
 * instead of showing the browser's torn-image icon.
 */
function imageFallback(imgEl) {
  if (imgEl.dataset.fallbackApplied) return;
  imgEl.dataset.fallbackApplied = "1";
  imgEl.src = CONFIG.PLACEHOLDER_IMAGE;
}

/** Five stars, halves included. */
function renderStars(rating = 0) {
  const value = Math.round(Number(rating || 0) * 2) / 2;
  let out = "";
  for (let i = 1; i <= 5; i++) {
    if (value >= i) out += '<i class="bi bi-star-fill"></i>';
    else if (value >= i - 0.5) out += '<i class="bi bi-star-half"></i>';
    else out += '<i class="bi bi-star"></i>';
  }
  return `<span class="vm-stars" aria-label="${value} out of 5">${out}</span>`;
}

/** Percentage saved, or 0 when there's no genuine discount. */
function discountPercent(price, originalPrice) {
  const p = Number(price);
  const o = Number(originalPrice);
  if (!o || o <= p) return 0;
  return Math.round(((o - p) / o) * 100);
}

/* ================================= Toasts ================================ */

function toastHost() {
  let host = document.getElementById("vmToastHost");
  if (!host) {
    host = document.createElement("div");
    host.id = "vmToastHost";
    host.className = "vm-toast-host";
    host.setAttribute("role", "status");
    host.setAttribute("aria-live", "polite");
    document.body.appendChild(host);
  }
  return host;
}

/**
 * showToast("Added to bag", "success")
 * @param {"success"|"error"|"info"} tone
 */
function showToast(message, tone = "info") {
  const icons = {
    success: "bi-check-circle-fill",
    error: "bi-exclamation-circle-fill",
    info: "bi-info-circle-fill",
  };
  const el = document.createElement("div");
  el.className = `vm-toast vm-toast--${tone}`;
  el.innerHTML = `<i class="bi ${icons[tone] || icons.info}"></i><span>${escapeHtml(message)}</span>`;
  toastHost().appendChild(el);

  window.setTimeout(() => {
    el.classList.add("is-leaving");
    el.addEventListener("transitionend", () => el.remove(), { once: true });
  }, 3400);
}

/** Reports an ApiError consistently, and logs the detail for debugging. */
function showApiError(error, fallback = "Something went wrong. Try again.") {
  console.error(error);
  showToast((error && error.message) || fallback, "error");
}

/* ========================== Loading & empty states ======================== */

/**
 * Skeleton placeholders sized like the real cards, so the layout doesn't jump
 * when the data lands.
 */
function showSkeletons(container, count = 4, variant = "product") {
  if (!container) return;
  container.innerHTML = Array.from({ length: count })
    .map(() => `<div class="vm-skeleton vm-skeleton--${variant}" aria-hidden="true"></div>`)
    .join("");
}

/**
 * An empty screen is an invitation to act, so it always offers a next step.
 */
function showEmpty(container, { icon = "bi-inbox", title, body = "", action = "" }) {
  if (!container) return;
  container.innerHTML = `
    <div class="vm-empty">
      <i class="bi ${icon}" aria-hidden="true"></i>
      <h3>${escapeHtml(title)}</h3>
      ${body ? `<p>${escapeHtml(body)}</p>` : ""}
      ${action}
    </div>`;
}

/* =============================== Validation ============================== */
const Validate = {
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim()),
  phone: (v) => /^[0-9+\-\s]{7,15}$/.test(String(v || "").trim()),
  required: (v) => String(v || "").trim().length > 0,
  minLength: (v, n) => String(v || "").trim().length >= n,
  /** Matches the backend rule: 8+ chars, one uppercase, one number. */
  password: (v) => /^(?=.*[A-Z])(?=.*\d).{8,}$/.test(String(v || "")),
};

/** Applies Bootstrap validity styling plus the message beneath the field. */
function setFieldError(input, message = "") {
  const feedback = input.parentElement.querySelector(".invalid-feedback");
  const invalid = Boolean(message);
  input.classList.toggle("is-invalid", invalid);
  if (feedback) feedback.textContent = message;
  return !invalid;
}

/* ================================== Misc ================================= */

/** Waits until the user stops typing before firing (search inputs). */
function debounce(fn, wait = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/** Read-only view of the current query string. */
function getQueryParams() {
  return Object.fromEntries(new URLSearchParams(window.location.search).entries());
}

/**
 * Adds `.is-visible` to elements as they scroll into view, which is what the
 * CSS reveal animations hook onto. Honours prefers-reduced-motion by simply
 * revealing everything immediately.
 */
function observeReveals(root = document) {
  const targets = root.querySelectorAll("[data-reveal]:not(.is-visible)");
  if (!targets.length) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion || !("IntersectionObserver" in window)) {
    targets.forEach((el) => el.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
  );

  targets.forEach((el) => observer.observe(el));
}
