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

-- Create index on technical_name for faster lookups
CREATE INDEX IF NOT EXISTS idx_scrapers_technical_name ON scrapers(technical_name);

-- Create index on is_active for filtering
CREATE INDEX IF NOT EXISTS idx_scrapers_is_active ON scrapers(is_active);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_scrapers_updated_at 
    BEFORE UPDATE ON scrapers 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Create scraper_runs table for tracking runs
CREATE TABLE IF NOT EXISTS scraper_runs (
    id SERIAL PRIMARY KEY,
    scraper_id INTEGER NOT NULL REFERENCES scrapers(id) ON DELETE CASCADE,
    apify_run_id VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP WITH TIME ZONE,
    items_count INTEGER,
    error_message TEXT
);

-- Create index on scraper_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_scraper_runs_scraper_id ON scraper_runs(scraper_id);

-- Create index on started_at for sorting
CREATE INDEX IF NOT EXISTS idx_scraper_runs_started_at ON scraper_runs(started_at);

-- Insert some example scrapers
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
