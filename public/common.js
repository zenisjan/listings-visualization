/**
 * Shared utilities for all pages.
 * Provides auth check, hamburger menu, message display, nav rendering, and logout.
 */

/**
 * Escape HTML to prevent XSS.
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Render the navigation menu dynamically based on current path and user role.
 * Injects into #nav-container.
 * @param {Object} user - The authenticated user object
 */
function renderNav(user) {
    const path = window.location.pathname;
    const isAdmin = user.role === 'admin';

    const nav = document.getElementById('nav-container');
    if (!nav) return;

    nav.innerHTML = `
        <span id="user-name">${escapeHtml(user.name)}</span>
        <div class="hamburger-menu">
            <button class="hamburger-btn" id="hamburger-btn">
                <span></span><span></span><span></span>
            </button>
            <div class="dropdown-menu" id="dropdown-menu">
                <a href="/" class="menu-item ${path === '/' ? 'active' : ''}">
                    <span class="menu-icon">&#x1f5fa;&#xfe0f;</span><span class="menu-text">Map</span>
                </a>
                <a href="/scrapers" class="menu-item ${path === '/scrapers' ? 'active' : ''}">
                    <span class="menu-icon">&#x1f916;</span><span class="menu-text">Scrapers</span>
                </a>
                ${isAdmin ? `
                <a href="/admin/users" class="menu-item ${path === '/admin/users' ? 'active' : ''}">
                    <span class="menu-icon">&#x1f465;</span><span class="menu-text">Users</span>
                </a>` : ''}
                <div class="menu-divider"></div>
                <button class="menu-item logout-btn" id="logout-btn">
                    <span class="menu-icon">&#x1f6aa;</span><span class="menu-text">Logout</span>
                </button>
            </div>
        </div>
    `;
}

/**
 * Check authentication and redirect to login if not authenticated.
 * Automatically renders nav and initializes hamburger menu on success.
 * @param {Object} [options]
 * @param {boolean} [options.requireAdmin] - If true, also require admin role
 * @returns {Promise<Object|null>} The user object, or null if redirected
 */
async function checkAuth(options = {}) {
    try {
        const response = await fetch('/api/auth/check', { credentials: 'include' });
        const data = await response.json();

        if (!data.authenticated) {
            window.location.href = '/login';
            return null;
        }

        if (options.requireAdmin && data.user.role !== 'admin') {
            window.location.href = '/login';
            return null;
        }

        renderNav(data.user);
        initHamburgerMenu();

        return data.user;
    } catch (error) {
        window.location.href = '/login';
        return null;
    }
}

/**
 * Initialize hamburger menu toggle + outside-click close + logout button.
 */
function initHamburgerMenu() {
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const dropdownMenu = document.getElementById('dropdown-menu');
    const logoutBtn = document.getElementById('logout-btn');

    if (hamburgerBtn && dropdownMenu) {
        hamburgerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            hamburgerBtn.classList.toggle('active');
            dropdownMenu.classList.toggle('show');
        });

        document.addEventListener('click', (e) => {
            if (!hamburgerBtn.contains(e.target) && !dropdownMenu.contains(e.target)) {
                hamburgerBtn.classList.remove('active');
                dropdownMenu.classList.remove('show');
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await fetch('/api/logout', { method: 'POST', credentials: 'include' });
            } catch (e) {
                // ignore
            }
            window.location.href = '/login';
        });
    }
}

/**
 * Show a temporary message in #message-container.
 * @param {string} message
 * @param {'success'|'error'} type
 */
function showMessage(message, type) {
    const container = document.getElementById('message-container');
    if (!container) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = type;
    messageDiv.textContent = message;
    container.innerHTML = '';
    container.appendChild(messageDiv);

    setTimeout(() => { messageDiv.remove(); }, 5000);
}
