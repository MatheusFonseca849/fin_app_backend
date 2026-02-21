const router = require('express').Router();
const userService = require('../services/user.service');
const emailService = require('../services/email.service');
const createError = require('../middlewares/createError');
const { hashPassword, comparePassword, validatePasswordStrength } = require('../utils/password.utils');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt.utils');
const { generateVerificationToken, hashToken } = require('../utils/verification.utils');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { registerValidation, loginValidation } = require('../middlewares/validators');
const multer = require('multer');
const { uploadAvatar } = require('../utils/upload.utils');

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Formato de imagem inválido. Use JPEG, PNG ou WebP.'));
    }
  }
});

// ============================================
// PUBLIC ROUTES (No Auth Required)
// ============================================

/**
 * POST /users/register
 * Register new user
 */
router.post('/register', registerValidation, async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;

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

    // Generate verification token
    const { rawToken, hashedToken } = generateVerificationToken();

    // Create user (unverified)
    const user = await userService.createUser({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      verificationToken: hashedToken,
      verificationTokenExpires: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h
    });

    // Send verification email
    try {
      await emailService.sendVerificationEmail(email, rawToken);
    } catch (emailError) {
      console.error('Verification email error:', emailError);
      // User was created but email failed — they can use resend later
    }

    res.status(201).json({
      message: 'Cadastro realizado com sucesso. Verifique seu email para ativar sua conta.'
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json(createError(500, 'Erro ao registrar usuário'));
  }
});

/**
 * GET /users/verify-email
 * Verify user email with token
 */
router.get('/verify-email', async (req, res) => {
  try {
    const { token, email } = req.query;

    if (!token || !email) {
      return res.status(400).json(
        createError(400, 'Token e email são obrigatórios')
      );
    }

    const hashedToken = hashToken(token);

    const user = await userService.findByEmailWithVerification(email);
    if (!user) {
      return res.status(404).json(
        createError(404, 'Usuário não encontrado')
      );
    }

    if (user.isVerified) {
      return res.status(400).json(
        createError(400, 'Email já verificado')
      );
    }

    if (user.verificationToken !== hashedToken) {
      return res.status(400).json(
        createError(400, 'Token de verificação inválido')
      );
    }

    if (user.verificationTokenExpires < new Date()) {
      return res.status(400).json(
        createError(400, 'Token de verificação expirado. Solicite um novo.')
      );
    }

    // Mark user as verified
    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;
    await user.save();

    res.json({ message: 'Email verificado com sucesso. Você já pode fazer login.' });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json(createError(500, 'Erro ao verificar email'));
  }
});

/**
 * POST /users/resend-verification
 * Resend verification email
 */
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json(
        createError(400, 'Email é obrigatório')
      );
    }

    const user = await userService.findByEmail(email);
    if (!user) {
      // Don't reveal if user exists
      return res.json({ message: 'Se o email estiver cadastrado, um novo link de verificação será enviado.' });
    }

    if (user.isVerified) {
      return res.status(400).json(
        createError(400, 'Email já verificado')
      );
    }

    // Generate new token
    const { rawToken, hashedToken } = generateVerificationToken();

    user.verificationToken = hashedToken;
    user.verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save();

    await emailService.sendVerificationEmail(email, rawToken);

    res.json({ message: 'Se o email estiver cadastrado, um novo link de verificação será enviado.' });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json(createError(500, 'Erro ao reenviar email de verificação'));
  }
});

/**
 * POST /users/login
 * Login user
 */
router.post('/login', loginValidation, async (req, res) => {
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

    // Check if email is verified
    if (!user.isVerified) {
      return res.status(403).json(
        createError(403, 'Email não verificado. Verifique sua caixa de entrada ou solicite um novo link.')
      );
    }

    // Generate tokens
    const accessToken = generateAccessToken({ id: user._id, email: user.email, role: user.role });
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
 * PUT /users/avatar
 * Upload user avatar image
 */
router.put('/avatar', authenticateToken, avatarUpload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json(createError(400, 'Nenhuma imagem enviada'));
    }

    // Upload to Cloudinary
    const { url } = await uploadAvatar(req.file.buffer, req.user.id);

    // Store only the URL in MongoDB
    const user = await userService.updateUser(req.user.id, { avatarUrl: url });
    res.json({ avatarUrl: user.avatarUrl });
  } catch (error) {
    console.error('Avatar upload error:', error);
    res.status(500).json(createError(500, error.message || 'Erro ao atualizar avatar'));
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

    const { firstName, lastName, email, password } = req.body;
    const updates = {};

    if (firstName) updates.firstName = firstName;
    if (lastName) updates.lastName = lastName;
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

    const accessToken = generateAccessToken({ id: user._id, email: user.email, role: user.role });
    res.json({ accessToken });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(401).json(createError(401, 'Token inválido'));
  }
});

module.exports = router;