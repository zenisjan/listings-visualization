let scrapers = [];
let editingScraper = null;

document.addEventListener('DOMContentLoaded', async () => {
    const user = await checkAuth();
    if (!user) return;

    loadScrapers();
    loadSchedulerStatus();

    document.getElementById('add-scraper-btn').addEventListener('click', () => {
        editingScraper = null;
        document.getElementById('modal-title').textContent = 'Add New Scraper';
        document.getElementById('scraper-form').reset();
        document.getElementById('scraper-modal').style.display = 'block';
    });

    document.getElementById('close-modal').addEventListener('click', closeModal);
    document.getElementById('cancel-scraper').addEventListener('click', closeModal);

    window.addEventListener('click', (e) => {
        if (e.target === document.getElementById('scraper-modal')) closeModal();
    });

    document.getElementById('scraper-form').addEventListener('submit', saveScraper);
    document.getElementById('run-scrapers-btn').addEventListener('click', runAllScrapers);
});

function closeModal() {
    document.getElementById('scraper-modal').style.display = 'none';
}

async function loadScrapers() {
    try {
        const response = await fetch('/api/scrapers', { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to load scrapers');
        scrapers = await response.json();
        renderScrapers();
    } catch (error) {
        showMessage('Error loading scrapers: ' + error.message, 'error');
    }
}

function renderScrapers() {
    const content = document.getElementById('scrapers-content');

    if (scrapers.length === 0) {
        content.innerHTML = '<div class="loading-text">No scrapers configured yet.</div>';
        return;
    }

    const tableHTML = `
        <table>
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Technical Name</th>
                    <th>Actor ID</th>
                    <th>Input Preview</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${scrapers.map(scraper => {
                    const inputStr = typeof scraper.input === 'object' ? JSON.stringify(scraper.input) : scraper.input;
                    const preview = inputStr.length > 50 ? inputStr.substring(0, 50) + '...' : inputStr;
                    return `
                    <tr>
                        <td>
                            <strong>${escapeHtml(scraper.name)}</strong>
                            ${scraper.description ? `<br><small class="form-hint">${escapeHtml(scraper.description)}</small>` : ''}
                        </td>
                        <td><code>${escapeHtml(scraper.technical_name)}</code></td>
                        <td><code>${escapeHtml(scraper.actor_id)}</code></td>
                        <td>
                            <div class="json-input" title="${escapeHtml(inputStr)}">
                                ${escapeHtml(preview)}
                            </div>
                        </td>
                        <td>
                            <span class="status-indicator ${scraper.is_active ? 'status-active' : 'status-inactive'}"></span>
                            ${scraper.is_active ? 'Active' : 'Inactive'}
                        </td>
                        <td>
                            <button class="btn btn-primary btn-sm" data-edit-scraper="${scraper.id}" style="margin-right: 5px;">Edit</button>
                            <button class="btn btn-danger btn-sm" data-delete-scraper="${scraper.id}">Delete</button>
                        </td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>
    `;

    content.innerHTML = tableHTML;

    content.addEventListener('click', (e) => {
        const editBtn = e.target.closest('[data-edit-scraper]');
        if (editBtn) editScraper(parseInt(editBtn.dataset.editScraper));

        const deleteBtn = e.target.closest('[data-delete-scraper]');
        if (deleteBtn) deleteScraper(parseInt(deleteBtn.dataset.deleteScraper));
    });
}

function editScraper(id) {
    const scraper = scrapers.find(s => s.id === id);
    if (!scraper) return;

    editingScraper = scraper;
    document.getElementById('modal-title').textContent = 'Edit Scraper';
    document.getElementById('scraper-id').value = scraper.id;
    document.getElementById('scraper-name').value = scraper.name;
    document.getElementById('scraper-technical-name').value = scraper.technical_name;
    document.getElementById('scraper-actor-id').value = scraper.actor_id;

    let inputValue = scraper.input;
    if (typeof inputValue === 'object') {
        inputValue = JSON.stringify(inputValue, null, 2);
    }
    document.getElementById('scraper-input').value = inputValue;
    document.getElementById('scraper-description').value = scraper.description || '';
    document.getElementById('scraper-modal').style.display = 'block';
}

async function deleteScraper(id) {
    if (!confirm('Are you sure you want to delete this scraper?')) return;

    try {
        const response = await fetch(`/api/scrapers/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        if (!response.ok) throw new Error('Failed to delete scraper');

        showMessage('Scraper deleted successfully', 'success');
        loadScrapers();
    } catch (error) {
        showMessage('Error deleting scraper: ' + error.message, 'error');
    }
}

async function saveScraper(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const scraperData = {
        name: formData.get('name'),
        technical_name: formData.get('technical_name'),
        actor_id: formData.get('actor_id'),
        input: formData.get('input'),
        description: formData.get('description')
    };

    try {
        JSON.parse(scraperData.input);
    } catch (error) {
        showMessage('Invalid JSON format in Actor Input field: ' + error.message, 'error');
        return;
    }

    try {
        const url = editingScraper ? `/api/scrapers/${editingScraper.id}` : '/api/scrapers';
        const method = editingScraper ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(scraperData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to save scraper');
        }

        showMessage(editingScraper ? 'Scraper updated successfully' : 'Scraper created successfully', 'success');
        closeModal();
        loadScrapers();
    } catch (error) {
        showMessage('Error saving scraper: ' + error.message, 'error');
    }
}

async function loadSchedulerStatus() {
    try {
        const response = await fetch('/api/scheduler/status', { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to load scheduler status');
        const status = await response.json();
        updateSchedulerStatus(status);
    } catch (error) {
        document.getElementById('scheduler-running-status').textContent = 'Error';
        document.getElementById('scheduler-running-status').className = 'status-value status-stopped';
    }
}

function updateSchedulerStatus(status) {
    const statusElement = document.getElementById('scheduler-running-status');
    const lastRunElement = document.getElementById('scheduler-last-run');
    const nextRunElement = document.getElementById('scheduler-next-run');

    if (status.isRunning) {
        statusElement.textContent = 'Running';
        statusElement.className = 'status-value status-running';
    } else if (status.isScheduled) {
        statusElement.textContent = 'Scheduled';
        statusElement.className = 'status-value status-scheduled';
    } else {
        statusElement.textContent = 'Stopped';
        statusElement.className = 'status-value status-stopped';
    }

    lastRunElement.textContent = status.lastRun
        ? new Date(status.lastRun).toLocaleString()
        : 'Never';

    nextRunElement.textContent = status.nextRun
        ? new Date(status.nextRun).toLocaleString()
        : 'Not scheduled';
}

async function runAllScrapers() {
    const button = document.getElementById('run-scrapers-btn');
    const originalText = button.textContent;

    try {
        button.textContent = 'Running...';
        button.disabled = true;

        const response = await fetch('/api/scheduler/run', {
            method: 'POST',
            credentials: 'include'
        });

        if (!response.ok) throw new Error('Failed to run scrapers');

        showMessage('Scrapers run triggered successfully', 'success');
        setTimeout(() => { loadSchedulerStatus(); }, 2000);
    } catch (error) {
        showMessage('Error running scrapers: ' + error.message, 'error');
    } finally {
        button.textContent = originalText;
        button.disabled = false;
    }
}
