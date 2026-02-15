const express = require('express');
const bcrypt = require('bcrypt');
const path = require('path');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

module.exports = (pool) => {
  router.get('/admin/users', requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
  });

  router.get('/api/admin/users', requireAdmin, async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT id, email, name, role, is_active, created_at, last_login
        FROM users
        ORDER BY created_at DESC
      `);
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

  router.post('/api/admin/users', requireAdmin, async (req, res) => {
    try {
      const { email, password, name, role } = req.body;

      if (!email || !password || !name) {
        return res.status(400).json({ error: 'Email, password, and name are required' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const result = await pool.query(`
        INSERT INTO users (email, password_hash, name, role)
        VALUES ($1, $2, $3, $4)
        RETURNING id, email, name, role, is_active, created_at
      `, [email, hashedPassword, name, role || 'user']);

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error creating user:', error);
      if (error.code === '23505') {
        res.status(400).json({ error: 'Email already exists' });
      } else {
        res.status(500).json({ error: 'Failed to create user' });
      }
    }
  });

  router.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;

      if (id == req.session.userId) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
      }

      await pool.query('DELETE FROM users WHERE id = $1', [id]);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting user:', error);
      res.status(500).json({ error: 'Failed to delete user' });
    }
  });

  // Self-service profile update (any logged-in user)
  router.put('/api/profile', requireAuth, async (req, res) => {
    try {
      const { currentPassword, email, name, password } = req.body;

      if (!currentPassword) {
        return res.status(400).json({ error: 'Current password is required' });
      }

      // Verify current password
      const userResult = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.session.userId]);
      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const valid = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      // Build dynamic UPDATE
      const setClauses = [];
      const values = [];
      let paramIndex = 1;

      if (email) {
        setClauses.push(`email = $${paramIndex++}`);
        values.push(email);
      }
      if (name) {
        setClauses.push(`name = $${paramIndex++}`);
        values.push(name);
      }
      if (password) {
        setClauses.push(`password_hash = $${paramIndex++}`);
        values.push(await bcrypt.hash(password, 10));
      }

      if (setClauses.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      values.push(req.session.userId);
      const result = await pool.query(
        `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING id, email, name, role`,
        values
      );

      const updated = result.rows[0];
      req.session.email = updated.email;
      req.session.name = updated.name;

      res.json(updated);
    } catch (error) {
      console.error('Error updating profile:', error);
      if (error.code === '23505') {
        res.status(400).json({ error: 'Email already exists' });
      } else {
        res.status(500).json({ error: 'Failed to update profile' });
      }
    }
  });

  // Admin user edit (no current password needed)
  router.put('/api/admin/users/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { email, name, password } = req.body;

      const setClauses = [];
      const values = [];
      let paramIndex = 1;

      if (email) {
        setClauses.push(`email = $${paramIndex++}`);
        values.push(email);
      }
      if (name) {
        setClauses.push(`name = $${paramIndex++}`);
        values.push(name);
      }
      if (password) {
        setClauses.push(`password_hash = $${paramIndex++}`);
        values.push(await bcrypt.hash(password, 10));
      }

      if (setClauses.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      values.push(id);
      const result = await pool.query(
        `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING id, email, name, role`,
        values
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      // If admin edits their own account, update session
      const updated = result.rows[0];
      if (parseInt(id) === req.session.userId) {
        req.session.email = updated.email;
        req.session.name = updated.name;
      }

      res.json(updated);
    } catch (error) {
      console.error('Error updating user:', error);
      if (error.code === '23505') {
        res.status(400).json({ error: 'Email already exists' });
      } else {
        res.status(500).json({ error: 'Failed to update user' });
      }
    }
  });

  return router;
};
