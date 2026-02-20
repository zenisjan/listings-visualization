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
            <button class="hamburger-btn" id="hamburger-btn" aria-label="Menu" aria-expanded="false">
                <span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span>
            </button>
            <div class="dropdown-menu" id="dropdown-menu">
                <a href="/" class="menu-item ${path === '/' ? 'active' : ''}">
                    <span class="menu-icon">&#x1f5fa;&#xfe0f;</span><span class="menu-text">Listings</span>
                </a>
                <a href="/scrapers" class="menu-item ${path === '/scrapers' ? 'active' : ''}">
                    <span class="menu-icon">&#x1f916;</span><span class="menu-text">Scrapers</span>
                </a>
                ${isAdmin ? `
                <a href="/admin/users" class="menu-item ${path === '/admin/users' ? 'active' : ''}">
                    <span class="menu-icon">&#x1f465;</span><span class="menu-text">Users</span>
                </a>` : ''}
                <div class="menu-divider"></div>
                <button class="menu-item" id="profile-btn">
                    <span class="menu-icon">&#x1f464;</span><span class="menu-text">Profile</span>
                </button>
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

        window.__currentUser = data.user;
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
            const isOpen = hamburgerBtn.classList.toggle('active');
            dropdownMenu.classList.toggle('show');
            hamburgerBtn.setAttribute('aria-expanded', isOpen);
        });

        document.addEventListener('click', (e) => {
            if (!hamburgerBtn.contains(e.target) && !dropdownMenu.contains(e.target)) {
                hamburgerBtn.classList.remove('active');
                dropdownMenu.classList.remove('show');
                hamburgerBtn.setAttribute('aria-expanded', 'false');
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && dropdownMenu.classList.contains('show')) {
                hamburgerBtn.classList.remove('active');
                dropdownMenu.classList.remove('show');
                hamburgerBtn.setAttribute('aria-expanded', 'false');
                hamburgerBtn.focus();
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

    const profileBtn = document.getElementById('profile-btn');
    if (profileBtn) {
        profileBtn.addEventListener('click', () => {
            hamburgerBtn.classList.remove('active');
            dropdownMenu.classList.remove('show');
            openProfileModal();
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

function openProfileModal() {
    // Remove existing modal if any
    const existing = document.getElementById('profileModal');
    if (existing) existing.remove();

    const user = window.__currentUser;
    if (!user) return;

    const modal = document.createElement('div');
    modal.id = 'profileModal';
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Edit Profile</h3>
                <button class="close" id="close-profile" aria-label="Close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="error-message" id="profile-modal-error" style="display: none;"></div>

                <form id="profileForm">
                    <div class="form-group">
                        <label for="profileName">Full Name</label>
                        <input type="text" id="profileName" value="${escapeHtml(user.name)}"
                               placeholder="Your name">
                    </div>

                    <div class="form-group">
                        <label for="profileEmail">Email Address</label>
                        <input type="email" id="profileEmail" value="${escapeHtml(user.email)}"
                               placeholder="your@email.com" autocomplete="email" spellcheck="false">
                    </div>

                    <div class="form-group">
                        <label for="profileNewPassword">New Password</label>
                        <input type="password" id="profileNewPassword"
                               placeholder="Leave blank to keep current" autocomplete="new-password">
                        <span class="form-hint">Leave blank to keep current password</span>
                    </div>

                    <div class="form-group">
                        <label for="profileCurrentPassword">Current Password *</label>
                        <input type="password" id="profileCurrentPassword" required
                               placeholder="Required to save changes" autocomplete="current-password">
                    </div>

                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" id="cancel-profile">Cancel</button>
                        <button type="submit" class="btn btn-primary">Save Changes</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('close-profile').addEventListener('click', closeProfileModal);
    document.getElementById('cancel-profile').addEventListener('click', closeProfileModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeProfileModal();
    });
    modal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeProfileModal();
    });
    document.getElementById('profileForm').addEventListener('submit', handleProfileSubmit);
}

function closeProfileModal() {
    const modal = document.getElementById('profileModal');
    if (modal) modal.remove();
}

async function handleProfileSubmit(e) {
    e.preventDefault();

    const data = {};
    const name = document.getElementById('profileName').value.trim();
    const email = document.getElementById('profileEmail').value.trim();
    const newPassword = document.getElementById('profileNewPassword').value;
    const currentPassword = document.getElementById('profileCurrentPassword').value;

    if (!currentPassword) {
        document.getElementById('profile-modal-error').textContent = 'Current password is required';
        document.getElementById('profile-modal-error').style.display = 'block';
        return;
    }

    data.currentPassword = currentPassword;
    if (name) data.name = name;
    if (email) data.email = email;
    if (newPassword) data.password = newPassword;

    try {
        const response = await fetch('/api/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (response.ok) {
            window.__currentUser = { ...window.__currentUser, ...result };
            const userNameEl = document.getElementById('user-name');
            if (userNameEl) userNameEl.textContent = result.name;
            closeProfileModal();
            showMessage('Profile updated successfully', 'success');
        } else {
            document.getElementById('profile-modal-error').textContent = result.error || 'Failed to update profile';
            document.getElementById('profile-modal-error').style.display = 'block';
        }
    } catch (error) {
        document.getElementById('profile-modal-error').textContent = 'Network error. Please try again.';
        document.getElementById('profile-modal-error').style.display = 'block';
    }
}
