/**
 * admin/products.js
 * Product CRUD with image upload. Create and update are multipart, because
 * the backend takes the file through Multer on the same request.
 */

const P_PER_PAGE = 12;
let pState = { search: "", category: "", sort: "newest", page: 1 };
let pCategories = [];
let pEditing = null;

document.addEventListener("DOMContentLoaded", async () => {
  if (!(await initAdminPage({ title: "Products" }))) return;
  await loadCategories();
  wireProductUI();
  loadProducts();
});

async function loadCategories() {
  try {
    pCategories = await AdminCategoryAPI.list();
  } catch { pCategories = []; }

  const opts = pCategories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
  document.getElementById("pFilterCat").innerHTML = `<option value="">All categories</option>${opts}`;
  document.getElementById("pCategory").innerHTML = `<option value="">Choose a category</option>${opts}`;
}

function wireProductUI() {
  document.getElementById("pSearch").addEventListener("input", debounce((e) => {
    pState.search = e.target.value.trim(); pState.page = 1; loadProducts();
  }, 350));

  document.getElementById("pFilterCat").addEventListener("change", (e) => {
    pState.category = e.target.value; pState.page = 1; loadProducts();
  });
  document.getElementById("pSort").addEventListener("change", (e) => {
    pState.sort = e.target.value; pState.page = 1; loadProducts();
  });

  document.getElementById("newProduct").addEventListener("click", () => openProductModal(null));
  document.getElementById("pModalClose").addEventListener("click", closeProductModal);
  document.getElementById("pCancel").addEventListener("click", closeProductModal);
  document.getElementById("productForm").addEventListener("submit", saveProduct);

  // Live preview so the admin sees the file they picked before uploading.
  document.getElementById("pImage").addEventListener("change", (e) => {
    const file = e.target.files[0];
    const box = document.getElementById("pPreview");
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { box.innerHTML = `<img src="${ev.target.result}" alt="">`; };
    reader.readAsDataURL(file);
  });

  document.getElementById("productModal").addEventListener("click", (e) => {
    if (e.target.id === "productModal") closeProductModal();
  });
}

async function loadProducts() {
  const table = document.getElementById("pTable");
  table.querySelector("tbody")?.remove();
  table.insertAdjacentHTML("beforeend", tableSkeleton(6, 6));

  try {
    const { items, meta } = await AdminProductAPI.list({
      search: pState.search,
      category_id: pState.category,
      sort: pState.sort,
      page: pState.page,
      limit: P_PER_PAGE,
      // Admins must see inactive products too, not just the storefront view.
      status: "",
    });

    table.querySelector("tbody").remove();

    if (!items.length) {
      table.insertAdjacentHTML("beforeend", tableEmpty(6, {
        icon: "bi-eyeglasses", title: "No products found",
        body: pState.search ? `Nothing matches "${pState.search}".` : "Add your first product to get started.",
      }));
      document.getElementById("pPager").innerHTML = "";
      return;
    }

    table.insertAdjacentHTML("beforeend", `<tbody>${items.map(productRow).join("")}</tbody>`);
    bindProductRows();
    renderPager("pPager", meta, (page) => { pState.page = page; loadProducts(); });
  } catch (err) {
    table.querySelector("tbody")?.remove();
    table.insertAdjacentHTML("beforeend", tableEmpty(6, {
      icon: "bi-wifi-off", title: "Couldn't load products", body: err.message,
    }));
  }
}

function productRow(p) {
  const price = Number(p.discount_price ?? p.price);
  const stock = Number(p.stock);
  return `
  <tr data-row="${p.id}">
    <td><div class="vm-tcell">
      <div class="vm-tthumb"><img src="${resolveImage(p.image)}" alt="" loading="lazy" onerror="imageFallback(this)"></div>
      <div style="min-width:0">
        <div class="vm-tname">${escapeHtml(p.name)}</div>
        <div class="vm-tsub">${escapeHtml(p.brand || "—")}${p.sku ? ` · ${escapeHtml(p.sku)}` : ""}</div>
      </div>
    </div></td>
    <td>${escapeHtml(p.category?.name || "—")}</td>
    <td class="num">
      ${formatPrice(price)}
      ${p.discount_price ? `<div class="vm-tsub" style="text-decoration:line-through">${formatPrice(p.price)}</div>` : ""}
    </td>
    <td class="num"><span class="vm-chip-stock ${stock === 0 ? "is-out" : stock <= 5 ? "is-low" : ""}">${stock}</span></td>
    <td><span class="vm-status vm-status--${p.status === "active" ? "active" : "blocked"}">${escapeHtml(p.status)}</span></td>
    <td>
      <div class="vm-row-actions">
        <button class="vm-icon-act" data-edit="${p.id}" aria-label="Edit ${escapeHtml(p.name)}"><i class="bi bi-pencil"></i></button>
        <button class="vm-icon-act vm-icon-act--danger" data-del="${p.id}" aria-label="Delete ${escapeHtml(p.name)}"><i class="bi bi-trash3"></i></button>
      </div>
    </td>
  </tr>`;
}

function bindProductRows() {
  document.querySelectorAll("[data-edit]").forEach((b) =>
    b.addEventListener("click", () => openProductModal(b.dataset.edit)));
  document.querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", () => deleteProduct(b.dataset.del, b)));
}

async function openProductModal(id) {
  const form = document.getElementById("productForm");
  form.reset();
  clearFormErrors(form);
  document.getElementById("pPreview").innerHTML = `<i class="bi bi-image"></i>`;
  pEditing = null;

  if (id) {
    document.getElementById("pModalTitle").textContent = "Edit product";
    try {
      const p = await AdminProductAPI.get(id);
      pEditing = p;
      form.name.value = p.name || "";
      form.brand.value = p.brand || "";
      form.category_id.value = p.category_id || "";
      form.price.value = p.price ?? "";
      form.discount_price.value = p.discount_price ?? "";
      form.stock.value = p.stock ?? 0;
      form.sku.value = p.sku || "";
      form.frame_type.value = p.frame_type || "";
      form.frame_material.value = p.frame_material || "";
      form.lens_type.value = p.lens_type || "";
      form.color.value = p.color || "";
      form.status.value = p.status || "active";
      form.description.value = p.description || "";
      if (p.image) document.getElementById("pPreview").innerHTML =
        `<img src="${resolveImage(p.image)}" alt="" onerror="imageFallback(this)">`;
      document.getElementById("pImageHint").textContent = "Leave empty to keep the current image.";
    } catch (err) {
      showToast(err.message || "Couldn't load that product.", "error");
      return;
    }
  } else {
    document.getElementById("pModalTitle").textContent = "New product";
    document.getElementById("pImageHint").textContent = "JPG, PNG or WebP, up to 5 MB.";
    form.status.value = "active";
  }

  document.getElementById("productModal").classList.add("is-open");
  document.body.style.overflow = "hidden";
  form.name.focus();
}

function closeProductModal() {
  document.getElementById("productModal").classList.remove("is-open");
  document.body.style.overflow = "";
}

async function saveProduct(e) {
  e.preventDefault();
  const form = e.currentTarget;
  clearFormErrors(form);

  // Mirror the server's required fields so obvious mistakes never leave here.
  const problems = [];
  if (!form.name.value.trim()) problems.push(["name", "Enter a product name."]);
  if (!form.category_id.value) problems.push(["category_id", "Choose a category."]);
  if (form.price.value === "" || Number(form.price.value) < 0) problems.push(["price", "Enter a valid price."]);
  if (form.discount_price.value && Number(form.discount_price.value) > Number(form.price.value)) {
    problems.push(["discount_price", "Discount can't be higher than the price."]);
  }
  if (problems.length) {
    problems.forEach(([field, msg]) => {
      const input = form.querySelector(`[name="${field}"]`);
      input?.classList.add("is-invalid");
      const box = input?.closest(".vm-field")?.querySelector(".vm-field__error");
      if (box) box.textContent = msg;
    });
    form.querySelector(".is-invalid")?.focus();
    return;
  }

  const fd = new FormData();
  ["name","brand","category_id","price","stock","sku","frame_type","frame_material","lens_type","color","status","description"]
    .forEach((k) => { const v = form[k].value.trim?.() ?? form[k].value; if (v !== "") fd.append(k, v); });

  // An empty discount on edit clears it (the API treats "" as "remove").
  if (form.discount_price.value !== "") fd.append("discount_price", form.discount_price.value);
  else if (pEditing) fd.append("discount_price", "");

  const file = document.getElementById("pImage").files[0];
  if (file) fd.append("image", file);

  const btn = document.getElementById("pSave");
  setBtnBusy(btn, true);

  try {
    if (pEditing) await AdminProductAPI.update(pEditing.id, fd);
    else await AdminProductAPI.create(fd);

    showToast(pEditing ? "Product updated" : "Product created", "success");
    closeProductModal();
    loadProducts();
  } catch (err) {
    applyAdminErrors(form, err);
  } finally {
    setBtnBusy(btn, false);
  }
}

async function deleteProduct(id, btn) {
  const name = btn.closest("tr")?.querySelector(".vm-tname")?.textContent || "this product";
  if (!confirm(`Delete ${name}? Past orders keep their record, but it disappears from the shop.`)) return;

  btn.disabled = true;
  try {
    await AdminProductAPI.remove(id);
    showToast("Product deleted", "info");
    loadProducts();
  } catch (err) {
    btn.disabled = false;
    showToast(err.message || "Couldn't delete that product.", "error");
  }
}
