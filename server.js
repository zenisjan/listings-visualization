const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const ScraperScheduler = require('./scheduler');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Initialize scraper scheduler
console.log('🔑 APIFY_TOKEN loaded:', process.env.APIFY_TOKEN ? 'Yes (configured)' : 'No (missing)');
const scraperScheduler = new ScraperScheduler(pool, process.env.APIFY_TOKEN);

// Session configuration (using memory store for now)
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true if using HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(express.static('public'));

// Authentication middleware
const requireAuth = (req, res, next) => {
  if (req.session && req.session.userId) {
    return next();
  } else {
    return res.status(401).json({ error: 'Authentication required' });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.session && req.session.userId && req.session.role === 'admin') {
    return next();
  } else {
    return res.status(403).json({ error: 'Admin access required' });
  }
};

// Authentication routes
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const result = await pool.query(
      'SELECT id, email, password_hash, name, role FROM users WHERE email = $1 AND is_active = true',
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Update last login
    await pool.query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );
    
    // Create session
    req.session.userId = user.id;
    req.session.email = user.email;
    req.session.name = user.name;
    req.session.role = user.role;
    
    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true });
  });
});

app.get('/api/auth/check', (req, res) => {
  if (req.session && req.session.userId) {
    res.json({
      authenticated: true,
      user: {
        id: req.session.userId,
        email: req.session.email,
        name: req.session.name,
        role: req.session.role
      }
    });
  } else {
    res.json({ authenticated: false });
  }
});

// Protected routes
app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// User management routes (admin only)
app.get('/admin/users', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Scrapers management routes (authenticated users)
app.get('/scrapers', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'scrapers.html'));
});

app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, email, name, role, is_active, created_at, last_login
      FROM users 
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.post('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const { email, password, name, role } = req.body;
    
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const result = await pool.query(`
      INSERT INTO users (email, password_hash, name, role)
      VALUES ($1, $2, $3, $4)
      RETURNING id, email, name, role, is_active, created_at
    `, [email, hashedPassword, name, role || 'user']);
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating user:', error);
    if (error.code === '23505') { // Unique violation
      res.status(400).json({ error: 'Email already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create user' });
    }
  }
});

app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (id == req.session.userId) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Scrapers API endpoints
app.get('/api/scrapers', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, technical_name, actor_id, input, description, is_active, created_at, updated_at
      FROM scrapers
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching scrapers:', error);
    res.status(500).json({ error: 'Failed to fetch scrapers' });
  }
});

app.post('/api/scrapers', requireAuth, async (req, res) => {
  try {
    const { name, technical_name, actor_id, input, description } = req.body;
    
    console.log('📥 POST /api/scrapers received:', { name, technical_name, actor_id, input, description });
    
    if (!name || !technical_name || !actor_id || !input) {
      return res.status(400).json({ error: 'Name, technical name, actor ID, and input are required' });
    }

    // Validate JSON input
    try {
      const parsedInput = JSON.parse(input);
      console.log('✅ Server JSON validation passed for POST:', parsedInput);
    } catch (error) {
      console.error('❌ Server JSON validation failed for POST:', error, 'Input:', input);
      return res.status(400).json({ error: 'Input must be valid JSON: ' + error.message });
    }

    const result = await pool.query(`
      INSERT INTO scrapers (name, technical_name, actor_id, input, description, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, name, technical_name, actor_id, input, description, is_active, created_at
    `, [name, technical_name, actor_id, input, description || null, req.session.userId]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating scraper:', error);
    if (error.code === '23505') { // Unique constraint violation
      res.status(400).json({ error: 'Technical name already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create scraper' });
    }
  }
});

app.put('/api/scrapers/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, technical_name, actor_id, input, description } = req.body;
    
    console.log('📥 PUT /api/scrapers/' + id + ' received:', { name, technical_name, actor_id, input, description });
    
    if (!name || !technical_name || !actor_id || !input) {
      return res.status(400).json({ error: 'Name, technical name, actor ID, and input are required' });
    }

    // Validate JSON input
    try {
      const parsedInput = JSON.parse(input);
      console.log('✅ Server JSON validation passed for PUT:', parsedInput);
    } catch (error) {
      console.error('❌ Server JSON validation failed for PUT:', error, 'Input:', input);
      return res.status(400).json({ error: 'Input must be valid JSON: ' + error.message });
    }

    const result = await pool.query(`
      UPDATE scrapers 
      SET name = $1, technical_name = $2, actor_id = $3, input = $4, description = $5, updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING id, name, technical_name, actor_id, input, description, is_active, created_at, updated_at
    `, [name, technical_name, actor_id, input, description || null, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scraper not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating scraper:', error);
    if (error.code === '23505') { // Unique constraint violation
      res.status(400).json({ error: 'Technical name already exists' });
    } else {
      res.status(500).json({ error: 'Failed to update scraper' });
    }
  }
});

app.delete('/api/scrapers/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query('DELETE FROM scrapers WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scraper not found' });
    }

    res.json({ message: 'Scraper deleted successfully' });
  } catch (error) {
    console.error('Error deleting scraper:', error);
    res.status(500).json({ error: 'Failed to delete scraper' });
  }
});

// Scheduler API endpoints
app.get('/api/scheduler/status', requireAuth, (req, res) => {
  try {
    const status = scraperScheduler.getStatus();
    res.json(status);
  } catch (error) {
    console.error('Error getting scheduler status:', error);
    res.status(500).json({ error: 'Failed to get scheduler status' });
  }
});

app.post('/api/scheduler/run', requireAuth, async (req, res) => {
  try {
    await scraperScheduler.runScrapersManually();
    res.json({ message: 'Scrapers run triggered successfully' });
  } catch (error) {
    console.error('Error running scrapers manually:', error);
    res.status(500).json({ error: 'Failed to run scrapers' });
  }
});

app.get('/api/scrapers/:id/runs', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 10 } = req.query;

    const result = await pool.query(`
      SELECT ar.id, ar.run_id, ar.start_time as started_at, ar.end_time as finished_at,
             ar.status, ar.total_listings_scraped, ar.categories, ar.scraper_id,
             s.name as scraper_name
      FROM actor_runs ar
      JOIN scrapers s ON ar.scraper_id = s.id
      WHERE ar.scraper_id = $1
      ORDER BY ar.start_time DESC
      LIMIT $2
    `, [id, limit]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching scraper runs:', error);
    res.status(500).json({ error: 'Failed to fetch scraper runs' });
  }
});

// Protected API routes
app.get('/api/listings', requireAuth, async (req, res) => {
  try {
    const { category, price_min, price_max, location, search, scraper_name } = req.query;
    
    let query = `
      WITH latest_listings_with_changes AS (
      SELECT 
        l.id,
        l.scraper_name,
        l.title,
        l.url,
        l.category,
        l.price,
        l.price_text,
        l.description,
        l.full_description,
        l.location,
        l.views,
        l.date,
        l.is_top,
        l.image_url,
        l.contact_name,
        l.phone,
        l.coordinates_lat,
        l.coordinates_lng,
        l.images,
        l.scraped_at,
        l.run_id,
        -- Check for changes from previous version
        CASE 
          WHEN prev.price IS NOT NULL AND prev.price != l.price THEN true
          ELSE false
        END as price_changed,
        CASE 
          WHEN prev.description IS NOT NULL AND prev.description != l.description THEN true
          ELSE false
        END as description_changed,
        CASE 
          WHEN prev.is_top IS NOT NULL AND prev.is_top != l.is_top THEN true
          ELSE false
        END as top_status_changed,
        false as views_changed,
        CASE 
          WHEN prev.title IS NOT NULL AND prev.title != l.title THEN true
          ELSE false
        END as title_changed,
        -- Count total versions
        (SELECT COUNT(*) FROM listings l2 WHERE l2.url = l.url AND l2.scraper_name = l.scraper_name) as total_versions
      FROM latest_listings l
        JOIN actor_runs ar ON l.run_id = ar.run_id
        LEFT JOIN LATERAL (
          SELECT 
            prev_l.price,
            prev_l.description,
            prev_l.is_top,
            prev_l.title
          FROM listings prev_l
          JOIN actor_runs prev_ar ON prev_l.actor_run_id = prev_ar.id
          WHERE prev_l.url = l.url 
            AND prev_l.scraper_name = l.scraper_name
            AND prev_ar.run_id < ar.run_id
          ORDER BY prev_ar.run_id DESC
          LIMIT 1
        ) prev ON true
      WHERE l.coordinates_lat IS NOT NULL 
        AND l.coordinates_lng IS NOT NULL
      )
      SELECT * FROM latest_listings_with_changes
    `;
    
    const params = [];
    let paramCount = 0;
    
    // Add WHERE conditions to the CTE
    let whereConditions = [];
    
    if (category) {
      paramCount++;
      whereConditions.push(`l.category = $${paramCount}`);
      params.push(category);
    }
    
    if (price_min) {
      paramCount++;
      whereConditions.push(`l.price >= $${paramCount}`);
      params.push(parseInt(price_min));
    }
    
    if (price_max) {
      paramCount++;
      whereConditions.push(`l.price <= $${paramCount}`);
      params.push(parseInt(price_max));
    }
    
    if (location) {
      paramCount++;
      whereConditions.push(`l.location ILIKE $${paramCount}`);
      params.push(`%${location}%`);
    }
    
    if (search) {
      paramCount++;
      whereConditions.push(`(l.title ILIKE $${paramCount} OR l.description ILIKE $${paramCount})`);
      params.push(`%${search}%`);
    }
    
    if (scraper_name) {
      paramCount++;
      whereConditions.push(`l.scraper_name = $${paramCount}`);
      params.push(scraper_name);
    }
    
    // Add WHERE conditions to the CTE if any exist
    if (whereConditions.length > 0) {
      const whereClause = whereConditions.join(' AND ');
      query = query.replace(
        'WHERE l.coordinates_lat IS NOT NULL AND l.coordinates_lng IS NOT NULL',
        `WHERE l.coordinates_lat IS NOT NULL AND l.coordinates_lng IS NOT NULL AND ${whereClause}`
      );
    }
    
    query += ` ORDER BY scraped_at DESC LIMIT 5000`;
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching listings:', error);
    res.status(500).json({ error: 'Failed to fetch listings' });
  }
});

// Get categories
app.get('/api/categories', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT category, COUNT(*) as count
      FROM latest_listings 
      WHERE coordinates_lat IS NOT NULL AND coordinates_lng IS NOT NULL
      GROUP BY category 
      ORDER BY count DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Get listing details with change history
app.get('/api/listings/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM latest_listings 
      WHERE id = $1
    `, [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found' });
    }
    
    const listing = result.rows[0];
    
    // Get change history for this listing
    const historyResult = await pool.query(`
      SELECT 
        l.*,
        l.scraped_at,
        ar.run_id,
        ROW_NUMBER() OVER (ORDER BY l.scraped_at DESC) as version_number
      FROM listings l
      JOIN actor_runs ar ON l.actor_run_id = ar.id
      WHERE l.url = $1
      ORDER BY l.scraped_at DESC
      LIMIT 10
    `, [listing.url]);
    
    listing.change_history = historyResult.rows;
    
    res.json(listing);
  } catch (error) {
    console.error('Error fetching listing details:', error);
    res.status(500).json({ error: 'Failed to fetch listing details' });
  }
});

// Get listing change history
app.get('/api/listings/:id/history', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        l.*,
        l.scraped_at,
        ar.run_id,
        ROW_NUMBER() OVER (ORDER BY l.scraped_at DESC) as version_number
      FROM listings l
      JOIN actor_runs ar ON l.actor_run_id = ar.id
      WHERE l.url = (SELECT url FROM latest_listings WHERE id = $1)
      ORDER BY l.scraped_at DESC
    `, [req.params.id]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching listing history:', error);
    res.status(500).json({ error: 'Failed to fetch listing history' });
  }
});

// Get available scrapers
app.get('/api/scrapers/available', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT scraper_name, COUNT(*) as count
      FROM latest_listings 
      WHERE coordinates_lat IS NOT NULL AND coordinates_lng IS NOT NULL
      GROUP BY scraper_name 
      ORDER BY count DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching scrapers:', error);
    res.status(500).json({ error: 'Failed to fetch scrapers' });
  }
});

// Get statistics
app.get('/api/stats', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_listings,
        COUNT(DISTINCT category) as total_categories,
        AVG(price) as avg_price,
        MIN(price) as min_price,
        MAX(price) as max_price,
        COUNT(CASE WHEN is_top = true THEN 1 END) as top_listings
      FROM latest_listings 
      WHERE coordinates_lat IS NOT NULL AND coordinates_lng IS NOT NULL
    `);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log('Make sure to configure your database connection in .env file');
  
  // Start the scraper scheduler
  if (process.env.APIFY_TOKEN) {
    scraperScheduler.start();
  } else {
    console.log('⚠️ APIFY_TOKEN not configured, scheduler not started');
  }
});
