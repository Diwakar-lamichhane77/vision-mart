/**
 * components.js
 * ---------------------------------------------------------------------------
 * Shared UI rendered on every page: the navbar, the mobile drawer, the footer,
 * and the product card markup that the home page and shop both use.
 *
 * Each page provides two mount points:
 *   <div id="vmNavbar"></div>  ...  <div id="vmFooter"></div>
 * and calls initLayout() on DOMContentLoaded.
 * ---------------------------------------------------------------------------
 */

/* Primary navigation. `file` is resolved per-page by resolvePath(). */
const NAV_ITEMS = [
  { file: "index.html", label: "Home" },
  { file: "shop.html", label: "Shop" },
  { file: "categories.html", label: "Categories" },
  { file: "wishlist.html", label: "Wishlist" },
];

/** Current file name, defaulting to index.html at the site root. */
function currentFile() {
  return window.location.pathname.split("/").pop() || "index.html";
}

/* ================================= NAVBAR ================================ */

function navbarMarkup() {
  const here = currentFile();
  const user = Session.getUser();
  const signedIn = Session.isLoggedIn();

  const links = NAV_ITEMS.map(
    (item) => `<li>
        <a class="vm-nav__link ${item.file === here ? "is-active" : ""}"
           href="${resolvePath(item.file)}">${item.label}</a>
      </li>`
  ).join("");

  const initial = ((user && user.name) || "A").trim().charAt(0).toUpperCase();

  const account = signedIn
    ? `<div class="vm-account" id="vmAccount">
         <button class="vm-account__toggle" id="vmAccountToggle"
                 aria-haspopup="true" aria-expanded="false">
           <span class="vm-account__initial">${escapeHtml(initial)}</span>
           <span class="d-none d-xl-inline">${escapeHtml((user && user.name) || "Account")}</span>
           <i class="bi bi-chevron-down" style="font-size:.7rem"></i>
         </button>
         <div class="vm-account__menu" role="menu">
           <div class="vm-account__head">
             <strong>${escapeHtml((user && user.name) || "Signed in")}</strong>
             <span>${escapeHtml((user && user.email) || "")}</span>
           </div>
           <a class="vm-account__item" role="menuitem" href="${resolvePath("profile.html")}">
             <i class="bi bi-person"></i>My profile</a>
           <a class="vm-account__item" role="menuitem" href="${resolvePath("orders.html")}">
             <i class="bi bi-bag-check"></i>My orders</a>
           <a class="vm-account__item" role="menuitem" href="${resolvePath("wishlist.html")}">
             <i class="bi bi-heart"></i>Wishlist</a>
           <button class="vm-account__item vm-account__item--danger" role="menuitem" id="vmSignOut">
             <i class="bi bi-box-arrow-right"></i>Sign out</button>
         </div>
       </div>`
    : `<div class="vm-nav__auth">
         <a class="vm-btn vm-btn--ghost vm-btn--sm" href="${resolvePath("login.html")}">Login</a>
         <a class="vm-btn vm-btn--sm" href="${resolvePath("register.html")}">Register</a>
       </div>`;

  return `
  <nav class="vm-nav" id="vmNav">
    <div class="vm-nav__inner">
      <a class="vm-brand" href="${resolvePath("index.html")}">
        <span class="vm-brand__name">Vision Mart</span>
        <span class="vm-brand__mark">Est. 2019</span>
      </a>

      <ul class="vm-nav__links">${links}</ul>

      <div class="vm-nav__actions">
        <a class="vm-icon-btn" href="${resolvePath("wishlist.html")}" aria-label="Wishlist">
          <i class="bi bi-heart"></i>
          <span class="vm-icon-btn__count" id="vmWishCount" hidden>0</span>
        </a>
        <a class="vm-icon-btn" href="${resolvePath("cart.html")}" aria-label="Shopping bag">
          <i class="bi bi-bag"></i>
          <span class="vm-icon-btn__count" id="vmCartCount" hidden>0</span>
        </a>
        ${account}
        <button class="vm-nav__burger" id="vmBurger" aria-label="Open menu"
                aria-expanded="false" aria-controls="vmDrawer">
          <i class="bi bi-list"></i>
        </button>
      </div>
    </div>
  </nav>

  <div class="vm-drawer" id="vmDrawer">
    <div class="vm-drawer__scrim" data-drawer-close></div>
    <div class="vm-drawer__panel" role="dialog" aria-modal="true" aria-label="Menu">
      <div class="vm-drawer__head">
        <span class="vm-brand__name">Vision Mart</span>
        <button class="vm-icon-btn" data-drawer-close aria-label="Close menu">
          <i class="bi bi-x-lg"></i>
        </button>
      </div>
      <ul class="vm-drawer__links">
        ${NAV_ITEMS.map(
          (i) => `<li><a href="${resolvePath(i.file)}">${i.label}<i class="bi bi-arrow-right"></i></a></li>`
        ).join("")}
        <li><a href="${resolvePath("cart.html")}">Bag<i class="bi bi-arrow-right"></i></a></li>
      </ul>
      <div class="vm-drawer__auth">
        ${
          signedIn
            ? `<a class="vm-btn vm-btn--outline vm-btn--block" href="${resolvePath("profile.html")}">My profile</a>
               <a class="vm-btn vm-btn--outline vm-btn--block" href="${resolvePath("orders.html")}">My orders</a>
               <button class="vm-btn vm-btn--block" id="vmSignOutMobile">Sign out</button>`
            : `<a class="vm-btn vm-btn--outline vm-btn--block" href="${resolvePath("login.html")}">Login</a>
               <a class="vm-btn vm-btn--block" href="${resolvePath("register.html")}">Create account</a>`
        }
      </div>
    </div>
  </div>`;
}

/* ================================= FOOTER ================================ */

function footerMarkup() {
  const year = new Date().getFullYear();
  return `
  <footer class="vm-footer">
    <div class="vm-shell">
      <div class="vm-footer__grid">

        <div class="vm-footer__brand">
          <span class="vm-footer__brand-name">Vision Mart</span>
          <p class="vm-footer__blurb">
            Frames chosen by opticians, not algorithms. Every pair is fitted,
            adjusted and posted from our workshop in Kathmandu.
          </p>
          <div class="vm-footer__meta">
            Thamel Marg 12, Kathmandu 44600<br>
            <a href="tel:+9779800000000">+977 980-000-0000</a><br>
            <a href="mailto:hello@visionmart.com">hello@visionmart.com</a>
          </div>
          <div class="vm-footer__socials">
            <a href="#" aria-label="Instagram"><i class="bi bi-instagram"></i></a>
            <a href="#" aria-label="Facebook"><i class="bi bi-facebook"></i></a>
            <a href="#" aria-label="Pinterest"><i class="bi bi-pinterest"></i></a>
          </div>
        </div>

        <div class="vm-footer__col">
          <h4>Shop</h4>
          <ul class="vm-footer__list">
            <li><a href="${resolvePath("shop.html")}">All eyewear</a></li>
            <li><a href="${resolvePath("shop.html")}?sort=newest">New arrivals</a></li>
            <li><a href="${resolvePath("shop.html")}?sort=popularity">Best sellers</a></li>
            <li><a href="${resolvePath("categories.html")}">Categories</a></li>
          </ul>
        </div>

        <div class="vm-footer__col">
          <h4>Help</h4>
          <ul class="vm-footer__list">
            <li><a href="${resolvePath("contact.html")}">Contact us</a></li>
            <li><a href="${resolvePath("orders.html")}">Track an order</a></li>
            <li><a href="${resolvePath("contact.html")}#returns">Returns &amp; exchanges</a></li>
            <li><a href="${resolvePath("contact.html")}#fitting">Fitting guide</a></li>
          </ul>
        </div>

        <div class="vm-footer__col">
          <h4>Visit</h4>
          <ul class="vm-footer__list">
            <li>Sun&ndash;Thu &middot; 10:00&ndash;19:00</li>
            <li>Friday &middot; 10:00&ndash;17:00</li>
            <li>Saturday &middot; Closed</li>
            <li><a href="${resolvePath("contact.html")}">Get directions</a></li>
          </ul>
        </div>
      </div>

      <div class="vm-footer__bar">
        <span>&copy; ${year} Vision Mart</span>
        <div class="vm-footer__pay">
          <span>Cash on delivery</span>
          <span>eSewa</span>
          <span>Khalti</span>
        </div>
      </div>
    </div>
  </footer>`;
}

/* ============================== PRODUCT CARD ============================= */

/**
 * One product card. Shared by every grid and rail so the markup exists once.
 * @param {object} p product from the API
 */
function productCardMarkup(p) {
  const price = Number(p.discount_price ?? p.effective_price ?? p.price ?? 0);
  const wasPrice = p.discount_price ? Number(p.price) : 0;
  const off = discountPercent(price, wasPrice);
  const outOfStock = Number(p.stock ?? 0) <= 0;
  const href = `${resolvePath("product.html")}?id=${encodeURIComponent(p.id)}`;

  const flags = [];
  if (off > 0) flags.push(`<span class="vm-badge vm-badge--sale">${off}% off</span>`);
  if (outOfStock) flags.push(`<span class="vm-badge vm-badge--out">Sold out</span>`);

  return `
  <article class="vm-card" data-product-id="${escapeHtml(p.id)}">
    <div class="vm-card__media">
      <a href="${href}" aria-label="${escapeHtml(p.name)}">
        <img class="vm-card__img" src="${resolveImage(p.image)}"
             alt="${escapeHtml(p.name)}" loading="lazy"
             onerror="imageFallback(this)">
      </a>
      ${flags.length ? `<div class="vm-card__flags">${flags.join("")}</div>` : ""}
      <button class="vm-card__wish ${p.is_in_wishlist ? "is-active" : ""}"
              data-wish="${escapeHtml(p.id)}"
              aria-label="${p.is_in_wishlist ? "Remove from wishlist" : "Save to wishlist"}">
        <i class="bi ${p.is_in_wishlist ? "bi-heart-fill" : "bi-heart"}"></i>
      </button>
      <button class="vm-card__add" data-add="${escapeHtml(p.id)}" ${outOfStock ? "disabled" : ""}>
        ${outOfStock ? "Sold out" : p.is_in_cart ? "In your bag" : "Add to bag"}
      </button>
    </div>

    ${p.brand ? `<div class="vm-card__brand">${escapeHtml(p.brand)}</div>` : ""}
    <a class="vm-card__name" href="${href}">${escapeHtml(p.name)}</a>

    ${
      Number(p.rating) > 0
        ? `<div class="vm-card__meta">${renderStars(p.rating)}
             <span class="vm-card__reviews">(${Number(p.reviews_count || 0)})</span>
           </div>`
        : ""
    }

    <div class="vm-card__prices">
      <span class="vm-card__price">${formatPrice(price)}</span>
      ${wasPrice ? `<span class="vm-card__was">${formatPrice(wasPrice)}</span>` : ""}
      ${off ? `<span class="vm-card__off">Save ${off}%</span>` : ""}
    </div>
  </article>`;
}

/**
 * Wires the add-to-bag and wishlist buttons inside a container. Called after
 * any grid is rendered.
 */
function bindProductCardActions(container) {
  if (!container) return;

  container.querySelectorAll("[data-add]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!Session.isLoggedIn()) {
        showToast("Sign in to start a bag.", "info");
        window.setTimeout(() => (window.location.href = resolvePath("login.html")), 900);
        return;
      }
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Adding...";
      try {
        await CartAPI.add(btn.dataset.add, 1);
        btn.textContent = "In your bag";
        showToast("Added to your bag", "success");
        refreshCounts();
      } catch (err) {
        btn.textContent = original;
        showApiError(err, "Couldn't add that to your bag.");
      } finally {
        btn.disabled = false;
      }
    });
  });

  container.querySelectorAll("[data-wish]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!Session.isLoggedIn()) {
        showToast("Sign in to save favourites.", "info");
        window.setTimeout(() => (window.location.href = resolvePath("login.html")), 900);
        return;
      }
      try {
        const result = await WishlistAPI.toggle(btn.dataset.wish);
        const saved = Boolean(result.in_wishlist);
        btn.classList.toggle("is-active", saved);
        btn.querySelector("i").className = saved ? "bi bi-heart-fill" : "bi bi-heart";
        btn.setAttribute("aria-label", saved ? "Remove from wishlist" : "Save to wishlist");
        showToast(saved ? "Saved to your wishlist" : "Removed from your wishlist", "success");
        refreshCounts();
      } catch (err) {
        showApiError(err, "Couldn't update your wishlist.");
      }
    });
  });
}

/* ============================ Badge counts =============================== */

/** Keeps the cart/wishlist numbers in the navbar current. */
async function refreshCounts() {
  if (!Session.isLoggedIn()) return;

  const paint = (el, value) => {
    if (!el) return;
    el.textContent = value > 99 ? "99+" : String(value);
    el.hidden = value <= 0;
  };

  try {
    const [cart, wish] = await Promise.all([
      CartAPI.count().catch(() => ({ units: 0 })),
      WishlistAPI.count().catch(() => ({ total_items: 0 })),
    ]);
    paint(document.getElementById("vmCartCount"), Number(cart.units || 0));
    paint(document.getElementById("vmWishCount"), Number(wish.total_items || 0));
  } catch {
    /* Counts are decorative — never block the page on them. */
  }
}

/* ============================== Layout init ============================== */

function initLayout({ transparentNav = false } = {}) {
  const navMount = document.getElementById("vmNavbar");
  const footMount = document.getElementById("vmFooter");
  if (navMount) navMount.innerHTML = navbarMarkup();
  if (footMount) footMount.innerHTML = footerMarkup();

  const nav = document.getElementById("vmNav");

  /* Nav is see-through over the hero, solid once the page scrolls. */
  const applyNavState = () => {
    const scrolled = window.scrollY > 24;
    if (!nav) return;
    nav.classList.toggle("vm-nav--solid", scrolled || !transparentNav);
    nav.classList.toggle("vm-nav--over", transparentNav && !scrolled);
  };
  applyNavState();
  window.addEventListener("scroll", applyNavState, { passive: true });

  /* Account dropdown */
  const account = document.getElementById("vmAccount");
  const toggle = document.getElementById("vmAccountToggle");
  if (account && toggle) {
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = account.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    document.addEventListener("click", () => {
      account.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") account.classList.remove("is-open");
    });
  }

  /* Mobile drawer */
  const drawer = document.getElementById("vmDrawer");
  const burger = document.getElementById("vmBurger");
  const setDrawer = (open) => {
    if (!drawer) return;
    drawer.classList.toggle("is-open", open);
    document.body.style.overflow = open ? "hidden" : "";
    if (burger) burger.setAttribute("aria-expanded", String(open));
  };
  if (burger) burger.addEventListener("click", () => setDrawer(true));
  document.querySelectorAll("[data-drawer-close]").forEach((el) =>
    el.addEventListener("click", () => setDrawer(false))
  );
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setDrawer(false);
  });

  /* Sign out (desktop menu + drawer) */
  ["vmSignOut", "vmSignOutMobile"].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener("click", () => Session.signOut());
  });

  refreshCounts();
  observeReveals();
}
