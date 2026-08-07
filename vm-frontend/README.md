# Vision Mart — Frontend

Premium eyewear storefront. HTML5, CSS3, Bootstrap 5.3, vanilla ES6, Fetch API.

## Structure

```
vm-frontend/
├── index.html          Home page
├── css/
│   ├── variables.css   Design tokens (colour, type, spacing, motion)
│   ├── base.css        Reset, typography, buttons, toasts, skeletons, states
│   ├── navbar.css      Navbar + mobile drawer
│   ├── home.css        Home page sections
│   └── footer.css      Footer
├── js/
│   ├── config.js       API_BASE_URL, ASSET_BASE_URL, placeholder, storage keys
│   ├── utils.js        Session, formatting, image resolution, toasts, validation
│   ├── api.js          Every network call
│   ├── components.js   Navbar, footer, product card, badge counts
│   └── home.js         Home page controller
└── assets/img/         Local images (product images come from the API)
```

## Running

Serve over HTTP — opening via `file://` breaks fetch and CORS:

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

**Set the backend's `FRONTEND_URL` to the same origin**, otherwise every request
is blocked by CORS. For the command above that means
`FRONTEND_URL=http://localhost:8080` in the backend `.env`.

## Script order

`config.js -> utils.js -> api.js -> components.js -> <page>.js`

`utils.js` defines `Session`, which `api.js` calls when a token expires, so it
must load first.

## Notes

- No hardcoded product data. All three home rails call `GET /products` with
  different `sort` values (`popularity`, `rating`, `newest`).
- Images resolve from `ASSET_BASE_URL + /uploads/products/`. Missing or broken
  images fall back to an inline SVG placeholder.
- Every value interpolated into `innerHTML` passes through `escapeHtml()`.
- Reveal animations are scoped to `.js` so the page stays readable if scripts
  fail. `prefers-reduced-motion` is respected.
