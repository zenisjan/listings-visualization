class ListingsMap {
    constructor() {
        this.map = null;
        this.markers = [];
        this.markerCluster = null;
        this.currentListings = [];
        this.viewMode = 'map';
        this.sortColumn = 'date';
        this.sortDirection = 'desc';
        this.filters = {
            category: '',
            priceMin: '',
            priceMax: '',
            location: '',
            search: '',
            scraper: '',
            changeFilter: ''
        };

        this.init();
    }

    async init() {
        try {
            this.initMap();

            await Promise.all([
                this.loadCategories(),
                this.loadScrapers(),
                this.loadStats(),
                this.loadListings()
            ]);
            this.setupEventListeners();
        } catch (error) {
            console.error('Error during initialization:', error);
            this.setupEventListeners();
        }
    }

    initMap() {
        this.map = L.map('map').setView([49.7437, 15.3386], 7);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(this.map);

        this.markerCluster = L.markerClusterGroup({
            chunkedLoading: true,
            maxClusterRadius: 50
        });
        this.map.addLayer(this.markerCluster);
    }

    async loadCategories() {
        try {
            const params = this.viewMode === 'list' ? '?include_all=true' : '';
            const response = await fetch(`/api/categories${params}`, { credentials: 'include' });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const categories = await response.json();
            const categorySelect = document.getElementById('category-filter');
            if (categorySelect) {
                while (categorySelect.children.length > 1) {
                    categorySelect.removeChild(categorySelect.lastChild);
                }
                categories.forEach(category => {
                    const option = document.createElement('option');
                    option.value = category.category;
                    option.textContent = `${category.category} (${category.count})`;
                    categorySelect.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Error loading categories:', error);
        }
    }

    async loadScrapers() {
        try {
            const response = await fetch('/api/scrapers/available', { credentials: 'include' });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const scrapers = await response.json();
            const scraperSelect = document.getElementById('scraper-filter');
            if (scraperSelect) {
                while (scraperSelect.children.length > 1) {
                    scraperSelect.removeChild(scraperSelect.lastChild);
                }
                scrapers.forEach(scraper => {
                    const option = document.createElement('option');
                    option.value = scraper.scraper_name;
                    option.textContent = `${scraper.scraper_name} (${scraper.count})`;
                    scraperSelect.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Error loading scrapers:', error);
        }
    }

    async loadStats() {
        try {
            const params = this.viewMode === 'list' ? '?include_all=true' : '';
            const response = await fetch(`/api/stats${params}`, { credentials: 'include' });
            const stats = await response.json();

            document.getElementById('total-listings').textContent =
                `${stats.total_listings} listings | ${stats.total_categories} categories`;
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }

    async loadListings() {
        try {
            const params = new URLSearchParams();

            if (this.filters.category) params.append('category', this.filters.category);
            if (this.filters.priceMin) params.append('price_min', this.filters.priceMin);
            if (this.filters.priceMax) params.append('price_max', this.filters.priceMax);
            if (this.filters.location) params.append('location', this.filters.location);
            if (this.filters.search) params.append('search', this.filters.search);
            if (this.filters.scraper) params.append('scraper_name', this.filters.scraper);
            if (this.viewMode === 'list') params.append('include_all', 'true');

            await new Promise(resolve => setTimeout(resolve, 0));

            const response = await fetch(`/api/listings?${params}`, { credentials: 'include' });
            const listings = await response.json();

            await new Promise(resolve => setTimeout(resolve, 0));

            this.currentListings = listings;
            if (this.viewMode === 'list') {
                this.renderListView(listings);
            } else {
                await this.updateMap(listings);
            }
        } catch (error) {
            console.error('Error loading listings:', error);
        }
    }

    async updateMap(listings) {
        this.markerCluster.clearLayers();
        this.markers = [];

        let filteredListings = listings;
        if (this.filters.changeFilter === 'changed') {
            filteredListings = listings.filter(listing =>
                listing.price_changed || listing.description_changed ||
                listing.top_status_changed || listing.title_changed
            );
        } else if (this.filters.changeFilter === 'top') {
            filteredListings = listings.filter(listing => listing.is_top);
        }

        const chunkSize = 100;
        for (let i = 0; i < filteredListings.length; i += chunkSize) {
            const chunk = filteredListings.slice(i, i + chunkSize);

            chunk.forEach(listing => {
                if (listing.coordinates_lat && listing.coordinates_lng) {
                    const marker = this.createMarker(listing);
                    this.markers.push(marker);
                    this.markerCluster.addLayer(marker);
                }
            });

            if (i + chunkSize < filteredListings.length) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        if (this.markers.length > 0) {
            const group = new L.featureGroup(this.markers);
            this.map.fitBounds(group.getBounds().pad(0.1));
        }
    }

    createMarker(listing) {
        let markerColor = '#667eea';
        let markerRadius = 10;

        if (listing.is_top) {
            markerColor = '#f6ad55';
            markerRadius = 12;
        }

        const hasChanges = listing.price_changed || listing.description_changed ||
                          listing.top_status_changed || listing.title_changed;

        if (hasChanges) {
            markerColor = '#e53e3e';
            markerRadius = listing.is_top ? 14 : 12;
        }

        const marker = L.circleMarker([listing.coordinates_lat, listing.coordinates_lng], {
            radius: markerRadius,
            fillColor: markerColor,
            color: 'white',
            weight: 3,
            opacity: 1,
            fillOpacity: 0.9
        });

        // Build popup content safely (no inline onclick)
        const changeIndicators = [];
        if (listing.price_changed) changeIndicators.push('Price');
        if (listing.description_changed) changeIndicators.push('Description');
        if (listing.top_status_changed) changeIndicators.push('TOP Status');
        if (listing.title_changed) changeIndicators.push('Title');

        const changeBadge = changeIndicators.length > 0 ?
            `<div class="change-badge">${changeIndicators.join(', ')} changed</div>` : '';

        const versionBadge = listing.total_versions > 1 ?
            `<div class="version-badge">${listing.total_versions} versions</div>` : '';

        const popupContent = document.createElement('div');
        popupContent.className = 'popup-content';
        popupContent.innerHTML = `
            <h4>${this.escapeHtml(listing.title)}</h4>
            <p><strong>Price:</strong> ${this.escapeHtml(listing.price_text || 'N/A')}</p>
            <p><strong>Category:</strong> ${this.escapeHtml(listing.category)}</p>
            <p><strong>Location:</strong> ${this.escapeHtml(listing.location)}</p>
            <p><strong>Scraper:</strong> ${this.escapeHtml(listing.scraper_name || 'N/A')}</p>
            ${listing.is_top ? '<span class="top-badge">TOP</span>' : ''}
            ${changeBadge}
            ${versionBadge}
        `;

        const detailsBtn = document.createElement('button');
        detailsBtn.className = 'view-details-btn';
        detailsBtn.textContent = 'View Details & History';
        detailsBtn.addEventListener('click', () => {
            this.showListingDetails(listing.id);
        });
        popupContent.appendChild(detailsBtn);

        marker.bindPopup(popupContent);

        marker.on('click', () => {
            this.showListingDetails(listing.id);
        });

        return marker;
    }

    async showListingDetails(listingId) {
        try {
            const response = await fetch(`/api/listings/${listingId}`, { credentials: 'include' });
            const listing = await response.json();

            document.getElementById('details-title').textContent = listing.title;
            document.getElementById('details-price').textContent = listing.price_text || 'N/A';
            document.getElementById('details-category').textContent = listing.category;
            document.getElementById('details-location').textContent = listing.location;
            document.getElementById('details-views').textContent = listing.views || 0;
            document.getElementById('details-date').textContent = listing.date || 'N/A';
            document.getElementById('details-contact').textContent = listing.contact_name || 'N/A';
            document.getElementById('details-phone').textContent = listing.phone || 'N/A';

            const descriptionText = listing.full_description || listing.description || 'No description available';
            document.getElementById('details-description').textContent = descriptionText;

            const lastScraped = new Date(listing.scraped_at).toLocaleDateString('en-US', {
                year: 'numeric', month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
            document.getElementById('details-last-scraped').textContent = lastScraped;

            document.getElementById('details-url').href = listing.url;

            const img = document.getElementById('details-image');
            if (listing.image_url) {
                img.src = listing.image_url;
                img.style.display = 'block';
            } else {
                img.style.display = 'none';
            }

            document.getElementById('listing-details').style.display = 'block';
            this.showChangeHistory(listing);
        } catch (error) {
            console.error('Error loading listing details:', error);
        }
    }

    hideListingDetails() {
        document.getElementById('listing-details').style.display = 'none';
    }

    showChangeHistory(listing) {
        const changeHistoryDiv = document.getElementById('change-history');
        const historyTimeline = document.getElementById('history-timeline');

        if (!listing.change_history || listing.change_history.length <= 1) {
            changeHistoryDiv.style.display = 'none';
            return;
        }

        historyTimeline.innerHTML = '';

        listing.change_history.forEach((version, index) => {
            const historyItem = document.createElement('div');
            historyItem.className = `history-item ${index === 0 ? 'current' : ''}`;

            const changes = [];
            if (index > 0) {
                const prevVersion = listing.change_history[index - 1];
                if (prevVersion.price !== version.price) changes.push('Price');
                if (prevVersion.description !== version.description) changes.push('Description');
                if (prevVersion.is_top !== version.is_top) changes.push('TOP Status');
                if (prevVersion.title !== version.title) changes.push('Title');
            }

            const changeBadges = changes.length > 0 ?
                `<div class="history-changes">${changes.map(change =>
                    `<span class="history-change-item">${change}</span>`
                ).join('')}</div>` : '';

            const formattedDate = new Date(version.scraped_at).toLocaleDateString('en-US', {
                year: 'numeric', month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });

            historyItem.innerHTML = `
                <div class="history-header">
                    <span class="history-version">Version ${version.version_number}${index === 0 ? ' (Current)' : ''}</span>
                    <span class="history-date">${formattedDate}</span>
                </div>
                <div class="history-details">
                    <p><strong>Price:</strong> ${this.escapeHtml(version.price_text || 'N/A')}</p>
                    <p><strong>Views:</strong> ${version.views || 0}</p>
                    <p><strong>TOP:</strong> ${version.is_top ? 'Yes' : 'No'}</p>
                    ${changeBadges}
                </div>
            `;

            historyTimeline.appendChild(historyItem);
        });

        changeHistoryDiv.style.display = 'block';
    }

    async applyFilters() {
        this.filters.category = document.getElementById('category-filter').value;
        this.filters.priceMin = document.getElementById('price-min').value;
        this.filters.priceMax = document.getElementById('price-max').value;
        this.filters.location = document.getElementById('location-filter').value;
        this.filters.search = document.getElementById('search-input').value;
        this.filters.scraper = document.getElementById('scraper-filter').value;
        this.filters.changeFilter = document.getElementById('change-filter').value;

        await this.loadListings();
    }

    async clearFilters() {
        document.getElementById('category-filter').value = '';
        document.getElementById('price-min').value = '';
        document.getElementById('price-max').value = '';
        document.getElementById('location-filter').value = '';
        document.getElementById('search-input').value = '';
        document.getElementById('scraper-filter').value = '';
        document.getElementById('change-filter').value = '';

        this.filters = {
            category: '', priceMin: '', priceMax: '',
            location: '', search: '', scraper: '', changeFilter: ''
        };

        await this.loadListings();
    }

    centerMap() {
        if (this.markers.length > 0) {
            const group = new L.featureGroup(this.markers);
            this.map.fitBounds(group.getBounds().pad(0.1));
        } else {
            this.map.setView([49.7437, 15.3386], 7);
        }
    }

    toggleClusters() {
        if (this.map.hasLayer(this.markerCluster)) {
            this.map.removeLayer(this.markerCluster);
        } else {
            this.map.addLayer(this.markerCluster);
        }
    }

    async toggleView(mode) {
        if (this.viewMode === mode) return;
        this.viewMode = mode;

        const mapContainer = document.getElementById('map-container');
        const listContainer = document.getElementById('list-container');
        const mapBtn = document.getElementById('view-map');
        const listBtn = document.getElementById('view-list');

        if (mode === 'list') {
            mapContainer.style.display = 'none';
            listContainer.style.display = 'flex';
            mapBtn.classList.remove('active');
            listBtn.classList.add('active');
        } else {
            listContainer.style.display = 'none';
            mapContainer.style.display = '';
            listBtn.classList.remove('active');
            mapBtn.classList.add('active');
            // Leaflet needs a resize nudge after being hidden
            setTimeout(() => this.map.invalidateSize(), 0);
        }

        await Promise.all([
            this.loadCategories(),
            this.loadStats(),
            this.loadListings()
        ]);
    }

    renderListView(listings) {
        let filtered = listings;
        if (this.filters.changeFilter === 'changed') {
            filtered = listings.filter(l =>
                l.price_changed || l.description_changed ||
                l.top_status_changed || l.title_changed
            );
        } else if (this.filters.changeFilter === 'top') {
            filtered = listings.filter(l => l.is_top);
        }

        filtered = this.sortListings(filtered);

        const tbody = document.getElementById('listings-tbody');
        tbody.innerHTML = '';

        filtered.forEach(listing => {
            const tr = document.createElement('tr');
            tr.addEventListener('click', () => this.showListingDetails(listing.id));

            const hasChanges = listing.price_changed || listing.description_changed ||
                listing.top_status_changed || listing.title_changed;
            const hasCoords = listing.coordinates_lat && listing.coordinates_lng;

            // Status badges
            let statusHtml = '';
            if (listing.is_top) statusHtml += '<span class="list-badge list-badge-top">TOP</span>';
            if (hasChanges) statusHtml += '<span class="list-badge list-badge-changed">Changed</span>';
            if (!hasCoords) statusHtml += '<span class="list-badge list-badge-no-coords">No coords</span>';

            tr.innerHTML = `
                <td title="${this.escapeHtml(listing.title)}">${this.escapeHtml(listing.title)}</td>
                <td>${this.escapeHtml(listing.price_text || 'N/A')}</td>
                <td>${this.escapeHtml(listing.category || '')}</td>
                <td>${this.escapeHtml(listing.location || '')}</td>
                <td>${this.escapeHtml(listing.scraper_name || '')}</td>
                <td>${listing.date || ''}</td>
                <td>${statusHtml}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    sortListings(listings) {
        const col = this.sortColumn;
        const dir = this.sortDirection === 'asc' ? 1 : -1;

        return [...listings].sort((a, b) => {
            let valA = a[col];
            let valB = b[col];

            if (col === 'price') {
                valA = Number(valA) || 0;
                valB = Number(valB) || 0;
                return (valA - valB) * dir;
            }

            valA = (valA || '').toString().toLowerCase();
            valB = (valB || '').toString().toLowerCase();
            return valA.localeCompare(valB) * dir;
        });
    }

    handleSort(column) {
        if (this.sortColumn === column) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColumn = column;
            this.sortDirection = 'asc';
        }

        // Update header classes
        document.querySelectorAll('#listings-table th.sortable').forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc');
            if (th.dataset.sort === this.sortColumn) {
                th.classList.add(this.sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
            }
        });

        this.renderListView(this.currentListings);
    }

    setupEventListeners() {
        document.getElementById('search-btn').addEventListener('click', () => this.applyFilters());
        document.getElementById('search-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.applyFilters();
        });

        ['category-filter', 'price-min', 'price-max', 'location-filter', 'scraper-filter', 'change-filter']
            .forEach(id => {
                document.getElementById(id).addEventListener('change', () => this.applyFilters());
            });

        document.getElementById('clear-filters').addEventListener('click', () => this.clearFilters());
        document.getElementById('center-map').addEventListener('click', () => this.centerMap());
        document.getElementById('toggle-clusters').addEventListener('click', () => this.toggleClusters());
        document.getElementById('close-details').addEventListener('click', () => this.hideListingDetails());

        // View toggle
        document.querySelectorAll('.view-toggle-btn').forEach(btn => {
            btn.addEventListener('click', () => this.toggleView(btn.dataset.view));
        });

        // Column sorting
        document.querySelectorAll('#listings-table th.sortable').forEach(th => {
            th.addEventListener('click', () => this.handleSort(th.dataset.sort));
        });
    }

    escapeHtml(text) {
        return escapeHtml(text);
    }
}

// Initialize the application
let listingsMap;
document.addEventListener('DOMContentLoaded', async () => {
    const user = await checkAuth();
    if (!user) return;

    listingsMap = new ListingsMap();
});
