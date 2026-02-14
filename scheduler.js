const cron = require('node-cron');
const axios = require('axios');
const { Pool } = require('pg');

class ScraperScheduler {
    constructor(pool, apifyToken) {
        this.pool = pool;
        this.apifyToken = apifyToken;
        this.isRunning = false;
        this.lastRun = null;
        this.nextRun = null;
        
        console.log('🤖 ScraperScheduler initialized with token:', apifyToken ? 'Present' : 'Missing');
    }

    // Start the scheduler
    start() {
        console.log('🤖 Starting Scraper Scheduler...');
        
        // Schedule daily runs at 8 AM
        this.schedule = cron.schedule('0 8 * * *', async () => {
            console.log('⏰ Scheduled scraper run triggered at', new Date().toISOString());
            await this.runAllActiveScrapers();
        }, {
            scheduled: true,
            timezone: 'Europe/Prague'
        });

        // Calculate next run time
        this.calculateNextRun();
        
        console.log('✅ Scraper Scheduler started');
        console.log('📅 Next scheduled run:', this.nextRun);
        console.log('🔄 Scheduler status:', this.getStatus());
    }

    // Stop the scheduler
    stop() {
        if (this.schedule) {
            this.schedule.stop();
            console.log('🛑 Scraper Scheduler stopped');
        }
    }

    // Calculate next run time
    calculateNextRun() {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(8, 0, 0, 0);
        this.nextRun = tomorrow;
    }

    // Run all active scrapers
    async runAllActiveScrapers() {
        if (this.isRunning) {
            console.log('⚠️ Scraper run already in progress, skipping...');
            return;
        }

        this.isRunning = true;
        this.lastRun = new Date();

        try {
            console.log('🚀 Starting scheduled scraper run...');
            
            // Get all active scrapers
            const result = await this.pool.query(`
                SELECT id, name, technical_name, actor_id, input
                FROM scrapers
                WHERE is_active = true
                ORDER BY created_at ASC
            `);

            const scrapers = result.rows;
            console.log(`📋 Found ${scrapers.length} active scrapers to run`);

            if (scrapers.length === 0) {
                console.log('ℹ️ No active scrapers found');
                return;
            }

            // Run each scraper
            const results = [];
            for (const scraper of scrapers) {
                try {
                    console.log(`🔄 Running scraper: ${scraper.name} (${scraper.technical_name})`);
                    console.log(`📋 Scraper data from DB:`, JSON.stringify(scraper, null, 2));
                    const runResult = await this.runScraper(scraper);
                    results.push({
                        scraper: scraper.name,
                        success: true,
                        runId: runResult.id,
                        status: runResult.status
                    });
                    console.log(`✅ Scraper ${scraper.name} started successfully (Run ID: ${runResult.id})`);
                } catch (error) {
                    console.error(`❌ Failed to run scraper ${scraper.name}:`, error.message);
                    if (error.response) {
                        console.error(`❌ Apify API error response:`, error.response.status, error.response.data);
                    }
                    results.push({
                        scraper: scraper.name,
                        success: false,
                        error: error.message
                    });
                }
            }

            // Log summary
            const successful = results.filter(r => r.success).length;
            const failed = results.filter(r => !r.success).length;
            console.log(`📊 Scraper run completed: ${successful} successful, ${failed} failed`);

            // Update last run time
            this.calculateNextRun();

        } catch (error) {
            console.error('💥 Error during scheduled scraper run:', error);
        } finally {
            this.isRunning = false;
        }
    }

    // Run a single scraper
    async runScraper(scraper) {
        if (!this.apifyToken) {
            throw new Error('Apify token not configured');
        }

        const url = `https://api.apify.com/v2/acts/${scraper.actor_id}/runs`;
        
        // Handle JSON input - convert object to string if needed, then parse
        let input;
        console.log(`🔍 Processing input for ${scraper.name}:`, typeof scraper.input, scraper.input);
        
        if (typeof scraper.input === 'object') {
            input = scraper.input; // Already an object, use directly
            console.log(`✅ Using object input directly`);
        } else {
            input = JSON.parse(scraper.input); // Parse string to object
            console.log(`✅ Parsed string input to object`);
        }

        console.log(`📤 Sending request to Apify with input:`, JSON.stringify(input, null, 2));
        
        const response = await axios.post(url, input, {
            headers: {
                'Authorization': `Bearer ${this.apifyToken}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000 // 30 second timeout
        });

        console.log(`📥 Apify API response status:`, response.status);
        console.log(`📥 Apify API response data:`, response.data);

        if (response.status !== 201) {
            throw new Error(`Apify API returned status ${response.status}: ${JSON.stringify(response.data)}`);
        }

        // Log the run in database
        await this.logScraperRun(scraper.id, response.data.data.id, response.data.data.status);

        return response.data.data;
    }

    // Log scraper run to actor_runs (canonical run table)
    async logScraperRun(scraperId, runId, status) {
        try {
            await this.pool.query(`
                INSERT INTO actor_runs (run_id, status, start_time, scraper_id)
                VALUES ($1, $2, CURRENT_TIMESTAMP, $3)
                ON CONFLICT (run_id) DO UPDATE SET scraper_id = $3
            `, [runId, status, scraperId]);
        } catch (error) {
            console.error('Error logging scraper run:', error);
        }
    }

    // Manual trigger for running scrapers
    async runScrapersManually() {
        console.log('🔧 Manual scraper run triggered');
        await this.runAllActiveScrapers();
    }

    // Get scheduler status
    getStatus() {
        return {
            isRunning: this.isRunning,
            lastRun: this.lastRun,
            nextRun: this.nextRun,
            isScheduled: this.schedule ? true : false
        };
    }
}

module.exports = ScraperScheduler;
