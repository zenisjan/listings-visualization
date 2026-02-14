# Bazos Listings Map Visualization

A modern web application that displays Bazos.cz listings on an interactive map, allowing users to browse, filter, and explore listings geographically.

## Features

🗺️ **Interactive Map**
- Leaflet.js powered map with OpenStreetMap tiles
- Marker clustering for better performance
- Custom markers for regular and TOP listings
- Click markers to view listing details

🔍 **Advanced Filtering**
- Filter by category
- Price range filtering
- Location-based search
- Text search across titles and descriptions
- Real-time filter application

📊 **Statistics Dashboard**
- Total listings count
- Category distribution
- Average price information
- TOP listings count

📱 **Responsive Design**
- Mobile-friendly interface
- Modern gradient design
- Smooth animations and transitions
- Accessible controls

## Installation

1. **Clone or download the project files**

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure database connection:**
   - Copy `.env.example` to `.env`
   - Update the database configuration with your PostgreSQL credentials:
   ```env
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=your_database_name
   DB_USER=your_username
   DB_PASSWORD=your_password
   PORT=3000
   ```

4. **Start the application:**
   ```bash
   # Development mode with auto-restart
   npm run dev
   
   # Production mode
   npm start
   ```

5. **Open your browser:**
   Navigate to `http://localhost:3000`

## Database Requirements

This application expects a PostgreSQL database with the following structure (from your `setup_database.sql`):

- `actor_runs` table - Contains scraping run information
- `listings` table - Contains individual listings with coordinates and scraper information
- `latest_listings` view - Provides the most recent version of each listing
- `actor_run_stats` view - Provides statistics about scraping runs
- `scraper_stats` view - Provides statistics about scrapers

## API Endpoints

- `GET /` - Serves the main application
- `GET /api/listings` - Returns filtered listings with coordinates (supports scraper_name filter)
- `GET /api/categories` - Returns available categories with counts
- `GET /api/scrapers/available` - Returns available scrapers with counts
- `GET /api/listings/:id` - Returns detailed information for a specific listing
- `GET /api/stats` - Returns overall statistics

## Usage

1. **Browse the Map**: The map automatically loads and displays all listings with coordinates
2. **Filter Listings**: Use the filter controls to narrow down results by category, price, location, or scraper
3. **Search**: Enter keywords to search through listing titles and descriptions
4. **View Details**: Click on any marker to see a popup with basic info, or click "View Details" for full information
5. **Map Controls**: Use the map control buttons to center the view or toggle marker clustering

## Customization

### Styling
- Modify `public/style.css` to change the appearance
- The design uses CSS custom properties for easy color theming

### Map Configuration
- Edit the map initialization in `public/script.js`
- Change the default center coordinates and zoom level
- Modify marker clustering settings

### Database Queries
- Update the SQL queries in `server.js` to modify data retrieval
- Add new filter options by extending the API endpoints

## Troubleshooting

### Database Connection Issues
- Verify your database credentials in the `.env` file
- Ensure PostgreSQL is running and accessible
- Check that the database contains the required tables and views

### No Listings Showing
- Verify that listings have valid coordinates (`coordinates_lat` and `coordinates_lng` are not NULL)
- Check the browser console for JavaScript errors
- Ensure the API endpoints are returning data

### Performance Issues
- The application limits results to 1000 listings for performance
- Consider adding pagination for larger datasets
- Marker clustering helps with performance when displaying many markers

## Technologies Used

- **Backend**: Node.js, Express.js, PostgreSQL
- **Frontend**: Vanilla JavaScript, Leaflet.js, HTML5, CSS3
- **Database**: PostgreSQL with spatial data support
- **Maps**: OpenStreetMap tiles via Leaflet.js

## License

MIT License - feel free to use and modify as needed.
