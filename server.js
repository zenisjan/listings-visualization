const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const ScraperScheduler = require('./scheduler');
const { requireAuth } = require('./middleware/auth');
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
console.log('APIFY_TOKEN loaded:', process.env.APIFY_TOKEN ? 'Yes (configured)' : 'No (missing)');
const scraperScheduler = new ScraperScheduler(pool, process.env.APIFY_TOKEN);

// Session configuration with PostgreSQL store
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  console.warn('WARNING: SESSION_SECRET not set. Using random secret (sessions will not persist across restarts).');
}

app.use(session({
  store: new pgSession({
    pool,
    tableName: 'session',
    createTableIfMissing: true,
  }),
  secret: sessionSecret || require('crypto').randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  }
}));

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.static('public'));

// Routes
app.use(require('./routes/auth')(pool));
app.use(require('./routes/users')(pool));
app.use(require('./routes/scrapers')(pool));
app.use(require('./routes/listings')(pool));
app.use(require('./routes/scheduler')(scraperScheduler));

// Protected page routes
app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);

  if (process.env.APIFY_TOKEN) {
    scraperScheduler.start();
  } else {
    console.log('APIFY_TOKEN not configured, scheduler not started');
  }
});
