const express = require('express');
const bcrypt = require('bcrypt');
const path = require('path');
const { requireAdmin } = require('../middleware/auth');

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

  return router;
};
