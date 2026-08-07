# Vision Mart API — Sample Requests

Every example uses `http://localhost:5000`. Replace tokens with real ones from the login responses.

All responses follow one of two shapes:

```json
{ "success": true,  "message": "...", "data": { } }
{ "success": false, "message": "...", "errors": [ ] }
```

List endpoints add a `meta` object (pagination, totals, summaries) alongside `data`.

---

## 1. Authentication

**Register**
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"John Doe","email":"john@example.com","password":"Password123"}'
```

**Login** — returns `{ user, token }`
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"john@example.com","password":"Password123"}'
```

**Admin login** — same shape, different secret
```bash
curl -X POST http://localhost:5000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@visionmart.com","password":"AdminPass123"}'
```

**Verify a token** (works for either role)
```bash
curl http://localhost:5000/api/auth/verify -H "Authorization: Bearer $TOKEN"
# -> { "data": { "is_admin": false, "user": {...} } }
```

**Update profile / change password**
```bash
curl -X PUT http://localhost:5000/api/auth/profile \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"phone":"9801234567","address":"Thamel Marg 12","city":"Kathmandu"}'

curl -X PUT http://localhost:5000/api/auth/change-password \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"current_password":"Password123","new_password":"NewPassword123"}'
```

---

## 2. Products

**Browse, search, filter, sort**
```bash
curl "http://localhost:5000/api/products"
curl "http://localhost:5000/api/products?search=aviator"
curl "http://localhost:5000/api/products?category_id=1&color=Black&frame_type=Full%20Rim"
curl "http://localhost:5000/api/products?min_price=5000&max_price=20000&sort=price_low"
curl "http://localhost:5000/api/products?sort=popularity&limit=8"
curl "http://localhost:5000/api/products?in_stock=true&page=2&limit=12"
```

Sort values: `newest` (default), `oldest`, `price_low`, `price_high`, `popularity`, `rating`, `name_asc`, `name_desc`.

**Send a customer token to get personalised flags**
```bash
curl "http://localhost:5000/api/products/1" -H "Authorization: Bearer $CUSTOMER_TOKEN"
# each product then carries accurate is_in_cart / is_in_wishlist booleans
```

**Filter options for building a sidebar**
```bash
curl http://localhost:5000/api/products/filters
# -> { brands[], colors[], frame_types[], frame_materials[], lens_types[], min_price, max_price }
```

**Create a product** (admin, multipart)
```bash
curl -X POST http://localhost:5000/api/products \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -F "category_id=1" -F "name=Aviator Classic Gold" -F "brand=RayBan" \
  -F "price=18500" -F "discount_price=15900" \
  -F "frame_type=Full Rim" -F "frame_material=Metal" \
  -F "lens_type=Polarized" -F "color=Gold" -F "stock=25" \
  -F "description=Timeless teardrop aviator." \
  -F "image=@/path/to/aviator.jpg"
```

**Clear a discount** — send an empty `discount_price`
```bash
curl -X PUT http://localhost:5000/api/products/1 \
  -H "Authorization: Bearer $ADMIN_TOKEN" -F "discount_price="
```

---

## 3. Cart

Route params are **product ids**, not cart-item ids.

```bash
curl http://localhost:5000/api/cart -H "Authorization: Bearer $TOKEN"

# add (re-adding the same product increments its quantity)
curl -X POST http://localhost:5000/api/cart \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"product_id":1,"quantity":2}'

# set an absolute quantity
curl -X PUT http://localhost:5000/api/cart/1 \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"quantity":3}'

curl -X DELETE http://localhost:5000/api/cart/1 -H "Authorization: Bearer $TOKEN"  # one line
curl -X DELETE http://localhost:5000/api/cart   -H "Authorization: Bearer $TOKEN"  # everything
curl http://localhost:5000/api/cart/count -H "Authorization: Bearer $TOKEN"        # header badge
```

Check `meta.checkout_ready` before showing a checkout button — `meta.issues[]` lists any
lines that went out of stock or were delisted while sitting in the cart.

---

## 4. Wishlist

```bash
curl http://localhost:5000/api/wishlist -H "Authorization: Bearer $TOKEN"

# idempotent: re-adding returns 200 with meta.already_existed = true
curl -X POST http://localhost:5000/api/wishlist \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"product_id":2}'

# add-or-remove in one call, for a heart icon
curl -X POST http://localhost:5000/api/wishlist/toggle \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"product_id":2}'

curl -X DELETE http://localhost:5000/api/wishlist/2 -H "Authorization: Bearer $TOKEN"
```

---

## 5. Checkout & Orders

**Buy the whole cart** — omit `items`; the cart is cleared on success.
```bash
curl -X POST http://localhost:5000/api/orders \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "shipping_name":"John Doe",
    "shipping_phone":"9801234567",
    "shipping_address":"Thamel Marg 12",
    "shipping_city":"Kathmandu",
    "payment_method":"COD",
    "notes":"Please ring the bell"
  }'
```

**Buy Now** — send `items`; the cart is left untouched.
```bash
curl -X POST http://localhost:5000/api/orders \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "shipping_name":"John Doe","shipping_phone":"9801234567",
    "shipping_address":"Thamel Marg 12","payment_method":"eSewa",
    "items":[{"product_id":1,"quantity":1}]
  }'
```

Prices always come from the database — any `price` in the request body is ignored.

**Read orders** (customers see their own, admins see all)
```bash
curl http://localhost:5000/api/orders -H "Authorization: Bearer $TOKEN"
curl "http://localhost:5000/api/orders?status=Pending&limit=20" -H "Authorization: Bearer $ADMIN_TOKEN"
curl "http://localhost:5000/api/orders?search=john&from=2026-01-01&to=2026-12-31" -H "Authorization: Bearer $ADMIN_TOKEN"
```

**Cancel** (customer, while Pending/Confirmed) — restores stock
```bash
curl -X PUT http://localhost:5000/api/orders/1/cancel \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"reason":"Changed my mind"}'
```

**Advance status** (admin, forward only)
```bash
curl -X PUT http://localhost:5000/api/orders/1/status \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"status":"Confirmed"}'
```
`Pending → Confirmed → Packed → Shipped → Out for Delivery → Delivered`,
with `Cancelled` reachable from any non-delivered state.

---

## 6. Payments

```bash
# what this deployment supports
curl http://localhost:5000/api/payments/methods

# start payment — response shape depends on the gateway
curl -X POST http://localhost:5000/api/payments/initiate \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"order_id":1}'
```

- **COD** → nothing more to do; settles when the order is marked Delivered.
- **eSewa** → build an HTML form from `fields` and POST it to `redirect_url`.
- **Khalti** → feed `amount_in_paisa` and `public_key` into the Khalti widget.

**Verify** — this is what actually settles the payment.
```bash
# eSewa (refId from the redirect)
curl -X POST http://localhost:5000/api/payments/verify \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"order_id":1,"transaction_id":"ESW-REF-00123"}'

# Khalti (token from the widget)
curl -X POST http://localhost:5000/api/payments/verify \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"order_id":1,"token":"KHALTI-TOKEN-XYZ"}'
```

Any `amount` you send is ignored — the charge comes from the order record.
Verification is idempotent, and a paid order advances `Pending → Confirmed`.

---

## 7. Reviews

```bash
curl "http://localhost:5000/api/reviews/product/1?limit=20&page=1"

curl -X POST http://localhost:5000/api/reviews \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"product_id":1,"rating":5,"comment":"Excellent quality."}'

curl -X PUT http://localhost:5000/api/reviews/1 \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"rating":4,"comment":"Updated after a month of use."}'

curl -X DELETE http://localhost:5000/api/reviews/1 -H "Authorization: Bearer $TOKEN"
```

One review per customer per product (a second POST returns 409 — edit instead).
Every write returns the recalculated `meta.product_rating`.

---

## 8. Admin Dashboard & Reports

```bash
curl "http://localhost:5000/api/admin/dashboard?low_stock_threshold=5&months=12" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

curl "http://localhost:5000/api/reports/sales?from=2026-01-01&to=2026-12-31" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

curl "http://localhost:5000/api/reports/inventory?low_stock_threshold=5" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

curl "http://localhost:5000/api/reports/customers" -H "Authorization: Bearer $ADMIN_TOKEN"
curl "http://localhost:5000/api/reports/best-selling?limit=10" -H "Authorization: Bearer $ADMIN_TOKEN"
```

Cancelled orders are excluded from every revenue figure. `total_revenue` is booked value;
`collected_revenue` is settled payments only.

**Customer management**
```bash
curl "http://localhost:5000/api/admin/users?search=john&status=active" -H "Authorization: Bearer $ADMIN_TOKEN"
curl http://localhost:5000/api/admin/users/1 -H "Authorization: Bearer $ADMIN_TOKEN"

curl -X PUT http://localhost:5000/api/admin/users/1/status \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"status":"blocked"}'
```
Blocking takes effect immediately — the customer's existing token stops working on their next request.

---

## 9. Contact

```bash
# public
curl -X POST http://localhost:5000/api/contact \
  -H "Content-Type: application/json" \
  -d '{"name":"Prakash Adhikari","email":"prakash@example.com",
       "subject":"Bulk order enquiry",
       "message":"I run an optical shop and would like to discuss wholesale pricing."}'

# admin inbox
curl "http://localhost:5000/api/contact?status=unread" -H "Authorization: Bearer $ADMIN_TOKEN"
curl http://localhost:5000/api/contact/1 -H "Authorization: Bearer $ADMIN_TOKEN"   # marks it read

curl -X PUT http://localhost:5000/api/contact/1/status \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"status":"replied"}'
```

---

## Status codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Business-rule violation (out of stock, invalid status transition, …) |
| 401 | Missing / invalid / wrong-role token |
| 403 | Account blocked |
| 404 | Not found — **also returned when you don't own the resource**, so ids can't be probed |
| 409 | Duplicate (email, category name, SKU, second review) |
| 422 | Validation failed — see the `errors[]` array |
| 500 | Server error (details are logged server-side, never returned to the client) |
