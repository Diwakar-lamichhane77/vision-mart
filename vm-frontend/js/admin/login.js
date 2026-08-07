/**
 * admin/login.js
 * POST /admin/login. Admin tokens are signed with a different secret than
 * customer tokens, so they're stored under their own keys (see core.js) —
 * signing in here never disturbs a customer session in the same browser.
 */

document.addEventListener("DOMContentLoaded", () => {
  // Already signed in? Go straight through.
  if (AdminSession.isLoggedIn()) {
    window.location.replace(nextPage());
    return;
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get("denied")) {
    showAlert("That account isn't an admin. Sign in with staff credentials.");
  }

  const form = document.getElementById("adminLoginForm");
  const email = document.getElementById("aEmail");
  const password = document.getElementById("aPassword");
  email.focus();

  [email, password].forEach((i) =>
    i.addEventListener("input", () => {
      i.classList.remove("is-invalid");
      i.closest(".vm-field").querySelector(".vm-field__error").textContent = "";
    })
  );

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideAlert();
    clearFormErrors(form);

    let ok = true;
    if (!Validate.email(email.value.trim())) {
      email.classList.add("is-invalid");
      email.closest(".vm-field").querySelector(".vm-field__error").textContent =
        "Enter a valid email address.";
      ok = false;
    }
    if (!password.value) {
      password.classList.add("is-invalid");
      password.closest(".vm-field").querySelector(".vm-field__error").textContent =
        "Enter your password.";
      ok = false;
    }
    if (!ok) { form.querySelector(".is-invalid")?.focus(); return; }

    const btn = document.getElementById("aSubmit");
    setBtnBusy(btn, true, "Signing in");

    try {
      const res = await AdminAuth.login({
        email: email.value.trim(),
        password: password.value,
      });
      const { token, admin } = res.data || {};
      if (!token) throw new Error("Sign-in succeeded but no token was returned.");

      AdminSession.save(token, admin);
      window.location.replace(nextPage());
    } catch (err) {
      setBtnBusy(btn, false);
      // Don't reveal which of the two was wrong.
      showAlert(
        err.status === 401
          ? "That email and password don't match a staff account."
          : err.message || "Couldn't sign in. Try again."
      );
      password.value = "";
      password.focus();
    }
  });
});

/** Honours ?next=orders.html, but only for pages inside the admin folder. */
function nextPage() {
  const next = new URLSearchParams(window.location.search).get("next");
  const allowed = ["dashboard.html", "products.html", "categories.html", "orders.html", "users.html"];
  return allowed.includes(next) ? next : "dashboard.html";
}

function showAlert(message) {
  const box = document.getElementById("loginAlert");
  box.querySelector("span").textContent = message;
  box.classList.add("is-shown");
}
function hideAlert() {
  document.getElementById("loginAlert").classList.remove("is-shown");
}
