/**
 * home.js
 * ---------------------------------------------------------------------------
 * Home page controller. Nothing on this page is hardcoded product data — the
 * category tiles and all three product rails come from the API.
 *
 * The three rails ask the same endpoint for different slices:
 *   Trending     GET /products?sort=popularity
 *   Best sellers GET /products?sort=rating
 *   New arrivals GET /products?sort=newest
 * ---------------------------------------------------------------------------
 */

document.addEventListener("DOMContentLoaded", () => {
  initLayout({ transparentNav: true });

  // Rails load in parallel — one slow response shouldn't hold up the others.
  loadCategories();
  loadRail("trendingGrid", { sort: "popularity" }, "product");
  loadRail("bestSellersGrid", { sort: "rating" }, "product");
  loadRail("newArrivalsGrid", { sort: "newest" }, "product");

  bindNewsletter();
});

/* ============================== CATEGORIES =============================== */

async function loadCategories() {
  const grid = document.getElementById("categoryGrid");
  if (!grid) return;

  showSkeletons(grid, 4, "category");

  try {
    const categories = await CategoryAPI.getAll({ status: "active" });

    if (!categories.length) {
      showEmpty(grid, {
        icon: "bi-grid",
        title: "No categories yet",
        body: "Once categories are added they'll appear here.",
        action: `<a class="vm-btn vm-btn--outline vm-btn--sm" href="${resolvePath("shop.html")}">Browse all eyewear</a>`,
      });
      return;
    }

    // Four tiles read best in the grid; the rest live on the categories page.
    grid.innerHTML = categories
      .slice(0, 4)
      .map((c, i) => {
        const count = Number(c.products_count || 0);
        return `
        <a class="vm-cat" href="${resolvePath("shop.html")}?category=${encodeURIComponent(c.id)}"
           data-reveal data-delay="${Math.min(i, 3)}">
          <img class="vm-cat__img" src="${resolveImage(c.image, "CATEGORIES")}"
               alt="${escapeHtml(c.name)}" loading="lazy" onerror="imageFallback(this)">
          <span class="vm-cat__veil"></span>
          <span class="vm-cat__body">
            <span class="vm-cat__name">${escapeHtml(c.name)}</span>
            <span class="vm-cat__count">${count} ${count === 1 ? "style" : "styles"}</span>
          </span>
        </a>`;
      })
      .join("");

    observeReveals(grid);
  } catch (err) {
    console.error(err);
    showEmpty(grid, {
      icon: "bi-wifi-off",
      title: "Couldn't load categories",
      body: "Check that the API is running, then reload the page.",
    });
  }
}

/* ============================ PRODUCT RAILS ============================== */

/**
 * Fills one product grid/rail.
 * @param {string} mountId  element id to render into
 * @param {object} params   query params (sort, category, etc.)
 */
async function loadRail(mountId, params, skeletonVariant = "product") {
  const mount = document.getElementById(mountId);
  if (!mount) return;

  showSkeletons(mount, 4, skeletonVariant);

  try {
    const { items } = await ProductAPI.getAll({
      limit: CONFIG.HOME_RAIL_LIMIT,
      ...params,
    });

    if (!items.length) {
      showEmpty(mount, {
        icon: "bi-eyeglasses",
        title: "Nothing here yet",
        body: "New frames are added every week — check back soon.",
        action: `<a class="vm-btn vm-btn--outline vm-btn--sm" href="${resolvePath("shop.html")}">Browse all eyewear</a>`,
      });
      return;
    }

    mount.innerHTML = items.map(productCardMarkup).join("");
    bindProductCardActions(mount);
  } catch (err) {
    console.error(err);
    showEmpty(mount, {
      icon: "bi-wifi-off",
      title: "Couldn't load products",
      body: "The store is unreachable right now. Reload to try again.",
      action: `<button class="vm-btn vm-btn--outline vm-btn--sm" onclick="window.location.reload()">Reload</button>`,
    });
  }
}

/* =============================== NEWSLETTER ============================== */

function bindNewsletter() {
  const form = document.getElementById("newsletterForm");
  if (!form) return;

  const input = form.querySelector("input[type='email']");
  const button = form.querySelector("button");

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    if (!Validate.email(input.value)) {
      input.setAttribute("aria-invalid", "true");
      showToast("Enter a valid email address.", "error");
      input.focus();
      return;
    }
    input.removeAttribute("aria-invalid");

    // No subscriber endpoint exists on the backend yet, so this confirms
    // locally rather than pretending a request was made.
    button.disabled = true;
    button.textContent = "Subscribed";
    input.value = "";
    showToast("You're on the list. Look out for first access to new frames.", "success");

    window.setTimeout(() => {
      button.disabled = false;
      button.textContent = "Subscribe";
    }, 2600);
  });
}
