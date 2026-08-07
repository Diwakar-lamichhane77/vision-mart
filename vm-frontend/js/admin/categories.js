/**
 * admin/categories.js
 * Category CRUD. Deleting a category with products attached is refused by the
 * server (products.category_id is ON DELETE RESTRICT) — the message explains
 * that rather than showing a generic failure.
 */

let cList = [];
let cEditing = null;

document.addEventListener("DOMContentLoaded", async () => {
  if (!(await initAdminPage({ title: "Categories" }))) return;
  wireCategoryUI();
  loadCategories();
});

function wireCategoryUI() {
  document.getElementById("cSearch").addEventListener("input", debounce(render, 250));
  document.getElementById("newCategory").addEventListener("click", () => openCategoryModal(null));
  document.getElementById("cModalClose").addEventListener("click", closeCategoryModal);
  document.getElementById("cCancel").addEventListener("click", closeCategoryModal);
  document.getElementById("categoryForm").addEventListener("submit", saveCategory);

  document.getElementById("cImage").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      document.getElementById("cPreview").innerHTML = `<img src="${ev.target.result}" alt="">`;
    };
    reader.readAsDataURL(file);
  });

  document.getElementById("categoryModal").addEventListener("click", (e) => {
    if (e.target.id === "categoryModal") closeCategoryModal();
  });
}

async function loadCategories() {
  const table = document.getElementById("cTable");
  table.querySelector("tbody")?.remove();
  table.insertAdjacentHTML("beforeend", tableSkeleton(5, 5));

  try {
    cList = await AdminCategoryAPI.list();
    render();
  } catch (err) {
    table.querySelector("tbody")?.remove();
    table.insertAdjacentHTML("beforeend", tableEmpty(5, {
      icon: "bi-wifi-off", title: "Couldn't load categories", body: err.message,
    }));
  }
}

function render() {
  const table = document.getElementById("cTable");
  const term = document.getElementById("cSearch").value.trim().toLowerCase();
  const rows = term
    ? cList.filter((c) => c.name.toLowerCase().includes(term) ||
        String(c.description || "").toLowerCase().includes(term))
    : cList;

  table.querySelector("tbody")?.remove();

  if (!rows.length) {
    table.insertAdjacentHTML("beforeend", tableEmpty(5, {
      icon: "bi-grid", title: term ? "No categories match" : "No categories yet",
      body: term ? `Nothing matches "${term}".` : "Create a category before adding products.",
    }));
    document.getElementById("cCount").textContent = "";
    return;
  }

  document.getElementById("cCount").textContent = `${rows.length} of ${cList.length}`;
  table.insertAdjacentHTML("beforeend", `<tbody>${rows.map(categoryRow).join("")}</tbody>`);

  document.querySelectorAll("[data-cedit]").forEach((b) =>
    b.addEventListener("click", () => openCategoryModal(b.dataset.cedit)));
  document.querySelectorAll("[data-cdel]").forEach((b) =>
    b.addEventListener("click", () => deleteCategory(b.dataset.cdel, b)));
}

function categoryRow(c) {
  const count = Number(c.products_count || 0);
  return `
  <tr>
    <td><div class="vm-tcell">
      <div class="vm-tthumb"><img src="${resolveImage(c.image, "CATEGORIES")}" alt="" loading="lazy" onerror="imageFallback(this)"></div>
      <div><div class="vm-tname">${escapeHtml(c.name)}</div>
      <div class="vm-tsub">${escapeHtml(c.slug || "")}</div></div>
    </div></td>
    <td>${c.description ? escapeHtml(String(c.description).slice(0, 70)) + (String(c.description).length > 70 ? "…" : "") : "<span class='vm-tsub'>—</span>"}</td>
    <td class="num">${count}</td>
    <td><span class="vm-status vm-status--${c.status === "active" ? "active" : "blocked"}">${escapeHtml(c.status)}</span></td>
    <td>
      <div class="vm-row-actions">
        <button class="vm-icon-act" data-cedit="${c.id}" aria-label="Edit ${escapeHtml(c.name)}"><i class="bi bi-pencil"></i></button>
        <button class="vm-icon-act vm-icon-act--danger" data-cdel="${c.id}"
                aria-label="Delete ${escapeHtml(c.name)}" ${count ? 'title="Has products attached"' : ""}>
          <i class="bi bi-trash3"></i>
        </button>
      </div>
    </td>
  </tr>`;
}

function openCategoryModal(id) {
  const form = document.getElementById("categoryForm");
  form.reset();
  clearFormErrors(form);
  document.getElementById("cPreview").innerHTML = `<i class="bi bi-image"></i>`;
  cEditing = null;

  if (id) {
    const c = cList.find((x) => String(x.id) === String(id));
    if (!c) return;
    cEditing = c;
    document.getElementById("cModalTitle").textContent = "Edit category";
    form.name.value = c.name || "";
    form.description.value = c.description || "";
    form.status.value = c.status || "active";
    if (c.image) document.getElementById("cPreview").innerHTML =
      `<img src="${resolveImage(c.image, "CATEGORIES")}" alt="" onerror="imageFallback(this)">`;
    document.getElementById("cImageHint").textContent = "Leave empty to keep the current image.";
  } else {
    document.getElementById("cModalTitle").textContent = "New category";
    document.getElementById("cImageHint").textContent = "JPG, PNG or WebP, up to 5 MB.";
    form.status.value = "active";
  }

  document.getElementById("categoryModal").classList.add("is-open");
  document.body.style.overflow = "hidden";
  form.name.focus();
}

function closeCategoryModal() {
  document.getElementById("categoryModal").classList.remove("is-open");
  document.body.style.overflow = "";
}

async function saveCategory(e) {
  e.preventDefault();
  const form = e.currentTarget;
  clearFormErrors(form);

  const name = form.name.value.trim();
  if (name.length < 2) {
    form.name.classList.add("is-invalid");
    form.name.closest(".vm-field").querySelector(".vm-field__error").textContent =
      "Category name must be at least 2 characters.";
    form.name.focus();
    return;
  }

  const fd = new FormData();
  fd.append("name", name);
  if (form.description.value.trim()) fd.append("description", form.description.value.trim());
  fd.append("status", form.status.value);
  const file = document.getElementById("cImage").files[0];
  if (file) fd.append("image", file);

  const btn = document.getElementById("cSave");
  setBtnBusy(btn, true);

  try {
    if (cEditing) await AdminCategoryAPI.update(cEditing.id, fd);
    else await AdminCategoryAPI.create(fd);

    showToast(cEditing ? "Category updated" : "Category created", "success");
    closeCategoryModal();
    loadCategories();
  } catch (err) {
    // 409 = duplicate name; point at the field rather than a vague toast.
    if (err.status === 409) {
      form.name.classList.add("is-invalid");
      form.name.closest(".vm-field").querySelector(".vm-field__error").textContent =
        "A category with this name already exists.";
      return;
    }
    applyAdminErrors(form, err);
  } finally {
    setBtnBusy(btn, false);
  }
}

async function deleteCategory(id, btn) {
  const c = cList.find((x) => String(x.id) === String(id));
  const count = Number(c?.products_count || 0);

  // Explain up front instead of letting the server refuse it.
  if (count > 0) {
    showToast(
      `${c.name} still has ${count} product${count === 1 ? "" : "s"}. Move or delete them first.`,
      "error"
    );
    return;
  }
  if (!confirm(`Delete the "${c?.name}" category?`)) return;

  btn.disabled = true;
  try {
    await AdminCategoryAPI.remove(id);
    showToast("Category deleted", "info");
    loadCategories();
  } catch (err) {
    btn.disabled = false;
    showToast(err.message || "Couldn't delete that category.", "error");
  }
}
