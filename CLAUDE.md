# VibedActor

Web scraping platform with 3 sub-projects: two Apify scrapers and a Node.js visualization app.
Each sub-project is an independent GitHub repo.

## Repositories

| Local directory | GitHub repo | Purpose |
|---|---|---|
| `bazos-scraper/` | `zenisjan/Bazos-listings` | Apify actor — scrapes bazos.cz classifieds |
| `gfr-scraper/` | `zenisjan/GFR-listings` | Apify actor — scrapes Czech gov auctions (drazby.fs.gov.cz) |
| `listings-visualization/` | `zenisjan/listings-visualization` | Express.js web app (map, admin, scheduler) + deployment config |

Each directory has its own `.git` — commit and push from within each sub-project.

## Project Structure

```
VibedActor/                       # Parent workspace (not a git repo itself)
  bazos-scraper/                  # git repo → zenisjan/Bazos-listings
    src/
      main.py                     # Scraper entry point
      database.py                 # DB operations (SHARED — keep in sync with gfr-scraper)
  gfr-scraper/                    # git repo → zenisjan/GFR-listings
    src/
      main.py                     # Scraper entry point
      database.py                 # DB operations (SHARED — keep in sync with bazos-scraper)
      czech_cities.py             # Czech city -> lat/lng geocoding (fuzzy matching)
  listings-visualization/         # git repo → zenisjan/listings-visualization
    server.js                     # Express API server
    scheduler.js                  # Cron-based Apify run trigger
    public/
      index.html                  # Map page (Leaflet)
      login.html                  # Auth page
      admin.html                  # User management
      scrapers.html               # Scraper config + scheduler status
      script.js                   # Map visualization logic (ListingsMap class)
      common.js                   # Shared auth check, nav rendering, message utils
      style.css                   # All styles (no inline CSS in HTML files)
    dbcheck/
      migration.sql               # Current migration (run against live DB)
      backfill_gfr_coords.js      # One-time backfill for GFR listing coordinates
    docker-compose.yml            # Docker Compose for Elestio CI/CD
    elestio.yml                   # Elestio platform config (runtime, ports, env vars)
```

## Database Schema (canonical — PostgreSQL)

**Connection**: `postgresql-v1mr4-u45404.vm.elestio.app:25432/bazos_scraper`

### Tables
- `users` — auth accounts (email, password_hash, role)
- `scrapers` — Apify actor definitions (actor_id, input JSON, technical_name)
- `actor_runs` — canonical run table for all scraper executions
  - `scraper_id` FK to `scrapers(id)` — links scheduler-triggered runs to their config
  - Both scrapers and the scheduler write here
- `listings` — all scraped listing data
  - PK: `(id, actor_run_id, scraper_name)`
  - `actor_run_id` FK to `actor_runs(id)`

### Views
- `latest_listings` — most recent version of each listing (DISTINCT ON id, scraper_name)
- `actor_run_stats` — run statistics with scraper name
- `scraper_stats` — aggregate stats per scraper_name

## database.py Sync Requirement

`bazos-scraper/src/database.py` and `gfr-scraper/src/database.py` share the same `DatabaseManager` class.
The ONLY difference is the last line:
- bazos: `db_manager = DatabaseManager()`  (defaults to 'bazos_scraper')
- gfr: `db_manager = DatabaseManager('gfr')`

When editing one, copy changes to the other. These live in separate repos so both must be committed/pushed independently.

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `DB_HOST` | PostgreSQL host | localhost |
| `DB_PORT` | PostgreSQL port | **25432** (not 5432!) |
| `DB_NAME` | Database name | bazos_scraper |
| `DB_USER` | Database user | postgres |
| `DB_PASSWORD` | Database password | — |
| `DB_SSL_MODE` | SSL mode | prefer |
| `APIFY_TOKEN` | Apify API token (scheduler) | — |
| `SCRAPER_ID` | Scrapers table ID (set by scheduler) | — |
| `SCRAPER_NAME` | Override scraper name | bazos_scraper / gfr |
| `ACTOR_RUN_ID` / `APIFY_ACTOR_RUN_ID` | Apify run ID | local-run |

## Deployment

- **Scrapers**: Deploy independently via `apify push` from each scraper directory
- **Visualization (local)**: `cd listings-visualization && npm install && npm start`
- **Visualization (production)**: Push to `zenisjan/listings-visualization` — Elestio auto-deploys
- **Scheduler**: Runs automatically when `APIFY_TOKEN` is set, triggers at 8 AM Prague time

### Elestio CI/CD (Docker)

The visualization app runs on Elestio via Docker with auto-deploy on every push to `zenisjan/listings-visualization`.

**Files (inside listings-visualization repo):**
- `docker-compose.yml` — builds `Dockerfile`, exposes port 3000
- `elestio.yml` — Elestio config: `dockerCompose` runtime, HTTPS reverse proxy (443 -> 3000)
- `Dockerfile` — Node 20 Alpine, `npm ci --omit=dev`, runs `node server.js`

**Auto-deploy:** Every push to main triggers a rebuild and redeploy.

**Environment variables:** Defaults are pre-filled in `elestio.yml`. `DB_PASSWORD` and `APIFY_TOKEN` must be set manually in the Elestio dashboard.

## How the Scheduler Works

1. `scheduler.js` runs a cron job daily at 08:00 Europe/Prague
2. Fetches all active scrapers from `scrapers` table
3. For each scraper, calls Apify API to trigger a run
4. Creates an `actor_runs` record with the Apify `run_id` and `scraper_id`
5. When the scraper runs on Apify, it checks for an existing `actor_runs` record
   matching its `run_id` and reuses it (inheriting the `scraper_id`)
