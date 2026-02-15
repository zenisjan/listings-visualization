const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

module.exports = (scraperScheduler) => {
  router.get('/api/scheduler/status', requireAuth, (req, res) => {
    try {
      const status = scraperScheduler.getStatus();
      res.json(status);
    } catch (error) {
      console.error('Error getting scheduler status:', error);
      res.status(500).json({ error: 'Failed to get scheduler status' });
    }
  });

  router.post('/api/scheduler/run', requireAuth, async (req, res) => {
    try {
      await scraperScheduler.runScrapersManually();
      res.json({ message: 'Scrapers run triggered successfully' });
    } catch (error) {
      console.error('Error running scrapers manually:', error);
      res.status(500).json({ error: 'Failed to run scrapers' });
    }
  });

  return router;
};
