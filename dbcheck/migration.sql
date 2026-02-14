-- VibedActor Database Migration
-- Resolves split-brain between actor_runs (scrapers) and scraper_runs (scheduler)
--
-- Pre-conditions (verified via live inspection):
--   actor_runs: 29 rows (canonical, used by bazos-scraper + gfr-scraper)
--   listings: 6,796 rows (references actor_runs)
--   bazos_listings: 5,159 rows (100% duplicate of listings — DROP)
--   scraper_runs: 9 rows (scheduler log — migrate to actor_runs then DROP)
--   scrapers: defined scraper configs
--
-- Run with: psql -h HOST -p 25432 -U postgres -d bazos_scraper -f migration.sql

BEGIN;

-- =============================================================================
-- 2.2  Drop legacy duplicate table
-- =============================================================================
DROP TABLE IF EXISTS bazos_listings;

-- =============================================================================
-- 2.3  Add scraper_id to actor_runs (links runs to scheduler's scraper defs)
-- =============================================================================
ALTER TABLE actor_runs
  ADD COLUMN IF NOT EXISTS scraper_id INTEGER REFERENCES scrapers(id) ON DELETE SET NULL;

-- =============================================================================
-- 2.4  Migrate scraper_runs data into actor_runs
--      Match on apify_run_id (scraper_runs) = run_id (actor_runs)
-- =============================================================================

-- First, update existing actor_runs where we can match by run_id
UPDATE actor_runs ar
SET scraper_id = sr.scraper_id
FROM scraper_runs sr
WHERE ar.run_id = sr.apify_run_id
  AND ar.scraper_id IS NULL;

-- Insert any scraper_runs that don't have a matching actor_runs record
INSERT INTO actor_runs (run_id, start_time, status, scraper_id)
SELECT
  sr.apify_run_id,
  sr.started_at,
  sr.status,
  sr.scraper_id
FROM scraper_runs sr
WHERE NOT EXISTS (
  SELECT 1 FROM actor_runs ar WHERE ar.run_id = sr.apify_run_id
);

-- Now drop scraper_runs
DROP TABLE IF EXISTS scraper_runs;

-- =============================================================================
-- 2.5  Update / recreate views
-- =============================================================================

-- Drop old views that may reference dropped tables
DROP VIEW IF EXISTS scraper_stats CASCADE;
DROP VIEW IF EXISTS actor_run_stats CASCADE;
DROP VIEW IF EXISTS latest_listings CASCADE;
DROP VIEW IF EXISTS scraper_run_stats CASCADE;

-- Recreate latest_listings with scraper info
CREATE OR REPLACE VIEW latest_listings AS
SELECT DISTINCT ON (l.id, l.scraper_name)
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
    l.similar_listings,
    l.scraped_at,
    ar.run_id,
    ar.start_time AS actor_run_start,
    ar.scraper_id,
    s.name AS scraper_display_name
FROM listings l
JOIN actor_runs ar ON l.actor_run_id = ar.id
LEFT JOIN scrapers s ON ar.scraper_id = s.id
ORDER BY l.id, l.scraper_name, l.scraped_at DESC;

-- Recreate actor_run_stats with scraper name
CREATE OR REPLACE VIEW actor_run_stats AS
SELECT
    ar.id,
    ar.run_id,
    ar.start_time,
    ar.end_time,
    ar.categories,
    ar.max_listings,
    ar.search_query,
    ar.location_filter,
    ar.price_min,
    ar.price_max,
    ar.total_listings_scraped,
    ar.status,
    ar.scraper_id,
    s.name AS scraper_name,
    s.technical_name AS scraper_technical_name,
    COUNT(l.id) AS actual_listings_count,
    COUNT(DISTINCT l.category) AS categories_scraped,
    MIN(l.scraped_at) AS first_listing_scraped,
    MAX(l.scraped_at) AS last_listing_scraped
FROM actor_runs ar
LEFT JOIN scrapers s ON ar.scraper_id = s.id
LEFT JOIN listings l ON ar.id = l.actor_run_id
GROUP BY ar.id, ar.run_id, ar.start_time, ar.end_time,
         ar.categories, ar.max_listings, ar.search_query, ar.location_filter,
         ar.price_min, ar.price_max, ar.total_listings_scraped, ar.status,
         ar.scraper_id, s.name, s.technical_name;

-- Recreate scraper_stats as a convenience view
CREATE OR REPLACE VIEW scraper_stats AS
SELECT
    l.scraper_name,
    COUNT(*) AS total_listings,
    COUNT(DISTINCT l.category) AS total_categories,
    COUNT(DISTINCT l.actor_run_id) AS total_runs,
    MIN(l.scraped_at) AS first_scraped,
    MAX(l.scraped_at) AS last_scraped,
    AVG(l.price) AS avg_price
FROM listings l
GROUP BY l.scraper_name;

-- =============================================================================
-- Add index on new column
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_actor_runs_scraper_id ON actor_runs(scraper_id);

COMMIT;
