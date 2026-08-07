/**
 * wishlist.js
 * ---------------------------------------------------------------------------
 * Saved items. Requires a signed-in customer; every request sends the JWT
 * through api.js.
 *
 * Endpoints:
 *   GET    /wishlist               -> { data:[{id, added_at, is_in_cart, product}], meta }
 *   POST   /wishlist               -> { product_id }
 *   DELETE /wishlist/:productId
 *
 * As with the cart, the route parameter is the PRODUCT id, not the wishlist
 * row id.
 *
 * "Move to cart" is two calls — add to cart, then drop from the wishlist —
 * because the API has no single move endpoint. If the cart add fails, the
 * item deliberately stays in the wishlist rather than vanishing.
 * ---------------------------------------------------------------------------
 */

let saved = [];

document.addEventListener("DOMContentLoaded", () => {
  initLayout();

  if (!Session.isLoggedIn()) {
    renderSignedOut();
    return;
  }
  loadWishlist();
});

/* ================================= Loading =============================== */

async function loadWishlist() {
  const grid = document.getElementById("wishGrid");
  showSkeletons(grid, 4, "product");

  try {
    saved = await WishlistAPI.getAll();
    render();
  } catch (err) {
    if (err.status === 401) {
      renderSignedOut("Your session ended. Sign in again to see your saved items.");
      return;
    }
    console.error(err);
    showEmpty(grid, {
      icon: "bi-wifi-off",
      title: "Couldn't load your wishlist",
      body: "The store is unreachable right now.",
      action: `<button class="vm-btn vm-btn--outline vm-btn--sm" onclick="window.location.reload()">Try again</button>`,
    });
  }
}

/* ================================ Rendering ============================== */

function render() {
  const grid = document.getElementById("wishGrid");
  const subtitle = document.getElementById("wishSubtitle");
  const toolbar = document.getElementById("wishToolbar");

  if (!saved.length) {
    renderEmpty();
    return;
  }

  const available = saved.filter((i) => i.product && i.product.in_stock).length;
  subtitle.textContent =
    `${saved.length} saved item${saved.length === 1 ? "" : "s"}` +
    (available !== saved.length ? ` · ${available} available now` : "");

  toolbar.hidden = false;
  document.getElementById("moveAllBtn").disabled = available === 0;

  grid.innerHTML = saved.map(cardMarkup).join("");
  bindActions();
}

function cardMarkup(item) {
  const p = item.product || {};
  const productId = p.id ?? item.product_id ?? item.id;
  const price = Number(p.price ?? 0);
  const was = p.original_price && Number(p.original_price) > price ? Number(p.original_price) : 0;
  const off = discountPercent(price, was);
  const inStock = Boolean(p.in_stock);
  const href = `${resolvePath("product.html")}?id=${encodeURIComponent(productId)}`;

  const flags = [];
  if (off > 0) flags.push(`<span class="vm-badge vm-badge--sale">${off}% off</span>`);
  if (!inStock) {
    flags.push(
      `<span class="vm-badge vm-badge--out">${p.status !== "active" ? "Unavailable" : "Sold out"}</span>`
    );
  }

  return `
  <article class="vm-wish-card" data-wish-card="${escapeHtml(productId)}">
    <div class="vm-wish-card__media">
      <a href="${href}">
        <img src="${resolveImage(p.image)}" alt="${escapeHtml(p.name || "Product")}"
             loading="lazy" onerror="imageFallback(this)">
      </a>
      ${flags.length ? `<div class="vm-card__flags">${flags.join("")}</div>` : ""}
      <button class="vm-wish-card__drop" data-drop="${escapeHtml(productId)}"
              aria-label="Remove ${escapeHtml(p.name || "item")} from wishlist">
        <i class="bi bi-x-lg"></i>
      </button>
    </div>

    ${p.brand ? `<div class="vm-card__brand">${escapeHtml(p.brand)}</div>` : ""}
    <a class="vm-card__name" href="${href}">${escapeHtml(p.name || "Product")}</a>

    ${Number(p.rating) > 0
      ? `<div class="vm-card__meta">${renderStars(p.rating)}</div>`
      : ""}

    <div class="vm-card__prices">
      <span class="vm-card__price">${formatPrice(price)}</span>
      ${was ? `<span class="vm-card__was">${formatPrice(was)}</span>` : ""}
    </div>

    <p class="vm-wish-card__added">Saved ${formatSavedDate(item.added_at)}</p>

    <div class="vm-wish-card__actions">
      <button class="vm-btn vm-btn--coat vm-btn--sm vm-btn--block"
              data-move="${escapeHtml(productId)}" ${inStock ? "" : "disabled"}>
        ${inStock ? (item.is_in_cart ? "Already in bag — move again" : "Move to bag") : "Unavailable"}
      </button>
    </div>
  </article>`;
}

/** API dates arrive as "2026-08-06 00:45:52". */
function formatSavedDate(value) {
  if (!value) return "recently";
  const d = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return "recently";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/* ================================= Actions =============================== */

function bindActions() {
  document.querySelectorAll("[data-move]").forEach((btn) =>
    btn.addEventListener("click", () => moveToCart(btn.dataset.move, btn))
  );
  document.querySelectorAll("[data-drop]").forEach((btn) =>
    btn.addEventListener("click", () => removeItem(btn.dataset.drop))
  );
  document.getElementById("moveAllBtn")?.addEventListener("click", moveAllAvailable);
  document.getElementById("clearWish")?.addEventListener("click", clearWishlist);
}

function findItem(productId) {
  return saved.find((i) => {
    const id = (i.product && i.product.id) ?? i.product_id ?? i.id;
    return String(id) === String(productId);
  });
}

function setCardBusy(productId, busy) {
  document
    .querySelector(`[data-wish-card="${productId}"]`)
    ?.classList.toggle("is-busy", busy);
}

/**
 * Add to bag, then remove from the wishlist. Order matters: if the cart add
 * fails (out of stock, network), the item must remain saved rather than
 * disappearing from both places.
 */
async function moveToCart(productId, btn) {
  const item = findItem(productId);
  if (!item) return;

  setCardBusy(productId, true);
  if (btn) btn.innerHTML = '<span class="vm-spinner"></span> Moving';

  try {
    await CartAPI.add(productId, 1);
  } catch (err) {
    setCardBusy(productId, false);
    if (btn) btn.textContent = "Move to bag";
    showApiError(err, "Couldn't add that to your bag — it's still saved here.");
    return;
  }

  try {
    const res = await WishlistAPI.remove(productId);
    saved = Array.isArray(res?.data) ? res.data : saved.filter((i) => i !== item);
  } catch (err) {
    // In the bag but still saved — harmless, and honest about what happened.
    console.error(err);
    showToast("Added to your bag, but it's still in your wishlist.", "info");
    setCardBusy(productId, false);
    refreshCounts();
    return;
  }

  showToast(`${item.product?.name || "Item"} moved to your bag`, "success");
  render();
  refreshCounts();
}

/** Moves every in-stock item, reporting how many actually made it. */
async function moveAllAvailable() {
  const movable = saved.filter((i) => i.product && i.product.in_stock);
  if (!movable.length) return;
  if (!confirm(`Move ${movable.length} available item${movable.length === 1 ? "" : "s"} to your bag?`)) return;

  const btn = document.getElementById("moveAllBtn");
  btn.disabled = true;
  btn.innerHTML = '<span class="vm-spinner"></span> Moving';

  let moved = 0;
  for (const item of movable) {
    const id = (item.product && item.product.id) ?? item.id;
    try {
      // Sequential on purpose: parallel writes to the same cart can race.
      // eslint-disable-next-line no-await-in-loop
      await CartAPI.add(id, 1);
      // eslint-disable-next-line no-await-in-loop
      await WishlistAPI.remove(id);
      moved += 1;
    } catch (err) {
      console.error(err);
    }
  }

  await loadWishlist();
  refreshCounts();

  if (moved === movable.length) {
    showToast(`${moved} item${moved === 1 ? "" : "s"} moved to your bag`, "success");
  } else {
    showToast(`${moved} of ${movable.length} moved — the rest are still saved.`, "info");
  }
}

async function removeItem(productId) {
  const item = findItem(productId);
  setCardBusy(productId, true);
  try {
    const res = await WishlistAPI.remove(productId);
    saved = Array.isArray(res?.data) ? res.data : saved.filter((i) => i !== item);
    render();
    refreshCounts();
    showToast(`${item?.product?.name || "Item"} removed from your wishlist`, "info");
  } catch (err) {
    setCardBusy(productId, false);
    showApiError(err, "Couldn't remove that item.");
  }
}

async function clearWishlist() {
  if (!confirm("Remove everything from your wishlist?")) return;
  try {
    await WishlistAPI.clear();
    saved = [];
    render();
    refreshCounts();
    showToast("Your wishlist is now empty", "info");
  } catch (err) {
    showApiError(err, "Couldn't clear your wishlist.");
  }
}

/* =============================== Empty states ============================ */

function renderEmpty() {
  document.getElementById("wishSubtitle").textContent = "Nothing saved yet";
  document.getElementById("wishToolbar").hidden = true;

  showEmpty(document.getElementById("wishGrid"), {
    icon: "bi-heart",
    title: "Your wishlist is empty",
    body: "Tap the heart on any frame to save it here for later — even if it's currently sold out.",
    action: `<a class="vm-btn vm-btn--coat vm-btn--sm" href="${resolvePath("shop.html")}">Browse eyewear</a>`,
  });
}

function renderSignedOut(message) {
  document.getElementById("wishSubtitle").textContent = "";
  document.getElementById("wishToolbar").hidden = true;

  showEmpty(document.getElementById("wishGrid"), {
    icon: "bi-person-lock",
    title: "Sign in to see your wishlist",
    body: message || "Saved items live on your account, so they follow you across devices.",
    action: `<a class="vm-btn vm-btn--coat vm-btn--sm"
        href="${resolvePath("login.html")}?redirect=wishlist.html">Sign in</a>`,
  });
}
