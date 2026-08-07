/**
 * admin/core.js
 * ---------------------------------------------------------------------------
 * Everything the admin panel shares: its own session, its own request helper,
 * the sidebar/layout, and the role guard.
 *
 * WHY A SEPARATE SESSION
 * The backend signs admin tokens with JWT_ADMIN_SECRET and customer tokens
 * with JWT_SECRET — they are not interchangeable. Storing the admin token
 * under the customer's `vm_token` key would break both: the storefront would
 * send an admin token to customer routes (401) and signing out of one would
 * sign you out of the other. So admins live under their own keys and a
 * shopkeeper can stay signed in as a customer in the same browser.
 *
 * Endpoints used across the panel:
 *   POST   /admin/login              GET /admin/dashboard
 *   GET    /admin/users              PUT /admin/users/:id/status
 *   GET/POST/PUT/DELETE /products    (multipart for create/update)
 *   GET/POST/PUT/DELETE /categories  (multipart for create/update)
 *   GET    /orders                   PUT /orders/:id/status
 * ---------------------------------------------------------------------------
 */

const ADMIN_KEYS = { TOKEN: "vm_admin_token", USER: "vm_admin" };

/* ============================== Admin session ============================ */
const AdminSession = {
  save(token, admin) {
    localStorage.setItem(ADMIN_KEYS.TOKEN, token);
    if (admin) localStorage.setItem(ADMIN_KEYS.USER, JSON.stringify(admin));
  },
  getToken() {
    return localStorage.getItem(ADMIN_KEYS.TOKEN);
  },
  getAdmin() {
    try {
      return JSON.parse(localStorage.getItem(ADMIN_KEYS.USER) || "null");
    } catch {
      return null;
    }
  },
  isLoggedIn() {
    return Boolean(this.getToken());
  },
  clear() {
    Object.values(ADMIN_KEYS).forEach((k) => localStorage.removeItem(k));
  },
  signOut() {
    this.clear();
    window.location.href = "login.html";
  },
};

/* ============================== Request helper =========================== */

class AdminApiError extends Error {
  constructor(message, status, fieldErrors) {
    super(message);
    this.status = status;
    this.fieldErrors = fieldErrors || null;
  }
}

const ADMIN_STATUS_TEXT = {
  0: "Can't reach the server. Check that the API is running.",
  400: "That action isn't allowed right now.",
  401: "Your admin session has ended. Sign in again.",
  403: "You don't have permission to do that.",
  404: "That record no longer exists.",
  409: "That already exists.",
  422: "Check the highlighted fields.",
  500: "The server hit an error. Try again shortly.",
};

function adminQuery(params = {}) {
  const usp = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
  ).toString();
  return usp ? `?${usp}` : "";
}

/**
 * @param {object} options
 * @param {boolean} options.isFormData  send multipart (image uploads)
 * @param {boolean} options.clearSessionOn401  see the note in the customer api.js
 */
async function adminRequest(path, options = {}) {
  const { method = "GET", body, isFormData = false, clearSessionOn401 = true } = options;

  // Never set Content-Type for multipart — the browser must add the boundary.
  const headers = isFormData ? {} : { "Content-Type": "application/json" };
  const token = AdminSession.getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${CONFIG.API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
    });
  } catch {
    throw new AdminApiError(ADMIN_STATUS_TEXT[0], 0);
  }

  const isJson = (response.headers.get("content-type") || "").includes("application/json");
  const payload = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    if (response.status === 401 && clearSessionOn401) {
      AdminSession.clear();
      // Bounce to the admin login, remembering where they were.
      const here = window.location.pathname.split("/").pop();
      if (here !== "login.html") window.location.replace(`login.html?next=${here}`);
    }
    throw new AdminApiError(
      (payload && payload.message) || ADMIN_STATUS_TEXT[response.status] || `Request failed (${response.status})`,
      response.status,
      payload && payload.errors
    );
  }

  return payload;
}

function adminList(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

/* ================================== APIs ================================= */

const AdminAuth = {
  login({ email, password }) {
    // clearSessionOn401: false — a 401 here means bad credentials, not an
    // expired session, so it must not trigger the redirect above.
    return adminRequest("/admin/login", {
      method: "POST",
      body: { email, password },
      clearSessionOn401: false,
    });
  },
  /** Confirms the stored token really belongs to an admin. */
  verify() {
    return adminRequest("/auth/verify", { clearSessionOn401: false });
  },
};

const AdminDashboardAPI = {
  async get(params = {}) {
    const res = await adminRequest(`/admin/dashboard${adminQuery(params)}`);
    return (res && res.data) || {};
  },
};

const AdminProductAPI = {
  async list(params = {}) {
    const res = await adminRequest(`/products${adminQuery(params)}`);
    return { items: adminList(res), meta: (res && res.meta) || {} };
  },
  async get(id) {
    const res = await adminRequest(`/products/${id}`);
    return (res && res.data) || res;
  },
  create(formData) {
    return adminRequest("/products", { method: "POST", body: formData, isFormData: true });
  },
  update(id, formData) {
    return adminRequest(`/products/${id}`, { method: "PUT", body: formData, isFormData: true });
  },
  remove(id) {
    return adminRequest(`/products/${id}`, { method: "DELETE" });
  },
};

const AdminCategoryAPI = {
  async list(params = {}) {
    const res = await adminRequest(`/categories${adminQuery(params)}`);
    return adminList(res);
  },
  create(formData) {
    return adminRequest("/categories", { method: "POST", body: formData, isFormData: true });
  },
  update(id, formData) {
    return adminRequest(`/categories/${id}`, { method: "PUT", body: formData, isFormData: true });
  },
  remove(id) {
    return adminRequest(`/categories/${id}`, { method: "DELETE" });
  },
};

const AdminOrderAPI = {
  async list(params = {}) {
    const res = await adminRequest(`/orders${adminQuery(params)}`);
    return { items: adminList(res), meta: (res && res.meta) || {} };
  },
  updateStatus(id, status) {
    return adminRequest(`/orders/${id}/status`, { method: "PUT", body: { status } });
  },
};

const AdminUserAPI = {
  // NOTE: the customer list lives at /admin/users. There is no /users route.
  async list(params = {}) {
    const res = await adminRequest(`/admin/users${adminQuery(params)}`);
    return { items: adminList(res), meta: (res && res.meta) || {} };
  },
  async get(id) {
    const res = await adminRequest(`/admin/users/${id}`);
    return (res && res.data) || res;
  },
  setStatus(id, status) {
    return adminRequest(`/admin/users/${id}/status`, { method: "PUT", body: { status } });
  },
};

/* ================================ Sidebar =============================== */

const ADMIN_NAV = [
  { file: "dashboard.html", label: "Dashboard", icon: "bi-speedometer2" },
  { file: "products.html", label: "Products", icon: "bi-eyeglasses" },
  { file: "categories.html", label: "Categories", icon: "bi-grid" },
  { file: "orders.html", label: "Orders", icon: "bi-receipt" },
  { file: "users.html", label: "Customers", icon: "bi-people" },
];

function sidebarMarkup() {
  const here = window.location.pathname.split("/").pop() || "dashboard.html";
  const admin = AdminSession.getAdmin() || {};
  const initial = (admin.name || "A").trim().charAt(0).toUpperCase();

  return `
  <aside class="vm-side" id="vmSide">
    <div class="vm-side__brand">
      <span class="vm-side__mark">VM</span>
      <span>
        <strong>Vision Mart</strong>
        <small>Admin</small>
      </span>
      <button class="vm-side__close" id="sideClose" aria-label="Close menu">
        <i class="bi bi-x-lg"></i>
      </button>
    </div>

    <nav class="vm-side__nav">
      ${ADMIN_NAV.map(
        (n) => `<a class="vm-side__link ${n.file === here ? "is-active" : ""}" href="${n.file}">
            <i class="bi ${n.icon}"></i><span>${n.label}</span>
          </a>`
      ).join("")}
    </nav>

    <div class="vm-side__foot">
      <a class="vm-side__link" href="../../index.html" target="_blank" rel="noopener">
        <i class="bi bi-box-arrow-up-right"></i><span>View storefront</span>
      </a>
      <div class="vm-side__me">
        <span class="vm-side__avatar">${escapeHtml(initial)}</span>
        <span class="vm-side__me-text">
          <strong>${escapeHtml(admin.name || "Admin")}</strong>
          <small>${escapeHtml(admin.email || "")}</small>
        </span>
      </div>
      <button class="vm-btn vm-btn--outline vm-btn--sm vm-btn--block" id="adminSignOut">
        Sign out
      </button>
    </div>
  </aside>
  <div class="vm-side__scrim" id="sideScrim"></div>`;
}

/**
 * Guards an admin page. Verifies the token server-side (not just its presence)
 * and confirms it belongs to an admin, so a customer token pasted into
 * localStorage can't open the panel.
 */
async function initAdminPage({ title = "" } = {}) {
  if (!AdminSession.isLoggedIn()) {
    const here = window.location.pathname.split("/").pop();
    window.location.replace(`login.html?next=${here}`);
    return false;
  }

  document.getElementById("vmSidebar").innerHTML = sidebarMarkup();
  if (title) {
    const el = document.getElementById("pageTitle");
    if (el) el.textContent = title;
  }

  wireShell();

  try {
    const res = await AdminAuth.verify();
    const data = (res && res.data) || {};

    // A valid token that isn't an admin token must not open the panel.
    if (!data.is_admin) {
      AdminSession.clear();
      window.location.replace("login.html?denied=1");
      return false;
    }

    // Refresh the cached admin so the sidebar shows current details.
    AdminSession.save(AdminSession.getToken(), data.user);
    document.getElementById("vmSidebar").innerHTML = sidebarMarkup();
    wireShell();
    return true;
  } catch {
    AdminSession.clear();
    window.location.replace("login.html");
    return false;
  }
}

function wireShell() {
  document.getElementById("adminSignOut")?.addEventListener("click", () => AdminSession.signOut());

  const side = document.getElementById("vmSide");
  const scrim = document.getElementById("sideScrim");
  const setOpen = (open) => {
    side?.classList.toggle("is-open", open);
    scrim?.classList.toggle("is-open", open);
    document.body.style.overflow = open ? "hidden" : "";
  };

  document.getElementById("sideToggle")?.addEventListener("click", () => setOpen(true));
  document.getElementById("sideClose")?.addEventListener("click", () => setOpen(false));
  scrim?.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });
}

/* ================================ Helpers =============================== */

/** Status pill shared by the orders table and dashboard. */
function orderStatusPill(status) {
  const map = {
    Pending: "pending", Confirmed: "confirmed", Packed: "packed",
    Shipped: "shipped", "Out for Delivery": "shipped",
    Delivered: "delivered", Cancelled: "cancelled",
  };
  const cls = map[status] || "";
  return `<span class="vm-status ${cls ? `vm-status--${cls}` : ""}">${escapeHtml(status)}</span>`;
}

function adminDate(value, withTime = false) {
  if (!value) return "—";
  const d = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return escapeHtml(String(value));
  const opts = { year: "numeric", month: "short", day: "numeric" };
  if (withTime) Object.assign(opts, { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString(undefined, opts);
}

/** Table-shaped skeleton so the layout doesn't jump when data lands. */
function tableSkeleton(rows = 6, cols = 5) {
  return `<tbody>${Array.from({ length: rows })
    .map(
      () =>
        `<tr>${Array.from({ length: cols })
          .map(() => `<td><span class="vm-skeleton vm-skeleton--line" style="display:block"></span></td>`)
          .join("")}</tr>`
    )
    .join("")}</tbody>`;
}

/** Full-width empty row inside a table. */
function tableEmpty(cols, { icon = "bi-inbox", title, body = "" }) {
  return `<tbody><tr><td colspan="${cols}">
    <div class="vm-empty">
      <i class="bi ${icon}"></i>
      <h3>${escapeHtml(title)}</h3>
      ${body ? `<p>${escapeHtml(body)}</p>` : ""}
    </div></td></tr></tbody>`;
}

function setBtnBusy(button, busy, label = "Saving") {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="vm-spinner"></span> ${label}`;
  } else {
    button.disabled = false;
    if (button.dataset.label) button.innerHTML = button.dataset.label;
  }
}

/** Maps server field errors onto a form, falling back to a toast. */
function applyAdminErrors(form, err) {
  const list = err && err.fieldErrors;
  if (!Array.isArray(list) || !list.length) {
    showToast(err?.message || "Something went wrong.", "error");
    return;
  }
  let unmatched = [];
  list.forEach(({ field, message }) => {
    const input = form.querySelector(`[name="${field}"]`);
    const box = input?.closest(".vm-field")?.querySelector(".vm-field__error");
    if (input) {
      input.classList.add("is-invalid");
      if (box) box.textContent = message;
    } else unmatched.push(message);
  });
  if (unmatched.length) showToast(unmatched.join(" "), "error");
}

function clearFormErrors(form) {
  form.querySelectorAll(".is-invalid").forEach((i) => i.classList.remove("is-invalid"));
  form.querySelectorAll(".vm-field__error").forEach((e) => (e.textContent = ""));
}

/* ================================ Pagination ============================= */

/** Shared numeric pager used by the products, orders and users tables. */
function renderPager(mountId, meta, onGo) {
  const el = document.getElementById(mountId);
  const page = Number(meta.page || 1);
  const pages = Number(meta.total_pages || 1);
  const total = Number(meta.total || 0);

  if (pages <= 1) {
    el.innerHTML = total ? `<span class="vm-apager__info">${total} total</span>` : "";
    return;
  }

  const nums = [...new Set([1, pages, page, page - 1, page + 1])]
    .filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);

  let out = `<span class="vm-apager__info">${total} total</span>`;
  out += `<button data-go="${page - 1}" ${page === 1 ? "disabled" : ""}>&lsaquo;</button>`;
  let prev = 0;
  nums.forEach((n) => {
    if (n - prev > 1) out += `<span class="vm-apager__info">…</span>`;
    out += `<button data-go="${n}" class="${n === page ? "is-current" : ""}">${n}</button>`;
    prev = n;
  });
  out += `<button data-go="${page + 1}" ${page === pages ? "disabled" : ""}>&rsaquo;</button>`;

  el.innerHTML = out;
  el.querySelectorAll("[data-go]").forEach((b) =>
    b.addEventListener("click", () => {
      const n = Number(b.dataset.go);
      if (n >= 1 && n <= pages && n !== page) onGo(n);
    }));
}
