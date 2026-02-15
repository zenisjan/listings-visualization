const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

module.exports = (pool) => {
  router.get('/api/listings', requireAuth, async (req, res) => {
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

  router.get('/api/categories', requireAuth, async (req, res) => {
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

  router.get('/api/listings/:id', requireAuth, async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT * FROM latest_listings
        WHERE id = $1
      `, [req.params.id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Listing not found' });
      }

      const listing = result.rows[0];

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

  router.get('/api/listings/:id/history', requireAuth, async (req, res) => {
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

  router.get('/api/stats', requireAuth, async (req, res) => {
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

  return router;
};
