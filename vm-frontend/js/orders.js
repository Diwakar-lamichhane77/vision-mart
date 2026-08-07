/**
 * orders.js
 * ---------------------------------------------------------------------------
 * Order history, detail view with a status timeline, and a printable invoice.
 *
 * Endpoints:
 *   GET /orders               -> customer's own orders, items nested
 *   PUT /orders/:id/cancel    -> while the order is still Pending/Confirmed
 *
 * Orders arrive with `items` already nested, so opening the detail view needs
 * no extra request — the row we already have is reused.
 * ---------------------------------------------------------------------------
 */

/* The fulfilment chain, in order. Cancelled is handled separately because it
   isn't a stage — it's an exit. */
const STATUS_FLOW = ["Pending", "Confirmed", "Packed", "Shipped", "Out for Delivery", "Delivered"];

const STATUS_ICON = {
  Pending: "bi-hourglass",
  Confirmed: "bi-check-lg",
  Packed: "bi-box-seam",
  Shipped: "bi-truck",
  "Out for Delivery": "bi-geo-alt",
  Delivered: "bi-house-check",
};

/* Tabs group the six statuses into the three things a customer cares about. */
const TABS = [
  { key: "all", label: "All orders" },
  { key: "active", label: "In progress" },
  { key: "Delivered", label: "Delivered" },
  { key: "Cancelled", label: "Cancelled" },
];

let orders = [];
let activeTab = "all";

document.addEventListener("DOMContentLoaded", () => {
  initLayout();

  if (!Session.isLoggedIn()) {
    renderSignedOut();
    return;
  }
  buildTabs();
  loadOrders();
  wireModal();
});

/* ================================= Loading =============================== */

async function loadOrders() {
  const list = document.getElementById("orderList");
  showSkeletons(list, 3, "line");

  try {
    const { items } = await OrderAPI.getAll({ limit: 100 });
    orders = items;
    render();

    // Arriving from checkout: scroll to and highlight the new order.
    const highlight = getQueryParams().highlight;
    if (highlight) {
      const card = document.querySelector(`[data-order="${highlight}"]`);
      if (card) {
        card.classList.add("is-highlight");
        card.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  } catch (err) {
    if (err.status === 401) {
      renderSignedOut("Your session ended. Sign in again to see your orders.");
      return;
    }
    console.error(err);
    showEmpty(list, {
      icon: "bi-wifi-off",
      title: "Couldn't load your orders",
      body: "The store is unreachable right now.",
      action: `<button class="vm-btn vm-btn--outline vm-btn--sm" onclick="window.location.reload()">Try again</button>`,
    });
  }
}

/* ================================== Tabs ================================= */

function buildTabs() {
  const wrap = document.getElementById("orderTabs");
  wrap.innerHTML = TABS.map(
    (t) => `<button class="vm-tab ${t.key === activeTab ? "is-active" : ""}"
        data-tab="${t.key}">${t.label}</button>`
  ).join("");

  wrap.querySelectorAll("[data-tab]").forEach((btn) =>
    btn.addEventListener("click", () => {
      activeTab = btn.dataset.tab;
      wrap.querySelectorAll(".vm-tab").forEach((b) => b.classList.toggle("is-active", b === btn));
      render();
    })
  );
}

function visibleOrders() {
  if (activeTab === "all") return orders;
  if (activeTab === "active") {
    return orders.filter((o) => o.status !== "Delivered" && o.status !== "Cancelled");
  }
  return orders.filter((o) => o.status === activeTab);
}

/* ================================ Rendering ============================== */

function render() {
  const list = document.getElementById("orderList");
  const subtitle = document.getElementById("ordersSubtitle");
  const tabs = document.getElementById("orderTabs");

  if (!orders.length) {
    subtitle.textContent = "No orders yet";
    tabs.hidden = true;
    showEmpty(list, {
      icon: "bi-bag-check",
      title: "You haven't ordered yet",
      body: "Once you place an order it'll appear here, with tracking and an invoice.",
      action: `<a class="vm-btn vm-btn--coat vm-btn--sm" href="${resolvePath("shop.html")}">Start shopping</a>`,
    });
    return;
  }

  tabs.hidden = false;
  subtitle.textContent = `${orders.length} order${orders.length === 1 ? "" : "s"}`;

  const shown = visibleOrders();
  if (!shown.length) {
    showEmpty(list, {
      icon: "bi-funnel",
      title: "Nothing in this group",
      body: "No orders match this filter right now.",
    });
    return;
  }

  list.innerHTML = shown.map(orderCard).join("");
  bindCardActions();
}

function orderCard(o) {
  const items = o.items || [];
  const thumbs = items.slice(0, 4);
  const extra = items.length - thumbs.length;

  return `
  <article class="vm-order-card" data-order="${escapeHtml(o.id)}">
    <div class="vm-order-card__top">
      <span class="vm-order-card__num">${escapeHtml(o.order_number)}</span>
      <span class="vm-order-card__date">${formatDate(o.created_at)}</span>
      <span class="vm-order-card__total">${formatPrice(o.total_amount)}</span>
    </div>

    <div class="vm-order-card__body">
      <div class="vm-order-card__thumbs">
        ${thumbs
          .map(
            (i) => `<div class="vm-order-thumb">
              <img src="${resolveImage(i.product_image)}" alt="${escapeHtml(i.product_name)}"
                   loading="lazy" onerror="imageFallback(this)"></div>`
          )
          .join("")}
        ${extra > 0 ? `<div class="vm-order-thumb__more">+${extra}</div>` : ""}
      </div>

      <div class="vm-order-card__foot">
        ${statusPill(o.status)}
        <span class="vm-pay-pill ${o.payment_status === "Paid" ? "is-paid" : ""}">
          ${escapeHtml(o.payment_method)} · ${escapeHtml(o.payment_status || "Pending")}
        </span>
        <span class="vm-pay-pill">${items.length} item${items.length === 1 ? "" : "s"}</span>

        <div class="ms-auto d-flex gap-2 flex-wrap">
          <button class="vm-btn vm-btn--outline vm-btn--sm" data-detail="${escapeHtml(o.id)}">
            View details
          </button>
          ${o.can_cancel
            ? `<button class="vm-btn vm-btn--ghost vm-btn--sm" data-cancel="${escapeHtml(o.id)}"
                 style="color:var(--vm-danger)">Cancel</button>`
            : ""}
        </div>
      </div>
    </div>
  </article>`;
}

function statusPill(status) {
  const key = String(status).toLowerCase().replace(/\s+/g, "");
  const cls =
    {
      pending: "pending",
      confirmed: "confirmed",
      packed: "packed",
      shipped: "shipped",
      outfordelivery: "shipped",
      delivered: "delivered",
      cancelled: "cancelled",
    }[key] || "";
  return `<span class="vm-status ${cls ? `vm-status--${cls}` : ""}">
      <i class="bi ${STATUS_ICON[status] || "bi-dot"}"></i>${escapeHtml(status)}</span>`;
}

function formatDate(value, withTime = false) {
  if (!value) return "";
  const d = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return escapeHtml(String(value));
  const opts = { year: "numeric", month: "short", day: "numeric" };
  if (withTime) Object.assign(opts, { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString(undefined, opts);
}

/* ================================= Actions =============================== */

function bindCardActions() {
  document.querySelectorAll("[data-detail]").forEach((btn) =>
    btn.addEventListener("click", () => openDetail(btn.dataset.detail))
  );
  document.querySelectorAll("[data-cancel]").forEach((btn) =>
    btn.addEventListener("click", () => cancelOrder(btn.dataset.cancel, btn))
  );
}

async function cancelOrder(orderId, btn) {
  const order = orders.find((o) => String(o.id) === String(orderId));
  if (!order) return;
  if (!confirm(`Cancel order ${order.order_number}? Stock will be returned and this can't be undone.`)) return;

  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="vm-spinner"></span>'; }

  try {
    await OrderAPI.cancel(orderId, "Cancelled by customer");
    showToast(`Order ${order.order_number} cancelled.`, "info");
    await loadOrders();
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = "Cancel"; }
    showApiError(err, "Couldn't cancel that order.");
  }
}

/* ============================== Detail modal ============================= */

function wireModal() {
  const modal = document.getElementById("orderModal");
  const close = () => {
    modal.classList.remove("is-open");
    document.body.style.overflow = "";
  };
  modal.querySelector(".vm-modal__close").addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
}

function openDetail(orderId) {
  const o = orders.find((x) => String(x.id) === String(orderId));
  if (!o) return;

  document.getElementById("modalBody").innerHTML = `
    ${timelineMarkup(o)}
    ${invoiceMarkup(o)}
    <div class="d-flex gap-2 flex-wrap vm-no-print" style="padding:0 clamp(1.25rem,3vw,2rem) clamp(1.25rem,3vw,2rem)">
      <button class="vm-btn vm-btn--coat vm-btn--sm" id="printInvoice">
        <i class="bi bi-printer"></i> Print invoice
      </button>
      ${o.can_cancel
        ? `<button class="vm-btn vm-btn--outline vm-btn--sm" data-cancel="${escapeHtml(o.id)}"
             style="color:var(--vm-danger)">Cancel order</button>`
        : ""}
    </div>`;

  document.getElementById("printInvoice").addEventListener("click", () => window.print());
  document.querySelectorAll("#modalBody [data-cancel]").forEach((btn) =>
    btn.addEventListener("click", () => cancelOrder(btn.dataset.cancel, btn))
  );

  const modal = document.getElementById("orderModal");
  modal.classList.add("is-open");
  document.body.style.overflow = "hidden";
  modal.querySelector(".vm-modal__close").focus();
}

/* ================================ Timeline =============================== */

/**
 * A cancelled order never reached the end of the chain, so showing it against
 * the normal progress track would misrepresent what happened. It gets its own
 * bar instead.
 */
function timelineMarkup(o) {
  if (o.status === "Cancelled") {
    return `
    <div style="padding:clamp(1.25rem,3vw,2rem) clamp(1.25rem,3vw,2rem) 0">
      <div class="vm-tl-cancelled">
        <i class="bi bi-x-circle-fill"></i>
        <span><strong>This order was cancelled.</strong>
        ${o.cancelled_reason ? escapeHtml(o.cancelled_reason) + "." : ""}
        Any stock has been returned${o.payment_status === "Refunded" ? " and your payment marked refunded" : ""}.</span>
      </div>
    </div>`;
  }

  const currentIndex = STATUS_FLOW.indexOf(o.status);

  return `
  <div style="padding:clamp(1.25rem,3vw,2rem) clamp(1.25rem,3vw,2rem) 0">
    <div class="vm-timeline" role="list" aria-label="Order progress">
      ${STATUS_FLOW.map((stage, i) => {
        const done = i <= currentIndex;
        const current = i === currentIndex;
        return `<div class="vm-tl-step ${done ? "is-done" : ""} ${current ? "is-current" : ""}"
            role="listitem" ${current ? 'aria-current="step"' : ""}>
            <span class="vm-tl-step__dot"><i class="bi bi-check-lg"></i></span>
            <span class="vm-tl-step__label">${stage}</span>
          </div>`;
      }).join("")}
    </div>
  </div>`;
}

/* ================================= Invoice =============================== */

function invoiceMarkup(o) {
  const user = o.user || Session.getUser() || {};
  const itemsTotal = (o.items || []).reduce((s, i) => s + Number(i.subtotal), 0);

  return `
  <div class="vm-invoice" id="invoiceArea">
    <div class="vm-invoice__head">
      <div>
        <span class="vm-invoice__brand">Vision Mart</span>
        <p class="vm-spec" style="margin:0">Thamel Marg 12 · Kathmandu 44600</p>
      </div>
      <div class="vm-invoice__meta">
        Invoice ${escapeHtml(o.order_number)}<br>
        ${formatDate(o.created_at, true)}<br>
        ${escapeHtml(o.status)} · ${escapeHtml(o.payment_method)} · ${escapeHtml(o.payment_status || "Pending")}
        ${o.transaction_id ? `<br>Txn ${escapeHtml(o.transaction_id)}` : ""}
      </div>
    </div>

    <div class="vm-invoice__parties">
      <div>
        <h4>Billed to</h4>
        <p>${escapeHtml(user.name || o.shipping_name)}<br>
           ${escapeHtml(user.email || "")}</p>
      </div>
      <div>
        <h4>Delivering to</h4>
        <p>${escapeHtml(o.shipping_name)}<br>
           ${escapeHtml(o.shipping_address)}${o.shipping_city ? `, ${escapeHtml(o.shipping_city)}` : ""}<br>
           ${escapeHtml(o.shipping_phone)}</p>
      </div>
    </div>

    <table class="vm-invoice__table">
      <thead>
        <tr><th>Item</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Amount</th></tr>
      </thead>
      <tbody>
        ${(o.items || [])
          .map(
            (i) => `<tr>
              <td>${escapeHtml(i.product_name)}</td>
              <td class="num">${Number(i.quantity)}</td>
              <td class="num">${formatPrice(i.price)}</td>
              <td class="num">${formatPrice(i.subtotal)}</td>
            </tr>`
          )
          .join("")}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="3" class="num">Items total</td>
          <td class="num">${formatPrice(itemsTotal)}</td>
        </tr>
        <tr>
          <td colspan="3" class="num">Charged</td>
          <td class="num">${formatPrice(o.total_amount)}</td>
        </tr>
      </tfoot>
    </table>

    ${o.notes ? `<p class="vm-summary__note"><strong>Order notes:</strong> ${escapeHtml(o.notes)}</p>` : ""}
    <p class="vm-summary__note">
      Delivery charges, where they apply, are collected separately and are not
      included in the amount above.
    </p>
  </div>`;
}

/* =============================== Empty state ============================= */

function renderSignedOut(message) {
  document.getElementById("ordersSubtitle").textContent = "";
  document.getElementById("orderTabs").hidden = true;
  showEmpty(document.getElementById("orderList"), {
    icon: "bi-person-lock",
    title: "Sign in to see your orders",
    body: message || "Your order history is tied to your account.",
    action: `<a class="vm-btn vm-btn--coat vm-btn--sm"
        href="${resolvePath("login.html")}?redirect=orders.html">Sign in</a>`,
  });
}
