/**
 * contact.js
 * Contact form -> POST /api/contact (public; no token required).
 */
document.addEventListener("DOMContentLoaded", () => {
  initLayout();
  wireForm();
  wireHours();
});

function wireForm() {
  const form = document.getElementById("contactForm");
  const name = document.getElementById("cName");
  const email = document.getElementById("cEmail");
  const subject = document.getElementById("cSubject");
  const message = document.getElementById("cMessage");
  const count = document.getElementById("cCount");

  message.addEventListener("input", () => {
    count.textContent = message.value.length;
    fieldError(message, "");
  });
  [name, email, subject].forEach((i) => i.addEventListener("input", () => fieldError(i, "")));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Mirrors the server's rules: name 2–100, valid email, message 10–5000.
    const ok = [
      fieldError(name, name.value.trim().length >= 2 ? "" : "Enter your name."),
      fieldError(email, Validate.email(email.value) ? "" : "Enter a valid email address."),
      fieldError(message, message.value.trim().length >= 10
        ? "" : "Tell us a little more — at least 10 characters."),
    ];
    if (ok.includes(false)) {
      form.querySelector(".is-invalid")?.focus();
      return;
    }

    const btn = document.getElementById("cSubmit");
    btn.disabled = true;
    btn.innerHTML = '<span class="vm-spinner"></span> Sending';

    try {
      await ContactAPI.send({
        name: name.value.trim(),
        email: email.value.trim(),
        subject: subject.value.trim(),
        message: message.value.trim(),
      });

      form.hidden = true;
      document.getElementById("contactDone").hidden = false;
      showToast("Message sent — we'll be in touch.", "success");
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "Send message";
      if (err.status === 422 && Array.isArray(err.fieldErrors)) {
        err.fieldErrors.forEach(({ field, message: msg }) => {
          const input = form.querySelector(`[name="${field}"]`);
          if (input) fieldError(input, msg);
        });
        return;
      }
      showApiError(err, "Couldn't send your message. Please try again.");
    }
  });

  document.getElementById("sendAnother")?.addEventListener("click", () => {
    form.reset();
    count.textContent = "0";
    form.hidden = false;
    document.getElementById("contactDone").hidden = true;
    const btn = document.getElementById("cSubmit");
    btn.disabled = false;
    btn.textContent = "Send message";
    name.focus();
  });
}

/**
 * Shows whether the shop is open right now, from the same hours listed below
 * it — so the two can't disagree.
 */
function wireHours() {
  const el = document.getElementById("openNow");
  if (!el) return;

  // 0 = Sunday … 6 = Saturday
  const HOURS = { 0: [10, 19], 1: [10, 19], 2: [10, 19], 3: [10, 19], 4: [10, 19], 5: [10, 17], 6: null };
  const now = new Date();
  const today = HOURS[now.getDay()];
  const open = today && now.getHours() >= today[0] && now.getHours() < today[1];

  el.className = `vm-status vm-status--${open ? "active" : "cancelled"}`;
  el.textContent = open ? "Open now" : "Closed now";
}
