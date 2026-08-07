/**
 * cart.js
 * ---------------------------------------------------------------------------
 * Shopping bag. Every request carries the JWT via api.js (Authorization:
 * Bearer <vm_token>); an anonymous visitor never reaches the fetch because
 * the page redirects to sign-in first.
 *
 * Endpoints:
 *   GET    /cart                -> { data:[lines], meta:{ subtotal, total, issues, checkout_ready } }
 *   POST   /cart                -> { product_id, quantity }
 *   PUT    /cart/:productId     -> { quantity }
 *   DELETE /cart/:productId
 *   DELETE /cart                -> empty the whole bag
 *
 * IMPORTANT: the route parameter is the PRODUCT id, not the cart-row id.
 * Sending the row id silently addresses the wrong line.
 *
 * Shipping: the API prices items only — it has no shipping field. The figure
 * shown here is a FRONTEND ESTIMATE from the rules below, and is labelled as
 * such so nobody mistakes it for a server-confirmed charge.
 * ---------------------------------------------------------------------------
 */

/* Delivery rules used for the estimate. Change these in one place. */
const SHIPPING = {
  FLAT_RATE: 150,        // Rs. inside Kathmandu valley
  FREE_ABOVE: 10000,     // free delivery once the bag reaches this subtotal
};

let lines = [];
let cartMeta = {};

document.addEventListener("DOMContentLoaded", () => {
  initLayout();

  // The bag belongs to an account, so there's nothing to show a guest.
  if (!Session.isLoggedIn()) {
    renderSignedOut();
    return;
  }
  loadCart();
});

/* ================================= Loading =============================== */

async function loadCart() {
  const list = document.getElementById("cartLines");
  const summary = document.getElementById("summaryCard");

  showSkeletons(list, 3, "line");
  summary.style.visibility = "hidden";

  try {
    const { items, meta } = await CartAPI.getAll();
    lines = items;
    cartMeta = meta || {};
    render();
  } catch (err) {
    // A 401 means the token expired; api.js has already cleared it.
    if (err.status === 401) {
      renderSignedOut("Your session ended. Sign in again to see your bag.");
      return;
    }
    console.error(err);
    document.getElementById("summaryCard").remove();
    showEmpty(list, {
      icon: "bi-wifi-off",
      title: "Couldn't load your bag",
      body: "The store is unreachable right now.",
      action: `<button class="vm-btn vm-btn--outline vm-btn--sm" onclick="window.location.reload()">Try again</button>`,
    });
  }
}

/* ================================ Rendering ============================== */

function render() {
  const list = document.getElementById("cartLines");
  const summary = document.getElementById("summaryCard");
  const subtitle = document.getElementById("bagSubtitle");
  const toolbar = document.getElementById("bagToolbar");

  if (!lines.length) {
    renderEmpty();
    return;
  }

  const units = lines.reduce((n, l) => n + Number(l.quantity), 0);
  subtitle.textContent = `${units} item${units === 1 ? "" : "s"} in your bag`;
  toolbar.hidden = false;

  list.innerHTML = lines.map(lineMarkup).join("");
  summary.style.visibility = "visible";

  bindLineActions();
  renderSummary();
}

function lineMarkup(line) {
  const p = line.product || {};
  const productId = p.id ?? line.product_id ?? line.id;
  const unit = Number(line.unit_price ?? p.price ?? 0);
  const was = p.original_price && Number(p.original_price) > unit ? Number(p.original_price) : 0;
  const qty = Number(line.quantity);
  const stock = Number(p.stock ?? 0);
  const href = `${resolvePath("product.html")}?id=${encodeURIComponent(productId)}`;

  // Stock and availability can change while a bag sits idle.
  let warning = "";
  if (p.status && p.status !== "active") {
    warning = `${escapeHtml(p.name)} is no longer available and can't be ordered. Please remove it.`;
  } else if (stock === 0) {
    warning = `${escapeHtml(p.name)} has sold out. Please remove it to continue.`;
  } else if (qty > stock) {
    warning = `Only ${stock} left — reduce the quantity to check out.`;
  }

  return `
  <div class="vm-line" data-line="${escapeHtml(productId)}">
    <a class="vm-line__media" href="${href}">
      <img src="${resolveImage(p.image)}" alt="${escapeHtml(p.name || "Product")}"
           loading="lazy" onerror="imageFallback(this)">
    </a>

    <div>
      ${p.brand ? `<div class="vm-line__brand">${escapeHtml(p.brand)}</div>` : ""}
      <a class="vm-line__name" href="${href}">${escapeHtml(p.name || "Product")}</a>
      <div class="vm-line__unit">
        ${formatPrice(unit)} each
        ${was ? `<span class="vm-line__was">${formatPrice(was)}</span>` : ""}
      </div>

      <div class="vm-line__controls">
        <div class="vm-qty">
          <button type="button" data-dec="${escapeHtml(productId)}"
                  aria-label="Decrease quantity" ${qty <= 1 ? "disabled" : ""}>
            <i class="bi bi-dash-lg"></i>
          </button>
          <label class="vm-sr" for="qty-${escapeHtml(productId)}">Quantity for ${escapeHtml(p.name || "product")}</label>
          <input type="number" id="qty-${escapeHtml(productId)}" value="${qty}"
                 min="1" max="${Math.max(1, stock)}" inputmode="numeric"
                 data-qty="${escapeHtml(productId)}">
          <button type="button" data-inc="${escapeHtml(productId)}"
                  aria-label="Increase quantity" ${stock > 0 && qty >= stock ? "disabled" : ""}>
            <i class="bi bi-plus-lg"></i>
          </button>
        </div>
        <span class="vm-spec">${stock > 0 ? `${stock} in stock` : "Out of stock"}</span>
      </div>
    </div>

    <div class="vm-line__right">
      <span class="vm-line__subtotal">${formatPrice(unit * qty)}</span>
      <button class="vm-line__remove" type="button" data-remove="${escapeHtml(productId)}">Remove</button>
    </div>

    ${warning ? `<p class="vm-line__warn"><i class="bi bi-exclamation-triangle-fill"></i>
        <span>${warning}</span></p>` : ""}
  </div>`;
}

/* ================================= Summary =============================== */

/**
 * Totals. The item subtotal comes from the server (meta.subtotal) so the
 * client can't disagree with it; shipping is added locally as an estimate.
 */
function renderSummary() {
  const subtotal = Number(
    cartMeta.subtotal ?? lines.reduce((sum, l) => sum + Number(l.unit_price) * Number(l.quantity), 0)
  );

  const freeShipping = subtotal >= SHIPPING.FREE_ABOVE;
  const shipping = freeShipping ? 0 : SHIPPING.FLAT_RATE;
  const grandTotal = subtotal + shipping;
  const remaining = Math.max(0, SHIPPING.FREE_ABOVE - subtotal);
  const pct = Math.min(100, Math.round((subtotal / SHIPPING.FREE_ABOVE) * 100));

  const blocked = cartMeta.checkout_ready === false;
  const issues = cartMeta.issues || [];

  document.getElementById("summaryBody").innerHTML = `
    <div class="vm-sum-row">
      <span>Subtotal (${lines.length} item${lines.length === 1 ? "" : "s"})</span>
      <strong>${formatPrice(subtotal)}</strong>
    </div>

    <div class="vm-sum-row ${freeShipping ? "vm-sum-row--free" : ""}">
      <span>Shipping <span class="vm-spec">estimate</span></span>
      <strong>${freeShipping ? "Free" : formatPrice(shipping)}</strong>
    </div>

    ${!freeShipping
      ? `<div class="vm-ship-progress">
           <span class="vm-ship-progress__track">
             <span class="vm-ship-progress__fill" style="width:${pct}%"></span>
           </span>
           <p class="vm-ship-note">Add ${formatPrice(remaining)} more for free delivery.</p>
         </div>`
      : ""}

    <div class="vm-sum-total">
      <span>Estimated total</span>
      <strong>${formatPrice(grandTotal)}</strong>
    </div>

    <p class="vm-summary__note">
      Delivery is estimated at ${formatPrice(SHIPPING.FLAT_RATE)} inside the Kathmandu
      valley, free over ${formatPrice(SHIPPING.FREE_ABOVE)}. The final delivery charge
      depends on your address and is confirmed at checkout.
    </p>

    ${blocked
      ? `<div class="vm-summary__block">
           <i class="bi bi-exclamation-triangle-fill"></i>
           <span>${issues.length
             ? escapeHtml(issues[0].message)
             : "Some items in your bag are unavailable."} Update your bag to continue.</span>
         </div>`
      : ""}`;

  const checkout = document.getElementById("checkoutBtn");
  checkout.disabled = blocked;
  checkout.title = blocked ? "Resolve the items flagged above to continue" : "";
}

/* ================================= Actions =============================== */

function bindLineActions() {
  document.querySelectorAll("[data-inc]").forEach((btn) =>
    btn.addEventListener("click", () => changeQty(btn.dataset.inc, +1))
  );
  document.querySelectorAll("[data-dec]").forEach((btn) =>
    btn.addEventListener("click", () => changeQty(btn.dataset.dec, -1))
  );
  document.querySelectorAll("[data-remove]").forEach((btn) =>
    btn.addEventListener("click", () => removeLine(btn.dataset.remove))
  );

  // Typing a quantity directly.
  document.querySelectorAll("[data-qty]").forEach((input) => {
    const commit = () => {
      const id = input.dataset.qty;
      const line = findLine(id);
      if (!line) return;

      let value = parseInt(input.value, 10);
      if (!Number.isFinite(value) || value < 1) value = 1;

      const stock = Number(line.product?.stock ?? 0);
      if (stock > 0 && value > stock) {
        value = stock;
        showToast(`Only ${stock} available.`, "info");
      }
      if (value === Number(line.quantity)) {
        input.value = line.quantity; // nothing changed; undo any stray text
        return;
      }
      setQty(id, value);
    };
    input.addEventListener("change", commit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); input.blur(); }
    });
  });

  document.getElementById("clearBag")?.addEventListener("click", clearBag);
}

/** Cart lines are keyed by product id — see the note at the top of this file. */
function findLine(productId) {
  return lines.find((l) => {
    const id = (l.product && l.product.id) ?? l.product_id ?? l.id;
    return String(id) === String(productId);
  });
}

function setLineBusy(productId, busy) {
  document.querySelector(`.vm-line[data-line="${productId}"]`)?.classList.toggle("is-busy", busy);
}

async function changeQty(productId, delta) {
  const line = findLine(productId);
  if (!line) return;

  const next = Number(line.quantity) + delta;
  if (next < 1) return removeLine(productId);

  const stock = Number(line.product?.stock ?? 0);
  if (stock > 0 && next > stock) {
    showToast(`Only ${stock} available.`, "info");
    return;
  }
  setQty(productId, next);
}

async function setQty(productId, quantity) {
  setLineBusy(productId, true);
  try {
    // The response carries the whole updated cart, so there's no second GET.
    const res = await CartAPI.update(productId, quantity);
    applyCartResponse(res);
    refreshCounts();
  } catch (err) {
    showApiError(err, "Couldn't update the quantity.");
    setLineBusy(productId, false);
    loadCart(); // resync so the screen can't drift from the server
  }
}

async function removeLine(productId) {
  const line = findLine(productId);
  setLineBusy(productId, true);
  try {
    const res = await CartAPI.remove(productId);
    applyCartResponse(res);
    refreshCounts();
    showToast(`${line?.product?.name || "Item"} removed from your bag`, "info");
  } catch (err) {
    showApiError(err, "Couldn't remove that item.");
    setLineBusy(productId, false);
  }
}

async function clearBag() {
  if (!confirm("Remove everything from your bag?")) return;
  try {
    await CartAPI.clear();
    lines = [];
    cartMeta = {};
    render();
    refreshCounts();
    showToast("Your bag is now empty", "info");
  } catch (err) {
    showApiError(err, "Couldn't empty your bag.");
  }
}

/** POST/PUT/DELETE all return the full cart, so reuse it instead of refetching. */
function applyCartResponse(res) {
  lines = Array.isArray(res?.data) ? res.data : [];
  cartMeta = res?.meta || {};
  render();
}

/* =============================== Empty states ============================ */

function renderEmpty() {
  document.getElementById("bagSubtitle").textContent = "Your bag is empty";
  document.getElementById("bagToolbar").hidden = true;
  document.getElementById("summaryCard")?.remove();
  document.getElementById("bagGrid").classList.add("vm-bag--single");

  showEmpty(document.getElementById("cartLines"), {
    icon: "bi-bag",
    title: "Your bag is empty",
    body: "Nothing here yet. Browse the collection and add a pair you like.",
    action: `<div class="d-flex gap-2 justify-content-center flex-wrap">
        <a class="vm-btn vm-btn--coat vm-btn--sm" href="${resolvePath("shop.html")}">Shop eyewear</a>
        <a class="vm-btn vm-btn--outline vm-btn--sm" href="${resolvePath("wishlist.html")}">View wishlist</a>
      </div>`,
  });
}

function renderSignedOut(message) {
  document.getElementById("bagSubtitle").textContent = "";
  document.getElementById("bagToolbar").hidden = true;
  document.getElementById("summaryCard")?.remove();
  document.getElementById("bagGrid").classList.add("vm-bag--single");

  showEmpty(document.getElementById("cartLines"), {
    icon: "bi-person-lock",
    title: "Sign in to see your bag",
    body: message || "Your bag is saved to your account, so it's waiting for you across devices.",
    action: `<a class="vm-btn vm-btn--coat vm-btn--sm"
        href="${resolvePath("login.html")}?redirect=cart.html">Sign in</a>`,
  });
}

/* ================================ Checkout =============================== */

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("checkoutBtn")?.addEventListener("click", () => {
    if (!lines.length) return;
    window.location.href = resolvePath("checkout.html");
  });
});
