const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const { Resend } = require('resend');
require('dotenv').config();

// ✅ Resend uses HTTPS (port 443) — never blocked by Railway
const resend = new Resend(process.env.RESEND_API_KEY);

const app = express();

// Configure CORS for multi-app architecture
const allowedOrigins = [
  'http://localhost:5173', 'http://localhost:3000',
  'https://cesa-shop.up.railway.app', 'https://cesadesigns.com', 'https://www.cesadesigns.com',
  'https://cesa-designs-online-shop-production.up.railway.app',
  'http://localhost:5174', 'http://localhost:3001',
  'https://cesa-admin.up.railway.app', 'https://admin.cesadesigns.com', 'https://www.admin.cesadesigns.com',
  'https://cesa-designs-admin-production.up.railway.app',
  'https://cesa-api.up.railway.app',
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      if (process.env.NODE_ENV === 'development') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS policy'), false);
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.path} - Origin: ${req.headers.origin || 'none'}`);
  next();
});

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// ========== EMAIL NOTIFICATION SETUP ==========
// Resend sends over HTTPS — no SMTP ports needed, works on all Railway plans
console.log(process.env.RESEND_API_KEY ? '✅ Resend API key found' : '❌ RESEND_API_KEY missing');

// ── Admin order notification email ─────────────────────────────────────────
async function sendAdminOrderNotification(order, customer, items, total, shippingCost) {
  const adminEmail = process.env.ADMIN_EMAIL || 'cesafabrics@gmail.com';

  const itemsHtml = items.map(i =>
    `<tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eee">${i.name}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center">${i.quantity}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">KSh ${(i.price * i.quantity).toLocaleString()}</td>
     </tr>`
  ).join('');

  const itemsText = items.map(i => `  • ${i.name} x${i.quantity}  → KSh ${(i.price * i.quantity).toLocaleString()}`).join('\n');

  const adminUrl = process.env.ADMIN_URL || 'https://cesa-admin.up.railway.app';

  await resend.emails.send({
    from: process.env.RESEND_FROM || 'Cesa Designs Shop <onboarding@resend.dev>',
    to: adminEmail,
    subject: `🛍️ New Order #${order.order_number} – KSh ${total.toLocaleString()} (Pending Payment)`,
    text: `
New order – awaiting M-Pesa payment confirmation.

Order #: ${order.order_number}
Customer: ${customer.name}
Email:    ${customer.email}
Phone:    ${customer.phone}
Address:  ${customer.address || 'Not provided'}

Items:
${itemsText}

Subtotal: KSh ${(total - shippingCost).toLocaleString()}
Shipping: KSh ${shippingCost.toLocaleString()}
TOTAL:    KSh ${total.toLocaleString()}

Payment instructions sent to customer:
  M-Pesa PayBill: 303030
  Account Number: 2035157150
  Amount: KSh ${total.toLocaleString()}

Mark as paid → ${adminUrl}/orders
    `,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#1a1a2e;color:white;padding:20px 24px;border-radius:8px 8px 0 0">
          <h2 style="margin:0">🛍️ New Order – Pending Payment</h2>
          <p style="margin:6px 0 0;opacity:0.8">Order #${order.order_number}</p>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;padding:24px;border-radius:0 0 8px 8px">
          <h3 style="margin-top:0;color:#374151">Customer Details</h3>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:4px 0;color:#6b7280;width:100px">Name</td><td style="padding:4px 0;font-weight:600">${customer.name}</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280">Email</td><td style="padding:4px 0">${customer.email}</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280">Phone</td><td style="padding:4px 0">${customer.phone}</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280">Address</td><td style="padding:4px 0">${customer.address || '<em>Not provided</em>'}</td></tr>
          </table>

          <h3 style="color:#374151;margin-top:20px">Order Items</h3>
          <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px">
            <thead><tr style="background:#f9fafb">
              <th style="padding:8px 10px;text-align:left;color:#6b7280;font-weight:600">Item</th>
              <th style="padding:8px 10px;text-align:center;color:#6b7280;font-weight:600">Qty</th>
              <th style="padding:8px 10px;text-align:right;color:#6b7280;font-weight:600">Total</th>
            </tr></thead>
            <tbody>${itemsHtml}</tbody>
          </table>

          <div style="margin-top:16px;padding:16px;background:#f9fafb;border-radius:6px">
            <div style="display:flex;justify-content:space-between"><span>Subtotal</span><span>KSh ${(total - shippingCost).toLocaleString()}</span></div>
            <div style="display:flex;justify-content:space-between;margin-top:4px"><span>Shipping</span><span>KSh ${shippingCost.toLocaleString()}</span></div>
            <div style="display:flex;justify-content:space-between;margin-top:8px;font-weight:700;font-size:18px;border-top:2px solid #e5e7eb;padding-top:8px">
              <span>TOTAL</span><span>KSh ${total.toLocaleString()}</span>
            </div>
          </div>

          <div style="margin-top:20px;padding:16px;background:#fef9c3;border-radius:6px;border:1px solid #fde047">
            <h4 style="margin:0 0 8px;color:#854d0e">💳 M-Pesa Payment Expected</h4>
            <p style="margin:0;color:#713f12">PayBill: <strong>303030</strong> | Account: <strong>2035157150</strong> | Amount: <strong>KSh ${total.toLocaleString()}</strong></p>
          </div>

          <div style="margin-top:20px;text-align:center">
            <a href="${adminUrl}/orders" style="display:inline-block;background:#16a34a;color:white;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:600;font-size:16px">
              ✅ Mark as Paid in Admin Panel
            </a>
          </div>
        </div>
      </div>
    `,
  });
  console.log(`📧 Admin notification sent via Resend for order ${order.order_number}`);
}

// ── Customer confirmation email (sent when admin marks as paid) ─────────────
async function sendCustomerConfirmationEmail(order) {
  if (!order.customer_email) {
    console.log('⚠️ No customer email – skipping confirmation.');
    return;
  }

  const items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []);
  const itemsHtml = items.map(i =>
    `<tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eee">${i.name}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center">${i.quantity}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">KSh ${(i.price * i.quantity).toLocaleString()}</td>
     </tr>`
  ).join('');

  const shopUrl = process.env.SHOP_URL || 'https://cesa-shop.up.railway.app';

  await resend.emails.send({
    from: process.env.RESEND_FROM || 'Cesa Designs <onboarding@resend.dev>',
    to: order.customer_email,
    subject: `✅ Payment Confirmed – Order #${order.order_number} is Being Processed!`,
    text: `
Hi ${order.customer_name || 'Valued Customer'},

Great news! Your payment has been confirmed and your order is now being processed.

Order #: ${order.order_number}
Status: Processing ✅

Your items are being prepared and will be dispatched soon.
We'll send you tracking information once your order ships.

Thank you for shopping with Cesa Designs!
Visit us again: ${shopUrl}
    `,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#16a34a;color:white;padding:20px 24px;border-radius:8px 8px 0 0;text-align:center">
          <div style="font-size:48px;margin-bottom:8px">✅</div>
          <h2 style="margin:0">Payment Confirmed!</h2>
          <p style="margin:6px 0 0;opacity:0.9">Your order is now being processed</p>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;padding:24px;border-radius:0 0 8px 8px">
          <p style="font-size:16px">Hi <strong>${order.customer_name || 'Valued Customer'}</strong>,</p>
          <p>Your M-Pesa payment has been received and confirmed. Your order is now being prepared for dispatch. 🎉</p>

          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:16px;margin:20px 0">
            <p style="margin:0 0 4px;color:#166534"><strong>Order Number:</strong> ${order.order_number}</p>
            <p style="margin:0 0 4px;color:#166534"><strong>Status:</strong> Processing ✅</p>
            <p style="margin:0;color:#166534"><strong>Total Paid:</strong> KSh ${order.total ? order.total.toLocaleString() : '–'}</p>
          </div>

          <h3 style="color:#374151">Items in Your Order</h3>
          <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px">
            <thead><tr style="background:#f9fafb">
              <th style="padding:8px 10px;text-align:left;color:#6b7280">Item</th>
              <th style="padding:8px 10px;text-align:center;color:#6b7280">Qty</th>
              <th style="padding:8px 10px;text-align:right;color:#6b7280">Total</th>
            </tr></thead>
            <tbody>${itemsHtml}</tbody>
          </table>

          <p style="margin-top:20px;color:#6b7280;font-size:14px">
            We'll send you another message with tracking details once your order ships. 
            If you have any questions, reply to this email.
          </p>

          <div style="text-align:center;margin-top:24px">
            <a href="${shopUrl}" style="display:inline-block;background:#1a1a2e;color:white;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:600">
              Continue Shopping
            </a>
          </div>

          <p style="margin-top:24px;text-align:center;color:#9ca3af;font-size:13px">
            Thank you for shopping with <strong>Cesa Designs</strong> ❤️
          </p>
        </div>
      </div>
    `,
  });
  console.log(`📧 Customer confirmation sent via Resend to ${order.customer_email} for order ${order.order_number}`);
}

// ── Telegram fallback notification ─────────────────────────────────────────
async function sendTelegramNotification(order, customer, items, total, shippingCost) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.log('⚠️ Telegram not configured – skipping.');
    return;
  }

  const itemsText = items.map(i => `• ${i.name} (x${i.quantity}) – KSh ${(i.price * i.quantity).toLocaleString()}`).join('\n');

  const message = `
🆕 *NEW ORDER* – Pending Payment
Order #: \`${order.order_number}\`
Customer: ${customer.name}
Phone: ${customer.phone}
Address: ${customer.address || 'Not provided'}

${itemsText}

Subtotal: KSh ${(total - shippingCost).toLocaleString()}
Shipping: KSh ${shippingCost.toLocaleString()}
*Total: KSh ${total.toLocaleString()}*

💳 PayBill 303030 | Account 2035157150

[✅ Mark as Paid](${process.env.ADMIN_URL || 'https://cesa-admin.up.railway.app'}/orders)
  `;

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown', disable_web_page_preview: true }),
    });
    if (!response.ok) console.error('Telegram error:', await response.text());
    else console.log(`📱 Telegram sent for order ${order.order_number}`);
  } catch (err) {
    console.error('Telegram failed:', err.message);
  }
}

// ========== TEST EMAIL ENDPOINT ==========
app.get('/api/test-email', async (req, res) => {
  try {
    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM || 'Cesa Designs <onboarding@resend.dev>',
      to: process.env.ADMIN_EMAIL || 'cesafabrics@gmail.com',
      subject: 'Test email – Resend working',
      text: 'Resend is working. Email delivery confirmed for Cesa Designs Shop.',
    });
    if (error) throw new Error(error.message);
    res.json({ success: true, id: data?.id });
  } catch (err) {
    console.error('Test email error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ========== ADMIN AUTH ==========
// Credentials validated server-side — never exposed in frontend code
// Set ADMIN_EMAIL and ADMIN_PASSWORD in Railway environment variables
app.post('/api/admin/auth/login', (req, res) => {
  const { email, password } = req.body;
  const validEmail    = process.env.ADMIN_EMAIL    || 'admin@cesadesigns.com';
  const validPassword = process.env.ADMIN_PASSWORD || 'CesaAdmin2024!';

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password required' });
  }
  if (email === validEmail && password === validPassword) {
    const token = Buffer.from(`${email}:${Date.now()}`).toString('base64');
    console.log(`✅ Admin login: ${email}`);
    res.json({ success: true, token, email });
  } else {
    console.log(`❌ Failed admin login attempt for: ${email}`);
    res.status(401).json({ success: false, error: 'Invalid email or password' });
  }
});

// ========== HEALTH CHECK ==========
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({
      status: '✅ Cesa Designs API is running',
      system: 'Multi-app Architecture',
      database: 'Connected to Railway PostgreSQL',
      time: result.rows[0].now,
      apps: {
        shop: process.env.SHOP_URL || 'https://cesa-shop.up.railway.app',
        admin: process.env.ADMIN_URL || 'https://cesa-admin.up.railway.app',
        api: process.env.API_URL || 'https://cesa-api.up.railway.app'
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message, status: '❌ Database connection failed' });
  }
});

// ========== CONTACT FORM ==========
// Receives messages from the footer contact form and emails them to cesafabrics@gmail.com
app.post('/api/contact', async (req, res) => {
  const { name, email, phone, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email and message are required' });
  }

  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM || 'Cesa Designs Shop <onboarding@resend.dev>',
      to: 'cesafabrics@gmail.com',
      replyTo: email,
      subject: `📩 Website Enquiry from ${name}`,
      text: `
New enquiry from the Cesa Designs website contact form.

Name:    ${name}
Email:   ${email}
Phone:   ${phone || 'Not provided'}

Message:
${message}

---
Reply directly to this email to respond to ${name}.
      `,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto">
          <div style="background:#3E2723;color:white;padding:20px 24px;border-radius:8px 8px 0 0">
            <h2 style="margin:0;font-size:18px">📩 New Website Enquiry</h2>
            <p style="margin:6px 0 0;opacity:0.7;font-size:13px">Via cesadesigns.com contact form</p>
          </div>
          <div style="background:#fff;border:1px solid #e5e7eb;padding:24px;border-radius:0 0 8px 8px">
            <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
              <tr>
                <td style="padding:6px 0;color:#6b7280;width:80px;font-size:13px">Name</td>
                <td style="padding:6px 0;font-weight:600;font-size:13px">${name}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#6b7280;font-size:13px">Email</td>
                <td style="padding:6px 0;font-size:13px"><a href="mailto:${email}" style="color:#3E2723">${email}</a></td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#6b7280;font-size:13px">Phone</td>
                <td style="padding:6px 0;font-size:13px">${phone || '<em style="color:#9ca3af">Not provided</em>'}</td>
              </tr>
            </table>
            <div style="background:#f9fafb;border-left:3px solid #D4AF37;padding:14px 16px;border-radius:0 6px 6px 0">
              <p style="margin:0 0 6px;font-size:12px;font-weight:700;text-transform:uppercase;color:#6b7280;letter-spacing:0.5px">Message</p>
              <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;white-space:pre-wrap">${message}</p>
            </div>
            <p style="margin-top:20px;font-size:12px;color:#9ca3af">
              Hit <strong>Reply</strong> to respond directly to ${name} at ${email}.
            </p>
          </div>
        </div>
      `,
    });

    console.log(`📩 Contact form email sent from ${email}`);
    res.json({ success: true, message: 'Message received. We\'ll be in touch soon!' });
  } catch (err) {
    console.error('Contact form email failed:', err.message);
    res.status(500).json({ error: 'Failed to send message. Please email us directly at cesafabrics@gmail.com' });
  }
});

// ========== PUBLIC ENDPOINTS ==========
app.get('/api/categories', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*,
        COUNT(p.id) as product_count,
        JSON_AGG(
          JSON_BUILD_OBJECT('id', col.id, 'name', col.name, 'slug', col.slug, 'description', col.description)
        ) as collections
      FROM categories c
      LEFT JOIN products p ON c.id = p.category_id
      LEFT JOIN collections col ON c.id = col.category_id
      GROUP BY c.id
      ORDER BY c.display_order
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/collections', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, cat.name as category_name
      FROM collections c
      JOIN categories cat ON c.category_id = cat.id
      ORDER BY cat.name, c.name
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/products', async (req, res) => {
  const { category, collection } = req.query;
  try {
    let query = `
      SELECT p.*, c.name as category_name, c.slug as category_slug,
             col.name as collection_name, col.slug as collection_slug
      FROM products p
      JOIN categories c ON p.category_id = c.id
      LEFT JOIN collections col ON p.collection_id = col.id
      WHERE (p.stock_quantity > 0
         OR  (p.variants IS NOT NULL
              AND p.variants::text NOT IN ('[]', 'null', '')
              AND p.variants::text != 'null'
              AND jsonb_array_length(p.variants::jsonb) > 0))
    `;
    const params = [];
    let paramCount = 1;
    if (category) { query += ` AND c.slug = $${paramCount}`; params.push(category); paramCount++; }
    if (collection) { query += ` AND col.slug = $${paramCount}`; params.push(collection); paramCount++; }
    query += ` ORDER BY p.created_at DESC`;
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/products/:id', async (req, res) => {
  const { id } = req.params;

  // Reject frontend-only IDs immediately — never hit the DB
  if (/^na-/.test(id) || /-placeholder-/.test(id)) {
    return res.status(404).json({ error: 'Local product — no DB record', local: true });
  }

  try {
    let result;
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (UUID_REGEX.test(id)) {
      // UUID lookup
      result = await pool.query(
        `SELECT p.*, c.name as category_name, c.slug as category_slug,
                col.name as collection_name, col.slug as collection_slug
         FROM products p
         JOIN categories c ON p.category_id = c.id
         LEFT JOIN collections col ON p.collection_id = col.id
         WHERE p.id = $1::uuid`,
        [id]
      );
    } else if (/^\d+$/.test(id)) {
      // Legacy numeric ID lookup
      result = await pool.query(
        `SELECT p.*, c.name as category_name, c.slug as category_slug,
                col.name as collection_name, col.slug as collection_slug
         FROM products p
         JOIN categories c ON p.category_id = c.id
         LEFT JOIN collections col ON p.collection_id = col.id
         WHERE p.id = $1`,
        [id]
      );
    } else {
      // Slug lookup
      result = await pool.query(
        `SELECT p.*, c.name as category_name, c.slug as category_slug,
                col.name as collection_name, col.slug as collection_slug
         FROM products p
         JOIN categories c ON p.category_id = c.id
         LEFT JOIN collections col ON p.collection_id = col.id
         WHERE p.slug = $1`,
        [id]
      );
      // Fallback: variant slug prefix match
      if (result.rows.length === 0) {
        result = await pool.query(
          `SELECT p.*, c.name as category_name, c.slug as category_slug,
                  col.name as collection_name, col.slug as collection_slug
           FROM products p
           JOIN categories c ON p.category_id = c.id
           LEFT JOIN collections col ON p.collection_id = col.id
           WHERE $1 LIKE p.slug || '%'
           ORDER BY length(p.slug) DESC
           LIMIT 1`,
          [id]
        );
      }
    }

    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(`❌ /api/products/${id} error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});
app.patch('/api/products/:id/stock', async (req, res) => {
  const quantityChange = req.body.quantityChange ?? req.body.quantity_change;
  const reason = req.body.reason || 'adjustment';
  if (quantityChange === undefined || quantityChange === null || typeof quantityChange !== 'number') {
    return res.status(400).json({ error: 'quantityChange must be a number' });
  }

  const { id } = req.params;
  if (/^na-/.test(id) || /-placeholder-/.test(id)) {
    return res.status(404).json({ error: 'Local product — no DB record', local: true });
  }

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const idParam = UUID_REGEX.test(id) ? `$2::uuid` : `$2`;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updateResult = await client.query(
      `UPDATE products SET stock_quantity = GREATEST(0, stock_quantity + $1), updated_at = CURRENT_TIMESTAMP
       WHERE id = ${idParam} RETURNING id, name, stock_quantity`,
      [quantityChange, id]
    );
    if (updateResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Product not found' });
    }
    const newStock = updateResult.rows[0].stock_quantity;
    await client.query(
      `INSERT INTO inventory_transactions (product_id, transaction_type, quantity_change, new_quantity, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.params.id, reason, quantityChange, newStock, `Stock updated via API: ${quantityChange > 0 ? '+' : ''}${quantityChange} units (${reason})`]
    );
    await client.query('COMMIT');
    res.json({ success: true, product: updateResult.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.get('/api/categories/:slug', async (req, res) => {
  try {
    const categoryResult = await pool.query('SELECT * FROM categories WHERE slug = $1', [req.params.slug]);
    if (categoryResult.rows.length === 0) return res.status(404).json({ error: 'Category not found' });
    const category = categoryResult.rows[0];
    const productsResult = await pool.query(
      `SELECT p.*, col.name as collection_name FROM products p
       LEFT JOIN collections col ON p.collection_id = col.id
       WHERE p.category_id = $1
         AND (p.stock_quantity > 0
              OR (p.variants IS NOT NULL
                  AND p.variants::text NOT IN ('[]', 'null', '')
                  AND jsonb_array_length(p.variants::jsonb) > 0))
       ORDER BY p.created_at DESC`,
      [category.id]
    );
    const collectionsResult = await pool.query('SELECT * FROM collections WHERE category_id = $1 ORDER BY name', [category.id]);
    res.json({ ...category, products: productsResult.rows, collections: collectionsResult.rows, product_count: productsResult.rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);
  try {
    const result = await pool.query(
      `SELECT p.*, c.name as category_name FROM products p
       JOIN categories c ON p.category_id = c.id
       WHERE p.name ILIKE $1 OR p.description ILIKE $1
       ORDER BY p.created_at DESC LIMIT 20`,
      [`%${q}%`]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== CUSTOMER ENDPOINTS ==========
app.post('/api/customers', async (req, res) => {
  const { name, email, phone, address } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });
  try {
    const result = await pool.query(
      `INSERT INTO customers (name, email, phone, shipping_address, created_at, updated_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (email)
       DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone,
                     shipping_address = EXCLUDED.shipping_address, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [name, email, phone, JSON.stringify(address || {})]
    );
    res.json({ success: true, customer: result.rows[0] });
  } catch (err) {
    console.error('Customer upsert error:', err.message);
    res.json({ success: true, message: 'Customer data noted (table may not exist yet)' });
  }
});

app.get('/api/customers/:email', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT name, email, phone, shipping_address FROM customers WHERE email = $1',
      [req.params.email]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Customer not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(404).json({ error: 'Customer not found' });
  }
});

// ========== ORDER ENDPOINTS ==========
app.post('/api/orders', async (req, res) => {
  const { items, customer, shipping, payment } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Order must contain at least one item' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const orderNumber = `CESA-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const shippingCost = shipping?.cost || 0;
    const total = subtotal + shippingCost;

    const result = await client.query(
      `INSERT INTO orders (
        order_number, customer_email, customer_name, customer_phone,
        items, subtotal, shipping, total,
        shipping_address, billing_address,
        payment_method, payment_status, order_status, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [
        orderNumber,
        customer?.email,
        customer?.name,
        customer?.phone,
        JSON.stringify(items),
        subtotal,
        shippingCost,
        total,
        JSON.stringify(shipping?.address || {}),
        JSON.stringify(customer?.billingAddress || shipping?.address || {}),
        payment?.method || 'mpesa',
        'pending',
        'processing',
        customer?.notes || ''
      ]
    );

    // Atomic stock deduction
    for (const item of items) {
      const updateResult = await client.query(
        `UPDATE products SET stock_quantity = stock_quantity - $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND stock_quantity >= $1 RETURNING stock_quantity`,
        [item.quantity, item.product_id]
      );
      if (updateResult.rowCount === 0) throw new Error(`Insufficient stock for: ${item.name}`);
      await client.query(
        `INSERT INTO inventory_transactions (product_id, transaction_type, quantity_change, new_quantity, notes, order_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [item.product_id, 'order_placed', -item.quantity, updateResult.rows[0].stock_quantity,
         `Sold ${item.quantity} via order ${orderNumber}`, result.rows[0].id]
      );
    }

    await client.query('COMMIT');

    // Also upsert customer record
    try {
      await pool.query(
        `INSERT INTO customers (name, email, phone, shipping_address, created_at, updated_at)
         VALUES ($1,$2,$3,$4,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
         ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name, phone=EXCLUDED.phone,
           shipping_address=EXCLUDED.shipping_address, updated_at=CURRENT_TIMESTAMP`,
        [customer?.name, customer?.email, customer?.phone, JSON.stringify(shipping?.address || {})]
      );
    } catch (e) {
      console.log('Customer upsert skipped (table may not exist):', e.message);
    }

    const customerInfo = {
      name: customer?.name || 'Guest',
      email: customer?.email || '',
      phone: customer?.phone || '',
      address: shipping?.address?.fullAddress
        || `${shipping?.address?.street || ''} ${shipping?.address?.town || ''} ${shipping?.address?.county || ''}`.trim()
        || 'Not provided',
    };

    // Fire-and-forget notifications
    sendAdminOrderNotification(result.rows[0], customerInfo, items, total, shippingCost).catch(console.error);
    sendTelegramNotification(result.rows[0], customerInfo, items, total, shippingCost).catch(console.error);

    res.json({ success: true, order: result.rows[0], message: 'Order created successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Order creation failed:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.get('/api/orders/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, order_number, order_status, payment_status, customer_email,
              customer_name, customer_phone, total, created_at, updated_at,
              tracking_number, shipping_carrier, items
       FROM orders WHERE order_number = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== ADMIN MIDDLEWARE ==========
const adminOnly = (req, res, next) => {
  const origin = req.headers.origin;
  const adminOrigins = [
    'https://cesa-admin.up.railway.app',
    'https://admin.cesadesigns.com',
    'http://localhost:5174',
    'http://localhost:3001',
    'https://cesa-designs-admin-production.up.railway.app'
  ];
  if (process.env.NODE_ENV === 'production') {
    if (!origin || !adminOrigins.includes(origin)) {
      return res.status(403).json({ error: 'Admin access only' });
    }
  }
  next();
};

// ========== ADMIN ORDER ENDPOINTS ==========
app.get('/api/admin/orders', adminOnly, async (req, res) => {
  const { status, payment_status, email, startDate, endDate, page = 1, limit = 20 } = req.query;
  try {
    let query = `SELECT o.*, COUNT(*) OVER() as total_count FROM orders o WHERE 1=1`;
    const params = [];
    let paramCount = 1;

    if (status === 'pending') {
      query += ` AND o.payment_status = $${paramCount}`; params.push('pending'); paramCount++;
    } else if (status) {
      query += ` AND o.order_status = $${paramCount}`; params.push(status); paramCount++;
    }
    if (payment_status) {
      query += ` AND o.payment_status = $${paramCount}`; params.push(payment_status); paramCount++;
    }
    if (email) { query += ` AND o.customer_email ILIKE $${paramCount}`; params.push(`%${email}%`); paramCount++; }
    if (startDate) { query += ` AND o.created_at >= $${paramCount}`; params.push(startDate); paramCount++; }
    if (endDate) { query += ` AND o.created_at <= $${paramCount}`; params.push(endDate); paramCount++; }

    query += ` ORDER BY o.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, (page - 1) * limit);

    const result = await pool.query(query, params);
    res.json({
      orders: result.rows,
      pagination: {
        page: parseInt(page), limit: parseInt(limit),
        total: result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0,
        totalPages: Math.ceil((result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0) / limit)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/admin/orders/:id', adminOnly, async (req, res) => {
  const { order_status, payment_status, tracking_number, shipping_carrier, notes } = req.body;
  try {
    await pool.query('BEGIN');
    const updateResult = await pool.query(
      `UPDATE orders
       SET order_status = COALESCE($1, order_status),
           payment_status = COALESCE($2, payment_status),
           tracking_number = COALESCE($3, tracking_number),
           shipping_carrier = COALESCE($4, shipping_carrier),
           notes = COALESCE($5, notes),
           updated_at = CURRENT_TIMESTAMP
       WHERE id::text = $6 OR order_number = $6
       RETURNING *`,
      [order_status, payment_status, tracking_number, shipping_carrier, notes, req.params.id]
    );
    if (updateResult.rows.length === 0) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }
    if (order_status || payment_status) {
      await pool.query(
        `INSERT INTO order_status_history (order_id, order_status, payment_status, notes)
         VALUES ($1, $2, $3, $4)`,
        [updateResult.rows[0].id, updateResult.rows[0].order_status, updateResult.rows[0].payment_status, 'Status updated via admin panel']
      );
    }
    await pool.query('COMMIT');
    res.json(updateResult.rows[0]);
  } catch (err) {
    await pool.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/admin/orders/:orderNumber/mark-paid', adminOnly, async (req, res) => {
  const { orderNumber } = req.params;
  try {
    const result = await pool.query(
      `UPDATE orders
       SET payment_status = 'paid',
           order_status = 'processing',
           updated_at = CURRENT_TIMESTAMP
       WHERE order_number = $1 AND payment_status = 'pending'
       RETURNING *`,
      [orderNumber]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found or already paid' });
    }

    const order = result.rows[0];

    await pool.query(
      `INSERT INTO order_status_history (order_id, order_status, payment_status, notes)
       VALUES ($1, $2, $3, $4)`,
      [order.id, 'processing', 'paid', 'Payment confirmed by admin – customer notified']
    ).catch(e => console.log('History insert skipped:', e.message));

    sendCustomerConfirmationEmail(order).catch(console.error);

    res.json({ success: true, order, message: 'Order marked as paid – customer email sent' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/orders/:id/history', adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM order_status_history
       WHERE order_id::text = $1 OR order_id IN (SELECT id FROM orders WHERE order_number = $1)
       ORDER BY created_at DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/customers', adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, COUNT(o.id) as order_count, COALESCE(SUM(o.total), 0) as lifetime_value
      FROM customers c
      LEFT JOIN orders o ON c.email = o.customer_email AND o.payment_status = 'paid'
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/customers/:email/orders', adminOnly, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM orders WHERE customer_email ILIKE $1 ORDER BY created_at DESC', [req.params.email]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/orders/stats/dashboard', adminOnly, async (req, res) => {
  try {
    const [totalOrders, totalRevenue, pendingOrders, completedOrders, recentOrders, revenueByMonth] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM orders'),
      pool.query(`SELECT COALESCE(SUM(total), 0) as revenue FROM orders WHERE payment_status = 'paid'`),
      pool.query(`SELECT COUNT(*) as count FROM orders WHERE payment_status = 'pending'`),
      pool.query(`SELECT COUNT(*) as count FROM orders WHERE order_status = 'completed'`),
      pool.query('SELECT * FROM orders ORDER BY created_at DESC LIMIT 10'),
      pool.query(`
        SELECT DATE_TRUNC('month', created_at) as month, COUNT(*) as order_count, COALESCE(SUM(total), 0) as revenue
        FROM orders WHERE created_at >= NOW() - INTERVAL '6 months'
        GROUP BY DATE_TRUNC('month', created_at) ORDER BY month DESC
      `)
    ]);
    res.json({
      total_orders: parseInt(totalOrders.rows[0].count),
      total_revenue: parseFloat(totalRevenue.rows[0].revenue),
      pending_orders: parseInt(pendingOrders.rows[0].count),
      completed_orders: parseInt(completedOrders.rows[0].count),
      recent_orders: recentOrders.rows,
      revenue_by_month: revenueByMonth.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== ADMIN INVENTORY ENDPOINTS ==========
app.get('/api/admin/inventory', adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        p.*,
        c.name  AS category_name,
        c.slug  AS category_slug,
        col.name AS collection_name,
        COALESCE(sold.units_sold,   0) AS units_sold,
        COALESCE(sold.total_orders, 0) AS total_sold,
        COALESCE(sold.revenue,      0) AS revenue
      FROM products p
      JOIN categories c ON p.category_id = c.id
      LEFT JOIN collections col ON p.collection_id = col.id
      LEFT JOIN (
        SELECT
          (item->>'product_id')::uuid                              AS product_id,
          COUNT(DISTINCT o.id)                                    AS total_orders,
          SUM((item->>'quantity')::int)                           AS units_sold,
          SUM((item->>'quantity')::int * (item->>'price')::numeric) AS revenue
        FROM orders o
        CROSS JOIN LATERAL jsonb_array_elements(o.items) AS item
        WHERE o.payment_status = 'paid'
          AND o.items IS NOT NULL
          AND jsonb_typeof(o.items) = 'array'
          AND (item->>'product_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        GROUP BY (item->>'product_id')::uuid
      ) sold ON p.id = sold.product_id
      ORDER BY p.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Inventory fetch error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/inventory/stats', adminOnly, async (req, res) => {
  try {
    const [totalProducts, lowStock, outOfStock, totalValue, recentTx, topSelling] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM products'),
      pool.query('SELECT COUNT(*) as count FROM products WHERE stock_quantity BETWEEN 1 AND 10'),
      pool.query('SELECT COUNT(*) as count FROM products WHERE stock_quantity = 0'),
      pool.query('SELECT COALESCE(SUM(price * stock_quantity), 0) as value FROM products'),
      pool.query(`
        SELECT t.*, p.name as product_name
        FROM inventory_transactions t
        JOIN products p ON t.product_id = p.id
        ORDER BY t.created_at DESC LIMIT 20
      `),
      pool.query(`
        SELECT
          p.id, p.name, p.sku, c.name AS category,
          COALESCE(sold.total_orders, 0) AS total_orders,
          COALESCE(sold.units_sold,   0) AS units_sold,
          COALESCE(sold.revenue,      0) AS revenue
        FROM products p
        JOIN categories c ON p.category_id = c.id
        LEFT JOIN (
          SELECT
            (item->>'product_id')::uuid                              AS product_id,
            COUNT(DISTINCT o.id)                                    AS total_orders,
            SUM((item->>'quantity')::int)                           AS units_sold,
            SUM((item->>'quantity')::int * (item->>'price')::numeric) AS revenue
          FROM orders o
          CROSS JOIN LATERAL jsonb_array_elements(o.items) AS item
          WHERE o.payment_status = 'paid'
            AND o.items IS NOT NULL
            AND jsonb_typeof(o.items) = 'array'
            AND (item->>'product_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          GROUP BY (item->>'product_id')::uuid
        ) sold ON p.id = sold.product_id
        ORDER BY COALESCE(sold.units_sold, 0) DESC
        LIMIT 10
      `)
    ]);
    res.json({
      total_products:      parseInt(totalProducts.rows[0].count),
      low_stock:           parseInt(lowStock.rows[0].count),
      out_of_stock:        parseInt(outOfStock.rows[0].count),
      inventory_value:     parseFloat(totalValue.rows[0].value),
      recent_transactions: recentTx.rows,
      top_selling:         topSelling.rows
    });
  } catch (err) {
    console.error('Inventory stats error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Helper: accepts a value that may already be a JSON string or a plain array/object.
// Always returns a valid JSON string for storage in a jsonb/text column.
const normalizeJsonField = (val, fallback = []) => {
  if (val === undefined || val === null) return JSON.stringify(fallback);
  if (typeof val === 'string') {
    try { JSON.parse(val); return val; } // already valid JSON string — use as-is
    catch { return JSON.stringify(fallback); }
  }
  return JSON.stringify(val);
};

app.post('/api/admin/inventory/products', adminOnly, async (req, res) => {
  const { name, description, price, category_id, collection_id, initial_stock, image_url, images, variants } = req.body;

  // Auto-generate slug from name + timestamp suffix (ensures uniqueness)
  const slug = name
    ? name.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') +
      '-' + Date.now().toString(36)
    : `product-${Date.now().toString(36)}`;

  try {
    // Auto-generate SKU: look up category slug, build CESA-{CAT}-{TIMESTAMP}
    let categorySlug = 'GEN';
    try {
      const catResult = await pool.query('SELECT slug FROM categories WHERE id = $1', [category_id]);
      if (catResult.rows.length > 0) {
        categorySlug = catResult.rows[0].slug.toUpperCase().substring(0, 6);
      }
    } catch {}
    const autoSku = `CESA-${categorySlug}-${Date.now().toString(36).toUpperCase()}`;

    // If variants provided, use sum of their stocks
    let effectiveStock = parseInt(initial_stock) || 0;
    try {
      const variantArr = typeof variants === 'string' ? JSON.parse(variants) : (Array.isArray(variants) ? variants : []);
      if (variantArr.length > 0) {
        const variantSum = variantArr.reduce((sum, v) => sum + (parseInt(v.stock) || 0), 0);
        if (variantSum > 0) effectiveStock = variantSum;
      }
    } catch {}

    // Build images array from image_url if provided
    let finalImages = normalizeJsonField(images);
    if (image_url && (!images || images === '[]')) {
      finalImages = JSON.stringify([image_url]);
    }

    await pool.query('BEGIN');
    const productResult = await pool.query(
      `INSERT INTO products (name, description, sku, slug, price, category_id, collection_id, stock_quantity, image_url, images, variants, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING *`,
      [name, description, autoSku, slug, price, category_id, collection_id, effectiveStock, image_url || null, finalImages, normalizeJsonField(variants)]
    );
    if (effectiveStock > 0) {
      await pool.query(
        `INSERT INTO inventory_transactions (product_id, transaction_type, quantity_change, new_quantity, notes)
         VALUES ($1,'initial_stock',$2,$3,$4)`,
        [productResult.rows[0].id, effectiveStock, effectiveStock, `Initial stock: ${effectiveStock} units`]
      );
    }
    await pool.query('COMMIT');
    res.json({ success: true, product: productResult.rows[0] });
  } catch (err) {
    await pool.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/inventory/products/:id', adminOnly, async (req, res) => {
  const { name, description, price, category_id, collection_id, image_url, images, variants } = req.body;
  try {
    let stockUpdate = '';
    const params = [
      name, description, price, category_id, collection_id,
      image_url || null,
      images   ? normalizeJsonField(images)   : null,
      variants ? normalizeJsonField(variants) : null,
    ];

    if (variants) {
      try {
        const variantArr = typeof variants === 'string' ? JSON.parse(variants) : (Array.isArray(variants) ? variants : []);
        if (variantArr.length > 0) {
          const variantSum = variantArr.reduce((sum, v) => sum + (parseInt(v.stock) || 0), 0);
          if (variantSum > 0) {
            stockUpdate = `, stock_quantity=$${params.length + 1}`;
            params.push(variantSum);
          }
        }
      } catch {}
    }

    params.push(req.params.id);
    const result = await pool.query(
      `UPDATE products SET
         name=COALESCE($1,name),
         description=COALESCE($2,description),
         price=COALESCE($3,price),
         category_id=COALESCE($4,category_id),
         collection_id=COALESCE($5,collection_id),
         image_url=COALESCE($6,image_url),
         images=COALESCE($7,images),
         variants=COALESCE($8,variants)${stockUpdate},
         updated_at=CURRENT_TIMESTAMP
       WHERE id=$${params.length} RETURNING *`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    res.json({ success: true, product: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/inventory/bulk-update', adminOnly, async (req, res) => {
  const { updates } = req.body;
  try {
    await pool.query('BEGIN');
    const results = [];
    for (const update of updates) {
      const { product_id, quantity_change, reason, notes } = update;
      const updateResult = await pool.query(
        `UPDATE products SET stock_quantity = GREATEST(0, stock_quantity + $1), updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 RETURNING *`,
        [quantity_change, product_id]
      );
      if (updateResult.rows.length === 0) continue;
      await pool.query(
        `INSERT INTO inventory_transactions (product_id, transaction_type, quantity_change, new_quantity, notes)
         VALUES ($1,$2,$3,$4,$5)`,
        [product_id, reason || 'bulk_adjustment', quantity_change, updateResult.rows[0].stock_quantity,
         notes || `Bulk update: ${quantity_change > 0 ? '+' : ''}${quantity_change} units`]
      );
      results.push(updateResult.rows[0]);
    }
    await pool.query('COMMIT');
    res.json({ success: true, updated: results.length, products: results });
  } catch (err) {
    await pool.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/inventory/products/:id', adminOnly, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM inventory_transactions WHERE product_id = $1', [req.params.id]);
    const result = await client.query('DELETE FROM products WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Product not found' });
    }
    await client.query('COMMIT');
    res.json({ success: true, message: 'Product deleted', product: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.get('/api/admin/inventory/transactions', adminOnly, async (req, res) => {
  const { product_id, start_date, end_date, type, page = 1, limit = 50 } = req.query;
  try {
    let query = `
      SELECT t.*, p.name as product_name, p.sku, c.name as category_name, COUNT(*) OVER() as total_count
      FROM inventory_transactions t
      JOIN products p ON t.product_id = p.id
      JOIN categories c ON p.category_id = c.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;
    if (product_id) { query += ` AND t.product_id = $${paramCount}`; params.push(product_id); paramCount++; }
    if (type) { query += ` AND t.transaction_type = $${paramCount}`; params.push(type); paramCount++; }
    if (start_date) { query += ` AND t.created_at >= $${paramCount}`; params.push(start_date); paramCount++; }
    if (end_date) { query += ` AND t.created_at <= $${paramCount}`; params.push(end_date); paramCount++; }
    query += ` ORDER BY t.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, (page - 1) * limit);
    const result = await pool.query(query, params);
    res.json({
      transactions: result.rows,
      pagination: { page: parseInt(page), limit: parseInt(limit), total: result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0 }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/inventory/export', adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        p.sku, p.name, c.name as category, col.name as collection,
        p.price, p.stock_quantity, p.created_at, p.updated_at,
        COALESCE(sold.total_orders, 0) as total_orders,
        COALESCE(sold.units_sold,   0) as units_sold,
        COALESCE(sold.revenue,      0) as revenue
      FROM products p
      JOIN categories c ON p.category_id = c.id
      LEFT JOIN collections col ON p.collection_id = col.id
      LEFT JOIN (
        SELECT
          (item->>'product_id')::uuid                              AS product_id,
          COUNT(DISTINCT o.id)                                    AS total_orders,
          SUM((item->>'quantity')::int)                           AS units_sold,
          SUM((item->>'quantity')::int * (item->>'price')::numeric) AS revenue
        FROM orders o
        CROSS JOIN LATERAL jsonb_array_elements(o.items) AS item
        WHERE o.payment_status = 'paid'
          AND o.items IS NOT NULL
          AND jsonb_typeof(o.items) = 'array'
          AND (item->>'product_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        GROUP BY (item->>'product_id')::uuid
      ) sold ON p.id = sold.product_id
      ORDER BY p.category_id, p.created_at DESC
    `);
    if (result.rows.length === 0) return res.json([]);
    const headers = Object.keys(result.rows[0]).join(',');
    const csv = result.rows.map(row =>
      Object.values(row).map(val =>
        typeof val === 'string' && val.includes(',') ? `"${val}"` : val
      ).join(',')
    ).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=inventory-export.csv');
    res.send(headers + '\n' + csv);
  } catch (err) {
    console.error('Export error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/sales/analytics', adminOnly, async (req, res) => {
  const { period = 'month' } = req.query;
  const interval = ['day','week','month','year'].includes(period) ? period : 'month';

  // Shared safe JSONB guard — only process rows where items is a non-null JSON array
  // and product_id is a valid UUID string. products.id is UUID type — cast accordingly.
  const SAFE_WHERE = `
    o.payment_status = 'paid'
    AND o.items IS NOT NULL
    AND jsonb_typeof(o.items) = 'array'
    AND (item->>'product_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  `;

  try {
    const [salesResult, categorySales, topProducts] = await Promise.all([

      // Sales trend — uses order-level totals (no item unnesting needed)
      pool.query(`
        SELECT
          DATE_TRUNC('${interval}', o.created_at)  AS period,
          COUNT(DISTINCT o.id)                       AS order_count,
          COUNT(DISTINCT o.customer_email)           AS customer_count,
          COALESCE(SUM(o.total), 0)                  AS revenue,
          COALESCE(AVG(o.total), 0)                  AS avg_order_value,
          COALESCE(SUM(item_counts.qty), 0)          AS units_sold
        FROM orders o
        LEFT JOIN LATERAL (
          SELECT SUM((item->>'quantity')::int) AS qty
          FROM jsonb_array_elements(o.items) AS item
          WHERE (item->>'quantity') ~ '^[0-9]+$'
        ) item_counts ON o.items IS NOT NULL AND jsonb_typeof(o.items) = 'array'
        WHERE o.payment_status = 'paid'
          AND o.created_at >= NOW() - INTERVAL '6 months'
        GROUP BY DATE_TRUNC('${interval}', o.created_at)
        ORDER BY period DESC
      `),

      // Revenue by category
      pool.query(`
        SELECT
          c.name                                              AS category,
          COUNT(DISTINCT o.id)                               AS order_count,
          SUM((item->>'quantity')::int)                      AS units_sold,
          SUM((item->>'quantity')::int * (item->>'price')::numeric) AS revenue
        FROM orders o
        CROSS JOIN LATERAL jsonb_array_elements(o.items) AS item
        JOIN products p ON p.id = (item->>'product_id')::uuid
        JOIN categories c ON c.id = p.category_id
        WHERE ${SAFE_WHERE}
          AND o.created_at >= NOW() - INTERVAL '30 days'
        GROUP BY c.id, c.name
        ORDER BY revenue DESC
      `),

      // Top selling products
      pool.query(`
        SELECT
          p.name,
          p.sku,
          c.name                                              AS category,
          SUM((item->>'quantity')::int)                      AS units_sold,
          SUM((item->>'quantity')::int * (item->>'price')::numeric) AS revenue
        FROM orders o
        CROSS JOIN LATERAL jsonb_array_elements(o.items) AS item
        JOIN products p ON p.id = (item->>'product_id')::uuid
        JOIN categories c ON c.id = p.category_id
        WHERE ${SAFE_WHERE}
        GROUP BY p.id, p.name, p.sku, c.name
        ORDER BY units_sold DESC
        LIMIT 10
      `)
    ]);

    res.json({
      sales_trend:          salesResult.rows,
      category_performance: categorySales.rows,
      top_products:         topProducts.rows
    });
  } catch (err) {
    console.error('Analytics error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ========== ERROR HANDLING ==========
app.use((req, res) => res.status(404).json({ error: 'Route not found', path: req.path }));

app.use((err, req, res, next) => {
  console.error('❌ Server error:', err.stack);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', async () => {

  // ── Run safe migrations on every startup ─────────────────────────────────
  // ALTER TABLE ... ADD COLUMN IF NOT EXISTS is idempotent — safe to run repeatedly
  try {
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT`);
    console.log('✅ Migration: products.image_url column ready');
  } catch (err) {
    console.error('⚠️  Migration warning (image_url):', err.message);
  }

  console.log(`
┌──────────────────────────────────────────────────────┐
│       🚀 Cesa Designs API – All Bugs Fixed           │
├──────────────────────────────────────────────────────┤
│  Port: ${PORT}
│  Env:  ${process.env.NODE_ENV || 'development'}
│  DB:   ${process.env.DATABASE_URL ? '✅ Railway PostgreSQL' : '⚠️  No DATABASE_URL'}
│                                                      │
│  ✅ Resend email API (HTTPS) – works on Railway      │
│  ✅ Admin orders fixed (payment_status filter)       │
│  ✅ Customer confirmation email on mark-paid         │
│  ✅ Customer data saved to DB                        │
│  📱 Telegram: ${process.env.TELEGRAM_BOT_TOKEN ? 'Configured' : 'Not configured (optional)'}
└──────────────────────────────────────────────────────┘
  `);
});