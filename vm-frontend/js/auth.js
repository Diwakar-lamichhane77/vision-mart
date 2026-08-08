/**
 * auth.js
 * ---------------------------------------------------------------------------
 * Drives both login.html and register.html. Each page has its own form id, so
 * this file simply wires up whichever one is present.
 *
 * Backend routes used:
 *   POST /auth/register  { name, email, password, phone?, address? }
 *   POST /auth/login     { email, password }
 *   GET  /auth/profile   (used to confirm the token straight after sign-in)
 *
 * On success the API returns { success, message, data: { user, token } }.
 * The token is stored as `vm_token` and the user object as `vm_user`.
 *
 * Client-side rules below mirror the server's validators exactly — the point
 * is to fail fast and locally, not to replace the server's checks.
 * ---------------------------------------------------------------------------
 */

/* Same rules the backend enforces (see validators/authValidators.js). */
const PASSWORD_RULES = [
  { id: "len", label: "At least 8 characters", test: (v) => v.length >= 8 },
  { id: "upper", label: "One uppercase letter", test: (v) => /[A-Z]/.test(v) },
  { id: "num", label: "One number", test: (v) => /\d/.test(v) },
];

const MIN_NAME_LENGTH = 3; // backend: isLength({ min: 3 })

document.addEventListener("DOMContentLoaded", () => {
  initLayout();

  // Someone already signed in has no business on these pages.
  if (Session.isLoggedIn()) {
    window.location.replace(afterAuthTarget());
    return;
  }

  if (document.getElementById("loginForm")) initLogin();
  if (document.getElementById("registerForm")) initRegister();
  initForgotPassword();
});

/* ============================== Shared helpers =========================== */

/**
 * Where to send someone once they're authenticated.
 * `?redirect=cart.html` lets other pages bounce a visitor through sign-in and
 * return them to what they were doing. Only same-site paths are honoured, so
 * this can't be used to send someone to another domain.
 */
function afterAuthTarget() {
  const requested = getQueryParams().redirect;

  // Only a bare page name is accepted — "cart.html", never "../../elsewhere",
  // never "//evil.example.com", never an absolute URL. Anything else falls
  // back to the home page rather than being followed.
  const isSafe =
    typeof requested === "string" &&
    /^[\w-]+\.html$/.test(requested);

  return resolvePath(isSafe ? requested : "index.html");
}

function showAlert(form, message) {
  const box = form.querySelector(".vm-auth__alert");
  if (!box) return;
  box.querySelector("span").textContent = message;
  box.classList.add("is-shown");
}

function hideAlert(form) {
  form.querySelector(".vm-auth__alert")?.classList.remove("is-shown");
}

/** Wires the show/hide toggle on a password input. */
function initPasswordPeek() {
  document.querySelectorAll("[data-peek]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.peek);
      if (!input) return;
      const revealed = input.type === "text";
      input.type = revealed ? "password" : "text";
      btn.querySelector("i").className = revealed ? "bi bi-eye" : "bi bi-eye-slash";
      btn.setAttribute("aria-label", revealed ? "Show password" : "Hide password");
    });
  });
}

/* ================================= LOGIN ================================= */

function initLogin() {
  const form = document.getElementById("loginForm");
  const email = document.getElementById("loginEmail");
  const password = document.getElementById("loginPassword");
  const remember = document.getElementById("rememberMe");
  const submit = document.getElementById("loginSubmit");

  initPasswordPeek();

  // "Remember me" brings the address back next time. The token itself always
  // lives in localStorage; how long it stays valid is the server's call.
  const savedEmail = localStorage.getItem("vm_remember_email");
  if (savedEmail) {
    email.value = savedEmail;
    remember.checked = true;
    password.focus();
  } else {
    email.focus();
  }

  // Validate on blur so mistakes surface before submitting.
  email.addEventListener("blur", () => {
    if (email.value.trim()) validateLoginEmail(email);
  });
  [email, password].forEach((input) =>
    input.addEventListener("input", () => fieldError(input, ""))
  );

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearFormErrors(form);

    const okEmail = validateLoginEmail(email);
    const okPassword = fieldError(
      password,
      Validate.required(password.value) ? "" : "Enter your password."
    );
    if (!okEmail || !okPassword) {
      form.querySelector(".vm-input.is-invalid")?.focus();
      return;
    }

    setBusy(submit, true, "Signing in");

    try {
      const res = await AuthAPI.login({
        email: email.value.trim(),
        password: password.value,
      });

      const { token, user } = res.data || {};
      if (!token) throw new Error("Sign-in succeeded but no token was returned.");

      Session.save(token, user);

      if (remember.checked) localStorage.setItem("vm_remember_email", email.value.trim());
      else localStorage.removeItem("vm_remember_email");

      showToast(`Welcome back, ${(user && user.name) || "there"}.`, "success");
      window.setTimeout(() => window.location.replace(afterAuthTarget()), 650);
    } catch (err) {
      setBusy(submit, false);

      // 401 is a wrong email/password — say so plainly, and don't reveal
      // which of the two was wrong.
      if (err.status === 401) {
        showAlert(form, "That email and password don't match. Check them and try again.");
        password.value = "";
        password.focus();
        return;
      }
      // 403 is a blocked account, which is a different problem entirely.
      if (err.status === 403) {
        showAlert(form, err.message || "This account has been blocked. Contact support for help.");
        return;
      }
      applyServerErrors(form, err, (m) => showAlert(form, m));
    }
  });
}

function validateLoginEmail(input) {
  const value = input.value.trim();
  if (!Validate.required(value)) return fieldError(input, "Enter your email address.");
  if (!Validate.email(value)) return fieldError(input, "That doesn't look like a valid email address.");
  return fieldError(input, "");
}

/* ================================ REGISTER =============================== */

function initRegister() {
  const form = document.getElementById("registerForm");
  const name = document.getElementById("regName");
  const email = document.getElementById("regEmail");
  const phone = document.getElementById("regPhone");
  const address = document.getElementById("regAddress");
  const password = document.getElementById("regPassword");
  const confirm = document.getElementById("regConfirm");
  const submit = document.getElementById("registerSubmit");

  initPasswordPeek();
  name.focus();

  // Live rule ticks — the person can see exactly what's still missing.
  password.addEventListener("input", () => {
    paintPasswordRules(password.value);
    fieldError(password, "");
    if (confirm.value) validateConfirm(password, confirm);
  });

  name.addEventListener("blur", () => name.value.trim() && validateName(name));
  email.addEventListener("blur", () => email.value.trim() && validateEmail(email));
  phone.addEventListener("blur", () => phone.value.trim() && validatePhone(phone));
  confirm.addEventListener("blur", () => confirm.value && validateConfirm(password, confirm));

  [name, email, phone, address, confirm].forEach((input) =>
    input.addEventListener("input", () => fieldError(input, ""))
  );

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearFormErrors(form);

    const checks = [
      validateName(name),
      validateEmail(email),
      validatePhone(phone),
      validatePassword(password),
      validateConfirm(password, confirm),
    ];
    if (checks.includes(false)) {
      form.querySelector(".vm-input.is-invalid")?.focus();
      return;
    }

    setBusy(submit, true, "Creating account");

    try {
      const payload = {
        name: name.value.trim(),
        email: email.value.trim(),
        password: password.value,
      };
      // Both are optional on the server — only send them when filled in.
      if (phone.value.trim()) payload.phone = phone.value.trim();
      if (address.value.trim()) payload.address = address.value.trim();

      const res = await AuthAPI.register(payload);
      const { token, user } = res.data || {};

      // Registration returns a token, so there's no reason to make someone
      // log in again immediately afterwards.
      if (token) {
        Session.save(token, user);
        showToast(`Welcome to Vision Mart, ${(user && user.name) || ""}.`.trim(), "success");
        window.setTimeout(() => window.location.replace(afterAuthTarget()), 700);
        return;
      }

      // If a future backend version stops returning a token, fall back to
      // sending them to sign in rather than silently doing nothing.
      showToast("Account created. Please sign in.", "success");
      window.setTimeout(() => window.location.replace(resolvePath("login.html")), 700);
    } catch (err) {
      setBusy(submit, false);

      // 409 means the email is taken — point at the field, and offer the
      // action they probably want.
      if (err.status === 409) {
        fieldError(email, "An account already exists with this email.");
        showAlert(form, "Already have an account? Sign in instead.");
        email.focus();
        return;
      }
      applyServerErrors(form, err, (m) => showAlert(form, m));
    }
  });

  paintPasswordRules("");
}

/* --------------------------- Register field rules ------------------------ */

function validateName(input) {
  const value = input.value.trim();
  if (!Validate.required(value)) return fieldError(input, "Enter your full name.");
  if (value.length < MIN_NAME_LENGTH)
    return fieldError(input, `Name must be at least ${MIN_NAME_LENGTH} characters.`);
  return fieldError(input, "");
}

function validateEmail(input) {
  const value = input.value.trim();
  if (!Validate.required(value)) return fieldError(input, "Enter your email address.");
  if (!Validate.email(value)) return fieldError(input, "That doesn't look like a valid email address.");
  return fieldError(input, "");
}

/** Phone is optional on the server, so an empty value is fine. */
function validatePhone(input) {
  const value = input.value.trim();
  if (!value) return fieldError(input, "");
  if (!Validate.phone(value)) return fieldError(input, "Enter a valid phone number, e.g. 9801234567.");
  return fieldError(input, "");
}

function validatePassword(input) {
  const value = input.value;
  if (!Validate.required(value)) return fieldError(input, "Choose a password.");

  const unmet = PASSWORD_RULES.filter((rule) => !rule.test(value));
  if (unmet.length) {
    return fieldError(input, `Password still needs: ${unmet.map((r) => r.label.toLowerCase()).join(", ")}.`);
  }
  return fieldError(input, "");
}

function validateConfirm(password, confirm) {
  if (!Validate.required(confirm.value)) return fieldError(confirm, "Re-enter your password.");
  if (confirm.value !== password.value) return fieldError(confirm, "Passwords don't match.");
  return fieldError(confirm, "");
}

/** Ticks each rule as it's satisfied. */
function paintPasswordRules(value) {
  PASSWORD_RULES.forEach((rule) => {
    const li = document.querySelector(`[data-rule="${rule.id}"]`);
    if (li) li.classList.toggle("is-met", rule.test(value));
  });
}

/* ============================ Forgot password ============================ */

/**
 * There is no password-reset endpoint on the backend, so rather than link to
 * a page that can't work, this explains the situation and offers the route
 * that does: contacting the store.
 */
function initForgotPassword() {
  const trigger = document.getElementById("forgotLink");
  const modal = document.getElementById("forgotModal");
  if (!trigger || !modal) return;

  const open = (e) => {
    e.preventDefault();
    modal.classList.add("is-open");
    modal.querySelector("button, a")?.focus();
  };
  const close = () => modal.classList.remove("is-open");

  trigger.addEventListener("click", open);
  modal.querySelectorAll("[data-close-modal]").forEach((el) => el.addEventListener("click", close));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
}
