/**
 * admin/orders.js
 * Order table with status updates. The server only allows forward transitions
 * (and Cancelled from any non-delivered state), so the dropdown offers exactly
 * the moves that will be accepted rather than letting an admin pick one that
 * bounces back as a 400.
 */

const O_PER_PAGE = 15;
let oState = { search: "", status: "", payment_method: "", page: 1 };
let oRows = [];

/* Mirrors ALLOWED_TRANSITIONS in the backend's order controller. */
const NEXT_STATUS = {
  Pending: ["Confirmed", "Packed", "Cancelled"],
  Confirmed: ["Packed", "Shipped", "Cancelled"],
  Packed: ["Shipped", "Cancelled"],
  Shipped: ["Out for Delivery", "Delivered", "Cancelled"],
  "Out for Delivery": ["Delivered", "Cancelled"],
  Delivered: [],
  Cancelled: [],
};

document.addEventListener("DOMContentLoaded", async () => {
  if (!(await initAdminPage({ title: "Orders" }))) return;
  wireOrdersUI();
  loadOrders();
});

function wireOrdersUI() {
  document.getElementById("oSearch").addEventListener("input", debounce((e) => {
    oState.search = e.target.value.trim(); oState.page = 1; loadOrders();
  }, 350));
  document.getElementById("oStatus").addEventListener("change", (e) => {
    oState.status = e.target.value; oState.page = 1; loadOrders();
  });
  document.getElementById("oPayment").addEventListener("change", (e) => {
    oState.payment_method = e.target.value; oState.page = 1; loadOrders();
  });
  document.getElementById("oModalClose").addEventListener("click", closeOrderModal);
  document.getElementById("orderModal").addEventListener("click", (e) => {
    if (e.target.id === "orderModal") closeOrderModal();
  });
}

async function loadOrders() {
  const table = document.getElementById("oTable");
  table.querySelector("tbody")?.remove();
  table.insertAdjacentHTML("beforeend", tableSkeleton(8, 7));

  try {
    const { items, meta } = await AdminOrderAPI.list({
      search: oState.search,
      status: oState.status,
      payment_method: oState.payment_method,
      page: oState.page,
      limit: O_PER_PAGE,
    });
    oRows = items;

    table.querySelector("tbody").remove();

    if (!items.length) {
      table.insertAdjacentHTML("beforeend", tableEmpty(7, {
        icon: "bi-receipt", title: "No orders found",
        body: oState.search || oState.status ? "Try clearing the filters." : "Orders will appear here as they come in.",
      }));
      document.getElementById("oPager").innerHTML = "";
      return;
    }

    table.insertAdjacentHTML("beforeend", `<tbody>${items.map(orderRow).join("")}</tbody>`);
    bindOrderRows();
    renderPager("oPager", meta, (page) => { oState.page = page; loadOrders(); });
  } catch (err) {
    table.querySelector("tbody")?.remove();
    table.insertAdjacentHTML("beforeend", tableEmpty(7, {
      icon: "bi-wifi-off", title: "Couldn't load orders", body: err.message,
    }));
  }
}

function orderRow(o) {
  const moves = NEXT_STATUS[o.status] || [];
  const terminal = moves.length === 0;

  return `
  <tr data-orow="${o.id}">
    <td class="nowrap"><span class="vm-tsub">${escapeHtml(o.order_number)}</span></td>
    <td>
      <div class="vm-tname">${escapeHtml(o.user?.name || "—")}</div>
      <div class="vm-tsub">${escapeHtml(o.user?.email || "")}</div>
    </td>
    <td class="nowrap">${adminDate(o.created_at)}</td>
    <td class="num">${o.items_count ?? (o.items || []).length}</td>
    <td class="num">${formatPrice(o.total_amount)}</td>
    <td>
      ${orderStatusPill(o.status)}
      <div class="vm-tsub">${escapeHtml(o.payment_method)} · ${escapeHtml(o.payment_status || "Pending")}</div>
    </td>
    <td>
      <div class="vm-row-actions">
        ${terminal
          ? ""
          : `<select class="vm-select vm-select--sm" data-ostatus="${o.id}" aria-label="Change status">
               <option value="">Move to…</option>
               ${moves.map((s) => `<option value="${s}">${s}</option>`).join("")}
             </select>`}
        <button class="vm-icon-act" data-oview="${o.id}" aria-label="View order"><i class="bi bi-eye"></i></button>
      </div>
    </td>
  </tr>`;
}

function bindOrderRows() {
  document.querySelectorAll("[data-ostatus]").forEach((sel) =>
    sel.addEventListener("change", () => changeStatus(sel.dataset.ostatus, sel)));
  document.querySelectorAll("[data-oview]").forEach((b) =>
    b.addEventListener("click", () => openOrderModal(b.dataset.oview)));
}

async function changeStatus(id, select) {
  const status = select.value;
  if (!status) return;

  const order = oRows.find((o) => String(o.id) === String(id));

  // Cancelling returns stock and can't be undone, so confirm it explicitly.
  if (status === "Cancelled" &&
      !confirm(`Cancel ${order?.order_number}? Stock will be returned and this can't be reversed.`)) {
    select.value = "";
    return;
  }

  select.disabled = true;
  try {
    await AdminOrderAPI.updateStatus(id, status);
    showToast(`${order?.order_number} moved to ${status}`, "success");
    loadOrders();
  } catch (err) {
    select.disabled = false;
    select.value = "";
    showToast(err.message || "Couldn't update that order.", "error");
  }
}

function openOrderModal(id) {
  const o = oRows.find((x) => String(x.id) === String(id));
  if (!o) return;

  document.getElementById("oModalTitle").textContent = o.order_number;
  document.getElementById("oModalBody").innerHTML = `
    <div class="vm-grid-2col" style="gap:1rem;margin-bottom:1.15rem">
      <div>
        <div class="vm-field__label">Delivering to</div>
        <p style="margin:0">
          ${escapeHtml(o.shipping_name)}<br>
          ${escapeHtml(o.shipping_address)}${o.shipping_city ? `, ${escapeHtml(o.shipping_city)}` : ""}<br>
          <span class="vm-tsub">${escapeHtml(o.shipping_phone)}</span>
        </p>
      </div>
      <div>
        <div class="vm-field__label">Order</div>
        <p style="margin:0">
          ${orderStatusPill(o.status)}<br>
          <span class="vm-tsub">${adminDate(o.created_at, true)}</span><br>
          <span class="vm-tsub">${escapeHtml(o.payment_method)} · ${escapeHtml(o.payment_status || "Pending")}</span>
          ${o.transaction_id ? `<br><span class="vm-tsub">Txn ${escapeHtml(o.transaction_id)}</span>` : ""}
        </p>
      </div>
    </div>

    <div class="vm-table-wrap">
      <table class="vm-table">
        <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Amount</th></tr></thead>
        <tbody>
          ${(o.items || []).map((i) => `<tr>
            <td><div class="vm-tcell">
              <div class="vm-tthumb"><img src="${resolveImage(i.product_image)}" alt="" onerror="imageFallback(this)"></div>
              <span>${escapeHtml(i.product_name)}</span>
            </div></td>
            <td class="num">${i.quantity}</td>
            <td class="num">${formatPrice(i.price)}</td>
            <td class="num">${formatPrice(i.subtotal)}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>

    <div class="d-flex justify-content-between" style="margin-top:1rem;padding-top:.85rem;border-top:1px solid var(--vm-line)">
      <strong>Total charged</strong><strong>${formatPrice(o.total_amount)}</strong>
    </div>

    ${o.notes ? `<p class="vm-field__hint" style="margin-top:.85rem"><strong>Notes:</strong> ${escapeHtml(o.notes)}</p>` : ""}
    ${o.cancelled_reason ? `<p class="vm-field__hint"><strong>Cancelled:</strong> ${escapeHtml(o.cancelled_reason)}</p>` : ""}`;

  document.getElementById("orderModal").classList.add("is-open");
  document.body.style.overflow = "hidden";
}

function closeOrderModal() {
  document.getElementById("orderModal").classList.remove("is-open");
  document.body.style.overflow = "";
}
