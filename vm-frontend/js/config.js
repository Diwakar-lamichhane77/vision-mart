/**
 * config.js
 * ---------------------------------------------------------------------------
 * Single source of truth for everything environment-specific.
 * Change API_BASE_URL and ASSET_BASE_URL to point at wherever the Express
 * server is running; nothing else in the app hardcodes a URL.
 * ---------------------------------------------------------------------------
 */
const CONFIG = {
  /** All API calls are made relative to this. */
  API_BASE_URL: "http://localhost:5000/api",

  /**
   * Root of the server's static files. Used to turn a stored filename or a
   * relative path ("/uploads/products/frame.jpg") into a loadable URL.
   * Product images live under: ASSET_BASE_URL + /uploads/products/
   */
  ASSET_BASE_URL: "http://localhost:5000",

  /** Sub-paths for uploaded media, so pages never spell these out inline. */
  UPLOAD_PATHS: {
    PRODUCTS: "/uploads/products/",
    CATEGORIES: "/uploads/categories/",
  },

  /**
   * Inline SVG placeholder shown when a product or category has no image.
   * Kept as a data URI so a missing image never triggers a second network
   * request that could also fail.
   */
  PLACEHOLDER_IMAGE:
    "data:image/svg+xml;charset=UTF-8," +
    encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600">
        <rect width="600" height="600" fill="#E9ECEF"/>
        <g fill="none" stroke="#A8B0B8" stroke-width="7" stroke-linecap="round">
          <circle cx="222" cy="312" r="82"/>
          <circle cx="392" cy="312" r="82"/>
          <path d="M304 312c0-16 22-16 22 0"/>
          <path d="M140 288l-38-26M474 288l38-26"/>
        </g>
        <text x="300" y="452" text-anchor="middle"
              font-family="DM Sans, Helvetica, Arial, sans-serif"
              font-size="21" letter-spacing="3" fill="#8A939C">VISION MART</text>
      </svg>`),

  /** localStorage keys — namespaced so they can't collide with other apps. */
  STORAGE_KEYS: {
    TOKEN: "vm_token",
    USER: "vm_user",
  },

  CURRENCY: "Rs.",

  /** How many products each home-page rail requests. */
  HOME_RAIL_LIMIT: 8,
};
