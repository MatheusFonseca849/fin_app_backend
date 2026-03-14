const router = require('express').Router();
const userService = require('../services/user.service');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { isAdmin } = require('../middlewares/admin.middleware');
const createError = require('../middlewares/createError');
const { hashPassword, comparePassword } = require('../utils/password.utils');
const { adminUpdateUserValidation, adminUserIdValidation } = require('../middlewares/validators');

// All admin routes require authentication + admin role
router.use(authenticateToken, isAdmin);

// ============================================
// USER MANAGEMENT
// ============================================

/**
 * GET /admin/users
 * List all users (without transactions/password for privacy)
 */
router.get('/users', async (req, res) => {
  try {
    const users = await userService.getAllUsersSafe();
    res.json({
      count: users.length,
      users
    });
  } catch (error) {
    console.error('Admin list users error:', error);
    res.status(500).json(createError(500, 'Erro ao listar usuários'));
  }
});

/**
 * GET /admin/users/:id
 * Get a single user summary (with stats but no transaction details)
 */
router.get('/users/:id', adminUserIdValidation, async (req, res) => {
  try {
    const user = await userService.getUserSummary(req.params.id);
    res.json(user);
  } catch (error) {
    console.error('Admin get user error:', error);
    const status = error.message === 'Usuário não encontrado' ? 404 : 500;
    res.status(status).json(createError(status, error.message));
  }
});

/**
 * PUT /admin/users/:id
 * Update a user's info (name, email, role, password)
 * Password changes require the admin's own password for verification
 */
router.put('/users/:id', adminUserIdValidation, adminUpdateUserValidation, async (req, res) => {
  try {
    const { firstName, lastName, email, role, password, currentPassword } = req.body;
    const updates = {};

    if (firstName) updates.firstName = firstName;
    if (lastName) updates.lastName = lastName;
    if (email) updates.email = email;
    if (role) updates.role = role;

    if (password) {
      const admin = await userService.findByEmail(req.user.email);
      if (!admin) {
        return res.status(404).json(createError(404, 'Administrador não encontrado'));
      }
      const isValid = await comparePassword(currentPassword, admin.password);
      if (!isValid) {
        return res.status(401).json(createError(401, 'Senha do administrador incorreta'));
      }
      updates.password = await hashPassword(password);
    }

    const user = await userService.adminUpdateUser(req.params.id, updates);
    res.json(user);
  } catch (error) {
    console.error('Admin update user error:', error);
    const status = error.message === 'Usuário não encontrado' ? 404 : 400;
    res.status(status).json(createError(status, error.message));
  }
});

/**
 * DELETE /admin/users/:id
 * Delete a user account (cannot delete other admins)
 */
router.delete('/users/:id', adminUserIdValidation, async (req, res) => {
  try {
    // Prevent self-deletion through admin route
    if (req.params.id === req.user.id) {
      return res.status(400).json(
        createError(400, 'Use a rota /users/:id para excluir sua própria conta')
      );
    }

    await userService.adminDeleteUser(req.params.id);
    res.json({ message: 'Usuário excluído com sucesso pelo administrador' });
  } catch (error) {
    console.error('Admin delete user error:', error);
    const status = error.message === 'Usuário não encontrado' ? 404 : 400;
    res.status(status).json(createError(status, error.message));
  }
});

/**
 * PATCH /admin/users/:id/role
 * Change a user's role (promote to admin or demote to user)
 */
router.patch('/users/:id/role', adminUserIdValidation, async (req, res) => {
  try {
    const { role } = req.body;

    if (!role || !['user', 'admin'].includes(role)) {
      return res.status(400).json(
        createError(400, 'Role deve ser "user" ou "admin"')
      );
    }

    // Prevent self-demotion
    if (req.params.id === req.user.id && role !== 'admin') {
      return res.status(400).json(
        createError(400, 'Você não pode remover seu próprio papel de administrador')
      );
    }

    const user = await userService.updateUserRole(req.params.id, role);
    res.json(user);
  } catch (error) {
    console.error('Admin update role error:', error);
    const status = error.message === 'Usuário não encontrado' ? 404 : 500;
    res.status(status).json(createError(status, error.message));
  }
});

// ============================================
// SYSTEM INFO
// ============================================

/**
 * GET /admin/stats
 * Get system-wide statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await userService.getSystemStats();
    stats.server = {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      nodeVersion: process.version,
      timestamp: new Date().toISOString()
    };
    res.json(stats);
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json(createError(500, 'Erro ao buscar estatísticas'));
  }
});

module.exports = router;
