const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Configure CORS for multi-app architecture
const allowedOrigins = [
  // Public Shop (cesa-shop)
  'http://localhost:5173', // Local dev - shop
  'http://localhost:3000', // Alternative local dev
  'https://cesa-shop.up.railway.app', // Production shop on Railway
  'https://cesadesigns.com', // Custom domain - shop
  'https://www.cesadesigns.com', // WWW custom domain
  'https://cesa-designs-online-shop-production.up.railway.app',
  
  // ✅ YOUR ACTUAL FRONTEND URLS (CORRECTED - no hyphen between cesa and designs)
  'https://cesa-designs-online-shop-production.up.railway.app', // CORRECT: Actual shop frontend
  
  // Private Admin (cesa-admin)
  'http://localhost:5174', // Local dev - admin
  'http://localhost:3001', // Alternative local dev admin
  'https://cesa-admin.up.railway.app', // Production admin on Railway
  'https://admin.cesadesigns.com', // Custom domain - admin
  'https://www.admin.cesadesigns.com', // WWW admin domain
  'https://cesa-designs-admin-production.up.railway.app', // Your actual admin frontend
  
  // API Documentation/Testing
  'https://cesa-api.up.railway.app', // API itself for documentation
  'http://localhost:3001', // API local
];

// Log the allowed origins at startup (moved AFTER definition)
console.log('🚀 Starting server with allowed origins:', allowedOrigins);

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, postman)
    if (!origin) return callback(null, true);
    
    // Check if origin is allowed
    if (allowedOrigins.indexOf(origin) !== -1) {
      console.log(`✅ Allowed CORS for origin: ${origin}`); // <-- ADDED DEBUG LOG
      callback(null, true);
    } else {
      // For development/testing, you might want to allow all
      if (process.env.NODE_ENV === 'development') {
        console.warn(`⚠️ Allowing origin in dev: ${origin}`);
        callback(null, true);
      } else {
        console.log(`🚫 Blocked by CORS: ${origin}`);
        callback(new Error('Not allowed by CORS policy'), false);
      }
    }
  },
  credentials: true, // Allow cookies/auth headers
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200
};

// Apply CORS globally
app.use(cors(corsOptions));

// Pre-flight requests
app.options('*', cors(corsOptions));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.path} - Origin: ${req.headers.origin || 'none'}`);
  next();
});

// Database connection - using Railway PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test database connection
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
    res.status(500).json({ 
      error: err.message,
      status: '❌ Database connection failed'
    });
  }
});

// ========== PUBLIC ENDPOINTS (Shop accessible) ==========

// Get all categories
app.get('/api/categories', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, 
        COUNT(p.id) as product_count,
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'id', col.id,
            'name', col.name,
            'slug', col.slug,
            'description', col.description
          )
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

// Get all collections (used by admin frontend for dropdowns)
app.get('/api/collections', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        c.*,
        cat.name as category_name
      FROM collections c
      JOIN categories cat ON c.category_id = cat.id
      ORDER BY cat.name, c.name
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get products by category/collection
app.get('/api/products', async (req, res) => {
  const { category, collection } = req.query;
  
  try {
    let query = `
      SELECT 
        p.*,
        c.name as category_name,
        c.slug as category_slug,
        col.name as collection_name,
        col.slug as collection_slug
      FROM products p
      JOIN categories c ON p.category_id = c.id
      LEFT JOIN collections col ON p.collection_id = col.id
      WHERE p.stock_quantity > 0
    `;
    
    const params = [];
    let paramCount = 1;
    
    if (category) {
      query += ` AND c.slug = $${paramCount}`;
      params.push(category);
      paramCount++;
    }
    
    if (collection) {
      query += ` AND col.slug = $${paramCount}`;
      params.push(collection);
      paramCount++;
    }
    
    query += ` ORDER BY p.created_at DESC`;
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get specific category with all its data
app.get('/api/categories/:slug', async (req, res) => {
  try {
    const categoryResult = await pool.query(
      'SELECT * FROM categories WHERE slug = $1',
      [req.params.slug]
    );
    
    if (categoryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    const category = categoryResult.rows[0];
    
    const productsResult = await pool.query(
      `SELECT p.*, col.name as collection_name
       FROM products p
       LEFT JOIN collections col ON p.collection_id = col.id
       WHERE p.category_id = $1 AND p.stock_quantity > 0
       ORDER BY p.created_at DESC`,
      [category.id]
    );
    
    const collectionsResult = await pool.query(
      'SELECT * FROM collections WHERE category_id = $1 ORDER BY name',
      [category.id]
    );
    
    res.json({
      ...category,
      products: productsResult.rows,
      collections: collectionsResult.rows,
      product_count: productsResult.rows.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Search products
app.get('/api/search', async (req, res) => {
  const { q } = req.query;
  
  if (!q) {
    return res.json([]);
  }
  
  try {
    const result = await pool.query(
      `SELECT p.*, c.name as category_name
       FROM products p
       JOIN categories c ON p.category_id = c.id
       WHERE p.name ILIKE $1 OR p.description ILIKE $1
       ORDER BY p.created_at DESC
       LIMIT 20`,
      [`%${q}%`]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== ORDER ENDPOINTS (Shop accessible) ==========

// Create a new order
app.post('/api/orders', async (req, res) => {
  const { items, customer, shipping, payment } = req.body;
  
  try {
    await pool.query('BEGIN');
    
    const orderNumber = `CESA-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const shippingCost = shipping?.cost || 0;
    const total = subtotal + shippingCost;
    
    const result = await pool.query(
      `INSERT INTO orders (
        order_number, customer_email, customer_name, customer_phone,
        items, subtotal, shipping, total,
        shipping_address, billing_address,
        payment_method, payment_status, order_status, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
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
        payment?.method || 'stripe',
        payment?.status || 'pending',
        'processing',
        customer?.notes || ''
      ]
    );
    
    for (const item of items) {
      await pool.query(
        `UPDATE products 
         SET stock_quantity = stock_quantity - $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [item.quantity, item.product_id]
      );
      
      await pool.query(
        `INSERT INTO inventory_transactions 
         (product_id, transaction_type, quantity_change, new_quantity, notes, order_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          item.product_id,
          'order_placed',
          -item.quantity,
          item.stock_quantity - item.quantity,
          `Sold ${item.quantity} units via order ${orderNumber}`,
          result.rows[0].id
        ]
      );
    }
    
    await pool.query('COMMIT');
    res.json({ 
      success: true, 
      order: result.rows[0],
      message: 'Order created successfully'
    });
  } catch (err) {
    await pool.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  }
});

// Get order by ID or order number (public tracking)
app.get('/api/orders/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, order_number, order_status, customer_email, 
              customer_name, total, created_at, updated_at,
              tracking_number, shipping_carrier
       FROM orders 
       WHERE order_number = $1`,
      [req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Only return basic info for public tracking
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== ADMIN ENDPOINTS (Admin app only) ==========
// Middleware to protect admin routes (basic example)
const adminOnly = (req, res, next) => {
  const origin = req.headers.origin;
  const adminOrigins = [
    'https://cesa-admin.up.railway.app',
    'https://admin.cesadesigns.com',
    'http://localhost:5174',
    'http://localhost:3001',
    'https://cesa-designs-admin-production.up.railway.app' // Your actual admin frontend
  ];
  
  // In production, add proper authentication
  if (process.env.NODE_ENV === 'production') {
    if (!origin || !adminOrigins.includes(origin)) {
      return res.status(403).json({ error: 'Admin access only' });
    }
  }
  
  next();
};

// Get all orders (admin only)
app.get('/api/admin/orders', adminOnly, async (req, res) => {
  const { 
    status, 
    email, 
    startDate, 
    endDate,
    page = 1,
    limit = 20
  } = req.query;
  
  try {
    let query = `
      SELECT 
        o.*,
        COUNT(*) OVER() as total_count
      FROM orders o
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 1;
    
    if (status) {
      query += ` AND o.order_status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }
    
    if (email) {
      query += ` AND o.customer_email ILIKE $${paramCount}`;
      params.push(`%${email}%`);
      paramCount++;
    }
    
    if (startDate) {
      query += ` AND o.created_at >= $${paramCount}`;
      params.push(startDate);
      paramCount++;
    }
    
    if (endDate) {
      query += ` AND o.created_at <= $${paramCount}`;
      params.push(endDate);
      paramCount++;
    }
    
    query += ` ORDER BY o.created_at DESC
               LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    
    const offset = (page - 1) * limit;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    res.json({
      orders: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0,
        totalPages: Math.ceil((result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0) / limit)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update order status (admin only)
app.patch('/api/admin/orders/:id', adminOnly, async (req, res) => {
  const { order_status, payment_status, tracking_number, shipping_carrier, notes } = req.body;
  
  try {
    await pool.query('BEGIN');
    
    const updateResult = await pool.query(
      `UPDATE orders 
       SET 
         order_status = COALESCE($1, order_status),
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
        `INSERT INTO order_status_history 
         (order_id, order_status, payment_status, notes)
         VALUES ($1, $2, $3, $4)`,
        [
          updateResult.rows[0].id,
          updateResult.rows[0].order_status,
          updateResult.rows[0].payment_status,
          `Status updated via admin panel`
        ]
      );
    }
    
    await pool.query('COMMIT');
    res.json(updateResult.rows[0]);
  } catch (err) {
    await pool.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  }
});

// Get order status history (admin only)
app.get('/api/admin/orders/:id/history', adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM order_status_history 
       WHERE order_id::text = $1 
       OR order_id IN (SELECT id FROM orders WHERE order_number = $1)
       ORDER BY created_at DESC`,
      [req.params.id]
    );
    
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get customer orders by email (admin only)
app.get('/api/admin/customers/:email/orders', adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM orders 
       WHERE customer_email ILIKE $1 
       ORDER BY created_at DESC`,
      [req.params.email]
    );
    
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get order statistics (admin only)
app.get('/api/admin/orders/stats/dashboard', adminOnly, async (req, res) => {
  try {
    const [
      totalOrders,
      totalRevenue,
      pendingOrders,
      completedOrders,
      recentOrders,
      revenueByMonth
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM orders'),
      pool.query('SELECT COALESCE(SUM(total), 0) as revenue FROM orders WHERE payment_status = $1', ['paid']),
      pool.query('SELECT COUNT(*) as count FROM orders WHERE order_status = $1', ['processing']),
      pool.query('SELECT COUNT(*) as count FROM orders WHERE order_status = $1', ['completed']),
      pool.query('SELECT * FROM orders ORDER BY created_at DESC LIMIT 10'),
      pool.query(`
        SELECT 
          DATE_TRUNC('month', created_at) as month,
          COUNT(*) as order_count,
          COALESCE(SUM(total), 0) as revenue
        FROM orders 
        WHERE created_at >= NOW() - INTERVAL '6 months'
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY month DESC
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

// ========== INVENTORY MANAGEMENT (Admin only) ==========

// Get all products with detailed inventory info
app.get('/api/admin/inventory', adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.*,
        c.name as category_name,
        c.slug as category_slug,
        col.name as collection_name,
        COUNT(o.id) as total_sold,
        COALESCE(SUM(oi.quantity), 0) as units_sold
      FROM products p
      JOIN categories c ON p.category_id = c.id
      LEFT JOIN collections col ON p.collection_id = col.id
      LEFT JOIN order_items oi ON p.id = oi.product_id
      LEFT JOIN orders o ON oi.order_id = o.id AND o.order_status = 'completed'
      GROUP BY p.id, c.name, c.slug, col.name
      ORDER BY p.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get inventory statistics
app.get('/api/admin/inventory/stats', adminOnly, async (req, res) => {
  try {
    const [
      totalProducts,
      lowStockProducts,
      outOfStockProducts,
      totalValue,
      recentTransactions,
      topSellingProducts
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM products'),
      pool.query('SELECT COUNT(*) as count FROM products WHERE stock_quantity BETWEEN 1 AND 10'),
      pool.query('SELECT COUNT(*) as count FROM products WHERE stock_quantity = 0'),
      pool.query(`
        SELECT COALESCE(SUM(price * stock_quantity), 0) as value 
        FROM products
      `),
      pool.query(`
        SELECT * FROM inventory_transactions 
        ORDER BY created_at DESC 
        LIMIT 10
      `),
      pool.query(`
        SELECT 
          p.id,
          p.name,
          p.sku,
          c.name as category,
          COUNT(oi.id) as total_orders,
          COALESCE(SUM(oi.quantity), 0) as units_sold
        FROM products p
        LEFT JOIN order_items oi ON p.id = oi.product_id
        LEFT JOIN orders o ON oi.order_id = o.id
        JOIN categories c ON p.category_id = c.id
        WHERE o.order_status = 'completed' OR o.id IS NULL
        GROUP BY p.id, p.name, p.sku, c.name
        ORDER BY units_sold DESC
        LIMIT 10
      `)
    ]);
    
    res.json({
      total_products: parseInt(totalProducts.rows[0].count),
      low_stock: parseInt(lowStockProducts.rows[0].count),
      out_of_stock: parseInt(outOfStockProducts.rows[0].count),
      inventory_value: parseFloat(totalValue.rows[0].value),
      recent_transactions: recentTransactions.rows,
      top_selling: topSellingProducts.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add new product (admin only)
app.post('/api/admin/inventory/products', adminOnly, async (req, res) => {
  const {
    name,
    description,
    sku,
    price,
    category_id,
    collection_id,
    initial_stock,
    images,
    variants
  } = req.body;
  
  try {
    await pool.query('BEGIN');
    
    const productResult = await pool.query(
      `INSERT INTO products (
        name, description, sku, price, 
        category_id, collection_id, stock_quantity,
        images, variants, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *`,
      [
        name,
        description,
        sku,
        price,
        category_id,
        collection_id,
        initial_stock || 0,
        JSON.stringify(images || []),
        JSON.stringify(variants || [])
      ]
    );
    
    if (initial_stock && initial_stock > 0) {
      await pool.query(
        `INSERT INTO inventory_transactions 
         (product_id, transaction_type, quantity_change, new_quantity, notes)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          productResult.rows[0].id,
          'initial_stock',
          initial_stock,
          initial_stock,
          `Initial stock added: ${initial_stock} units`
        ]
      );
    }
    
    await pool.query('COMMIT');
    res.json({ success: true, product: productResult.rows[0] });
  } catch (err) {
    await pool.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  }
});

// Update product details (admin only)
app.put('/api/admin/inventory/products/:id', adminOnly, async (req, res) => {
  const { name, description, price, category_id, collection_id, images, variants } = req.body;
  
  try {
    const result = await pool.query(
      `UPDATE products 
       SET 
         name = COALESCE($1, name),
         description = COALESCE($2, description),
         price = COALESCE($3, price),
         category_id = COALESCE($4, category_id),
         collection_id = COALESCE($5, collection_id),
         images = COALESCE($6, images),
         variants = COALESCE($7, variants),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $8
       RETURNING *`,
      [
        name,
        description,
        price,
        category_id,
        collection_id,
        images ? JSON.stringify(images) : null,
        variants ? JSON.stringify(variants) : null,
        req.params.id
      ]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.json({ success: true, product: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk update stock (admin only)
app.post('/api/admin/inventory/bulk-update', adminOnly, async (req, res) => {
  const { updates } = req.body;
  
  try {
    await pool.query('BEGIN');
    
    const results = [];
    
    for (const update of updates) {
      const { product_id, quantity_change, reason, notes } = update;
      
      const updateResult = await pool.query(
        `UPDATE products 
         SET stock_quantity = GREATEST(0, stock_quantity + $1),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *`,
        [quantity_change, product_id]
      );
      
      if (updateResult.rows.length === 0) {
        continue;
      }
      
      await pool.query(
        `INSERT INTO inventory_transactions 
         (product_id, transaction_type, quantity_change, new_quantity, notes)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          product_id,
          reason || 'bulk_adjustment',
          quantity_change,
          updateResult.rows[0].stock_quantity,
          notes || `Bulk update: ${quantity_change > 0 ? '+' : ''}${quantity_change} units`
        ]
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

// Delete product (admin only) - NEW ROUTE
app.delete('/api/admin/inventory/products/:id', adminOnly, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // First delete related inventory transactions (due to foreign key)
    await client.query('DELETE FROM inventory_transactions WHERE product_id = $1', [req.params.id]);

    // Delete the product
    const result = await client.query('DELETE FROM products WHERE id = $1 RETURNING *', [req.params.id]);

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Product not found' });
    }

    await client.query('COMMIT');
    res.json({ success: true, message: 'Product deleted successfully', product: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error deleting product:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Get inventory transactions (admin only)
app.get('/api/admin/inventory/transactions', adminOnly, async (req, res) => {
  const { product_id, start_date, end_date, type, page = 1, limit = 50 } = req.query;
  
  try {
    let query = `
      SELECT 
        t.*,
        p.name as product_name,
        p.sku,
        c.name as category_name,
        COUNT(*) OVER() as total_count
      FROM inventory_transactions t
      JOIN products p ON t.product_id = p.id
      JOIN categories c ON p.category_id = c.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 1;
    
    if (product_id) {
      query += ` AND t.product_id = $${paramCount}`;
      params.push(product_id);
      paramCount++;
    }
    
    if (type) {
      query += ` AND t.transaction_type = $${paramCount}`;
      params.push(type);
      paramCount++;
    }
    
    if (start_date) {
      query += ` AND t.created_at >= $${paramCount}`;
      params.push(start_date);
      paramCount++;
    }
    
    if (end_date) {
      query += ` AND t.created_at <= $${paramCount}`;
      params.push(end_date);
      paramCount++;
    }
    
    query += ` ORDER BY t.created_at DESC
               LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    
    const offset = (page - 1) * limit;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    res.json({
      transactions: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Export inventory data (admin only)
app.get('/api/admin/inventory/export', adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.sku,
        p.name,
        c.name as category,
        col.name as collection,
        p.price,
        p.stock_quantity,
        p.created_at,
        p.updated_at,
        COUNT(DISTINCT o.id) as total_orders,
        COALESCE(SUM(oi.quantity), 0) as units_sold,
        COALESCE(SUM(oi.quantity * oi.price), 0) as revenue
      FROM products p
      JOIN categories c ON p.category_id = c.id
      LEFT JOIN collections col ON p.collection_id = col.id
      LEFT JOIN order_items oi ON p.id = oi.product_id
      LEFT JOIN orders o ON oi.order_id = o.id
      GROUP BY p.id, p.sku, p.name, c.name, col.name, p.price, p.stock_quantity, p.created_at, p.updated_at
      ORDER BY p.category_id, p.created_at DESC
    `);
    
    const csv = result.rows.map(row => 
      Object.values(row).map(val => 
        typeof val === 'string' && val.includes(',') ? `"${val}"` : val
      ).join(',')
    ).join('\n');
    
    const headers = Object.keys(result.rows[0]).join(',');
    const csvData = headers + '\n' + csv;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=inventory-export.csv');
    res.send(csvData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get sales analytics (admin only)
app.get('/api/admin/sales/analytics', adminOnly, async (req, res) => {
  const { period = 'month' } = req.query;
  
  try {
    let interval;
    switch(period) {
      case 'day': interval = 'day'; break;
      case 'week': interval = 'week'; break;
      case 'month': interval = 'month'; break;
      case 'year': interval = 'year'; break;
      default: interval = 'month';
    }
    
    const salesResult = await pool.query(`
      SELECT 
        DATE_TRUNC('${interval}', o.created_at) as period,
        COUNT(DISTINCT o.id) as order_count,
        COUNT(DISTINCT o.customer_email) as customer_count,
        SUM(o.total) as revenue,
        AVG(o.total) as avg_order_value,
        SUM(oi.quantity) as units_sold
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      WHERE o.order_status = 'completed'
        AND o.created_at >= NOW() - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('${interval}', o.created_at)
      ORDER BY period DESC
    `);
    
    const categorySales = await pool.query(`
      SELECT 
        c.name as category,
        COUNT(DISTINCT o.id) as order_count,
        SUM(oi.quantity) as units_sold,
        SUM(oi.quantity * oi.price) as revenue
      FROM categories c
      JOIN products p ON c.id = p.category_id
      JOIN order_items oi ON p.id = oi.product_id
      JOIN orders o ON oi.order_id = o.id
      WHERE o.order_status = 'completed'
        AND o.created_at >= NOW() - INTERVAL '30 days'
      GROUP BY c.id, c.name
      ORDER BY revenue DESC
    `);
    
    const topProducts = await pool.query(`
      SELECT 
        p.name,
        p.sku,
        c.name as category,
        SUM(oi.quantity) as units_sold,
        SUM(oi.quantity * oi.price) as revenue
      FROM products p
      JOIN categories c ON p.category_id = c.id
      JOIN order_items oi ON p.id = oi.product_id
      JOIN orders o ON oi.order_id = o.id
      WHERE o.order_status = 'completed'
        AND o.created_at >= NOW() - INTERVAL '30 days'
      GROUP BY p.id, p.name, p.sku, c.name
      ORDER BY units_sold DESC
      LIMIT 10
    `);
    
    res.json({
      sales_trend: salesResult.rows,
      category_performance: categorySales.rows,
      top_products: topProducts.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== ERROR HANDLING ==========

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.path,
    method: req.method 
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err.stack);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// ========== START SERVER ==========

const PORT = process.env.PORT || 3001;
// Bind to 0.0.0.0 to accept connections from anywhere (required for Railway)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
┌─────────────────────────────────────────────────────┐
│     🚀 Cesa Designs API - Multi-App Architecture    │
├─────────────────────────────────────────────────────┤
│ Port: ${PORT}                                          
│ Environment: ${process.env.NODE_ENV || 'development'}   
│ Database: ${process.env.DATABASE_URL ? 'Railway PostgreSQL' : 'Local DB'}
│                                                     │
│ 📱 Connected Apps:                                  
│   • Shop: https://cesa-shop.up.railway.app          
│   • Admin: https://cesa-admin.up.railway.app        
│   • API: https://cesa-api.up.railway.app            
│   • Your frontend: https://cesa-designs-production.up.railway.app
│                                                     │
│ 🌐 CORS Enabled for:                                
│   • Local dev (5173, 5174, 3000, 3001)              
│   • Railway apps (cesa-shop, cesa-admin, cesa-api)  
│   • Custom domains (cesadesigns.com, admin.cesadesigns.com)
│   • Your admin frontend: https://cesa-designs-admin-production.up.railway.app
│   • Your shop frontend: https://cesa-designs-production.up.railway.app
│                                                     │
│ 📊 Endpoints:                                       
│   • Public: /api/health, /api/products, /api/orders,
│             /api/categories, /api/collections (NEW!)
│   • Admin: /api/admin/* (protected)                 
│                                                     │
│ ⚡ Database Pool: 20 max connections                 
└─────────────────────────────────────────────────────┘
  `);
});