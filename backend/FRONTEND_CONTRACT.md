# Vision Mart — Frontend Integration Contract

This is the exact API contract the reworked Bazario frontend now expects.
Every backend module I build from here on must match this precisely.

`baseUrl` in `assets/js/utils.js` is `http://localhost:5000` — update it for production.

## Auth
| Method | Path | Body | Notes |
|---|---|---|---|
| POST | /api/auth/register | `{name,email,password}` | |
| POST | /api/auth/login | `{email,password}` | data: `{user, token}` |
| POST | /api/admin/login | `{email,password}` | data: `{admin, token}`. Login form tries customer login first, falls back to this. |
| GET | /api/auth/verify | — (Bearer token) | **New, not in original spec.** Accepts either a customer or admin JWT and returns `data: {is_admin: bool, user: {...}}`. Powers the login-guard middleware on both admin pages and the login/register redirect check. |
| GET | /api/auth/profile | — | data: `{user}` |
| PUT | /api/auth/profile | `{name,phone,address}` | data: `{user}` |
| PUT | /api/auth/change-password | `{current_password,new_password}` | not yet wired into the UI |

## Categories — ✅ implemented (Module 3)
`GET/POST /api/categories`, `GET/PUT/DELETE /api/categories/:id` — POST/PUT/DELETE admin-only, multipart (`name`, `image` file, optional `description`, `status`).

`GET` responses return a flat array; each category is:
```json
{ "id": 1, "name": "Sunglasses", "slug": "sunglasses", "description": "...",
  "image": "http://localhost:5000/uploads/categories/category-123.png",
  "status": "active", "products_count": 4, "created_at": "...", "updated_at": "..." }
```
`image` is an **absolute URL** (the frontend uses it directly as `<img src>`); the DB stores only the filename. `GET /api/categories?status=active` filters out disabled categories. DELETE returns 400 if products are still assigned to the category.

## Products — ✅ implemented (Module 4)
`GET /api/products` → **flat array** in `data`, plus `meta: {total, page, limit, total_pages}`.

Query params: `search`, `category_id`, `brand`, `color`, `frame_type`, `frame_material`, `lens_type`, `min_price`, `max_price`, `in_stock=true`, `status`, `sort`, `limit`, `page`.
Sort values: `newest` (default), `oldest`, `price_low`, `price_high`, `popularity`, `rating`, `name_asc`, `name_desc`.

Each product:
`id, category_id, name, brand, description, price, discount_price, effective_price, frame_type, frame_material, lens_type, color, stock, image (absolute URL), sku, sold_count, status, category:{id,name,slug}, rating, reviews_count, is_in_cart, is_in_wishlist, created_at, updated_at`

`is_in_cart`/`is_in_wishlist` are real booleans, computed per-user when a customer Bearer token is sent (anonymous requests always get `false`). `rating` is the average review score (0 when unreviewed). Price sorting/filtering uses `effective_price` (the discounted price when one exists).

`GET /api/products/:id` → same shape plus `reviews:[{id,rating,comment,created_at,updated_at,user:{id,name}}]`.
`GET /api/products/filters` → `{brands[], colors[], frame_types[], frame_materials[], lens_types[], min_price, max_price}` for building filter UI.

`POST /api/products` and `PUT /api/products/:id` — admin-only, multipart, same field names (note: `stock`, not `stock_quantity`). Send `discount_price=""` on PUT to clear an existing discount.
`DELETE /api/products/:id` — admin-only. Safe for order history: `order_items.product_id` becomes NULL but the stored name/image/price snapshot keeps past orders intact.

## Cart — ✅ implemented (Module 5)
All routes require a **customer** token (admin tokens are rejected).
- `GET /api/cart` → `data: [{id, quantity, unit_price, subtotal, price_at_add, product:{id,name,brand,price,original_price,discount_price,image,stock,status,category}, created_at, updated_at}]`, plus `meta: {total_items, total_units, subtotal, total, issues[], checkout_ready}`
- `POST /api/cart` `{product_id, quantity?}` — quantity defaults to 1; re-adding an existing product **increments** it. Returns the full updated cart.
- `PUT /api/cart/:productId` `{quantity}` — **route param is the product_id**, not the cart_item id. Sets an absolute quantity.
- `DELETE /api/cart/:productId` — remove one line. `DELETE /api/cart` — clear the whole cart.
- `GET /api/cart/count` → `{lines, units}` for a header badge.

`product.price` is the **effective** (discounted) price the frontend should multiply out; `original_price` and `discount_price` are also provided. Stock is validated on add/update (cumulatively) but only decremented at checkout. `meta.issues[]` flags `out_of_stock` / `insufficient_stock` / `unavailable` lines, and `checkout_ready` is false whenever any exist.

## Wishlist — ✅ implemented (Module 6)
All routes require a **customer** token.
- `GET /api/wishlist` → `data: [{id, added_at, is_in_cart, product:{id,name,brand,price,original_price,discount_price,image,stock,status,in_stock,rating,category}}]`, plus `meta: {total_items, available_items}`
- `POST /api/wishlist` `{product_id}` — **idempotent**: adding an already-saved product returns 200 with `meta.already_existed = true` (not 409), so a heart button can fire freely. New adds return 201.
- `POST /api/wishlist/toggle` `{product_id}` → `{in_wishlist, total_items}` — add/remove in one call for a toggling heart icon.
- `DELETE /api/wishlist/:productId` — **route param is the product_id**. `DELETE /api/wishlist` clears all.
- `GET /api/wishlist/count` → `{total_items}`.

Out-of-stock products **can** be wishlisted (that's the point); inactive/delisted products cannot (400).

## Payments — ✅ implemented (Module 8)
- `GET /api/payments/methods` — **public**. `[{method, label, requires_redirect, configured, mock}]`. Render checkout options from this rather than hardcoding.
- `POST /api/payments/initiate` `{order_id}` — customer. Returns a gateway-specific descriptor:
  - **COD** → `{requires_redirect:false, message}` — nothing more to do, order is placed.
  - **eSewa** → `{requires_redirect:true, redirect_url, redirect_method:"POST", fields:{...}}` — build an HTML form with `fields` and submit it to `redirect_url`.
  - **Khalti** → `{requires_redirect:false, amount_in_paisa, public_key, product_identity, product_name}` — feed into the Khalti widget.
- `POST /api/payments/verify` `{order_id, transaction_id}` (eSewa refId) or `{order_id, token}` (Khalti) — customer. **This is what actually settles the payment.** On success the order advances `Pending → Confirmed`. Returns `{payment, order_status, already_verified}`.
- `GET /api/payments/order/:orderId` — owning customer or admin.
- `GET /api/payments/esewa/success|failure` — where eSewa redirects the browser. **Informational only**; the frontend must still call `/verify`.
- `PUT /api/payments/:orderId/status` `{payment_status, transaction_id?}` — **admin only**, manual reconciliation.

Any `amount` sent by the client is ignored — the charge always comes from the order record. Verification is idempotent. COD cannot be verified via this endpoint; it settles when the order is marked `Delivered`.

## Orders — ✅ implemented (Module 7)
- `POST /api/orders` — **customer only**. Body: `{shipping_name, shipping_phone, shipping_address, shipping_city?, payment_method: "COD"|"eSewa"|"Khalti", notes?, items?: [{product_id, quantity}]}`
  - Omit `items` → order is built from the cart, and the cart is cleared.
  - Send `items` ("Buy Now") → the cart is left untouched.
  - Prices come from the database; any price sent by the client is ignored.
- `GET /api/orders` — customers see only their own; admins see all. Filters: `status`, `payment_method`, `from`, `to`, `limit`, `page`, plus `search` (admin only). Returns `meta: {total, page, limit, total_pages}`.
- `GET /api/orders/:id` — same scoping; a customer requesting another's order gets **404**.
- `PUT /api/orders/:id/cancel` `{reason?}` — customer (while `Pending`/`Confirmed`) or admin (any non-terminal). Restores stock.
- `PUT /api/orders/:id/status` `{status, cancelled_reason?}` — **admin only**, forward transitions only.
- `DELETE /api/orders/:id` — **admin only**, and only for `Cancelled` orders.

Order shape:
```json
{ "id":1, "order_number":"VM-20260805-9404", "status":"Pending", "total_amount":420,
  "payment_method":"COD", "payment_status":"Pending", "transaction_id":null,
  "shipping_name":"...", "shipping_phone":"...", "shipping_address":"...", "shipping_city":"...",
  "notes":null, "cancelled_reason":null, "can_cancel":true,
  "items":[{"id":1,"product_id":14,"product_name":"...","product_image":"http://...","quantity":2,
            "price":120,"subtotal":240,"product":{"id":14,"name":"...","image":"http://..."}}],
  "items_count":2, "user":{"id":1,"name":"...","email":"...","phone":"..."},
  "created_at":"...", "updated_at":"..." }
```
Statuses: `Pending → Confirmed → Packed → Shipped → Out for Delivery → Delivered`, with `Cancelled` reachable from any non-delivered state. `can_cancel` tells the frontend whether to show a Cancel button. Order items keep name/image snapshots, so `product_id` may be `null` if the product was later deleted.

## Reviews — ✅ implemented (Module 9)
- `POST /api/reviews` `{product_id, rating (1–5), comment?}` — customer. **409** if they've already reviewed that product (edit instead).
- `PUT /api/reviews/:id` `{rating?, comment?}` — **owner only**; at least one field required. Admins cannot edit customer reviews.
- `DELETE /api/reviews/:id` — owning customer **or** admin (moderation).
- `GET /api/reviews/product/:productId` — **public**, paginated. `data:[{id, rating, comment, verified_purchase, user:{id,name}, created_at, updated_at}]`, `meta:{total, average, breakdown:{1..5}, page, limit, total_pages}`.
- `GET /api/reviews/my` — customer's own reviews, each with its product.
- `GET /api/reviews` — **admin only** moderation list; filters `product_id`, `rating`, `limit`, `page`.

Reviews also still come nested on `GET /api/products/:id`. Every create/update/delete returns the recalculated `meta.product_rating` (`{total, average, breakdown}`) so the star display can refresh without a second request. `verified_purchase` is true when the reviewer has a **Delivered** order containing that product. Non-owners get **404**, not 403.

## Admin dashboard, reports & users — ✅ implemented (Module 10)
All admin-only (401 for anonymous and customer tokens).

- `GET /api/admin/dashboard?low_stock_threshold=5&months=12&recent_limit=10` → flat `total_users`, `total_products`, `total_orders`, `revenue`, plus `counts{}`, `revenue_summary{total_revenue, collected_revenue, pending_revenue, order_count, average_order_value}`, `low_stock_products[]`, `recent_orders[]`, `monthly_sales[]` (zero-filled), `best_selling_products[]`, `orders_by_status[]`.
- `GET /api/reports/sales?from=&to=` → `summary`, `daily[]`, `by_payment_method[]`, `monthly_sales[]`.
- `GET /api/reports/inventory?low_stock_threshold=` → `summary`, `products[]` (each with `stock_value`, `stock_status`), `out_of_stock[]`, `low_stock[]`.
- `GET /api/reports/customers?from=&to=&limit=` → `summary`, `customers[]`, `top_customers[]`, `new_customers_by_month[]`.
- `GET /api/reports/best-selling?from=&to=&limit=` → ranked `products[]` with `units_sold`, `revenue`, `order_count`.
- `GET /api/admin/users?search=&status=&limit=&page=` → customers with `order_count`, `total_spent`, `last_order_at`.
- `GET /api/admin/users/:id` → customer + recent orders. `PUT /api/admin/users/:id/status` `{status:"active"|"blocked"}`.

**Cancelled orders are excluded from every revenue and sales figure.** `total_revenue` is booked value; `collected_revenue` is settled payments only. Date ranges treat `to` as inclusive of that whole day.

## Payments
COD / eSewa / Khalti only — PayPal was removed from the frontend entirely (checkout page + script tag). Payment method is selected via radio buttons and sent as `payment_method` in the `POST /api/orders` body.

## localStorage schema (frontend)
- `token` — JWT (whichever role last logged in)
- `role` — `"customer" | "admin"`
- `user` — JSON of the logged-in user/admin object
