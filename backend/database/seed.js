// database/seed.js
// Populates the database with realistic demo data for development.
//
// Usage:
//   npm run seed          # add seed data (skips if data already present)
//   npm run seed -- --fresh   # wipe existing data first, then seed
//
// Safety: refuses to run with --fresh when NODE_ENV=production, because
// wiping a live catalogue and its order history is unrecoverable.

require('dotenv').config();
const { pool } = require('../config/db');
const { hashPassword } = require('../utils/password');

const FRESH = process.argv.includes('--fresh');

const CATEGORIES = [
  { name: 'Sunglasses', description: 'UV-protective sunglasses for every face shape.' },
  { name: 'Eyeglasses', description: 'Prescription-ready frames for everyday wear.' },
  { name: 'Contact Lenses', description: 'Daily, monthly and coloured contact lenses.' },
  { name: 'Reading Glasses', description: 'Magnification for comfortable close-up reading.' },
  { name: 'Kids Eyewear', description: 'Durable, flexible frames built for children.' }
];

// category is the index into CATEGORIES above.
const PRODUCTS = [
  { category: 0, name: 'Aviator Classic Gold', brand: 'RayBan', price: 18500, discount_price: 15900, frame_type: 'Full Rim', frame_material: 'Metal', lens_type: 'Polarized', color: 'Gold', stock: 25, sku: 'VM-SG-001', description: 'The timeless teardrop aviator with polarized lenses and a lightweight gold-tone metal frame.' },
  { category: 0, name: 'Wayfarer Bold Black', brand: 'RayBan', price: 16200, discount_price: null, frame_type: 'Full Rim', frame_material: 'Acetate', lens_type: 'Polarized', color: 'Black', stock: 18, sku: 'VM-SG-002', description: 'An icon of everyday style. Thick acetate frame with glare-cutting polarized lenses.' },
  { category: 0, name: 'Round Retro Silver', brand: 'Oakley', price: 12400, discount_price: 9900, frame_type: 'Rimless', frame_material: 'Titanium', lens_type: 'Tinted', color: 'Silver', stock: 7, sku: 'VM-SG-003', description: 'Featherweight titanium rimless rounds with a subtle gradient tint.' },
  { category: 0, name: 'Sport Wrap Shield', brand: 'Oakley', price: 21000, discount_price: null, frame_type: 'Half Rim', frame_material: 'Plastic', lens_type: 'Polarized', color: 'Matte Black', stock: 12, sku: 'VM-SG-004', description: 'Wraparound sports shield with a non-slip grip, built for running and cycling.' },
  { category: 1, name: 'Titan Slim Rectangle', brand: 'Titan', price: 8900, discount_price: 7200, frame_type: 'Half Rim', frame_material: 'Titanium', lens_type: 'Single Vision', color: 'Gunmetal', stock: 30, sku: 'VM-EG-001', description: 'Ultra-light titanium half-rim rectangles that disappear on the face.' },
  { category: 1, name: 'Bookworm Blue Cut', brand: 'Lenskart', price: 5400, discount_price: 4300, frame_type: 'Full Rim', frame_material: 'Plastic', lens_type: 'Blue Cut', color: 'Navy Blue', stock: 45, sku: 'VM-EG-002', description: 'Blue-light filtering lenses in a comfortable full-rim frame for long screen days.' },
  { category: 1, name: 'Executive Tortoise', brand: 'Fastrack', price: 7600, discount_price: null, frame_type: 'Full Rim', frame_material: 'Acetate', lens_type: 'Progressive', color: 'Tortoise', stock: 4, sku: 'VM-EG-003', description: 'Classic tortoiseshell acetate, progressive-lens ready for all-day desk work.' },
  { category: 1, name: 'Minimal Wire Round', brand: 'Titan', price: 6800, discount_price: 5500, frame_type: 'Full Rim', frame_material: 'Metal', lens_type: 'Single Vision', color: 'Rose Gold', stock: 22, sku: 'VM-EG-004', description: 'Slim wire rounds in a warm rose-gold finish. Understated and light.' },
  { category: 2, name: 'Daily Fresh 30 Pack', brand: 'AcuVue', price: 3200, discount_price: null, frame_type: null, frame_material: null, lens_type: 'Daily Disposable', color: 'Clear', stock: 120, sku: 'VM-CL-001', description: 'Thirty pairs of breathable daily disposables. No cleaning, no storage.' },
  { category: 2, name: 'Monthly Comfort Pair', brand: 'Bausch & Lomb', price: 2800, discount_price: 2400, frame_type: null, frame_material: null, lens_type: 'Monthly', color: 'Clear', stock: 80, sku: 'VM-CL-002', description: 'Silicone hydrogel monthlies that stay comfortable well into the evening.' },
  { category: 2, name: 'Hazel Colour Lenses', brand: 'FreshLook', price: 4100, discount_price: 3500, frame_type: null, frame_material: null, lens_type: 'Coloured Monthly', color: 'Hazel', stock: 0, sku: 'VM-CL-003', description: 'Natural-looking hazel tint with a soft limbal ring.' },
  { category: 3, name: 'Reader Plus 1.5', brand: 'Vision Mart', price: 1800, discount_price: 1500, frame_type: 'Full Rim', frame_material: 'Plastic', lens_type: 'Reading', color: 'Black', stock: 60, sku: 'VM-RG-001', description: 'Affordable +1.50 readers with spring hinges and a hard case included.' },
  { category: 3, name: 'Foldable Pocket Reader', brand: 'Vision Mart', price: 2400, discount_price: null, frame_type: 'Half Rim', frame_material: 'Metal', lens_type: 'Reading', color: 'Silver', stock: 3, sku: 'VM-RG-002', description: 'Folds to the size of a pen. Slips into a shirt pocket without a bulge.' },
  { category: 4, name: 'Kids Flex Bendable', brand: 'Vision Mart', price: 3600, discount_price: 2900, frame_type: 'Full Rim', frame_material: 'Silicone', lens_type: 'Single Vision', color: 'Red', stock: 35, sku: 'VM-KE-001', description: 'Bends almost in half without snapping. Built to survive a school bag.' },
  { category: 4, name: 'Kids Sun Shield Blue', brand: 'Vision Mart', price: 2900, discount_price: null, frame_type: 'Full Rim', frame_material: 'Silicone', lens_type: 'Polarized', color: 'Blue', stock: 2, sku: 'VM-KE-002', description: 'Full UV protection with a soft strap so they stay put during play.' }
];

const CUSTOMERS = [
  { name: 'John Doe', email: 'john@example.com', password: 'Password123', phone: '9801234567', address: 'Thamel Marg 12', city: 'Kathmandu' },
  { name: 'Jane Smith', email: 'jane@example.com', password: 'Password123', phone: '9807654321', address: 'Patan Durbar Square 8', city: 'Lalitpur' },
  { name: 'Ravi Thapa', email: 'ravi@example.com', password: 'Password123', phone: '9812345678', address: 'Lakeside Road 44', city: 'Pokhara' },
  { name: 'Sita Gurung', email: 'sita@example.com', password: 'Password123', phone: '9843216789', address: 'Bhaktapur Old Town 3', city: 'Bhaktapur' }
];

const CONTACT_MESSAGES = [
  { name: 'Anil Shrestha', email: 'anil@example.com', subject: 'Prescription lens fitting', message: 'Do you fit prescription lenses into frames bought from your store? I have a recent prescription from my optometrist.' },
  { name: 'Maya Rai', email: 'maya@example.com', subject: 'Delivery to Dharan', message: 'Do you deliver outside the Kathmandu valley, and how long does shipping to Dharan usually take?' },
  { name: 'Bikash Karki', email: 'bikash@example.com', subject: 'Warranty question', message: 'One of the hinges on my frames loosened after two months. Is that covered under warranty?' }
];

/**
 * wipeData
 * Deletes in FK-safe order (children before parents).
 * Admin accounts are preserved so you don't lock yourself out.
 */
async function wipeData() {
  const tables = [
    'payments', 'order_items', 'orders', 'cart_items', 'cart',
    'wishlist', 'reviews', 'product_images', 'products',
    'categories', 'contact_messages'
  ];
  for (const table of tables) {
    // eslint-disable-next-line no-await-in-loop
    await pool.query(`DELETE FROM ${table}`);
  }
  await pool.query('DELETE FROM users');
  console.log('🗑️  Existing data cleared (admin accounts preserved).');
}

/**
 * slugify - local copy so the seed doesn't depend on request-time helpers.
 */
function slugify(text) {
  return String(text).toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

async function seed() {
  try {
    if (FRESH && process.env.NODE_ENV === 'production') {
      console.error('❌ Refusing to run --fresh in production. That would erase live orders.');
      process.exit(1);
    }

    if (FRESH) {
      await wipeData();
    } else {
      const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM products');
      if (count > 0) {
        console.log(`ℹ️  Database already has ${count} products. Nothing to do.`);
        console.log('   Run "npm run seed -- --fresh" to wipe and reseed.');
        process.exit(0);
      }
    }

    // --- Admin ---
    const [[{ adminCount }]] = await pool.query('SELECT COUNT(*) AS adminCount FROM admins');
    if (adminCount === 0) {
      await pool.query(
        'INSERT INTO admins (name, email, password, role) VALUES (:name, :email, :password, :role)',
        {
          name: 'Vision Mart Admin',
          email: 'admin@visionmart.com',
          password: await hashPassword('AdminPass123'),
          role: 'super_admin'
        }
      );
      console.log('✅ Admin created:  admin@visionmart.com / AdminPass123');
    } else {
      console.log('ℹ️  Admin account already exists, skipping.');
    }

    // --- Customers ---
    const customerIds = [];
    for (const customer of CUSTOMERS) {
      // eslint-disable-next-line no-await-in-loop
      const [result] = await pool.query(
        `INSERT INTO users (name, email, password, phone, address, city)
         VALUES (:name, :email, :password, :phone, :address, :city)`,
        { ...customer, password: await hashPassword(customer.password) }
      );
      customerIds.push(result.insertId);
    }
    console.log(`✅ ${customerIds.length} customers created (password for all: Password123)`);

    // --- Categories ---
    const categoryIds = [];
    for (const category of CATEGORIES) {
      // eslint-disable-next-line no-await-in-loop
      const [result] = await pool.query(
        `INSERT INTO categories (name, slug, description) VALUES (:name, :slug, :description)`,
        { ...category, slug: slugify(category.name) }
      );
      categoryIds.push(result.insertId);
    }
    console.log(`✅ ${categoryIds.length} categories created`);

    // --- Products ---
    const productIds = [];
    for (const product of PRODUCTS) {
      // eslint-disable-next-line no-await-in-loop
      const [result] = await pool.query(
        `INSERT INTO products
           (category_id, name, brand, description, price, discount_price,
            frame_type, frame_material, lens_type, color, stock, sku)
         VALUES
           (:category_id, :name, :brand, :description, :price, :discount_price,
            :frame_type, :frame_material, :lens_type, :color, :stock, :sku)`,
        { ...product, category_id: categoryIds[product.category] }
      );
      productIds.push(result.insertId);
    }
    console.log(`✅ ${productIds.length} products created (incl. 1 out-of-stock and 3 low-stock for dashboard testing)`);

    // --- Reviews ---
    const reviews = [
      { user: 0, product: 0, rating: 5, comment: 'Exactly what I wanted. The polarization cuts glare on the highway completely.' },
      { user: 1, product: 0, rating: 4, comment: 'Beautiful frames, though the case feels a bit flimsy for the price.' },
      { user: 2, product: 1, rating: 5, comment: 'Classic look, sturdy build. Second pair I have bought from Vision Mart.' },
      { user: 0, product: 5, rating: 4, comment: 'Noticeably less eye strain after a full day of coding. Worth it.' },
      { user: 1, product: 4, rating: 5, comment: 'So light I forget I am wearing them. Titanium was the right call.' },
      { user: 3, product: 8, rating: 3, comment: 'Comfortable enough, but drier than my previous brand by evening.' }
    ];
    for (const review of reviews) {
      // eslint-disable-next-line no-await-in-loop
      await pool.query(
        `INSERT INTO reviews (user_id, product_id, rating, comment)
         VALUES (:user_id, :product_id, :rating, :comment)`,
        {
          user_id: customerIds[review.user],
          product_id: productIds[review.product],
          rating: review.rating,
          comment: review.comment
        }
      );
    }
    console.log(`✅ ${reviews.length} reviews created`);

    // --- Wishlist & cart ---
    await pool.query('INSERT INTO wishlist (user_id, product_id) VALUES (:u, :p)', { u: customerIds[0], p: productIds[3] });
    await pool.query('INSERT INTO wishlist (user_id, product_id) VALUES (:u, :p)', { u: customerIds[0], p: productIds[10] });
    await pool.query('INSERT INTO wishlist (user_id, product_id) VALUES (:u, :p)', { u: customerIds[1], p: productIds[6] });

    const [cartResult] = await pool.query('INSERT INTO cart (user_id) VALUES (:u)', { u: customerIds[0] });
    await pool.query(
      'INSERT INTO cart_items (cart_id, product_id, quantity, price) VALUES (:c, :p, :q, :pr)',
      { c: cartResult.insertId, p: productIds[5], q: 2, pr: 4300 }
    );
    console.log('✅ Sample wishlist and cart items created');

    // --- Orders across several statuses, so the dashboard has real shape ---
    const orders = [
      { user: 0, status: 'Delivered', payment_method: 'COD', payment_status: 'Paid', daysAgo: 20, items: [{ product: 0, qty: 1, price: 15900 }] },
      { user: 1, status: 'Delivered', payment_method: 'eSewa', payment_status: 'Paid', daysAgo: 14, items: [{ product: 4, qty: 1, price: 7200 }, { product: 5, qty: 2, price: 4300 }] },
      { user: 2, status: 'Shipped', payment_method: 'Khalti', payment_status: 'Paid', daysAgo: 5, items: [{ product: 1, qty: 1, price: 16200 }] },
      { user: 0, status: 'Confirmed', payment_method: 'COD', payment_status: 'Pending', daysAgo: 2, items: [{ product: 11, qty: 3, price: 1500 }] },
      { user: 3, status: 'Pending', payment_method: 'COD', payment_status: 'Pending', daysAgo: 0, items: [{ product: 13, qty: 1, price: 2900 }] },
      // A cancelled order — deliberately included so you can verify that
      // dashboard revenue EXCLUDES it.
      { user: 1, status: 'Cancelled', payment_method: 'COD', payment_status: 'Pending', daysAgo: 8, items: [{ product: 3, qty: 2, price: 21000 }] }
    ];

    let orderSeq = 1;
    for (const order of orders) {
      const total = order.items.reduce((sum, item) => sum + item.price * item.qty, 0);
      const orderNumber = `VM-SEED-${String(orderSeq).padStart(4, '0')}`;
      orderSeq += 1;

      const customer = CUSTOMERS[order.user];

      // eslint-disable-next-line no-await-in-loop
      const [orderResult] = await pool.query(
        `INSERT INTO orders
           (user_id, order_number, total_amount, status, payment_method,
            shipping_name, shipping_phone, shipping_address, shipping_city, created_at)
         VALUES
           (:user_id, :order_number, :total, :status, :payment_method,
            :name, :phone, :address, :city, DATE_SUB(NOW(), INTERVAL :daysAgo DAY))`,
        {
          user_id: customerIds[order.user],
          order_number: orderNumber,
          total,
          status: order.status,
          payment_method: order.payment_method,
          name: customer.name,
          phone: customer.phone,
          address: customer.address,
          city: customer.city,
          daysAgo: order.daysAgo
        }
      );

      for (const item of order.items) {
        const product = PRODUCTS[item.product];
        // eslint-disable-next-line no-await-in-loop
        await pool.query(
          `INSERT INTO order_items
             (order_id, product_id, product_name, quantity, price, subtotal)
           VALUES (:order_id, :product_id, :product_name, :qty, :price, :subtotal)`,
          {
            order_id: orderResult.insertId,
            product_id: productIds[item.product],
            product_name: product.name,
            qty: item.qty,
            price: item.price,
            subtotal: item.price * item.qty
          }
        );

        // Keep sold_count consistent with what was actually sold.
        if (order.status !== 'Cancelled') {
          // eslint-disable-next-line no-await-in-loop
          await pool.query(
            'UPDATE products SET sold_count = sold_count + :qty WHERE id = :id',
            { qty: item.qty, id: productIds[item.product] }
          );
        }
      }

      // eslint-disable-next-line no-await-in-loop
      await pool.query(
        `INSERT INTO payments (order_id, transaction_id, payment_method, payment_status, amount)
         VALUES (:order_id, :txn, :method, :status, :amount)`,
        {
          order_id: orderResult.insertId,
          txn: order.payment_status === 'Paid' ? `TXN-SEED-${orderSeq}` : null,
          method: order.payment_method,
          status: order.payment_status,
          amount: total
        }
      );
    }
    console.log(`✅ ${orders.length} orders created across all statuses (1 cancelled, to verify revenue excludes it)`);

    // --- Contact messages ---
    for (const msg of CONTACT_MESSAGES) {
      // eslint-disable-next-line no-await-in-loop
      await pool.query(
        'INSERT INTO contact_messages (name, email, subject, message) VALUES (:name, :email, :subject, :message)',
        msg
      );
    }
    console.log(`✅ ${CONTACT_MESSAGES.length} contact messages created`);

    console.log('\n🎉 Seeding complete!\n');
    console.log('   Admin login:     admin@visionmart.com / AdminPass123');
    console.log('   Customer login:  john@example.com / Password123');
    console.log('   (all seeded customers share the password Password123)\n');
    console.log('   Note: products have no images. Upload them via the admin panel,');
    console.log('   or the frontend will show broken image placeholders.\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    process.exit(1);
  }
}

seed();
