/**
 * product.js
 * ---------------------------------------------------------------------------
 * Product detail page.
 *
 * Endpoints:
 *   GET /products/:id            product + nested reviews
 *   GET /reviews/product/:id     rating summary (average + 1–5 breakdown)
 *   GET /products?category_id=   related products
 *
 * Gallery note: the API exposes a single `image` per product today. The
 * gallery is built from an array so that when the backend starts returning
 * `images[]` (the product_images table), thumbnails appear with no change
 * here — but nothing is invented in the meantime.
 * ---------------------------------------------------------------------------
 */

let product = null;
let gallery = [];
let activeIndex = 0;

document.addEventListener("DOMContentLoaded", () => {
  initLayout();

  const id = getQueryParams().id;
  if (!id) {
    renderMissing("No product was specified.");
    return;
  }
  loadProduct(id);
});

/* ================================= Loading =============================== */

async function loadProduct(id) {
  const wrap = document.getElementById("pdp");

  try {
    product = await ProductAPI.getById(id);
    if (!product || !product.id) throw new ApiError("Product not found.", 404);

    document.title = `${product.name} — Vision Mart`;

    // Single image today; ready for an images[] array tomorrow.
    gallery = Array.isArray(product.images) && product.images.length
      ? product.images
      : [product.image];

    renderProduct();
    loadReviews(product.id);
    loadRelated(product);
  } catch (err) {
    console.error(err);
    renderMissing(
      err && err.status === 404
        ? "We couldn't find that product. It may have been removed."
        : "We couldn't load this product right now."
    );
  }
}

function renderMissing(message) {
  document.getElementById("pdp").innerHTML = "";
  const host = document.getElementById("pdpEmpty");
  host.hidden = false;
  showEmpty(host, {
    icon: "bi-eyeglasses",
    title: "Product unavailable",
    body: message,
    action: `<a class="vm-btn vm-btn--outline vm-btn--sm" href="${resolvePath("shop.html")}">Back to shop</a>`,
  });
  document.getElementById("relatedSection")?.remove();
  document.getElementById("reviewsSection")?.remove();
}

/* ================================ Rendering ============================== */

function renderProduct() {
  const p = product;
  const price = Number(p.discount_price ?? p.effective_price ?? p.price ?? 0);
  const was = p.discount_price ? Number(p.price) : 0;
  const off = discountPercent(price, was);
  const stock = Number(p.stock ?? 0);

  // Breadcrumb reflects the real category rather than a fixed trail.
  const crumb = document.getElementById("crumb");
  if (crumb) {
    crumb.innerHTML = `<a href="../index.html">Home</a> /
      <a href="${resolvePath("shop.html")}">Shop</a> /
      ${p.category ? `<a href="${resolvePath("shop.html")}?category=${encodeURIComponent(p.category.id)}">${escapeHtml(p.category.name)}</a> / ` : ""}
      <span>${escapeHtml(p.name)}</span>`;
  }

  const flags = [];
  if (off > 0) flags.push(`<span class="vm-badge vm-badge--sale">${off}% off</span>`);
  if (stock === 0) flags.push(`<span class="vm-badge vm-badge--out">Sold out</span>`);

  const stockClass = stock === 0 ? "out" : stock <= 5 ? "low" : "in";
  const stockText =
    stock === 0
      ? "Out of stock"
      : stock <= 5
      ? `Only ${stock} left`
      : `In stock · ${stock} available`;

  document.getElementById("pdp").innerHTML = `
    <!-- Gallery -->
    <div class="vm-gallery">
      <div class="vm-gallery__stage" id="stage">
        <img class="vm-gallery__img" id="stageImg"
             src="${resolveImage(gallery[0])}" alt="${escapeHtml(p.name)}"
             onerror="imageFallback(this)">
        ${flags.length ? `<div class="vm-gallery__flags">${flags.join("")}</div>` : ""}
        <span class="vm-gallery__hint" id="zoomHint">Hover to zoom</span>
      </div>
      <div class="vm-gallery__thumbs" id="thumbs">
        ${gallery.length > 1
          ? gallery
              .map(
                (src, i) => `<button class="vm-thumb ${i === 0 ? "is-active" : ""}" data-thumb="${i}"
                    aria-label="View image ${i + 1}">
                    <img src="${resolveImage(src)}" alt="" onerror="imageFallback(this)"></button>`
              )
              .join("")
          : ""}
      </div>
    </div>

    <!-- Info -->
    <div>
      ${p.brand ? `<div class="vm-pdp__brand">${escapeHtml(p.brand)}</div>` : ""}
      <h1 class="vm-pdp__title">${escapeHtml(p.name)}</h1>

      <div class="vm-pdp__rating">
        ${Number(p.rating) > 0
          ? `${renderStars(p.rating)}
             <span>${Number(p.rating).toFixed(1)}</span>
             <a href="#reviewsSection">${Number(p.reviews_count || 0)} review${Number(p.reviews_count) === 1 ? "" : "s"}</a>`
          : `<span>No reviews yet</span>`}
      </div>

      <div class="vm-pdp__prices">
        <span class="vm-pdp__price">${formatPrice(price)}</span>
        ${was ? `<span class="vm-pdp__was">${formatPrice(was)}</span>` : ""}
        ${off ? `<span class="vm-pdp__save">Save ${off}%</span>` : ""}
      </div>
      <p class="vm-pdp__stock ${stockClass}">${stockText}</p>

      ${p.description ? `<p class="vm-pdp__desc">${escapeHtml(p.description)}</p>` : ""}

      <div class="vm-buy">
        <div class="vm-qty">
          <button type="button" id="qtyMinus" aria-label="Decrease quantity">
            <i class="bi bi-dash-lg"></i>
          </button>
          <label class="vm-sr" for="qty">Quantity</label>
          <input type="number" id="qty" value="1" min="1" max="${Math.max(1, stock)}"
                 inputmode="numeric" ${stock === 0 ? "disabled" : ""}>
          <button type="button" id="qtyPlus" aria-label="Increase quantity">
            <i class="bi bi-plus-lg"></i>
          </button>
        </div>

        <button class="vm-btn vm-btn--coat vm-buy__cart" id="addToCart" ${stock === 0 ? "disabled" : ""}>
          ${stock === 0 ? "Sold out" : "Add to bag"}
        </button>

        <button class="vm-wish-btn ${p.is_in_wishlist ? "is-active" : ""}" id="wishBtn"
                aria-label="${p.is_in_wishlist ? "Remove from wishlist" : "Save to wishlist"}"
                aria-pressed="${Boolean(p.is_in_wishlist)}">
          <i class="bi ${p.is_in_wishlist ? "bi-heart-fill" : "bi-heart"}"></i>
        </button>
      </div>

      <ul class="vm-assure">
        <li><i class="bi bi-rulers"></i><span>Free fitting and adjustment, in store or by post</span></li>
        <li><i class="bi bi-truck"></i><span>Delivery across Nepal · 1–2 days in the valley</span></li>
        <li><i class="bi bi-arrow-repeat"></i><span>7-day returns on unworn frames</span></li>
      </ul>
    </div>`;

  renderSpecs(p);
  wireGallery();
  wireBuyBox(stock);
}

/** Only renders the fields the product actually has — no "N/A" filler. */
function renderSpecs(p) {
  const rows = [
    ["Brand", p.brand],
    ["Category", p.category && p.category.name],
    ["Frame type", p.frame_type],
    ["Frame material", p.frame_material],
    ["Lens type", p.lens_type],
    ["Colour", p.color],
    ["SKU", p.sku],
  ].filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "");

  const section = document.getElementById("specsSection");
  if (!rows.length) {
    section.remove();
    return;
  }

  document.getElementById("specs").innerHTML = rows
    .map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`)
    .join("");
}

/* ================================= Gallery =============================== */

function wireGallery() {
  const stage = document.getElementById("stage");
  const img = document.getElementById("stageImg");
  if (!stage || !img) return;

  // Pointer-tracked zoom on devices that actually have a pointer.
  const canHover = window.matchMedia("(hover: hover)").matches;

  if (canHover) {
    stage.addEventListener("mouseenter", () => stage.classList.add("is-zoomed"));
    stage.addEventListener("mouseleave", () => {
      stage.classList.remove("is-zoomed");
      img.style.transformOrigin = "center center";
    });
    stage.addEventListener("mousemove", (e) => {
      const rect = stage.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      img.style.transformOrigin = `${x}% ${y}%`;
    });
  } else {
    // On touch, tap toggles zoom centred on the tap point.
    document.getElementById("zoomHint").textContent = "Tap to zoom";
    stage.addEventListener("click", (e) => {
      const rect = stage.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      img.style.transformOrigin = `${x}% ${y}%`;
      stage.classList.toggle("is-zoomed");
    });
  }

  document.querySelectorAll("[data-thumb]").forEach((btn) =>
    btn.addEventListener("click", () => {
      activeIndex = Number(btn.dataset.thumb);
      img.src = resolveImage(gallery[activeIndex]);
      document.querySelectorAll("[data-thumb]").forEach((b) =>
        b.classList.toggle("is-active", b === btn)
      );
    })
  );
}

/* ============================== Buy box ================================= */

function wireBuyBox(stock) {
  const qty = document.getElementById("qty");
  const minus = document.getElementById("qtyMinus");
  const plus = document.getElementById("qtyPlus");
  const addBtn = document.getElementById("addToCart");
  const wishBtn = document.getElementById("wishBtn");

  const clamp = () => {
    let v = parseInt(qty.value, 10);
    if (!Number.isFinite(v) || v < 1) v = 1;
    if (stock > 0 && v > stock) {
      v = stock;
      showToast(`Only ${stock} available.`, "info");
    }
    qty.value = v;
    minus.disabled = v <= 1;
    plus.disabled = stock > 0 && v >= stock;
  };

  minus.addEventListener("click", () => {
    qty.value = Math.max(1, parseInt(qty.value, 10) - 1);
    clamp();
  });
  plus.addEventListener("click", () => {
    qty.value = parseInt(qty.value, 10) + 1;
    clamp();
  });
  qty.addEventListener("change", clamp);
  qty.addEventListener("blur", clamp);
  clamp();

  addBtn.addEventListener("click", async () => {
    if (!Session.isLoggedIn()) return sendToLogin("Sign in to start a bag.");

    const original = addBtn.textContent;
    addBtn.disabled = true;
    addBtn.innerHTML = '<span class="vm-spinner"></span> Adding';
    try {
      await CartAPI.add(product.id, parseInt(qty.value, 10) || 1);
      addBtn.textContent = "Added to bag";
      showToast(`${product.name} added to your bag`, "success");
      refreshCounts();
      window.setTimeout(() => {
        addBtn.textContent = original;
        addBtn.disabled = false;
      }, 1800);
    } catch (err) {
      addBtn.textContent = original;
      addBtn.disabled = false;
      showApiError(err, "Couldn't add that to your bag.");
    }
  });

  wishBtn.addEventListener("click", async () => {
    if (!Session.isLoggedIn()) return sendToLogin("Sign in to save favourites.");
    try {
      const res = await WishlistAPI.toggle(product.id);
      const saved = Boolean(res.in_wishlist);
      wishBtn.classList.toggle("is-active", saved);
      wishBtn.setAttribute("aria-pressed", String(saved));
      wishBtn.querySelector("i").className = saved ? "bi bi-heart-fill" : "bi bi-heart";
      wishBtn.setAttribute("aria-label", saved ? "Remove from wishlist" : "Save to wishlist");
      showToast(saved ? "Saved to your wishlist" : "Removed from your wishlist", "success");
      refreshCounts();
    } catch (err) {
      showApiError(err, "Couldn't update your wishlist.");
    }
  });
}

/** Sends an anonymous visitor to sign in and back again afterwards. */
function sendToLogin(message) {
  showToast(message, "info");
  window.setTimeout(() => {
    window.location.href = `${resolvePath("login.html")}?redirect=product.html`;
  }, 900);
}

/* ================================= Reviews =============================== */

async function loadReviews(productId) {
  const list = document.getElementById("reviewList");
  const summary = document.getElementById("reviewSummary");

  try {
    const { items, meta } = await ReviewAPI.getByProduct(productId, { limit: 50 });

    renderReviewSummary(summary, meta);

    if (!items.length) {
      showEmpty(list, {
        icon: "bi-chat-square-text",
        title: "No reviews yet",
        body: "This product hasn't been reviewed. Reviews appear here once customers leave them.",
      });
      return;
    }

    list.innerHTML = items.map(reviewMarkup).join("");
  } catch (err) {
    console.error(err);
    summary.innerHTML = "";
    showEmpty(list, { icon: "bi-chat-square", title: "Reviews unavailable", body: "Try reloading the page." });
  }
}

function renderReviewSummary(el, meta) {
  const total = Number(meta.total || 0);
  const average = Number(meta.average || 0);
  const breakdown = meta.breakdown || {};

  const bars = [5, 4, 3, 2, 1]
    .map((star) => {
      const n = Number(breakdown[star] || 0);
      const pct = total ? Math.round((n / total) * 100) : 0;
      return `<div class="vm-rbar">
          <span>${star} <i class="bi bi-star-fill" style="color:var(--vm-star)"></i></span>
          <span class="vm-rbar__track"><span class="vm-rbar__fill" style="width:${pct}%"></span></span>
          <span>${n}</span>
        </div>`;
    })
    .join("");

  el.innerHTML = `
    <div class="vm-rsummary__score">${average.toFixed(1)}</div>
    ${renderStars(average)}
    <div class="vm-rsummary__count">${total} review${total === 1 ? "" : "s"}</div>
    <div class="vm-rbars">${bars}</div>`;
}

function reviewMarkup(r) {
  const name = (r.user && r.user.name) || "Customer";
  return `
  <article class="vm-review">
    <div class="vm-review__avatar" aria-hidden="true">${escapeHtml(name.trim().charAt(0).toUpperCase())}</div>
    <div class="flex-grow-1">
      <div class="vm-review__head">
        <strong>${escapeHtml(name)}</strong>
        ${r.verified_purchase ? `<span class="vm-badge vm-badge--verified"><i class="bi bi-patch-check-fill"></i> Verified purchase</span>` : ""}
        <span class="vm-review__date">${formatDate(r.created_at)}</span>
      </div>
      ${renderStars(r.rating)}
      ${r.comment ? `<p class="vm-review__text">${escapeHtml(r.comment)}</p>` : ""}
    </div>
  </article>`;
}

/* ============================ Related products =========================== */

async function loadRelated(p) {
  const grid = document.getElementById("relatedGrid");
  if (!p.category || !p.category.id) {
    document.getElementById("relatedSection")?.remove();
    return;
  }

  showSkeletons(grid, 4, "product");

  try {
    // Fetch one extra, since the current product will be filtered out.
    const { items } = await ProductAPI.getAll({ category: p.category.id, limit: 5 });
    const related = items.filter((item) => String(item.id) !== String(p.id)).slice(0, 4);

    if (!related.length) {
      document.getElementById("relatedSection")?.remove();
      return;
    }

    grid.innerHTML = related.map(productCardMarkup).join("");
    bindProductCardActions(grid);
  } catch (err) {
    console.error(err);
    document.getElementById("relatedSection")?.remove();
  }
}
