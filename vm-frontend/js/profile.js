/**
 * profile.js
 * ---------------------------------------------------------------------------
 * Account page: identity summary, editable details, saved delivery address,
 * and password change. Requires a signed-in customer.
 *
 * Endpoints:
 *   GET /auth/profile          -> { data: { user } }
 *   PUT /auth/profile          -> { name?, phone?, address?, city? }
 *   PUT /auth/change-password  -> { current_password, new_password }
 *
 * Two things the account table does NOT have, handled openly rather than
 * faked:
 *   • No avatar column — the avatar is a monogram derived from the name, and
 *     the UI says photo uploads aren't supported instead of offering a file
 *     picker that would silently discard the image.
 *   • Email is not updatable — the server ignores it (verified). It's shown
 *     read-only with an explanation, not as an input that quietly does nothing.
 * ---------------------------------------------------------------------------
 */

/* Same rules the server enforces (validators/authValidators.js). */
const PASSWORD_RULES = [
  { id: "len", label: "At least 8 characters", test: (v) => v.length >= 8 },
  { id: "upper", label: "One uppercase letter", test: (v) => /[A-Z]/.test(v) },
  { id: "num", label: "One number", test: (v) => /\d/.test(v) },
];

const MIN_NAME_LENGTH = 3; // server: isLength({ min: 3 })

let profile = null;

document.addEventListener("DOMContentLoaded", () => {
  initLayout();

  if (!Session.isLoggedIn()) {
    window.location.replace(`${resolvePath("login.html")}?redirect=profile.html`);
    return;
  }

  loadProfile();
  wirePasswordPanel();
});

/* ================================= Loading =============================== */

async function loadProfile() {
  try {
    const res = await AuthAPI.getProfile();
    profile = (res.data && res.data.user) || res.data || res;

    // Keep the cached copy in step so the navbar and checkout prefill agree
    // with what the server actually holds.
    Session.save(Session.getToken(), profile);

    renderCard();
    renderDetails();
    renderAddress();
    document.getElementById("pfPanels").hidden = false;
    document.getElementById("pfLoading").hidden = true;
  } catch (err) {
    if (err.status === 401) {
      window.location.replace(`${resolvePath("login.html")}?redirect=profile.html`);
      return;
    }
    document.getElementById("pfLoading").hidden = true;
    showEmpty(document.getElementById("pfError"), {
      icon: "bi-wifi-off",
      title: "Couldn't load your profile",
      body: "The store is unreachable right now.",
      action: `<button class="vm-btn vm-btn--outline vm-btn--sm" onclick="window.location.reload()">Try again</button>`,
    });
  }
}

/* ============================== Identity card ============================ */

/** Stable tint per account, so the avatar looks deliberate rather than random. */
function avatarTint(seed) {
  const palette = ["#16181D", "#0E6E58", "#3D4A7A", "#7A3B2E", "#4B357F", "#1B4F8F"];
  let hash = 0;
  for (let i = 0; i < String(seed).length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

function renderCard() {
  const initial = (profile.name || "?").trim().charAt(0).toUpperCase();
  const avatar = document.getElementById("pfAvatar");
  avatar.textContent = initial;
  avatar.style.background = avatarTint(profile.email || profile.name || "vm");

  document.getElementById("pfName").textContent = profile.name || "Your account";
  document.getElementById("pfEmail").textContent = profile.email || "";

  document.getElementById("pfMeta").innerHTML = `
    <div><dt>Member since</dt><dd>${formatJoined(profile.created_at)}</dd></div>
    <div><dt>Account</dt><dd>${profile.status === "active" ? "Active" : escapeHtml(profile.status || "—")}</dd></div>`;
}

function formatJoined(value) {
  if (!value) return "—";
  const d = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/* ============================ Profile details ============================ */

function renderDetails() {
  document.getElementById("detailsReadout").innerHTML = `
    <div><dt>Full name</dt><dd>${escapeHtml(profile.name || "")}</dd></div>
    <div><dt>Email</dt><dd>${escapeHtml(profile.email || "")}</dd></div>
    <div><dt>Phone</dt>${valueOrBlank(profile.phone, "Not added")}</div>`;
}

function valueOrBlank(value, placeholder) {
  return value && String(value).trim()
    ? `<dd>${escapeHtml(value)}</dd>`
    : `<dd class="is-blank">${placeholder}</dd>`;
}

/** Swaps the read-only list for the edit form (and back). */
function toggleDetailsEdit(editing) {
  document.getElementById("detailsReadout").hidden = editing;
  document.getElementById("detailsForm").hidden = !editing;
  document.getElementById("editDetailsBtn").hidden = editing;

  if (editing) {
    document.getElementById("pfNameInput").value = profile.name || "";
    document.getElementById("pfPhoneInput").value = profile.phone || "";
    // Shown for context only — the server ignores email on this endpoint.
    document.getElementById("pfEmailInput").value = profile.email || "";
    clearFormErrors(document.getElementById("detailsForm"));
    document.getElementById("pfNameInput").focus();
  }
}

/* ============================= Saved address ============================= */

function renderAddress() {
  const box = document.getElementById("addressView");
  const hasAddress = Boolean(profile.address && profile.address.trim());

  box.className = `vm-address ${hasAddress ? "" : "vm-address--empty"}`;
  box.innerHTML = hasAddress
    ? `<span class="vm-address__tag"><i class="bi bi-geo-alt-fill"></i> Delivery</span>
       <div>${escapeHtml(profile.name || "")}<br>
       ${escapeHtml(profile.address)}${profile.city ? `<br>${escapeHtml(profile.city)}` : ""}
       ${profile.phone ? `<br><span class="vm-spec">${escapeHtml(profile.phone)}</span>` : ""}</div>`
    : `<p class="mb-0">No delivery address saved yet. Add one and it'll be filled in
       for you at checkout.</p>`;

  document.getElementById("editAddressBtn").textContent = hasAddress ? "Edit address" : "Add address";
}

function toggleAddressEdit(editing) {
  document.getElementById("addressView").hidden = editing;
  document.getElementById("addressForm").hidden = !editing;
  document.getElementById("editAddressBtn").hidden = editing;

  if (editing) {
    document.getElementById("pfAddressInput").value = profile.address || "";
    document.getElementById("pfCityInput").value = profile.city || "";
    clearFormErrors(document.getElementById("addressForm"));
    document.getElementById("pfAddressInput").focus();
  }
}

/* ================================ Helpers =============================== */

function showPanelAlert(form, message, kind = "error") {
  const box = form.querySelector(".vm-alert");
  if (!box) return;
  box.className = `vm-alert vm-alert--${kind} is-shown`;
  box.innerHTML = `<i class="bi ${kind === "ok" ? "bi-check-circle-fill" : "bi-exclamation-circle-fill"}"></i>
    <span>${escapeHtml(message)}</span>`;
}

/* ============================== Save details ============================= */

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("editDetailsBtn").addEventListener("click", () => toggleDetailsEdit(true));
  document.getElementById("cancelDetails").addEventListener("click", () => toggleDetailsEdit(false));
  document.getElementById("detailsForm").addEventListener("submit", saveDetails);

  document.getElementById("editAddressBtn").addEventListener("click", () => toggleAddressEdit(true));
  document.getElementById("cancelAddress").addEventListener("click", () => toggleAddressEdit(false));
  document.getElementById("addressForm").addEventListener("submit", saveAddress);
});

async function saveDetails(e) {
  e.preventDefault();
  const form = e.currentTarget;
  clearFormErrors(form);

  const nameInput = document.getElementById("pfNameInput");
  const phoneInput = document.getElementById("pfPhoneInput");
  const name = nameInput.value.trim();
  const phone = phoneInput.value.trim();

  const ok = [
    fieldError(nameInput,
      !name ? "Enter your name."
      : name.length < MIN_NAME_LENGTH ? `Name must be at least ${MIN_NAME_LENGTH} characters.`
      : ""),
    fieldError(phoneInput, !phone || Validate.phone(phone) ? "" : "Enter a valid phone number."),
  ];
  if (ok.includes(false)) return;

  const btn = document.getElementById("saveDetails");
  setBusy(btn, true);

  try {
    // Only send what changed — an unchanged field doesn't need a round trip
    // through validation.
    const payload = {};
    if (name !== (profile.name || "")) payload.name = name;
    if (phone !== (profile.phone || "")) payload.phone = phone;

    if (!Object.keys(payload).length) {
      setBusy(btn, false);
      toggleDetailsEdit(false);
      showToast("Nothing to update.", "info");
      return;
    }

    const res = await AuthAPI.updateProfile(payload);
    profile = (res.data && res.data.user) || profile;
    Session.save(Session.getToken(), profile);

    renderCard();
    renderDetails();
    renderAddress();       // the address block shows the name and phone too
    toggleDetailsEdit(false);
    showToast("Your details have been updated", "success");
  } catch (err) {
    applyServerErrors(form, err, (m) => showPanelAlert(form, m));
  } finally {
    setBusy(btn, false);
  }
}

async function saveAddress(e) {
  e.preventDefault();
  const form = e.currentTarget;
  clearFormErrors(form);

  const addressInput = document.getElementById("pfAddressInput");
  const cityInput = document.getElementById("pfCityInput");
  const address = addressInput.value.trim();

  if (!fieldError(addressInput, !address || address.length >= 5 ? "" : "Enter a full address (at least 5 characters).")) {
    return;
  }

  const btn = document.getElementById("saveAddress");
  setBusy(btn, true);

  try {
    const res = await AuthAPI.updateProfile({ address, city: cityInput.value.trim() });
    profile = (res.data && res.data.user) || profile;
    Session.save(Session.getToken(), profile);

    renderAddress();
    toggleAddressEdit(false);
    showToast("Your delivery address has been saved", "success");
  } catch (err) {
    applyServerErrors(form, err, (m) => showPanelAlert(form, m));
  } finally {
    setBusy(btn, false);
  }
}

/* ============================ Change password ============================ */

function wirePasswordPanel() {
  const form = document.getElementById("passwordForm");
  const next = document.getElementById("pwNew");

  // Reveal toggles
  document.querySelectorAll("[data-peek]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.peek);
      const revealed = input.type === "text";
      input.type = revealed ? "password" : "text";
      btn.querySelector("i").className = revealed ? "bi bi-eye" : "bi bi-eye-slash";
      btn.setAttribute("aria-label", revealed ? "Show password" : "Hide password");
    })
  );

  next.addEventListener("input", () => {
    paintRules(next.value);
    fieldError(next, "");
  });
  paintRules("");

  form.addEventListener("submit", changePassword);
}

function paintRules(value) {
  PASSWORD_RULES.forEach((rule) => {
    document.querySelector(`[data-rule="${rule.id}"]`)?.classList.toggle("is-met", rule.test(value));
  });
}

async function changePassword(e) {
  e.preventDefault();
  const form = e.currentTarget;
  clearFormErrors(form);

  const current = document.getElementById("pwCurrent");
  const next = document.getElementById("pwNew");
  const confirm = document.getElementById("pwConfirm");

  const unmet = PASSWORD_RULES.filter((r) => !r.test(next.value));

  const ok = [
    fieldError(current, current.value ? "" : "Enter your current password."),
    fieldError(next,
      !next.value ? "Choose a new password."
      : unmet.length ? `Password still needs: ${unmet.map((r) => r.label.toLowerCase()).join(", ")}.`
      : next.value === current.value ? "Your new password must be different from the current one."
      : ""),
    fieldError(confirm,
      !confirm.value ? "Re-enter the new password."
      : confirm.value !== next.value ? "Passwords don't match."
      : ""),
  ];
  if (ok.includes(false)) {
    form.querySelector(".vm-input.is-invalid")?.focus();
    return;
  }

  const btn = document.getElementById("savePassword");
  setBusy(btn, true, "Updating");

  try {
    await AuthAPI.changePassword({ currentPassword: current.value, newPassword: next.value });

    form.reset();
    paintRules("");
    showPanelAlert(form, "Your password has been changed. Use it next time you sign in.", "ok");
    showToast("Password changed successfully", "success");
  } catch (err) {
    // 401 here means the current password was wrong — point at that field
    // rather than showing a vague failure.
    if (err.status === 401) {
      fieldError(current, "That's not your current password.");
      current.value = "";
      current.focus();
      return;
    }
    applyServerErrors(form, err, (m) => showPanelAlert(form, m));
  } finally {
    setBusy(btn, false);
  }
}
