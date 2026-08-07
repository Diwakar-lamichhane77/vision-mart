/**
 * shop.js
 * ---------------------------------------------------------------------------
 * Product listing: search, category/brand/colour/frame filters, price range,
 * sorting and server-side pagination.
 *
 * Single source of truth is `state`, which is mirrored into the URL query
 * string. That means a filtered view can be bookmarked, shared, and survives
 * a page reload or the browser back button.
 *
 * Endpoints:
 *   GET /products?search=&category_id=&brand=&color=&frame_type=
 *                &min_price=&max_price=&sort=&page=&limit=
 *   GET /products/filters   (facet values)
 *   GET /categories
 * ---------------------------------------------------------------------------
 */

const PER_PAGE = 12;

/* Sort options shown to the shopper, mapped to the API's sort keys. */
const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "popularity", label: "Most popular" },
  { value: "rating", label: "Highest rated" },
  { value: "price_low", label: "Price: low to high" },
  { value: "price_high", label: "Price: high to low" },
  { value: "name_asc", label: "Name: A–Z" },
];

/* Multi-select facets, all driven by GET /products/filters. */
const FACETS = [
  { key: "brand", label: "Brand", source: "brands" },
  { key: "color", label: "Colour", source: "colors" },
  { key: "frame_type", label: "Frame type", source: "frame_types" },
  { key: "frame_material", label: "Material", source: "frame_materials" },
  { key: "lens_type", label: "Lens type", source: "lens_types" },
];

const state = {
  search: "",
  category: "",
  brand: "",
  color: "",
  frame_type: "",
  frame_material: "",
  lens_type: "",
  minPrice: "",
  maxPrice: "",
  sort: "newest",
  page: 1,
};

let categories = [];
let facets = {};
let priceBounds = { min: 0, max: 0 };
let lastResults = [];

/* ================================ Bootstrap ============================== */

document.addEventListener("DOMContentLoaded", async () => {
  initLayout();
  readStateFromUrl();
  buildToolbar();

  // Facets and categories are needed to draw the rail; products can load in
  // parallel so the grid isn't waiting on them.
  loadProducts();
  await buildFilters();
  wireFilterSheet();

  window.addEventListener("popstate", () => {
    readStateFromUrl();
    syncControls();
    loadProducts({ push: false });
  });
});

/* ============================ URL <-> state sync ========================= */

function readStateFromUrl() {
  const q = getQueryParams();
  state.search = q.search || "";
  state.category = q.category || q.category_id || "";
  state.brand = q.brand || "";
  state.color = q.color || "";
  state.frame_type = q.frame_type || "";
  state.frame_material = q.frame_material || "";
  state.lens_type = q.lens_type || "";
  state.minPrice = q.min_price || "";
  state.maxPrice = q.max_price || "";
  state.sort = SORT_OPTIONS.some((o) => o.value === q.sort) ? q.sort : "newest";
  state.page = Math.max(1, parseInt(q.page, 10) || 1);
}

/** Writes the current state back to the address bar without reloading. */
function pushStateToUrl() {
  const params = new URLSearchParams();
  const map = {
    search: state.search,
    category: state.category,
    brand: state.brand,
    color: state.color,
    frame_type: state.frame_type,
    frame_material: state.frame_material,
    lens_type: state.lens_type,
    min_price: state.minPrice,
    max_price: state.maxPrice,
    sort: state.sort === "newest" ? "" : state.sort,
    page: state.page > 1 ? state.page : "",
  };
  Object.entries(map).forEach(([k, v]) => {
    if (v !== "" && v !== null && v !== undefined) params.set(k, v);
  });
  const qs = params.toString();
  history.pushState(null, "", qs ? `?${qs}` : window.location.pathname);
}

/* ================================= Toolbar =============================== */

function buildToolbar() {
  const sortSelect = document.getElementById("sortSelect");
  sortSelect.innerHTML = SORT_OPTIONS.map(
    (o) => `<option value="${o.value}">${o.label}</option>`
  ).join("");

  const searchInput = document.getElementById("searchInput");
  const clearBtn = document.getElementById("searchClear");

  syncControls();

  // Debounced so typing doesn't fire a request per keystroke.
  const runSearch = debounce(() => {
    state.search = searchInput.value.trim();
    state.page = 1;
    loadProducts();
  }, 350);

  searchInput.addEventListener("input", () => {
    clearBtn.classList.toggle("is-shown", Boolean(searchInput.value));
    runSearch();
  });

  clearBtn.addEventListener("click", () => {
    searchInput.value = "";
    clearBtn.classList.remove("is-shown");
    state.search = "";
    state.page = 1;
    loadProducts();
    searchInput.focus();
  });

  sortSelect.addEventListener("change", () => {
    state.sort = sortSelect.value;
    state.page = 1;
    loadProducts();
  });
}

/** Pushes state back into the visible controls (after popstate / reset). */
function syncControls() {
  const searchInput = document.getElementById("searchInput");
  const sortSelect = document.getElementById("sortSelect");
  if (searchInput) {
    searchInput.value = state.search;
    document.getElementById("searchClear").classList.toggle("is-shown", Boolean(state.search));
  }
  if (sortSelect) sortSelect.value = state.sort;

  document.querySelectorAll("[data-facet]").forEach((input) => {
    input.checked = state[input.dataset.facet] === input.value;
  });
  const minEl = document.getElementById("minPrice");
  const maxEl = document.getElementById("maxPrice");
  if (minEl) minEl.value = state.minPrice;
  if (maxEl) maxEl.value = state.maxPrice;
}

/* ================================= Filters =============================== */

async function buildFilters() {
  const rail = document.getElementById("filterGroups");

  try {
    const [cats, opts] = await Promise.all([
      CategoryAPI.getAll({ status: "active" }),
      ProductAPI.getFilters(),
    ]);
    categories = cats || [];
    facets = opts || {};
    priceBounds = {
      min: Math.floor(Number(facets.min_price || 0)),
      max: Math.ceil(Number(facets.max_price || 0)),
    };
  } catch (err) {
    console.error(err);
    rail.innerHTML = `<div class="vm-fgroup"><div class="vm-fgroup__body">
      <p class="text-muted small mb-0">Filters are unavailable right now.</p></div></div>`;
    return;
  }

  const groups = [];

  // Categories are single-select — browsing two at once isn't meaningful here.
  if (categories.length) {
    groups.push(
      filterGroup(
        "Category",
        categories
          .map(
            (c) => `<label class="vm-fopt">
              <input type="radio" name="category" data-facet="category" value="${escapeHtml(c.id)}">
              <span>${escapeHtml(c.name)}</span>
              <span class="vm-fopt__count">${Number(c.products_count || 0)}</span>
            </label>`
          )
          .join("")
      )
    );
  }

  groups.push(priceGroup());

  FACETS.forEach(({ key, label, source }) => {
    const values = (facets[source] || []).filter(Boolean);
    if (!values.length) return; // never render an empty filter group
    groups.push(
      filterGroup(
        label,
        values
          .map(
            (v) => `<label class="vm-fopt">
              <input type="radio" name="${key}" data-facet="${key}" value="${escapeHtml(v)}">
              <span>${escapeHtml(v)}</span>
            </label>`
          )
          .join("")
      )
    );
  });

  rail.innerHTML = groups.join("");
  syncControls();
  wireFilterGroups();
}

function filterGroup(label, body, collapsed = false) {
  return `
  <div class="vm-fgroup${collapsed ? " is-collapsed" : ""}">
    <button class="vm-fgroup__btn" type="button" aria-expanded="${!collapsed}">
      ${escapeHtml(label)} <i class="bi bi-chevron-down"></i>
    </button>
    <div class="vm-fgroup__body">
      <div class="vm-fopts">${body}</div>
    </div>
  </div>`;
}

function priceGroup() {
  const hint = priceBounds.max
    ? `<p class="vm-price-hint">In stock: ${formatPrice(priceBounds.min)} – ${formatPrice(priceBounds.max)}</p>`
    : "";
  return `
  <div class="vm-fgroup">
    <button class="vm-fgroup__btn" type="button" aria-expanded="true">
      Price <i class="bi bi-chevron-down"></i>
    </button>
    <div class="vm-fgroup__body">
      <div class="vm-price-row">
        <input type="number" id="minPrice" placeholder="Min" min="0" inputmode="numeric" aria-label="Minimum price">
        <span>–</span>
        <input type="number" id="maxPrice" placeholder="Max" min="0" inputmode="numeric" aria-label="Maximum price">
      </div>
      ${hint}
      <button class="vm-btn vm-btn--outline vm-btn--sm vm-btn--block mt-2" type="button" id="applyPrice">
        Apply
      </button>
    </div>
  </div>`;
}

function wireFilterGroups() {
  // Collapse / expand
  document.querySelectorAll(".vm-fgroup__btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const group = btn.closest(".vm-fgroup");
      const collapsed = group.classList.toggle("is-collapsed");
      btn.setAttribute("aria-expanded", String(!collapsed));
    });
  });

  // Facet radios. Clicking the selected one again clears it, which is the
  // behaviour people expect from a filter even though radios don't do it.
  document.querySelectorAll("[data-facet]").forEach((input) => {
    input.addEventListener("click", () => {
      const key = input.dataset.facet;
      if (state[key] === input.value) {
        input.checked = false;
        state[key] = "";
      } else {
        state[key] = input.value;
      }
      state.page = 1;
      loadProducts();
      closeFilterSheet();
    });
  });

  // Price range
  const apply = document.getElementById("applyPrice");
  if (apply) {
    const commit = () => {
      const min = document.getElementById("minPrice").value;
      const max = document.getElementById("maxPrice").value;

      // A backwards range returns nothing and looks broken, so swap it.
      if (min && max && Number(min) > Number(max)) {
        document.getElementById("minPrice").value = max;
        document.getElementById("maxPrice").value = min;
        state.minPrice = max;
        state.maxPrice = min;
        showToast("Swapped the price range so it reads low to high.", "info");
      } else {
        state.minPrice = min;
        state.maxPrice = max;
      }
      state.page = 1;
      loadProducts();
      closeFilterSheet();
    };

    apply.addEventListener("click", commit);
    ["minPrice", "maxPrice"].forEach((id) =>
      document.getElementById(id).addEventListener("keydown", (e) => {
        if (e.key === "Enter") commit();
      })
    );
  }
}

/* --------------------------- Mobile filter sheet ------------------------- */

function wireFilterSheet() {
  const open = document.getElementById("filterToggle");
  const sheet = document.getElementById("filterRail");
  const scrim = document.getElementById("filterScrim");
  const close = document.getElementById("filterClose");

  const setOpen = (isOpen) => {
    sheet.classList.toggle("is-open", isOpen);
    scrim.classList.toggle("is-open", isOpen);
    document.body.style.overflow = isOpen ? "hidden" : "";
  };

  open?.addEventListener("click", () => setOpen(true));
  close?.addEventListener("click", () => setOpen(false));
  scrim?.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setOpen(false);
  });
}

function closeFilterSheet() {
  if (window.matchMedia("(max-width: 991.98px)").matches) {
    document.getElementById("filterRail")?.classList.remove("is-open");
    document.getElementById("filterScrim")?.classList.remove("is-open");
    document.body.style.overflow = "";
  }
}

/* ============================== Active chips ============================= */

function renderChips() {
  const wrap = document.getElementById("activeChips");
  const chips = [];

  const add = (key, label, value) =>
    chips.push(`<span class="vm-chip">${escapeHtml(label)}: ${escapeHtml(value)}
      <button type="button" data-clear="${key}" aria-label="Remove ${escapeHtml(label)} filter">
        <i class="bi bi-x-lg"></i></button></span>`);

  if (state.search) add("search", "Search", state.search);
  if (state.category) {
    const cat = categories.find((c) => String(c.id) === String(state.category));
    add("category", "Category", cat ? cat.name : state.category);
  }
  FACETS.forEach(({ key, label }) => {
    if (state[key]) add(key, label, state[key]);
  });
  if (state.minPrice || state.maxPrice) {
    add("price", "Price",
      `${state.minPrice ? formatPrice(state.minPrice) : "Any"} – ${state.maxPrice ? formatPrice(state.maxPrice) : "Any"}`);
  }

  if (chips.length > 1) {
    chips.push(`<button class="vm-chip vm-chip--clear" type="button" data-clear="all">Clear all</button>`);
  }

  wrap.innerHTML = chips.join("");

  wrap.querySelectorAll("[data-clear]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const key = btn.dataset.clear;
      if (key === "all") {
        ["search", "category", "brand", "color", "frame_type", "frame_material", "lens_type"].forEach(
          (k) => (state[k] = "")
        );
        state.minPrice = "";
        state.maxPrice = "";
      } else if (key === "price") {
        state.minPrice = "";
        state.maxPrice = "";
      } else {
        state[key] = "";
      }
      state.page = 1;
      syncControls();
      loadProducts();
    })
  );
}

/* ============================== Load & render =========================== */

async function loadProducts({ push = true } = {}) {
  const grid = document.getElementById("results");
  const count = document.getElementById("resultCount");

  showSkeletons(grid, PER_PAGE, "product");
  count.textContent = "Loading...";
  document.getElementById("pager").innerHTML = "";

  if (push) pushStateToUrl();
  renderChips();

  try {
    const { items, total, page, totalPages } = await ProductAPI.getAll({
      search: state.search,
      category: state.category,
      brand: state.brand,
      color: state.color,
      frame_type: state.frame_type,
      frame_material: state.frame_material,
      lens_type: state.lens_type,
      minPrice: state.minPrice,
      maxPrice: state.maxPrice,
      sort: state.sort,
      page: state.page,
      limit: PER_PAGE,
    });

    lastResults = items;

    // Asking for page 9 of a 3-page result set should recover, not dead-end.
    if (!items.length && state.page > 1 && totalPages >= 1) {
      state.page = 1;
      return loadProducts();
    }

    if (!items.length) {
      count.textContent = "0 products";
      showEmpty(grid, {
        icon: "bi-search",
        title: "No frames match those filters",
        body: state.search
          ? `Nothing came up for “${state.search}”. Try a broader search or clear a filter.`
          : "Try widening the price range or clearing a filter.",
        action: `<button class="vm-btn vm-btn--outline vm-btn--sm" id="emptyReset">Clear all filters</button>`,
      });
      document.getElementById("emptyReset")?.addEventListener("click", () => {
        document.querySelector('[data-clear="all"]')?.click() ||
          (() => {
            ["search", "category", "brand", "color", "frame_type", "frame_material", "lens_type"].forEach(
              (k) => (state[k] = "")
            );
            state.minPrice = state.maxPrice = "";
            state.page = 1;
            syncControls();
            loadProducts();
          })();
      });
      return;
    }

    const from = (page - 1) * PER_PAGE + 1;
    const to = Math.min(page * PER_PAGE, total);
    count.textContent = `${from}–${to} of ${total} product${total === 1 ? "" : "s"}`;

    grid.innerHTML = items.map(shopCardMarkup).join("");
    bindProductCardActions(grid);
    bindQuickView(grid);

    renderPager(page, totalPages);
  } catch (err) {
    console.error(err);
    count.textContent = "";
    showEmpty(grid, {
      icon: "bi-wifi-off",
      title: "Couldn't load products",
      body: "The store is unreachable right now.",
      action: `<button class="vm-btn vm-btn--outline vm-btn--sm" onclick="window.location.reload()">Try again</button>`,
    });
  }
}

/** The shared card plus a quick-view button. */
function shopCardMarkup(p) {
  const base = productCardMarkup(p);
  const quick = `<button class="vm-card__quick" data-quick="${escapeHtml(p.id)}"
      aria-label="Quick view: ${escapeHtml(p.name)}"><i class="bi bi-eye"></i></button>`;
  // Insert right after the wishlist button so both sit in the media corner.
  return base.replace("<button class=\"vm-card__add\"", `${quick}<button class="vm-card__add"`);
}

/* ================================ Pagination ============================= */

/**
 * Numbered pages with ellipsis, always showing first/last and the pages
 * either side of the current one.
 */
function renderPager(page, totalPages) {
  const pager = document.getElementById("pager");
  if (totalPages <= 1) {
    pager.innerHTML = "";
    return;
  }

  const go = (n) => `data-page="${n}"`;
  const parts = [];

  parts.push(`<button ${go(page - 1)} ${page === 1 ? "disabled" : ""} aria-label="Previous page">
    <i class="bi bi-chevron-left"></i></button>`);

  const window_ = new Set([1, totalPages, page, page - 1, page + 1]);
  const shown = [...window_].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);

  let prev = 0;
  shown.forEach((n) => {
    if (n - prev > 1) parts.push(`<span class="vm-pager__gap">…</span>`);
    parts.push(
      `<button ${go(n)} class="${n === page ? "is-current" : ""}"
        ${n === page ? 'aria-current="page"' : ""}>${n}</button>`
    );
    prev = n;
  });

  parts.push(`<button ${go(page + 1)} ${page === totalPages ? "disabled" : ""} aria-label="Next page">
    <i class="bi bi-chevron-right"></i></button>`);

  pager.innerHTML = parts.join("");

  pager.querySelectorAll("[data-page]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const next = Number(btn.dataset.page);
      if (!next || next === state.page || next < 1 || next > totalPages) return;
      state.page = next;
      loadProducts();
      // Send them back to the top of the results, not the bottom of the page.
      document.getElementById("resultsTop").scrollIntoView({ behavior: "smooth", block: "start" });
    })
  );
}

/* ================================ Quick view ============================= */

function bindQuickView(container) {
  container.querySelectorAll("[data-quick]").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const product = lastResults.find((p) => String(p.id) === String(btn.dataset.quick));
      if (product) openQuickView(product);
    })
  );
}

function openQuickView(p) {
  const modal = document.getElementById("quickView");
  const body = document.getElementById("quickViewBody");

  const price = Number(p.discount_price ?? p.effective_price ?? p.price ?? 0);
  const was = p.discount_price ? Number(p.price) : 0;
  const off = discountPercent(price, was);
  const outOfStock = Number(p.stock ?? 0) <= 0;

  const specs = [
    ["Brand", p.brand],
    ["Frame", p.frame_type],
    ["Material", p.frame_material],
    ["Lens", p.lens_type],
    ["Colour", p.color],
  ].filter(([, v]) => v);

  body.innerHTML = `
    <div class="vm-qv__media">
      <img src="${resolveImage(p.image)}" alt="${escapeHtml(p.name)}" onerror="imageFallback(this)">
    </div>
    <div class="vm-qv__info">
      ${p.brand ? `<div class="vm-card__brand">${escapeHtml(p.brand)}</div>` : ""}
      <h3>${escapeHtml(p.name)}</h3>
      ${Number(p.rating) > 0
        ? `<div class="vm-card__meta">${renderStars(p.rating)}
             <span class="vm-card__reviews">(${Number(p.reviews_count || 0)})</span></div>`
        : `<p class="vm-card__reviews mb-2">No reviews yet</p>`}
      <div class="vm-card__prices mb-3">
        <span class="vm-card__price">${formatPrice(price)}</span>
        ${was ? `<span class="vm-card__was">${formatPrice(was)}</span>` : ""}
        ${off ? `<span class="vm-card__off">Save ${off}%</span>` : ""}
      </div>
      ${p.description ? `<p class="text-muted small">${escapeHtml(String(p.description).slice(0, 220))}${String(p.description).length > 220 ? "…" : ""}</p>` : ""}
      ${specs.length
        ? `<dl class="vm-qv__specs">${specs
            .map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`)
            .join("")}</dl>`
        : ""}
      <p class="vm-spec mb-3">${outOfStock ? "Out of stock" : `${p.stock} in stock`}</p>
      <div class="d-flex gap-2 flex-wrap">
        <button class="vm-btn vm-btn--coat" data-qv-add="${escapeHtml(p.id)}" ${outOfStock ? "disabled" : ""}>
          ${outOfStock ? "Sold out" : "Add to bag"}
        </button>
        <a class="vm-btn vm-btn--outline" href="${resolvePath("product.html")}?id=${encodeURIComponent(p.id)}">
          Full details
        </a>
      </div>
    </div>`;

  modal.classList.add("is-open");
  document.body.style.overflow = "hidden";
  modal.querySelector(".vm-qv__close")?.focus();

  body.querySelector("[data-qv-add]")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    if (!Session.isLoggedIn()) {
      showToast("Sign in to start a bag.", "info");
      window.setTimeout(() => (window.location.href = resolvePath("login.html")), 900);
      return;
    }
    btn.disabled = true;
    btn.innerHTML = '<span class="vm-spinner"></span> Adding';
    try {
      await CartAPI.add(p.id, 1);
      showToast("Added to your bag", "success");
      refreshCounts();
      closeQuickView();
    } catch (err) {
      showApiError(err, "Couldn't add that to your bag.");
      btn.disabled = false;
      btn.textContent = "Add to bag";
    }
  });
}

function closeQuickView() {
  document.getElementById("quickView").classList.remove("is-open");
  document.body.style.overflow = "";
}

document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("quickView");
  if (!modal) return;
  modal.querySelector(".vm-qv__close")?.addEventListener("click", closeQuickView);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeQuickView();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeQuickView();
  });
});
