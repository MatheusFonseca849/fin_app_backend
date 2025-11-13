const router = require('express').Router();
const userService = require('../services/user.service');
const createError = require('../middlewares/createError');
const { hashPassword, comparePassword, validatePasswordStrength } = require('../utils/password.utils');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt.utils');
const { authenticateToken } = require('../middlewares/auth.middleware');

// ============================================
// PUBLIC ROUTES (No Auth Required)
// ============================================

/**
 * POST /users/register
 * Register new user
 */
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validate password strength
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json(
        createError(400, passwordValidation.message)
      );
    }

    // Check if user exists
    const existingUser = await userService.findByEmail(email);
    if (existingUser) {
      return res.status(400).json(
        createError(400, 'Email já cadastrado')
      );
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const user = await userService.createUser({
      name,
      email,
      password: hashedPassword
    });

    // Generate tokens
    const accessToken = generateAccessToken({ id: user._id, email: user.email });
    const refreshToken = generateRefreshToken({ id: user._id });

    // Set refresh token cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    // Return user without password
    const { password: _, ...userWithoutPassword } = user.toObject();

    res.status(201).json({
      accessToken,
      user: userWithoutPassword
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json(createError(500, 'Erro ao registrar usuário'));
  }
});

/**
 * POST /users/login
 * Login user
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await userService.findByEmail(email);
    if (!user) {
      return res.status(401).json(
        createError(401, 'Email ou senha incorretos')
      );
    }

    // Check password
    const isValid = await comparePassword(password, user.password);
    if (!isValid) {
      return res.status(401).json(
        createError(401, 'Email ou senha incorretos')
      );
    }

    // Generate tokens
    const accessToken = generateAccessToken({ id: user._id, email: user.email });
    const refreshToken = generateRefreshToken({ id: user._id });

    // Set cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    // Return user without password
    const { password: _, ...userWithoutPassword } = user.toObject();

    res.json({
      accessToken,
      user: userWithoutPassword
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json(createError(500, 'Erro ao fazer login'));
  }
});

// ============================================
// PROTECTED ROUTES (Auth Required)
// ============================================

/**
 * GET /users/me
 * Get current user
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await userService.findById(req.user.id);
    if (!user) {
      return res.status(404).json(createError(404, 'Usuário não encontrado'));
    }
    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json(createError(500, 'Erro ao buscar usuário'));
  }
});

/**
 * PUT /users/:id
 * Update user
 */
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    // Check ownership
    if (req.params.id !== req.user.id) {
      return res.status(403).json(
        createError(403, 'Acesso negado')
      );
    }

    const { name, email, password } = req.body;
    const updates = {};

    if (name) updates.name = name;
    if (email) updates.email = email;
    if (password) {
      updates.password = await hashPassword(password);
    }

    const user = await userService.updateUser(req.user.id, updates);
    res.json(user);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json(createError(500, 'Erro ao atualizar usuário'));
  }
});

/**
 * DELETE /users/:id
 * Delete user
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    if (req.params.id !== req.user.id) {
      return res.status(403).json(
        createError(403, 'Acesso negado')
      );
    }

    await userService.deleteUser(req.user.id);
    res.json({ message: 'Usuário excluído com sucesso' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json(createError(500, 'Erro ao excluir usuário'));
  }
});

/**
 * POST /users/logout
 * Logout user
 */
router.post('/logout', authenticateToken, (req, res) => {
  res.clearCookie('refreshToken');
  res.json({ message: 'Logout realizado com sucesso' });
});

/**
 * POST /users/refresh
 * Refresh access token
 */
router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    
    if (!refreshToken) {
      return res.status(401).json(
        createError(401, 'Refresh token não encontrado')
      );
    }

    const decoded = verifyRefreshToken(refreshToken);
    const user = await userService.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json(
        createError(401, 'Usuário não encontrado')
      );
    }

    const accessToken = generateAccessToken({ id: user._id, email: user.email });
    res.json({ accessToken });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(401).json(createError(401, 'Token inválido'));
  }
});

module.exports = router;