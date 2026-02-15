let users = [];
let currentUserId = null;

document.addEventListener('DOMContentLoaded', async () => {
    const user = await checkAuth({ requireAdmin: true });
    if (!user) return;

    currentUserId = user.id;
    await loadUsers();

    document.getElementById('add-user-btn').addEventListener('click', openAddUserModal);
    document.getElementById('close-add-user').addEventListener('click', closeAddUserModal);
    document.getElementById('cancel-add-user').addEventListener('click', closeAddUserModal);
    document.getElementById('addUserForm').addEventListener('submit', handleAddUser);

    window.addEventListener('click', (e) => {
        if (e.target === document.getElementById('addUserModal')) {
            closeAddUserModal();
        }
    });
});

async function loadUsers() {
    try {
        const response = await fetch('/api/admin/users', { credentials: 'include' });
        if (response.ok) {
            users = await response.json();
            renderUsers();
        } else {
            document.getElementById('users-content').innerHTML =
                '<div class="loading-text">Error loading users</div>';
        }
    } catch (error) {
        document.getElementById('users-content').innerHTML =
            '<div class="loading-text">Error loading users</div>';
    }
}

function renderUsers() {
    const content = document.getElementById('users-content');

    if (users.length === 0) {
        content.innerHTML = '<div class="loading-text">No users found</div>';
        return;
    }

    const tableHTML = `
        <table>
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Last Login</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${users.map(user => `
                    <tr>
                        <td>${user.id}</td>
                        <td>${escapeHtml(user.name)}</td>
                        <td>${escapeHtml(user.email)}</td>
                        <td><span class="role-badge role-${escapeHtml(user.role)}">${escapeHtml(user.role)}</span></td>
                        <td><span class="status-${user.is_active ? 'active' : 'inactive'}">${user.is_active ? 'Active' : 'Inactive'}</span></td>
                        <td>${new Date(user.created_at).toLocaleDateString()}</td>
                        <td>${user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}</td>
                        <td>
                            <button class="btn btn-danger btn-sm" data-delete-user="${user.id}"
                                    ${user.id === currentUserId ? 'disabled' : ''}>
                                Delete
                            </button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    content.innerHTML = tableHTML;

    content.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-delete-user]');
        if (btn && !btn.disabled) {
            deleteUser(parseInt(btn.dataset.deleteUser));
        }
    });
}

function openAddUserModal() {
    document.getElementById('addUserModal').style.display = 'block';
    document.getElementById('addUserForm').reset();
    document.getElementById('modal-error').style.display = 'none';
}

function closeAddUserModal() {
    document.getElementById('addUserModal').style.display = 'none';
}

async function handleAddUser(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const userData = {
        email: formData.get('email'),
        password: formData.get('password'),
        name: formData.get('name'),
        role: formData.get('role')
    };

    try {
        const response = await fetch('/api/admin/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(userData)
        });

        const data = await response.json();

        if (response.ok) {
            closeAddUserModal();
            showMessage('User created successfully', 'success');
            await loadUsers();
        } else {
            document.getElementById('modal-error').textContent = data.error || 'Failed to create user';
            document.getElementById('modal-error').style.display = 'block';
        }
    } catch (error) {
        document.getElementById('modal-error').textContent = 'Network error. Please try again.';
        document.getElementById('modal-error').style.display = 'block';
    }
}

async function deleteUser(userId) {
    if (!confirm('Are you sure you want to delete this user?')) return;

    try {
        const response = await fetch(`/api/admin/users/${userId}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        if (response.ok) {
            showMessage('User deleted successfully', 'success');
            await loadUsers();
        } else {
            const data = await response.json();
            showMessage(data.error || 'Failed to delete user', 'error');
        }
    } catch (error) {
        showMessage('Network error. Please try again.', 'error');
    }
}
