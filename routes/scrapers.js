const express = require('express');
const path = require('path');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

module.exports = (pool) => {
  router.get('/scrapers', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'scrapers.html'));
  });

  // Available scrapers for map filter (must be before :id routes)
  router.get('/api/scrapers/available', requireAuth, async (req, res) => {
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

  router.get('/api/scrapers', requireAuth, async (req, res) => {
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

  router.post('/api/scrapers', requireAuth, async (req, res) => {
    try {
      const { name, technical_name, actor_id, input, description } = req.body;

      if (!name || !technical_name || !actor_id || !input) {
        return res.status(400).json({ error: 'Name, technical name, actor ID, and input are required' });
      }

      try {
        JSON.parse(input);
      } catch (error) {
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
      if (error.code === '23505') {
        res.status(400).json({ error: 'Technical name already exists' });
      } else {
        res.status(500).json({ error: 'Failed to create scraper' });
      }
    }
  });

  router.put('/api/scrapers/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { name, technical_name, actor_id, input, description } = req.body;

      if (!name || !technical_name || !actor_id || !input) {
        return res.status(400).json({ error: 'Name, technical name, actor ID, and input are required' });
      }

      try {
        JSON.parse(input);
      } catch (error) {
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
      if (error.code === '23505') {
        res.status(400).json({ error: 'Technical name already exists' });
      } else {
        res.status(500).json({ error: 'Failed to update scraper' });
      }
    }
  });

  router.delete('/api/scrapers/:id', requireAuth, async (req, res) => {
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

  router.get('/api/scrapers/:id/runs', requireAuth, async (req, res) => {
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

  return router;
};
