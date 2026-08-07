/**
 * checkout.js
 * ---------------------------------------------------------------------------
 * Checkout. Builds the order from the signed-in customer's cart.
 *
 * Endpoints:
 *   GET  /cart                 -> lines + meta.subtotal / checkout_ready
 *   GET  /payments/methods     -> which gateways this deployment supports
 *   POST /orders               -> creates the order (and clears the cart)
 *   POST /payments/initiate    -> gateway handoff for eSewa / Khalti
 *
 * What the backend actually stores (validators/orderValidators.js):
 *   shipping_name, shipping_phone, shipping_address, shipping_city,
 *   payment_method, notes, items
 *
 * There is NO billing_address column and NO coupon endpoint. Rather than
 * silently dropping either, both are folded into `notes`, which does reach
 * the server — and the UI says so plainly instead of implying a discount was
 * applied or a separate billing record was saved.
 * ---------------------------------------------------------------------------
 */

const SHIPPING = {
  FLAT_RATE: 150,
  FREE_ABOVE: 10000,
};

let cartLines = [];
let cartMeta = {};
let methods = [];
let selectedMethod = "COD";
let appliedCoupon = "";

document.addEventListener("DOMContentLoaded", () => {
  initLayout();

  if (!Session.isLoggedIn()) {
    window.location.replace(`${resolvePath("login.html")}?redirect=checkout.html`);
    return;
  }

  prefillFromProfile();
  loadCart();
  loadPaymentMethods();
  wireForm();
});

/* ================================= Loading =============================== */

async function loadCart() {
  try {
    const { items, meta } = await CartAPI.getAll();
    cartLines = items;
    cartMeta = meta || {};

    // Nothing to check out — send them back rather than showing a dead form.
    if (!cartLines.length) {
      showToast("Your bag is empty.", "info");
      window.setTimeout(() => window.location.replace(resolvePath("cart.html")), 900);
      return;
    }
    renderSummary();
  } catch (err) {
    if (err.status === 401) {
      window.location.replace(`${resolvePath("login.html")}?redirect=checkout.html`);
      return;
    }
    showApiError(err, "Couldn't load your bag.");
  }
}

/** Payment options come from the server, so an unconfigured gateway can't be picked. */
async function loadPaymentMethods() {
  const wrap = document.getElementById("payOptions");

  const COPY = {
    COD: "Pay the courier in cash when your order arrives.",
    eSewa: "You'll be redirected to eSewa to complete payment.",
    Khalti: "Pay with the Khalti wallet without leaving this page.",
  };

  try {
    methods = await PaymentAPI.getMethods();
  } catch (err) {
    console.error(err);
    // COD needs no gateway, so it's always a safe fallback.
    methods = [{ method: "COD", label: "Cash on Delivery", configured: true }];
  }

  wrap.innerHTML = methods
    .map((m, i) => {
      // A gateway with no credentials can't take a payment, so don't offer it.
      const usable = m.configured !== false || m.method === "COD";
      return `
      <label class="vm-pay__opt ${i === 0 ? "is-selected" : ""} ${usable ? "" : "is-disabled"}">
        <input type="radio" name="payment" value="${escapeHtml(m.method)}"
               ${i === 0 ? "checked" : ""} ${usable ? "" : "disabled"}>
        <span>
          <span class="vm-pay__name">${escapeHtml(m.label || m.method)}</span>
          <p class="vm-pay__desc">${
            usable
              ? escapeHtml(COPY[m.method] || "")
              : "Not available at the moment — please choose another method."
          }</p>
        </span>
      </label>`;
    })
    .join("");

  selectedMethod = (methods.find((m) => m.configured !== false) || methods[0] || {}).method || "COD";

  wrap.querySelectorAll('input[name="payment"]').forEach((input) =>
    input.addEventListener("change", () => {
      selectedMethod = input.value;
      wrap.querySelectorAll(".vm-pay__opt").forEach((o) =>
        o.classList.toggle("is-selected", o.contains(input))
      );
    })
  );
}

/** Saves the customer retyping what's already on their account. */
function prefillFromProfile() {
  const user = Session.getUser() || {};
  if (user.name) document.getElementById("shipName").value = user.name;
  if (user.phone) document.getElementById("shipPhone").value = user.phone;
  if (user.address) document.getElementById("shipAddress").value = user.address;
  if (user.city) document.getElementById("shipCity").value = user.city;
}

/* ================================= Summary =============================== */

function renderSummary() {
  const subtotal = Number(
    cartMeta.subtotal ??
      cartLines.reduce((s, l) => s + Number(l.unit_price) * Number(l.quantity), 0)
  );
  const freeShipping = subtotal >= SHIPPING.FREE_ABOVE;
  const shipping = freeShipping ? 0 : SHIPPING.FLAT_RATE;

  document.getElementById("summaryLines").innerHTML = cartLines
    .map((l) => {
      const p = l.product || {};
      return `
      <div class="vm-mini-line">
        <div class="vm-mini-line__media">
          <img src="${resolveImage(p.image)}" alt="" onerror="imageFallback(this)">
          <span class="vm-mini-line__qty">${Number(l.quantity)}</span>
        </div>
        <div class="vm-mini-line__name">${escapeHtml(p.name || "Product")}</div>
        <div class="vm-mini-line__price">${formatPrice(Number(l.unit_price) * Number(l.quantity))}</div>
      </div>`;
    })
    .join("");

  document.getElementById("summaryTotals").innerHTML = `
    <div class="vm-sum-row">
      <span>Subtotal</span><strong>${formatPrice(subtotal)}</strong>
    </div>
    <div class="vm-sum-row ${freeShipping ? "vm-sum-row--free" : ""}">
      <span>Shipping <span class="vm-spec">estimate</span></span>
      <strong>${freeShipping ? "Free" : formatPrice(shipping)}</strong>
    </div>
    <div class="vm-sum-total">
      <span>Estimated total</span>
      <strong>${formatPrice(subtotal + shipping)}</strong>
    </div>
    <p class="vm-summary__note">
      The store charges ${formatPrice(subtotal)} for the items. Delivery is estimated
      at ${formatPrice(SHIPPING.FLAT_RATE)} inside the Kathmandu valley (free over
      ${formatPrice(SHIPPING.FREE_ABOVE)}) and is confirmed with you before dispatch.
    </p>`;

  // The cart flags lines that went out of stock while the bag sat idle.
  if (cartMeta.checkout_ready === false) {
    const issue = (cartMeta.issues || [])[0];
    showAlert(
      `${issue ? issue.message : "Some items are no longer available."} Please update your bag before ordering.`
    );
    document.getElementById("placeOrderBtn").disabled = true;
  }
}

/* ================================ Validation ============================= */

function fieldError(input, message = "") {
  const box = input.closest(".vm-field")?.querySelector(".vm-field__error");
  input.classList.toggle("is-invalid", Boolean(message));
  input.setAttribute("aria-invalid", message ? "true" : "false");
  if (box) box.textContent = message;
  return !message;
}

function showAlert(message) {
  const box = document.getElementById("checkoutAlert");
  box.querySelector("span").textContent = message;
  box.classList.add("is-shown");
}
function hideAlert() {
  document.getElementById("checkoutAlert").classList.remove("is-shown");
}

/** Mirrors the server's rules so mistakes surface before the request. */
function validateForm() {
  const name = document.getElementById("shipName");
  const phone = document.getElementById("shipPhone");
  const address = document.getElementById("shipAddress");

  const checks = [
    fieldError(name, Validate.minLength(name.value, 2) ? "" : "Enter the recipient's full name."),
    fieldError(phone, Validate.phone(phone.value) ? "" : "Enter a valid phone number we can call on delivery."),
    fieldError(address, Validate.minLength(address.value, 5) ? "" : "Enter a delivery address (at least 5 characters)."),
  ];

  // Billing is only validated when it's actually different from shipping.
  if (!document.getElementById("billingSame").checked) {
    const billAddress = document.getElementById("billAddress");
    checks.push(
      fieldError(billAddress, Validate.minLength(billAddress.value, 5) ? "" : "Enter the billing address.")
    );
  }

  return !checks.includes(false);
}

/* ================================= Coupon ================================ */

/**
 * There is no coupon endpoint, so nothing here can validate a code or change
 * the total — doing either would show a discount the server won't honour.
 * The code is recorded on the order instead, and the copy says exactly that.
 */
function wireCoupon() {
  const input = document.getElementById("couponCode");
  const apply = document.getElementById("applyCoupon");
  const note = document.getElementById("couponNote");

  apply.addEventListener("click", () => {
    const code = input.value.trim().toUpperCase();
    if (!code) {
      note.className = "vm-coupon-note";
      note.innerHTML = `<i class="bi bi-info-circle"></i><span>Enter a code to add it to your order.</span>`;
      return;
    }

    appliedCoupon = code;
    note.className = "vm-coupon-note is-applied";
    note.innerHTML = `<i class="bi bi-check-circle-fill"></i>
      <span>Code <strong>${escapeHtml(code)}</strong> will be recorded on your order.
      Discounts are checked by the store before dispatch — the total below hasn't
      changed yet.</span>`;
    input.value = code;
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); apply.click(); }
  });
}

/* ================================ Placing ================================ */

function wireForm() {
  wireCoupon();

  // Billing fields only exist when billing differs from shipping.
  const same = document.getElementById("billingSame");
  const billingFields = document.getElementById("billingFields");
  same.addEventListener("change", () => {
    billingFields.hidden = same.checked;
  });

  ["shipName", "shipPhone", "shipAddress"].forEach((id) =>
    document.getElementById(id).addEventListener("input", (e) => fieldError(e.target, ""))
  );

  document.getElementById("checkoutForm").addEventListener("submit", placeOrder);
}

/**
 * Assembles `notes` from the customer's own note plus anything the schema
 * can't store separately (billing address, coupon code), so the information
 * reaches the store rather than being quietly discarded.
 */
function buildNotes() {
  const parts = [];
  const own = document.getElementById("orderNotes").value.trim();
  if (own) parts.push(own);

  if (!document.getElementById("billingSame").checked) {
    const billName = document.getElementById("billName").value.trim();
    const billAddress = document.getElementById("billAddress").value.trim();
    const billCity = document.getElementById("billCity").value.trim();
    parts.push(
      `Billing address: ${[billName, billAddress, billCity].filter(Boolean).join(", ")}`
    );
  }

  if (appliedCoupon) parts.push(`Coupon code: ${appliedCoupon}`);

  // The column is VARCHAR(500); trim rather than let the server 422.
  return parts.join(" | ").slice(0, 500);
}

async function placeOrder(e) {
  e.preventDefault();
  hideAlert();

  if (!validateForm()) {
    document.querySelector(".vm-input.is-invalid")?.focus();
    return;
  }

  const btn = document.getElementById("placeOrderBtn");
  btn.disabled = true;
  btn.innerHTML = '<span class="vm-spinner"></span> Placing order';

  const payload = {
    shipping_name: document.getElementById("shipName").value.trim(),
    shipping_phone: document.getElementById("shipPhone").value.trim(),
    shipping_address: document.getElementById("shipAddress").value.trim(),
    shipping_city: document.getElementById("shipCity").value.trim(),
    payment_method: selectedMethod,
    notes: buildNotes(),
    // No `items` — the server builds the order from the cart and clears it.
    // Prices come from the database, so nothing is sent from here.
  };

  let order;
  try {
    const res = await OrderAPI.create(payload);
    order = res.data || res;
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "Place order";

    if (err.status === 422 && Array.isArray(err.fieldErrors)) {
      err.fieldErrors.forEach(({ field, message }) => {
        const input = document.querySelector(`[name="${field}"]`);
        if (input) fieldError(input, message);
      });
      showAlert("Please correct the highlighted fields.");
      return;
    }
    showAlert(err.message || "We couldn't place your order. Please try again.");
    return;
  }

  refreshCounts();

  // Cash on delivery is done — nothing to hand to a gateway.
  if (selectedMethod === "COD") {
    showToast(`Order ${order.order_number} placed.`, "success");
    window.setTimeout(
      () => window.location.replace(`${resolvePath("orders.html")}?highlight=${order.id}`),
      800
    );
    return;
  }

  await startGatewayPayment(order, btn);
}

/**
 * Hands off to eSewa or Khalti. The order already exists and is awaiting
 * payment, so any failure here leaves a recoverable order rather than losing
 * the customer's basket.
 */
async function startGatewayPayment(order, btn) {
  try {
    const gw = await PaymentAPI.initiate(order.id);

    sessionStorage.setItem(
      "vm_pending_payment",
      JSON.stringify({ orderId: order.id, orderNumber: order.order_number, method: gw.method })
    );

    // eSewa expects a classic form POST, not a query string.
    if (gw.requires_redirect && gw.redirect_url) {
      showToast("Redirecting to eSewa...", "info");
      const form = document.createElement("form");
      form.method = gw.redirect_method || "POST";
      form.action = gw.redirect_url;
      form.style.display = "none";
      Object.entries(gw.fields || {}).forEach(([k, v]) => {
        const i = document.createElement("input");
        i.type = "hidden";
        i.name = k;
        i.value = v;
        form.appendChild(i);
      });
      document.body.appendChild(form);
      form.submit();
      return;
    }

    // Khalti's widget. Without the SDK we don't fake success — the order
    // stays unpaid and the customer is told.
    if (gw.method === "Khalti" && typeof KhaltiCheckout !== "undefined") {
      const checkout = new KhaltiCheckout({
        publicKey: gw.public_key,
        productIdentity: gw.product_identity,
        productName: gw.product_name,
        productUrl: window.location.href,
        eventHandler: {
          async onSuccess(payload) {
            try {
              // The widget token proves nothing until the server verifies it.
              await PaymentAPI.verify({ orderId: order.id, token: payload.token });
              showToast("Payment confirmed.", "success");
            } catch (err) {
              showApiError(err, "We couldn't confirm the payment. Please contact support.");
            }
            goToOrders(order.id);
          },
          onError() {
            showToast("Payment failed. Your order is saved and awaiting payment.", "error");
            goToOrders(order.id);
          },
          onClose() {
            showToast("Payment cancelled. Your order is awaiting payment.", "info");
            goToOrders(order.id);
          },
        },
      });
      checkout.show({ amount: gw.amount_in_paisa });
      return;
    }

    showToast(
      `Order ${order.order_number} placed, but ${gw.method} checkout isn't available here — it's awaiting payment.`,
      "info"
    );
    goToOrders(order.id);
  } catch (err) {
    console.error(err);
    showToast(
      `Order ${order.order_number} was placed but payment couldn't start. You can pay from your orders.`,
      "info"
    );
    goToOrders(order.id);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Place order";
    }
  }
}

function goToOrders(orderId) {
  window.setTimeout(
    () => window.location.replace(`${resolvePath("orders.html")}?highlight=${orderId}`),
    900
  );
}
