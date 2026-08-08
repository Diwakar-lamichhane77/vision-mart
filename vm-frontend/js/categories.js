/**
 * categories.js
 * Category index. Everything comes from GET /categories — no hardcoded names,
 * counts or images.
 */
document.addEventListener("DOMContentLoaded", () => {
  initLayout();
  loadCategories();
});

async function loadCategories() {
  const grid = document.getElementById("catGrid");
  showSkeletons(grid, 6, "category");

  try {
    const categories = await CategoryAPI.getAll({ status: "active" });

    if (!categories.length) {
      showEmpty(grid, {
        icon: "bi-grid",
        title: "No categories yet",
        body: "Categories appear here once they're added in the admin panel.",
        action: `<a class="vm-btn vm-btn--outline vm-btn--sm" href="shop.html">Browse all eyewear</a>`,
      });
      return;
    }

    document.getElementById("catCount").textContent =
      `${categories.length} categor${categories.length === 1 ? "y" : "ies"}`;

    grid.innerHTML = categories
      .map((c, i) => {
        const count = Number(c.products_count || 0);
        return `
        <a class="vm-cat" href="shop.html?category=${encodeURIComponent(c.id)}"
           data-reveal data-delay="${Math.min(i, 3)}">
          <img class="vm-cat__img" src="${resolveImage(c.image, "CATEGORIES")}"
               alt="${escapeHtml(c.name)}" loading="lazy" onerror="imageFallback(this)">
          <span class="vm-cat__veil"></span>
          <span class="vm-cat__body">
            <span class="vm-cat__name">${escapeHtml(c.name)}</span>
            <span class="vm-cat__count">${count} ${count === 1 ? "style" : "styles"}</span>
            ${c.description ? `<span class="vm-cat__desc">${escapeHtml(c.description)}</span>` : ""}
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
      body: "The store is unreachable right now.",
      action: `<button class="vm-btn vm-btn--outline vm-btn--sm" onclick="window.location.reload()">Try again</button>`,
    });
  }
}
