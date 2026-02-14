-- Unified Database Migration
-- This file combines authentication, scraper management, and listing data schemas
-- Run this script to create the complete database schema

-- =============================================================================
-- AUTHENTICATION SYSTEM
-- =============================================================================

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE
);

-- Create sessions table for session management
CREATE TABLE IF NOT EXISTS user_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ip_address INET,
    user_agent TEXT
);

-- =============================================================================
-- SCRAPER MANAGEMENT SYSTEM
-- =============================================================================

-- Create scrapers table for managing Apify actors
CREATE TABLE IF NOT EXISTS scrapers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    technical_name VARCHAR(255) UNIQUE NOT NULL,
    actor_id VARCHAR(255) NOT NULL,
    input JSONB NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- Create unified scraper_runs table (replaces both scraper_runs and actor_runs)
CREATE TABLE IF NOT EXISTS scraper_runs (
    id SERIAL PRIMARY KEY,
    scraper_id INTEGER NOT NULL REFERENCES scrapers(id) ON DELETE CASCADE,
    run_id VARCHAR(100) UNIQUE NOT NULL, -- Apify run ID
    apify_run_id VARCHAR(255) NOT NULL, -- Alternative field for compatibility
    status VARCHAR(50) NOT NULL DEFAULT 'running',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP WITH TIME ZONE,
    items_count INTEGER,
    total_listings_scraped INTEGER DEFAULT 0,
    error_message TEXT,
    
    -- Scraper configuration (moved from actor_runs)
    categories TEXT[],
    max_listings INTEGER,
    search_query TEXT,
    location_filter TEXT,
    price_min INTEGER,
    price_max INTEGER,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- =============================================================================
-- LISTING DATA SYSTEM
-- =============================================================================

-- Create listings table (generalized from bazos_listings)
CREATE TABLE IF NOT EXISTS listings (
    id VARCHAR(50) NOT NULL,
    scraper_run_id INTEGER NOT NULL REFERENCES scraper_runs(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    category VARCHAR(50) NOT NULL,
    price INTEGER,
    price_text VARCHAR(100),
    description TEXT,
    full_description TEXT,
    location TEXT,
    views INTEGER DEFAULT 0,
    date VARCHAR(100),
    is_top BOOLEAN DEFAULT FALSE,
    image_url TEXT,
    contact_name VARCHAR(255),
    phone VARCHAR(100),
    coordinates_lat DECIMAL(10, 8),
    coordinates_lng DECIMAL(11, 8),
    images JSONB,
    similar_listings JSONB,
    scraped_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Primary key using listing ID and scraper run ID
    PRIMARY KEY (id, scraper_run_id)
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- User and session indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON user_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON user_sessions(expires_at);

-- Scraper indexes
CREATE INDEX IF NOT EXISTS idx_scrapers_technical_name ON scrapers(technical_name);
CREATE INDEX IF NOT EXISTS idx_scrapers_is_active ON scrapers(is_active);
CREATE INDEX IF NOT EXISTS idx_scrapers_created_by ON scrapers(created_by);

-- Scraper runs indexes
CREATE INDEX IF NOT EXISTS idx_scraper_runs_scraper_id ON scraper_runs(scraper_id);
CREATE INDEX IF NOT EXISTS idx_scraper_runs_run_id ON scraper_runs(run_id);
CREATE INDEX IF NOT EXISTS idx_scraper_runs_apify_run_id ON scraper_runs(apify_run_id);
CREATE INDEX IF NOT EXISTS idx_scraper_runs_started_at ON scraper_runs(started_at);
CREATE INDEX IF NOT EXISTS idx_scraper_runs_status ON scraper_runs(status);
CREATE INDEX IF NOT EXISTS idx_scraper_runs_created_by ON scraper_runs(created_by);

-- Listings indexes
CREATE INDEX IF NOT EXISTS idx_listings_scraper_run_id ON listings(scraper_run_id);
CREATE INDEX IF NOT EXISTS idx_listings_category ON listings(category);
CREATE INDEX IF NOT EXISTS idx_listings_price ON listings(price);
CREATE INDEX IF NOT EXISTS idx_listings_location ON listings(location);
CREATE INDEX IF NOT EXISTS idx_listings_scraped_at ON listings(scraped_at);
CREATE INDEX IF NOT EXISTS idx_listings_is_top ON listings(is_top);

-- =============================================================================
-- TRIGGERS AND FUNCTIONS
-- =============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for scrapers table
CREATE TRIGGER update_scrapers_updated_at 
    BEFORE UPDATE ON scrapers 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- VIEWS FOR EASY QUERYING
-- =============================================================================

-- View for easy querying of latest listings
CREATE OR REPLACE VIEW latest_listings AS
SELECT DISTINCT ON (l.id) 
    l.id,
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
    l.similar_listings,
    l.scraped_at,
    sr.run_id,
    sr.apify_run_id,
    sr.started_at as scraper_run_start,
    s.name as scraper_name,
    s.technical_name as scraper_technical_name
FROM listings l
JOIN scraper_runs sr ON l.scraper_run_id = sr.id
JOIN scrapers s ON sr.scraper_id = s.id
ORDER BY l.id, l.scraped_at DESC;

-- View for scraper run statistics
CREATE OR REPLACE VIEW scraper_run_stats AS
SELECT 
    sr.id,
    sr.run_id,
    sr.apify_run_id,
    sr.started_at,
    sr.finished_at,
    sr.categories,
    sr.max_listings,
    sr.search_query,
    sr.location_filter,
    sr.price_min,
    sr.price_max,
    sr.total_listings_scraped,
    sr.status,
    sr.created_at,
    s.name as scraper_name,
    s.technical_name as scraper_technical_name,
    u.name as created_by_name,
    COUNT(l.id) as actual_listings_count,
    COUNT(DISTINCT l.category) as categories_scraped,
    MIN(l.scraped_at) as first_listing_scraped,
    MAX(l.scraped_at) as last_listing_scraped
FROM scraper_runs sr
JOIN scrapers s ON sr.scraper_id = s.id
LEFT JOIN users u ON sr.created_by = u.id
LEFT JOIN listings l ON sr.id = l.scraper_run_id
GROUP BY sr.id, sr.run_id, sr.apify_run_id, sr.started_at, sr.finished_at, 
         sr.categories, sr.max_listings, sr.search_query, sr.location_filter, 
         sr.price_min, sr.price_max, sr.total_listings_scraped, sr.status, 
         sr.created_at, s.name, s.technical_name, u.name;

-- =============================================================================
-- DEFAULT DATA
-- =============================================================================

-- Insert default admin user (password: admin123)
-- You should change this password after first login
INSERT INTO users (email, password_hash, name, role) 
VALUES ('admin@example.com', '$2b$10$ZIy8U82810QtF4v4AuSbY.LdpCyq.f43dc3e.G9plOPqsNs.Ysqf2', 'Admin User', 'admin')
ON CONFLICT (email) DO NOTHING;

-- Insert example scrapers
INSERT INTO scrapers (name, technical_name, actor_id, input, description, created_by) VALUES
(
    'Bazos Electronics Scraper',
    'bazos-electronics',
    'apify/bazos-scraper',
    '{"startUrls": ["https://www.bazos.sk/elektro/"], "maxItems": 1000, "category": "electronics"}',
    'Scrapes electronics listings from Bazos Slovakia',
    1
),
(
    'Bazos Real Estate Scraper',
    'bazos-real-estate',
    'apify/bazos-scraper',
    '{"startUrls": ["https://www.bazos.sk/nehnutelnosti/"], "maxItems": 500, "category": "real-estate"}',
    'Scrapes real estate listings from Bazos Slovakia',
    1
)
ON CONFLICT (technical_name) DO NOTHING;

-- =============================================================================
-- PERMISSIONS (Uncomment and adjust as needed for your setup)
-- =============================================================================

-- GRANT ALL PRIVILEGES ON TABLE users TO your_username;
-- GRANT ALL PRIVILEGES ON TABLE user_sessions TO your_username;
-- GRANT ALL PRIVILEGES ON TABLE scrapers TO your_username;
-- GRANT ALL PRIVILEGES ON TABLE scraper_runs TO your_username;
-- GRANT ALL PRIVILEGES ON TABLE listings TO your_username;
-- GRANT ALL PRIVILEGES ON VIEW latest_listings TO your_username;
-- GRANT ALL PRIVILEGES ON VIEW scraper_run_stats TO your_username;
-- GRANT USAGE, SELECT ON SEQUENCE users_id_seq TO your_username;
-- GRANT USAGE, SELECT ON SEQUENCE user_sessions_id_seq TO your_username;
-- GRANT USAGE, SELECT ON SEQUENCE scrapers_id_seq TO your_username;
-- GRANT USAGE, SELECT ON SEQUENCE scraper_runs_id_seq TO your_username;
