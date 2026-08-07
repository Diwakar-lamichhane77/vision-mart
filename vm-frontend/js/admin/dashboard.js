/**
 * admin/dashboard.js
 * Summary cards, a monthly-sales chart drawn from real data, low stock and
 * recent orders. Everything comes from GET /admin/dashboard in one request.
 */

document.addEventListener("DOMContentLoaded", async () => {
  if (!(await initAdminPage({ title: "Dashboard" }))) return;
  loadDashboard();
});

async function loadDashboard() {
  try {
    const d = await AdminDashboardAPI.get({ months: 12, recent_limit: 8 });
    renderCards(d);
    renderChart(d.monthly_sales || []);
    renderLowStock(d.low_stock_products || [], d.low_stock_threshold);
    renderRecent(d.recent_orders || []);
    renderPipeline(d.orders_by_status || []);
  } catch (err) {
    showToast(err.message || "Couldn't load the dashboard.", "error");
    document.getElementById("dashCards").innerHTML = "";
  }
}

function renderCards(d) {
  const c = d.counts || {};
  const rev = d.revenue_summary || {};

  const cards = [
    { label: "Revenue", value: formatPrice(d.revenue || 0), icon: "bi-cash-stack",
      sub: `${formatPrice(rev.collected_revenue || 0)} collected · ${formatPrice(rev.pending_revenue || 0)} pending`,
      accent: true },
    { label: "Orders", value: c.total_orders ?? d.total_orders ?? 0, icon: "bi-receipt",
      sub: `${c.pending_orders || 0} pending · ${c.delivered_orders || 0} delivered` },
    { label: "Products", value: c.total_products ?? d.total_products ?? 0, icon: "bi-eyeglasses",
      sub: `${c.total_categories || 0} categories` },
    { label: "Customers", value: c.total_users ?? d.total_users ?? 0, icon: "bi-people",
      sub: `${c.active_users || 0} active` },
  ];

  document.getElementById("dashCards").innerHTML = cards
    .map(
      (k) => `
      <div class="vm-card-stat ${k.accent ? "vm-card-stat--accent" : ""}">
        <div class="vm-card-stat__top">
          <span class="vm-card-stat__label">${k.label}</span>
          <span class="vm-card-stat__icon"><i class="bi ${k.icon}"></i></span>
        </div>
        <div class="vm-card-stat__value">${typeof k.value === "number" ? k.value.toLocaleString() : k.value}</div>
        <div class="vm-card-stat__sub">${escapeHtml(k.sub)}</div>
      </div>`
    )
    .join("");
}

/**
 * Bars are scaled against the highest month in the range. Months with no
 * orders are drawn flat and greyed rather than omitted, so a quiet period
 * reads as quiet instead of disappearing.
 */
function renderChart(months) {
  const wrap = document.getElementById("salesChart");
  if (!months.length) {
    wrap.innerHTML = `<p class="vm-chart-note">No sales data yet.</p>`;
    return;
  }

  const peak = Math.max(...months.map((m) => Number(m.revenue) || 0), 1);

  wrap.innerHTML = months
    .map((m) => {
      const value = Number(m.revenue) || 0;
      const pct = Math.round((value / peak) * 100);
      return `
      <div class="vm-chart__col">
        <div class="vm-chart__bar" style="height:${Math.max(pct, 1)}%"
             data-empty="${value === 0 ? 1 : 0}"
             title="${escapeHtml(m.label)}: ${formatPrice(value)} from ${m.order_count} order(s)"></div>
        <span class="vm-chart__label">${escapeHtml(String(m.label || "").split(" ")[0])}</span>
      </div>`;
    })
    .join("");

  const total = months.reduce((s, m) => s + Number(m.revenue || 0), 0);
  document.getElementById("chartNote").textContent =
    `${formatPrice(total)} across ${months.length} months. Cancelled orders are excluded.`;
}

function renderPipeline(rows) {
  const el = document.getElementById("pipeline");
  if (!rows.length) { el.innerHTML = `<p class="vm-chart-note">No orders yet.</p>`; return; }
  el.innerHTML = rows
    .map(
      (r) => `<div class="d-flex align-items-center justify-content-between" style="padding:.45rem 0;border-bottom:1px solid var(--vm-line)">
        ${orderStatusPill(r.status)}
        <span><strong>${r.count}</strong> <span class="vm-tsub">${formatPrice(r.value)}</span></span>
      </div>`
    )
    .join("");
}

function renderLowStock(items, threshold) {
  const body = document.getElementById("lowStockBody");
  document.getElementById("lowStockNote").textContent = `Stock at or below ${threshold ?? 5}`;

  if (!items.length) {
    body.innerHTML = `<tr><td colspan="3"><div class="vm-empty"><i class="bi bi-check2-circle"></i>
      <h3>Stock looks healthy</h3><p>Nothing is running low.</p></div></td></tr>`;
    return;
  }

  body.innerHTML = items
    .map(
      (p) => `<tr>
        <td><div class="vm-tcell">
          <div class="vm-tthumb"><img src="${resolveImage(p.image)}" alt="" onerror="imageFallback(this)"></div>
          <div><div class="vm-tname">${escapeHtml(p.name)}</div>
          <div class="vm-tsub">${escapeHtml(p.category_name || "")}</div></div>
        </div></td>
        <td class="num"><span class="vm-chip-stock ${p.stock === 0 ? "is-out" : "is-low"}">${p.stock}</span></td>
        <td class="num">${formatPrice(p.discount_price ?? p.price)}</td>
      </tr>`
    )
    .join("");
}

function renderRecent(orders) {
  const body = document.getElementById("recentBody");
  if (!orders.length) {
    body.innerHTML = `<tr><td colspan="4"><div class="vm-empty"><i class="bi bi-receipt"></i>
      <h3>No orders yet</h3></div></td></tr>`;
    return;
  }
  body.innerHTML = orders
    .map(
      (o) => `<tr>
        <td class="nowrap"><span class="vm-tsub">${escapeHtml(o.order_number)}</span></td>
        <td>${escapeHtml(o.user?.name || "—")}</td>
        <td>${orderStatusPill(o.status)}</td>
        <td class="num">${formatPrice(o.total_amount)}</td>
      </tr>`
    )
    .join("");
}
