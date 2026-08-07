/**
 * admin/users.js
 * Customer table with block / unblock.
 *
 * There is deliberately no delete: orders.user_id is ON DELETE RESTRICT, so
 * removing a customer with history would either fail or destroy sales records.
 * Blocking achieves the intent without losing data — a blocked customer's
 * token stops working on their next request.
 */

const U_PER_PAGE = 20;
let uState = { search: "", status: "", page: 1 };
let uRows = [];

document.addEventListener("DOMContentLoaded", async () => {
  if (!(await initAdminPage({ title: "Customers" }))) return;
  wireUsersUI();
  loadUsers();
});

function wireUsersUI() {
  document.getElementById("uSearch").addEventListener("input", debounce((e) => {
    uState.search = e.target.value.trim(); uState.page = 1; loadUsers();
  }, 350));
  document.getElementById("uStatus").addEventListener("change", (e) => {
    uState.status = e.target.value; uState.page = 1; loadUsers();
  });
  document.getElementById("uModalClose").addEventListener("click", closeUserModal);
  document.getElementById("userModal").addEventListener("click", (e) => {
    if (e.target.id === "userModal") closeUserModal();
  });
}

async function loadUsers() {
  const table = document.getElementById("uTable");
  table.querySelector("tbody")?.remove();
  table.insertAdjacentHTML("beforeend", tableSkeleton(8, 6));

  try {
    const { items, meta } = await AdminUserAPI.list({
      search: uState.search, status: uState.status,
      page: uState.page, limit: U_PER_PAGE,
    });
    uRows = items;

    table.querySelector("tbody").remove();

    if (!items.length) {
      table.insertAdjacentHTML("beforeend", tableEmpty(6, {
        icon: "bi-people", title: "No customers found",
        body: uState.search ? `Nothing matches "${uState.search}".` : "Customers appear here once they register.",
      }));
      document.getElementById("uPager").innerHTML = "";
      return;
    }

    table.insertAdjacentHTML("beforeend", `<tbody>${items.map(userRow).join("")}</tbody>`);
    bindUserRows();
    renderPager("uPager", meta, (page) => { uState.page = page; loadUsers(); });
  } catch (err) {
    table.querySelector("tbody")?.remove();
    table.insertAdjacentHTML("beforeend", tableEmpty(6, {
      icon: "bi-wifi-off", title: "Couldn't load customers", body: err.message,
    }));
  }
}

function userRow(u) {
  const blocked = u.status === "blocked";
  const initial = (u.name || "?").trim().charAt(0).toUpperCase();
  return `
  <tr data-urow="${u.id}">
    <td><div class="vm-tcell">
      <span class="vm-side__avatar" style="background:var(--vm-ink);color:#fff">${escapeHtml(initial)}</span>
      <div style="min-width:0">
        <div class="vm-tname">${escapeHtml(u.name)}</div>
        <div class="vm-tsub">${escapeHtml(u.email)}</div>
      </div>
    </div></td>
    <td class="nowrap">${u.phone ? escapeHtml(u.phone) : "<span class='vm-tsub'>—</span>"}</td>
    <td class="num">${Number(u.order_count || 0)}</td>
    <td class="num">${formatPrice(u.total_spent || 0)}</td>
    <td><span class="vm-status vm-status--${blocked ? "blocked" : "active"}">${escapeHtml(u.status)}</span></td>
    <td>
      <div class="vm-row-actions">
        <button class="vm-icon-act" data-uview="${u.id}" aria-label="View ${escapeHtml(u.name)}"><i class="bi bi-eye"></i></button>
        <button class="vm-icon-act ${blocked ? "" : "vm-icon-act--danger"}" data-utoggle="${u.id}"
                aria-label="${blocked ? "Unblock" : "Block"} ${escapeHtml(u.name)}"
                title="${blocked ? "Unblock" : "Block"}">
          <i class="bi ${blocked ? "bi-unlock" : "bi-slash-circle"}"></i>
        </button>
      </div>
    </td>
  </tr>`;
}

function bindUserRows() {
  document.querySelectorAll("[data-uview]").forEach((b) =>
    b.addEventListener("click", () => openUserModal(b.dataset.uview)));
  document.querySelectorAll("[data-utoggle]").forEach((b) =>
    b.addEventListener("click", () => toggleStatus(b.dataset.utoggle, b)));
}

async function toggleStatus(id, btn) {
  const u = uRows.find((x) => String(x.id) === String(id));
  if (!u) return;
  const next = u.status === "blocked" ? "active" : "blocked";

  if (next === "blocked" &&
      !confirm(`Block ${u.name}? They'll be signed out and unable to order until you unblock them.`)) {
    return;
  }

  btn.disabled = true;
  try {
    await AdminUserAPI.setStatus(id, next);
    showToast(next === "blocked" ? `${u.name} blocked` : `${u.name} reactivated`, "success");
    loadUsers();
  } catch (err) {
    btn.disabled = false;
    showToast(err.message || "Couldn't update that customer.", "error");
  }
}

async function openUserModal(id) {
  const modal = document.getElementById("userModal");
  document.getElementById("uModalBody").innerHTML =
    `<div class="vm-skeleton vm-skeleton--line" style="height:120px;display:block"></div>`;
  modal.classList.add("is-open");
  document.body.style.overflow = "hidden";

  try {
    const u = await AdminUserAPI.get(id);
    document.getElementById("uModalTitle").textContent = u.name;

    document.getElementById("uModalBody").innerHTML = `
      <div class="vm-grid-2col" style="gap:1rem;margin-bottom:1.15rem">
        <div>
          <div class="vm-field__label">Contact</div>
          <p style="margin:0">
            ${escapeHtml(u.email)}<br>
            <span class="vm-tsub">${escapeHtml(u.phone || "No phone")}</span>
          </p>
        </div>
        <div>
          <div class="vm-field__label">Address</div>
          <p style="margin:0">
            ${u.address ? escapeHtml(u.address) : "<span class='vm-tsub'>None saved</span>"}
            ${u.city ? `<br><span class="vm-tsub">${escapeHtml(u.city)}</span>` : ""}
          </p>
        </div>
      </div>

      <div class="vm-field__label">Orders</div>
      ${(u.orders && u.orders.length)
        ? `<div class="vm-table-wrap"><table class="vm-table">
             <thead><tr><th>Order</th><th>Date</th><th>Status</th><th class="num">Total</th></tr></thead>
             <tbody>${u.orders.map((o) => `<tr>
               <td class="vm-tsub nowrap">${escapeHtml(o.order_number)}</td>
               <td class="nowrap">${adminDate(o.created_at)}</td>
               <td>${orderStatusPill(o.status)}</td>
               <td class="num">${formatPrice(o.total_amount)}</td>
             </tr>`).join("")}</tbody></table></div>`
        : `<p class="vm-field__hint">This customer hasn't ordered yet.</p>`}`;
  } catch (err) {
    document.getElementById("uModalBody").innerHTML =
      `<p class="vm-field__hint">${escapeHtml(err.message || "Couldn't load that customer.")}</p>`;
  }
}

function closeUserModal() {
  document.getElementById("userModal").classList.remove("is-open");
  document.body.style.overflow = "";
}
