# Vision Mart — Frontend

Premium eyewear storefront + admin panel.
HTML5 · CSS3 · Bootstrap 5.3 · vanilla ES6 · Fetch API. No build step.

---

## Getting it running

There are exactly three things to do.

### 1. Point the frontend at your API

Everything environment-specific lives in **`js/config.js`**:

```js
API_BASE_URL:   "http://localhost:5000/api",
ASSET_BASE_URL: "http://localhost:5000",
```

Change these if your Express server runs elsewhere. Nothing else hardcodes a URL.

### 2. Set `FRONTEND_URL` in the backend `.env`

CORS is locked to a single origin, so the backend must know where the frontend
is served from. With Live Server's default port:

```env
FRONTEND_URL=http://localhost:5500
```

**If this doesn't match, every request is blocked and the site will look
broken.** It's the most common setup mistake.

### 3. Serve it over HTTP

Right-click `index.html` → **Open with Live Server**, or:

```bash
python3 -m http.server 8080
```

Opening the files directly (`file://`) will not work — `fetch` and CORS both
require a real HTTP origin.

That's it. Add categories and products through `pages/admin/`, upload their
images there, and the storefront fills itself.

---

## Structure

```
vm-frontend/
├── index.html                 Home
├── 404.html                   Not found
├── css/
│   ├── variables.css          Design tokens (colour, type, spacing, motion)
│   ├── base.css               Reset, typography, buttons, toasts, skeletons
│   ├── components.css         Shared forms, alerts, spinners, status pills
│   ├── navbar.css  footer.css
│   ├── home.css  shop.css  product.css  cart.css  checkout.css
│   └── auth.css  profile.css  admin.css
├── js/
│   ├── config.js              URLs, storage keys, placeholder image
│   ├── utils.js               Session, formatting, images, toasts, form helpers
│   ├── api.js                 Every customer-side network call
│   ├── components.js          Navbar, footer, product card, badge counts
│   ├── home.js  categories.js  shop.js  product.js
│   ├── cart.js  wishlist.js  checkout.js  orders.js
│   ├── auth.js  profile.js  contact.js
│   └── admin/
│       ├── core.js            Admin session, API, sidebar, role guard
│       └── login.js  dashboard.js  products.js  categories.js  orders.js  users.js
└── pages/
    ├── shop.html  categories.html  product.html
    ├── cart.html  wishlist.html  checkout.html  orders.html
    ├── login.html  register.html  profile.html  contact.html
    └── admin/  login · dashboard · products · categories · orders · users
```

### Script order

`config.js → utils.js → api.js → components.js → <page>.js`

`utils.js` defines `Session`, which `api.js` calls when a token expires, so it
must load first. Admin pages load `admin/core.js` instead of `components.js`.

---

## How it hangs together

**Sessions are separate.** Customer tokens (`vm_token`) are signed with
`JWT_SECRET`; admin tokens (`vm_admin_token`) with `JWT_ADMIN_SECRET`. They are
not interchangeable, so they're stored under different keys — you can be signed
into the shop and the admin panel in the same browser without either breaking
the other.

**Role checks are server-verified.** Admin pages call `GET /auth/verify` and
check `is_admin`; a customer token pasted into storage won't open the panel.

**Nothing is hardcoded.** Every product, category, order, review and customer
is fetched. Missing images fall back to an inline SVG placeholder, so an empty
catalogue looks intentional rather than broken.

**Prices always come from the server.** No cart or order request sends a price
or total — the backend computes them from the database.

---

## Things the backend doesn't store

These are surfaced honestly in the UI rather than faked:

| Feature | Reality |
|---|---|
| Shipping cost | Not in the API. Shown as an **estimate** (Rs. 150, free over Rs. 10,000) and labelled as such. Rules live in one constant at the top of `cart.js` / `checkout.js`. |
| Coupon codes | No endpoint. The code is recorded on the order and the total **doesn't change** — the copy says the store applies discounts before dispatch. |
| Billing address | No column. Folded into the order's `notes` so it still reaches you. |
| Profile avatar | No column. A monogram is generated from the name; no upload is offered. |
| Email changes | The server ignores email on `PUT /auth/profile`, so the field is read-only with an explanation. |
| Password reset | No endpoint. "Forgot password" explains this and points to support. |
| Product galleries | The API returns one `image`. The gallery is built from an array, so if you add an `images[]` field later, thumbnails appear with no frontend change. |

---

## Notes

- **Live Server port** — remember to update `FRONTEND_URL` if it isn't 5500.
- **`404.html`** is a static page. Live Server won't route unknown URLs to it
  automatically; on a real host, point the 404 handler at it.
- Reveal animations are scoped to `.js`, so the page stays readable if scripts
  fail. `prefers-reduced-motion` is respected throughout.
- Every value interpolated into `innerHTML` passes through `escapeHtml()`.
