const userService = require('../services/user.service');
const createError = require('../middlewares/createError');
const { hashPassword, comparePassword } = require('../utils/password.utils');
const AppError = require('../utils/AppError');

const listUsers = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));

    const { users, total, page: safePage, limit: safeLimit } = await userService.getAllUsersSafe({ page, limit });
    res.json({
      data: users,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        pages: Math.ceil(total / safeLimit) || 1
      }
    });
  } catch (error) {
    console.error('Admin list users error:', error);
    res.status(500).json(createError(500, 'Erro ao listar usuários'));
  }
};

const getUser = async (req, res) => {
  try {
    const user = await userService.getUserSummary(req.params.id);
    res.json(user);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(createError(error.statusCode, error.message));
    }
    console.error('Admin get user error:', error);
    res.status(500).json(createError(500, 'Erro ao buscar usuário'));
  }
};

const updateUser = async (req, res) => {
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
    }

    // Apply allowlisted field updates (firstName, lastName, email, role)
    const user = await userService.adminUpdateUser(req.params.id, updates);

    // Password is handled separately — adminUpdateUser's allowlist intentionally excludes it
    if (password) {
      const targetUser = await userService.findById(req.params.id);
      targetUser.password = await hashPassword(password);
      await targetUser.save();
    }

    res.json(user);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(createError(error.statusCode, error.message));
    }
    console.error('Admin update user error:', error);
    res.status(500).json(createError(500, 'Erro ao atualizar usuário'));
  }
};

const deleteUser = async (req, res) => {
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
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(createError(error.statusCode, error.message));
    }
    console.error('Admin delete user error:', error);
    res.status(500).json(createError(500, 'Erro ao excluir usuário'));
  }
};

const updateRole = async (req, res) => {
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
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(createError(error.statusCode, error.message));
    }
    console.error('Admin update role error:', error);
    res.status(500).json(createError(500, 'Erro ao atualizar cargo'));
  }
};

const getStats = async (req, res) => {
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
};

module.exports = {
  listUsers,
  getUser,
  updateUser,
  deleteUser,
  updateRole,
  getStats,
};
