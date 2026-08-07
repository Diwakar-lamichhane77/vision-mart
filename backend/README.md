# Vision Mart — Eyewear E-commerce REST API

Production-ready Node.js/Express + MySQL backend for **Vision Mart**, an online eyewear store.
Built to plug straight into the accompanying Vision Mart storefront (adapted from the Bazario frontend).

**Backend only** — no frontend pages are served from this project.

---

## Tech Stack

| Concern | Package |
|---|---|
| Server | Express.js 4 |
| Database | MySQL 8 via `mysql2` (promise pool, parameterized queries) |
| Auth | JWT (`jsonwebtoken`) + `bcrypt`, separate secrets for customers and admins |
| Uploads | Multer (disk storage, image-only, 5 MB cap) |
| Validation | express-validator |
| Security | Helmet, CORS, centralized error handling |
| Logging | morgan |
| Config | dotenv |
| Dev | nodemon |

Requires **Node 18+** (uses the built-in `fetch` for payment gateways) and **MySQL 8+**
(uses recursive CTEs for zero-filled monthly reports).

---

## Quick Start

```bash
# 1. Install
npm install

# 2. Create the database and all 13 tables
mysql -u root -p < database/schema.sql

# 3. Configure
cp .env.example .env
#    then edit .env — at minimum set DB_PASSWORD, JWT_SECRET, JWT_ADMIN_SECRET

# 4. Load demo data (products, customers, orders, reviews, messages)
npm run seed

# 5. Run
npm run dev        # development, auto-reload
npm start          # production
```

Health check: `GET http://localhost:5000/api/health`

**Seeded logins**

| Role | Email | Password |
|---|---|---|
| Admin | `admin@visionmart.com` | `AdminPass123` |
| Customer | `john@example.com` | `Password123` |

All seeded customers share the password `Password123`. To create an admin on an unseeded
database: `npm run seed:admin -- "Admin Name" admin@example.com "StrongPass123"`
(there is no public admin-registration endpoint by design).

To wipe and reload demo data: `npm run seed -- --fresh` (refuses to run in production).

---

## Project Structure

```
vision-mart-backend/
├── config/
│   ├── db.js                 # MySQL connection pool
│   └── multer.js             # reusable upload factory + file cleanup
├── controllers/              # request handling, one file per resource
├── middleware/
│   ├── auth.js               # customer / admin / either / optional guards
│   ├── errorHandler.js       # centralized errors + 404
│   └── validate.js           # express-validator result handler
├── models/                   # raw parameterized SQL, one file per table group
├── routes/                   # Express routers
├── services/
│   ├── orderService.js       # transactional checkout with row locking
│   └── payments/             # pluggable gateway adapters (COD, eSewa, Khalti)
├── utils/                    # ApiError, asyncHandler, apiResponse, jwt, password, helpers
├── validators/               # express-validator chains
├── uploads/
│   ├── products/             # product images (served at /uploads/products/…)
│   └── categories/           # category images
├── database/
│   ├── schema.sql            # all 13 CREATE TABLE statements
│   ├── seed.js               # demo data
│   ├── seedAdmin.js          # create the first admin
│   ├── SAMPLE_REQUESTS.md    # curl examples for every endpoint
│   └── VisionMart.postman_collection.json
├── server.js
├── FRONTEND_CONTRACT.md      # exact API contract the storefront expects
└── .env.example
```

---

## API Overview

Base URL `http://localhost:5000`. Full details in
[`FRONTEND_CONTRACT.md`](FRONTEND_CONTRACT.md) and
[`database/SAMPLE_REQUESTS.md`](database/SAMPLE_REQUESTS.md).

| Area | Endpoints |
|---|---|
| **Auth** | `POST /api/auth/register` · `POST /api/auth/login` · `GET /api/auth/verify` · `GET|PUT /api/auth/profile` · `PUT /api/auth/change-password` |
| **Admin auth** | `POST /api/admin/login` · `GET /api/admin/profile` |
| **Categories** | `GET /api/categories` · `GET /api/categories/:id` · `POST|PUT|DELETE` (admin) |
| **Products** | `GET /api/products` (search/filter/sort/paginate) · `GET /api/products/filters` · `GET /api/products/:id` · `POST|PUT|DELETE` (admin) |
| **Cart** | `GET /api/cart` · `GET /api/cart/count` · `POST /api/cart` · `PUT|DELETE /api/cart/:productId` · `DELETE /api/cart` |
| **Wishlist** | `GET /api/wishlist` · `GET /api/wishlist/count` · `POST /api/wishlist` · `POST /api/wishlist/toggle` · `DELETE /api/wishlist/:productId` · `DELETE /api/wishlist` |
| **Orders** | `POST /api/orders` · `GET /api/orders` · `GET /api/orders/:id` · `PUT /api/orders/:id/cancel` · `PUT /api/orders/:id/status` (admin) · `DELETE /api/orders/:id` (admin) |
| **Payments** | `GET /api/payments/methods` · `POST /api/payments/initiate` · `POST /api/payments/verify` · `GET /api/payments/order/:orderId` · `GET /api/payments/esewa/success|failure` · `PUT /api/payments/:orderId/status` (admin) |
| **Reviews** | `GET /api/reviews/product/:productId` · `GET /api/reviews/my` · `POST /api/reviews` · `PUT|DELETE /api/reviews/:id` · `GET /api/reviews` (admin) |
| **Dashboard** | `GET /api/admin/dashboard` |
| **Reports** | `GET /api/reports/sales|inventory|customers|best-selling` |
| **Customers** | `GET /api/admin/users` · `GET /api/admin/users/:id` · `PUT /api/admin/users/:id/status` |
| **Contact** | `POST /api/contact` (public) · `GET /api/contact` · `GET /api/contact/:id` · `PUT /api/contact/:id/status` · `DELETE /api/contact/:id` (admin) |

### Response format

```json
{ "success": true,  "message": "Products fetched successfully.", "data": [ ] }
{ "success": false, "message": "Validation failed", "errors": [ { "field": "email", "message": "..." } ] }
```

List endpoints add `meta` (pagination, totals, summaries) beside `data`.

### Postman

Import `database/VisionMart.postman_collection.json` — 68 requests across 13 folders.
Run **Admin Auth → Admin Login** and **Customer Auth → Login** first; both auto-save their
tokens into collection variables, so every other request works immediately.

---

## Database

13 tables in [`database/schema.sql`](database/schema.sql): `admins`, `users`, `categories`,
`products`, `product_images`, `wishlist`, `cart`, `cart_items`, `orders`, `order_items`,
`payments`, `reviews`, `contact_messages` — with foreign keys, indexes and ENUM constraints.

Key referential choices:
- `order_items.product_id` is `ON DELETE SET NULL`, and each row stores a name/image/price
  **snapshot** — so deleting a product never corrupts historical orders.
- `products.category_id` is `ON DELETE RESTRICT` — the API returns a clear 400 rather than
  letting you orphan products.
- `cart_items` and `wishlist` have `UNIQUE(user/cart, product)` — adding twice updates
  rather than duplicating.

---

## Security Notes

- **Separate JWT secrets** for customers and admins, so a leaked customer token can never
  be replayed against admin routes (verified by test).
- **Passwords** hashed with bcrypt; hashes are never included in any response.
- **All SQL parameterized.** Injection attempts (`' OR 1=1--`, `'; DROP TABLE products;--`)
  were tested and return zero rows with tables intact. Only sort direction is interpolated,
  and strictly from a fixed whitelist.
- **Ownership violations return 404, not 403**, so resource ids can't be enumerated.
- **Checkout is transactional** with `SELECT … FOR UPDATE` row locks. Tested with 5
  simultaneous checkouts against 1 unit of stock: exactly one succeeded.
- **Prices and amounts always come from the database**, never the request body.
- **Internal errors return a generic message**; full detail (including SQL) goes only to
  the server log.
- **Blocking a customer** invalidates their existing token on the next request.
- **Mock payment mode refuses to run** when `NODE_ENV=production`.

### Before going live

1. Set strong, unique `JWT_SECRET` and `JWT_ADMIN_SECRET` values.
2. Set `NODE_ENV=production` and `PAYMENT_MOCK_MODE=false`.
3. Add real eSewa / Khalti credentials — **and test them.** The gateway integrations were
   only exercised in mock mode here (no network access to the providers, no merchant
   credentials), so treat the live paths as unverified.
4. Set `FRONTEND_URL` to your real storefront origin so CORS isn't left open.
5. Put the API behind HTTPS and consider adding rate limiting on the auth endpoints.
6. Change the seeded admin password.

---

## Build Progress

This backend is being generated **one module at a time**. Status so far:

- [x] **Module 1 — Project Setup & Foundation**
  - Folder structure, `package.json`, `.env.example`
  - MySQL schema (`database/schema.sql`) with all 13 tables, FKs, indexes
  - Reusable DB connection pool (`config/db.js`)
  - Centralized error handler + custom `ApiError` (`middleware/errorHandler.js`, `utils/ApiError.js`)
  - Standard API response helpers (`utils/apiResponse.js`)
  - `asyncHandler` wrapper for clean async controllers
  - express-validator result middleware (`middleware/validate.js`)
  - `server.js` with Helmet, CORS, Morgan, static `/uploads` serving, health check
- [x] **Module 2 — Authentication** (this delivery)
  - `users` / `admins` models (`models/userModel.js`, `models/adminModel.js`) — raw parameterized SQL, no injection surface
  - JWT helpers with **separate secrets for customers vs admins** (`utils/jwt.js`) so a leaked customer token can never be replayed as an admin token
  - bcrypt password hashing helper (`utils/password.js`)
  - Route guards: `requireCustomerAuth`, `requireAdminAuth`, `optionalCustomerAuth` (`middleware/auth.js`)
  - express-validator chains for register/login/profile/change-password (`validators/authValidators.js`)
  - Controllers + routes for `/api/auth/*` and `/api/admin/*` (register, login, profile, change-password)
  - **`GET /api/auth/verify`** — a unified endpoint (not in the original spec, added to match the frontend's single login-guard) that accepts either a customer or admin JWT and reports which
  - `database/seedAdmin.js` — CLI script to provision the first admin account (there is deliberately no public admin-registration endpoint)
  - **Verified end-to-end** against a real MySQL 8 instance: register, duplicate-email rejection, weak-password validation, login, wrong-password rejection, profile fetch/update, change-password, admin login, and cross-role token isolation (customer token rejected on admin routes and vice versa) all tested and passing
- [x] **Module 3 — Category Module** (this delivery)
  - Reusable Multer upload factory (`config/multer.js`) — disk storage, unique filenames, image-only filter (mimetype *and* extension), 5 MB limit, plus `deleteUploadedFile()` so replaced/deleted images don't orphan on disk. Module 4's products will reuse this.
  - Shared helpers (`utils/helpers.js`): `buildFileUrl()` converts the stored filename into an absolute URL (the frontend drops `category.image` straight into `<img src>`), and `slugify()` feeds the `categories.slug` UNIQUE column
  - `models/categoryModel.js` — parameterized SQL, with a `LEFT JOIN` that returns a live `products_count` per category
  - Full CRUD controller + routes: `GET /api/categories`, `GET /api/categories/:id` (both public), `POST`/`PUT`/`DELETE` (admin-only, multipart)
  - Auto-generated unique slugs (collision-safe: a second "Sunglasses" becomes `sunglasses-2`); slug regenerates on rename
  - **Delete guard**: refuses to delete a category that still has products, returning a clear 400 explaining how many, instead of leaking the raw `ON DELETE RESTRICT` foreign-key error
  - **Verified end-to-end** against real MySQL: create with image, duplicate-name 409, validation 422, rename + slug regen + old-image cleanup, delete guard with attached product, successful delete, `products_count` accuracy, 404/invalid-id handling, admin guard (401 for anonymous *and* for customer tokens), non-image upload rejection (400), and static `/uploads` serving (200)
- [x] **Module 4 — Product Module** (this delivery)
  - `models/productModel.js` — dynamic filter builder where every user **value** goes through a named placeholder; only sort direction is interpolated, and strictly from a `SORT_OPTIONS` whitelist
  - `rating`, `reviews_count`, `is_in_cart` and `is_in_wishlist` computed **in SQL** (AVG + EXISTS subqueries), so listing products stays one round-trip instead of N+1
  - `effective_price = COALESCE(discount_price, price)` — price sorting and min/max filtering use the price the customer actually pays, not the list price
  - Search across name/brand/description/color; filters for category, brand, color, frame_type, frame_material, lens_type, min/max price, in_stock, status
  - Sorts: `newest`, `oldest`, `price_low`, `price_high`, `popularity` (sold_count), `rating`, `name_asc`, `name_desc`
  - Pagination via `limit` + `page`, with `meta: { total, page, limit, total_pages }` alongside the flat `data` array the frontend expects
  - `GET /api/products/filters` — distinct brands/colors/frame types + price range, so the storefront builds filter dropdowns dynamically instead of hardcoding eyewear attributes
  - `GET /api/products/:id` includes the nested `reviews` array (fetched separately so it doesn't multiply rows and break the aggregates)
  - Admin CRUD with Multer image upload, old-image cleanup on replace/delete, SKU uniqueness guard, category-existence check, and discount-exceeds-price rejection
  - **Verified end-to-end** against real MySQL: 6 products across 3 categories; every filter and sort; anonymous vs logged-in flag differences; nested reviews; partial updates preserving untouched fields; discount clearing; pagination; SQL-injection attempts (`' OR 1=1--`, `'; DROP TABLE products;--`) returning 0 rows with the table intact; auth guards (401 for anonymous *and* customer tokens); image cleanup on delete; and **order-history safety** — deleting a product NULLs `order_items.product_id` while the name/price snapshot survives, so past orders still render
- [x] **Module 5 — Shopping Cart** (this delivery)
  - `models/cartModel.js` — auto-creates the user's cart row on first use; `INSERT ... ON DUPLICATE KEY UPDATE` means re-adding a product **increments** its quantity instead of creating a duplicate line
  - Routes address cart lines by **product id** (`PUT/DELETE /api/cart/:productId`), matching how the frontend already works — not by cart_item id
  - **Cumulative stock guard**: the check is against the total quantity that would end up in the cart, so repeated small adds can't creep past available stock
  - Stock is validated but **not decremented** here — reserving stock in carts would let anyone drain the catalogue with a cart they never buy. Stock moves at checkout (Module 7)
  - Cart shows **live prices**, while `price_at_add` preserves the original snapshot for reference
  - `meta.issues[]` surfaces stale-cart problems (out of stock, quantity now exceeds stock, product deactivated) with `checkout_ready` so the frontend can block checkout cleanly
  - `GET /api/cart/count` for a header badge without fetching the whole cart; `DELETE /api/cart` clears everything (idempotent)
  - **Verified end-to-end**: add/increment/update/remove/clear, cumulative stock guard, out-of-stock and inactive-product rejection, live price updates, stale-cart issue detection, **cross-user isolation** (a second customer could neither see nor delete another's items), and auth guards (401 for anonymous *and* admin tokens)
  - **Two bugs found and fixed during testing**: (1) `quantity: 0` was silently defaulting to 1 because `checkFalsy: true` treats 0 as absent — now explicitly rejected along with negatives and fractions; (2) `lines` is a reserved word in MySQL 8, breaking the count query
  - **Security fix**: the error handler was returning raw driver messages on 500s, leaking table/column names and query structure. Internal errors now return a generic message to the client while the full detail still goes to the server log
- [x] **Module 6 — Wishlist** (this delivery)
  - `models/wishlistModel.js` — `INSERT IGNORE` against the `UNIQUE(user_id, product_id)` constraint makes adds naturally duplicate-proof
  - **Idempotent add**: the frontend's heart button fires POST on every click with no way to know the item is already saved, so re-adding returns **200 + `already_existed: true`** rather than a 409 that would flash a spurious error in the UI
  - `POST /api/wishlist/toggle` — adds if absent, removes if present, returning `in_wishlist` so a heart icon can un-save on a second click
  - **Out-of-stock products are allowed** (saving for later is the whole point of a wishlist), but **inactive/delisted products are rejected** — those aren't coming back
  - Each row carries an `is_in_cart` flag (cross-referenced in SQL) plus `in_stock`, `rating`, and effective price, so the wishlist page can render "Already in cart" and stock state without extra requests
  - `GET /api/wishlist/count` for a header badge; `DELETE /api/wishlist` clears everything
  - **Verified end-to-end**: add / idempotent re-add / toggle both directions / remove / clear, out-of-stock allowed vs inactive rejected, `is_in_cart` cross-reference, error cases (404/422), auth guards (401 for anonymous *and* admin tokens), **cross-user isolation** (Jane could neither see, delete, nor be affected by John's wishlist), and the Module 4 `is_in_wishlist` flag round-tripping correctly against real wishlist data
- [x] **Module 7 — Checkout & Orders** (this delivery)
  - `services/orderService.js` — the whole checkout runs in **one database transaction**: order header, line items, stock decrement, `sold_count`, payment record and cart clearing either all commit or all roll back
  - **`SELECT ... FOR UPDATE` row locking prevents overselling.** Read-check-write on stock is a classic race: two shoppers buying the last frame would both read `stock=1`, both pass the check, and both decrement. Locking the product rows makes the second checkout wait and correctly see `stock=0`
  - **Prices are always taken from the database, never the request body** — a tampered payload claiming `price: 0.01` is ignored
  - Duplicate `product_id` lines in one payload are **merged** before the stock check, so the same product sent twice can't slip past it
  - Two checkout modes: omit `items` to buy the whole cart (cart is then cleared), or send `items` for "Buy Now" (**cart is deliberately left intact** — buying one thing shouldn't wipe everything else you saved)
  - `order_items` stores name/image/price **snapshots**, so historical orders stay readable after a product is renamed, repriced or deleted
  - **Status transition rules** (`ALLOWED_TRANSITIONS`): orders only move forward, `Delivered`/`Cancelled` are terminal. Without this an admin mis-click could "un-cancel" an order and silently double-decrement stock
  - Cancelling (customer *or* admin) **restores stock and rolls back `sold_count`**; a paid order flips to `Refunded`. Customers may only cancel while `Pending`/`Confirmed`; after that it's an admin decision
  - COD is auto-marked `Paid` when the order reaches `Delivered`
  - `DELETE /api/orders/:id` restricted to **cancelled orders only** — deleting a live order would destroy sales history and strand the decremented stock
  - Cross-user access returns **404, not 403**, so a customer can't probe which order ids exist
  - **Verified end-to-end**, including a real **concurrency test**: 5 simultaneous checkouts for 1 unit of stock → exactly 1 succeeded, 4 rejected, final stock 0, one `order_item` row. Also tested: full-cart vs Buy-Now, price tampering, duplicate merging, rollback leaving no orphan rows, stock restoration on cancel, every valid and invalid status transition, admin filters (status/payment/search), delete rules, and full access-control matrix (customer↔customer isolation, customer→admin routes, anonymous, admin→checkout)
- [x] **Module 8 — Payments (COD, eSewa, Khalti)** (this delivery)
  - `services/payments/` — a **pluggable gateway registry**. Adding a provider (Stripe, IMEPay, ConnectIPS…) means dropping in one file implementing `{name, label, requiresRedirect, initiate, verify}` and registering it in `index.js`. No controller, route or model changes needed
  - `GET /api/payments/methods` — the checkout page renders available methods from server config instead of a hardcoded list, and can see which gateways are actually configured
  - **Payments are only marked Paid after server-to-server verification.** A browser redirect or widget token proves nothing on its own — anyone can hit a success URL with an invented reference id. The eSewa callback routes therefore only *report* what eSewa claimed and explicitly require a follow-up `/verify` call
  - **The charge always comes from the order record, never the request body** — a payload claiming `amount: 1` on a NPR 450 order still settles at 450. Khalti's response amount is additionally compared against the order total to catch a tampered widget
  - **Verification is idempotent** — a double-clicked button or a repeated gateway callback returns `already_verified: true` rather than settling twice
  - **COD cannot be self-verified by a customer.** It's settled by fulfilment (order reaching `Delivered`, handled in Module 7), not by an endpoint anyone can call
  - **Mock mode** (`PAYMENT_MOCK_MODE=true`, or auto when credentials are absent) lets the whole flow be exercised in development — and **hard-refuses to run when `NODE_ENV=production`**, so a misconfigured deploy can't silently mark orders paid
  - Gateway network failures return **502, not a failed payment** — an unreachable gateway is an unknown state, not a decline
  - Admin manual reconciliation (`PUT /api/payments/:orderId/status`) records an audit trail: which admin, when, and the previous status
  - **Verified end-to-end**: methods listing, initiate for all three gateways (eSewa's exact form fields, Khalti's paisa conversion 450→45000), successful verification with auto-advance `Pending → Confirmed`, idempotent re-verification, amount tampering rejected, COD self-verification blocked, cancelled orders unpayable, paid-order cancellation flipping to `Refunded`, admin reconciliation with audit trail, full access-control matrix (cross-customer 404, admin read, customer→admin 401, anonymous 401), and the production mock-mode refusal
  - ⚠️ **Not tested against live gateways.** eSewa/Khalti calls were exercised in mock mode only — this sandbox has no network access to their endpoints and I have no merchant credentials. The request/response shapes follow their published specs, but **you must test with real sandbox credentials before going live**
- [x] **Module 9 — Reviews** (this delivery)
  - `models/reviewModel.js` — one review per customer per product (enforced by the schema's UNIQUE key, checked in the controller so the response says "edit your existing review" instead of leaking a duplicate-key error)
  - **`verified_purchase` flag** computed per review — true when the reviewer has a *delivered* order containing that product. A trust signal that costs nothing extra, since it's a correlated subquery in the same fetch
  - **Ownership**: a customer may edit/delete only their own review. An admin may **delete** any review (moderation) but deliberately **cannot edit** one — silently rewriting a customer's words would be worse than removing an abusive review outright
  - Unauthorised access returns **404, not 403**, consistent with orders/payments, so review ids can't be probed
  - `GET /api/reviews/product/:productId` — public, paginated, with a **1–5 star breakdown** in `meta` for rating-distribution bars
  - Every write returns the recalculated `meta.product_rating`, saving the frontend a round-trip to refresh the star display
  - `GET /api/reviews/my` (customer) and `GET /api/reviews` (admin moderation, filterable by product/rating)
  - Optional `REVIEWS_REQUIRE_PURCHASE=true` gates reviewing to actual buyers. **Off by default** — the storefront lets any logged-in customer review from the product page, and enabling it would make that button fail for most visitors
  - **Verified end-to-end**: create, duplicate rejection (409), multi-customer aggregation (5★ + 3★ → 4.0 average propagating to `/api/products/:id`), `verified_purchase` flipping to true after delivery, full and partial edits, ownership enforcement (Jane blocked from John's review both ways), admin moderation list + delete, customer self-delete, rating recalculation on every change, validation (rating 0/6/3.5 all rejected, empty update body rejected), and cascade cleanup when a product is deleted
- [x] **Module 10 — Admin Dashboard & Reports** (this delivery)
  - **Revenue is defined carefully and applied consistently**: cancelled orders are *always* excluded (counting them would inflate revenue with sales that never happened), and two separate figures are reported — `total_revenue` (booked) and `collected_revenue` (payments actually settled). Conflating those hides a cash-flow problem
  - `GET /api/admin/dashboard` — every dashboard value in **one request** (totals, revenue breakdown, low stock, recent orders, monthly sales, best sellers, order pipeline) so the page doesn't fire six parallel calls. Independent aggregates run concurrently via `Promise.all`
  - **Monthly sales zero-fill empty months** using a recursive calendar CTE. A plain `GROUP BY` omits months with no orders, which makes a chart lie by compressing quiet periods
  - Four reports: `GET /api/reports/sales` (daily breakdown + payment-method split), `/inventory` (stock valuation + health per product), `/customers` (spend, AOV, signup trend), `/best-selling` (ranked by units from `order_items`, not the denormalised `sold_count`, so the figure stays right even if that counter drifts)
  - All reports accept `?from=&to=`, with `to` treated as **inclusive of the whole day** — an admin asking for "1st to 31st" means through the end of the 31st
  - `GET /api/admin/users` (+ `/:id`, `PUT /:id/status`) — customer management with per-customer order stats. **No delete endpoint by design**: `orders.user_id` is ON DELETE RESTRICT, so deleting a customer with history would fail or destroy sales records. Blocking achieves the intent without data loss
  - **Verified against hand-computed values**: with 4 orders totalling $1,200 of which one $500 order was cancelled, the API reported revenue **$700** (not $1,200), collected **$300**, Aviator units sold **5** (not 10), inventory valuation **$5,200**, per-customer spend John $500 / Jane $200 / Ravi $0, and "registered but never ordered" = 1. Also tested: blocking a customer instantly invalidates their existing token (403) *and* blocks re-login, date-range filtering incl. empty periods and invalid dates (422), custom low-stock thresholds, and the full access-control matrix across all 6 admin endpoints (anon 401, customer 401, admin 200) with the pre-existing `/api/admin/login|profile` routes still working after the new mounts
- [x] **Module 11 — Contact module, Seed Data, Postman Collection, final README**
  - Contact module (the last unused table): `POST /api/contact` is **public** so visitors can reach you without an account; the inbox, status updates and deletion are admin-only. Opening an unread message marks it read, as an inbox should
  - `database/seed.js` — 5 categories, 15 products (deliberately including 1 out-of-stock and 3 low-stock so the dashboard has something to show), 4 customers, 6 reviews, sample cart/wishlist, 6 orders spread across every status and dated over the past 20 days, and 3 contact messages. **One order is cancelled on purpose** so you can verify revenue excludes it
  - Seed is **idempotent** (skips if products exist) and `--fresh` **refuses to run in production**
  - `database/VisionMart.postman_collection.json` — 68 requests in 13 folders, with test scripts that auto-capture both tokens on login. **Every route in the collection was programmatically verified to resolve** against the running API — zero dead endpoints
  - `database/SAMPLE_REQUESTS.md` — curl examples for every endpoint plus a status-code reference
  - README rewritten as real documentation: quick start, structure, endpoint map, security notes, and a pre-launch checklist

**All 11 modules complete.**
