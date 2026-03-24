const userService = require('../services/user.service');
const emailService = require('../services/email.service');
const createError = require('../middlewares/createError');
const { hashPassword, comparePassword, validatePasswordStrength } = require('../utils/password.utils');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken, generateFingerprint } = require('../utils/jwt.utils');
const { generateVerificationToken, hashToken } = require('../utils/verification.utils');
const { uploadAvatar } = require('../utils/upload.utils');
const cacheService = require('../services/cache.service');
const { auditLog, AUDIT_EVENTS } = require('../utils/auditLogger');

// ============================================
// PUBLIC ROUTES (No Auth Required)
// ============================================

const register = async (req, res) => {
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
    await userService.createUser({
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
};

const verifyEmail = async (req, res) => {
  try {
    const { token, email } = req.body;

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
};

const resendVerification = async (req, res) => {
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
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await userService.findByEmail(email);

    // Always return success. Prevents email enumeration
    if (!user || !user.isVerified) {
      return res.json({ message: 'Se o email estiver cadastrado, um link de redefinição será enviado.' });
    }

    // Generate reset token (reuse same utility as email verification)
    const { rawToken, hashedToken } = generateVerificationToken();

    // Store hashed token + 1h expiry on user doc
    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    // Send reset email
    try {
      await emailService.sendPasswordResetEmail(email, rawToken);
    } catch (emailError) {
      console.error('Password reset email error:', emailError);
    }

    res.json({ message: 'Se o email estiver cadastrado, um link de redefinição será enviado.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json(createError(500, 'Erro ao processar solicitação'));
  }
};

const resetPassword = async (req, res) => {
  try {
    const { token, email, password } = req.body;

    // Find user with reset token fields
    const user = await userService.findByEmailWithResetToken(email);
    if (!user) {
      return res.status(400).json(
        createError(400, 'Token inválido ou expirado')
      );
    }

    const hashedToken = hashToken(token);
    if (user.resetPasswordToken !== hashedToken) {
      return res.status(400).json(
        createError(400, 'Token inválido ou expirado')
      );
    }

    // Check expiry
    if (user.resetPasswordExpires < new Date()) {
      return res.status(400).json(
        createError(400, 'Token expirado. Solicite um novo link de redefinição.')
      );
    }

    // Validate password strength (defense-in-depth — validator also checks, but this guards direct calls)
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json(
        createError(400, passwordValidation.message)
      );
    }

    user.password = await hashPassword(password);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();

    auditLog(AUDIT_EVENTS.PASSWORD_RESET, { userId: user._id.toString(), email }, req);
    res.json({ message: 'Senha redefinida com sucesso. Você já pode fazer login.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json(createError(500, 'Erro ao redefinir senha'));
  }
};

const login = async (req, res) => {
  const MAX_FAILED_ATTEMPTS = 5;
  const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

  try {
    const { email, password } = req.body;

    // Find user
    const user = await userService.findByEmail(email);
    if (!user) {
      return res.status(401).json(
        createError(401, 'Email ou senha incorretos')
      );
    }

    // Check per-account lockout
    if (user.lockUntil && user.lockUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return res.status(429).json(
        createError(429, `Conta temporariamente bloqueada. Tente novamente em ${minutesLeft} minuto(s).`)
      );
    }

    // Check password
    const isValid = await comparePassword(password, user.password);
    if (!isValid) {
      // Increment failed attempts
      const attempts = (user.failedLoginAttempts || 0) + 1;
      const update = { failedLoginAttempts: attempts };

      if (attempts >= MAX_FAILED_ATTEMPTS) {
        update.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
        auditLog(AUDIT_EVENTS.ACCOUNT_LOCKED, { userId: user._id.toString(), email, attempts }, req);
      }

      await userService.updateUser(user._id, update);

      auditLog(AUDIT_EVENTS.LOGIN_FAILED, { email, attempts }, req);
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

    // Successful login — reset lockout counters
    if (user.failedLoginAttempts > 0 || user.lockUntil) {
      await userService.updateUser(user._id, { failedLoginAttempts: 0, lockUntil: null });
    }

    // Generate tokens (include tokenVersion for revocation support)
    const tokenPayload = { id: user._id, email: user.email, role: user.role, tokenVersion: user.tokenVersion };
    const accessToken = generateAccessToken(tokenPayload);
    const fingerprint = generateFingerprint(req.headers['user-agent']);
    const refreshToken = generateRefreshToken({ id: user._id, tokenVersion: user.tokenVersion, fingerprint });

    // Set cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    // Return user without sensitive fields (toJSON strips password, lockout info, etc.)
    const userData = user.toJSON();

    auditLog(AUDIT_EVENTS.LOGIN_SUCCESS, { userId: user._id.toString(), email: user.email }, req);

    res.json({
      accessToken,
      user: userData
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json(createError(500, 'Erro ao fazer login'));
  }
};

// ============================================
// AUTHENTICATED ROUTES
// ============================================

const getMe = async (req, res) => {
  try {
    const cached = await cacheService.getCachedUserProfile(req.user.id);
    if (cached) return res.json(cached);

    const user = await userService.findById(req.user.id);
    if (!user) {
      return res.status(404).json(createError(404, 'Usuário não encontrado'));
    }

    const userData = user.toJSON();
    await cacheService.cacheUserProfile(req.user.id, userData);

    res.json(userData);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json(createError(500, 'Erro ao buscar usuário'));
  }
};

const getBalance = async (req, res) => {
  try {
    const user = await userService.findById(req.user.id);
    if (!user) {
      return res.status(404).json(createError(404, 'Usuário não encontrado'));
    }
    res.json({ balance: user.balance });
  } catch (error) {
    console.error('Get balance error:', error);
    res.status(500).json(createError(500, 'Erro ao buscar saldo'));
  }
};

const setBalance = async (req, res) => {
  try {
    const { balance } = req.body;
    if (balance === undefined || typeof balance !== 'number') {
      return res.status(400).json(createError(400, 'Valor do saldo é obrigatório e deve ser um número (em centavos)'));
    }
    if (!Number.isInteger(balance)) {
      return res.status(400).json(createError(400, 'O saldo deve ser um número inteiro (em centavos)'));
    }
    const previousBalance = (await userService.findById(req.user.id))?.balance;
    const user = await userService.setBalance(req.user.id, balance);
    await cacheService.invalidateUser(req.user.id);
    auditLog(AUDIT_EVENTS.BALANCE_SET, { userId: req.user.id, previousBalance, newBalance: balance }, req);
    res.json({ balance: user.balance });
  } catch (error) {
    console.error('Set balance error:', error);
    res.status(500).json(createError(500, 'Erro ao atualizar saldo'));
  }
};

const updateAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json(createError(400, 'Nenhuma imagem enviada'));
    }

    // Upload to Cloudinary
    const { url } = await uploadAvatar(req.file.buffer, req.user.id);

    // Store only the URL in MongoDB
    const user = await userService.updateUser(req.user.id, { avatarUrl: url });
    await cacheService.invalidateUser(req.user.id);
    res.json({ avatarUrl: user.avatarUrl });
  } catch (error) {
    console.error('Avatar upload error:', error);
    res.status(500).json(createError(500, error.message || 'Erro ao atualizar avatar'));
  }
};

const updateUser = async (req, res) => {
  try {
    // Check ownership
    if (req.params.id !== req.user.id) {
      return res.status(403).json(
        createError(403, 'Acesso negado')
      );
    }

    const { firstName, lastName, email, password, currentPassword, preferences } = req.body;
    const updates = {};
    let emailChangeRequested = false;

    if (firstName) updates.firstName = firstName;
    if (lastName) updates.lastName = lastName;
    if (preferences) updates.preferences = preferences;

    // Email change: use pending email flow instead of direct update
    if (email && email.toLowerCase() !== req.user.email.toLowerCase()) {
      // Check if new email is already taken
      const emailTaken = await userService.findByEmail(email);
      if (emailTaken) {
        return res.status(400).json(createError(400, 'Este email já está em uso'));
      }

      const { rawToken, hashedToken } = generateVerificationToken();

      updates.pendingEmail = email.toLowerCase();
      updates.pendingEmailToken = hashedToken;
      updates.pendingEmailTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

      try {
        await emailService.sendEmailChangeVerification(email, rawToken);
      } catch (emailError) {
        console.error('Email change verification error:', emailError);
      }

      emailChangeRequested = true;
    }

    if (password) {
      // Defense-in-depth: validate strength even though validator middleware also checks
      const pwValidation = validatePasswordStrength(password);
      if (!pwValidation.isValid) {
        return res.status(400).json(createError(400, pwValidation.message));
      }

      // Verify current password before allowing change
      const user = await userService.findByEmail(req.user.email);
      if (!user) {
        return res.status(404).json(createError(404, 'Usuário não encontrado'));
      }
      const isValid = await comparePassword(currentPassword, user.password);
      if (!isValid) {
        return res.status(401).json(createError(401, 'Senha atual incorreta'));
      }
      updates.password = await hashPassword(password);
      auditLog(AUDIT_EVENTS.PASSWORD_CHANGED, { userId: req.user.id }, req);
    }

    if (emailChangeRequested) {
      auditLog(AUDIT_EVENTS.EMAIL_CHANGE_REQUESTED, { userId: req.user.id, newEmail: email }, req);
    }

    const user = await userService.updateUser(req.user.id, updates);
    await cacheService.invalidateUser(req.user.id);

    const response = user.toJSON();
    if (emailChangeRequested) {
      response.message = 'Um email de verificação foi enviado para o novo endereço.';
    }
    res.json(response);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json(createError(500, 'Erro ao atualizar usuário'));
  }
};

const verifyEmailChange = async (req, res) => {
  try {
    const { token, email } = req.body;

    if (!token || !email) {
      return res.status(400).json(
        createError(400, 'Token e email são obrigatórios')
      );
    }

    const user = await userService.findByPendingEmailWithToken(email);
    if (!user) {
      return res.status(400).json(
        createError(400, 'Nenhuma alteração de email pendente para este endereço')
      );
    }

    const hashedToken = hashToken(token);
    if (user.pendingEmailToken !== hashedToken) {
      return res.status(400).json(
        createError(400, 'Token de verificação inválido')
      );
    }

    if (user.pendingEmailTokenExpires < new Date()) {
      return res.status(400).json(
        createError(400, 'Token de verificação expirado. Solicite uma nova alteração.')
      );
    }

    // Race condition guard: check that the new email is still available
    const emailTaken = await userService.findByEmail(email);
    if (emailTaken) {
      return res.status(400).json(
        createError(400, 'Este email já está em uso por outra conta')
      );
    }

    // Apply the email change
    user.email = user.pendingEmail;
    user.pendingEmail = null;
    user.pendingEmailToken = undefined;
    user.pendingEmailTokenExpires = undefined;
    await user.save();

    // Force re-login since the email in the token payload is now stale
    await userService.incrementTokenVersion(user._id);
    await cacheService.invalidateUser(user._id.toString());

    auditLog(AUDIT_EVENTS.EMAIL_CHANGE_CONFIRMED, { userId: user._id.toString(), newEmail: user.email }, req);
    res.json({ message: 'Email alterado com sucesso. Faça login novamente com o novo endereço.' });
  } catch (error) {
    console.error('Verify email change error:', error);
    res.status(500).json(createError(500, 'Erro ao confirmar alteração de email'));
  }
};

const cancelEmailChange = async (req, res) => {
  try {
    const user = await userService.findById(req.user.id);
    if (!user || !user.pendingEmail) {
      return res.status(400).json(
        createError(400, 'Nenhuma alteração de email pendente')
      );
    }

    await userService.updateUser(req.user.id, {
      pendingEmail: null,
      pendingEmailToken: undefined,
      pendingEmailTokenExpires: undefined
    });
    await cacheService.invalidateUser(req.user.id);

    res.json({ message: 'Alteração de email cancelada.' });
  } catch (error) {
    console.error('Cancel email change error:', error);
    res.status(500).json(createError(500, 'Erro ao cancelar alteração de email'));
  }
};

const resendEmailChange = async (req, res) => {
  try {
    const user = await userService.findById(req.user.id);
    if (!user || !user.pendingEmail) {
      return res.status(400).json(
        createError(400, 'Nenhuma alteração de email pendente')
      );
    }

    const { rawToken, hashedToken } = generateVerificationToken();

    await userService.updateUser(req.user.id, {
      pendingEmailToken: hashedToken,
      pendingEmailTokenExpires: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });

    await emailService.sendEmailChangeVerification(user.pendingEmail, rawToken);

    res.json({ message: 'Email de verificação reenviado.' });
  } catch (error) {
    console.error('Resend email change error:', error);
    res.status(500).json(createError(500, 'Erro ao reenviar email de verificação'));
  }
};

const deleteUser = async (req, res) => {
  try {
    if (req.params.id !== req.user.id) {
      return res.status(403).json(
        createError(403, 'Acesso negado')
      );
    }

    const { password } = req.body;
    if (!password) {
      return res.status(400).json(createError(400, 'Senha é obrigatória para excluir a conta'));
    }

    const user = await userService.findByEmail(req.user.email);
    if (!user) {
      return res.status(404).json(createError(404, 'Usuário não encontrado'));
    }

    const isValid = await comparePassword(password, user.password);
    if (!isValid) {
      return res.status(401).json(createError(401, 'Senha incorreta'));
    }

    await userService.deleteUser(req.user.id);
    await cacheService.invalidateUser(req.user.id);
    auditLog(AUDIT_EVENTS.ACCOUNT_DELETED, { userId: req.user.id }, req);
    res.json({ message: 'Usuário excluído com sucesso' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json(createError(500, 'Erro ao excluir usuário'));
  }
};

const logout = async (req, res) => {
  try {
    await userService.incrementTokenVersion(req.user.id);
    res.clearCookie('refreshToken');
    auditLog(AUDIT_EVENTS.LOGOUT, { userId: req.user.id }, req);
    res.json({ message: 'Logout realizado com sucesso' });
  } catch (error) {
    console.error('Logout error:', error);
    res.clearCookie('refreshToken');
    res.json({ message: 'Logout realizado com sucesso' });
  }
};

const refresh = async (req, res) => {
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

    // Validate tokenVersion — reject revoked refresh tokens
    if (decoded.tokenVersion !== undefined && decoded.tokenVersion !== user.tokenVersion) {
      return res.status(401).json(
        createError(401, 'Token revogado')
      );
    }

    // Validate fingerprint — reject tokens from different user-agents
    if (decoded.fingerprint) {
      const currentFingerprint = generateFingerprint(req.headers['user-agent']);
      if (currentFingerprint !== decoded.fingerprint) {
        return res.status(401).json(
          createError(401, 'Token inválido — dispositivo não reconhecido')
        );
      }
    }

    const tokenPayload = { id: user._id, email: user.email, role: user.role, tokenVersion: user.tokenVersion };
    const accessToken = generateAccessToken(tokenPayload);

    // Rotate refresh token — issue a new one on every refresh (preserve fingerprint)
    const fingerprint = generateFingerprint(req.headers['user-agent']);
    const newRefreshToken = generateRefreshToken({ id: user._id, tokenVersion: user.tokenVersion, fingerprint });
    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({ accessToken });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(401).json(createError(401, 'Token inválido'));
  }
};

module.exports = {
  register,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  login,
  getMe,
  getBalance,
  setBalance,
  updateAvatar,
  updateUser,
  verifyEmailChange,
  cancelEmailChange,
  resendEmailChange,
  deleteUser,
  logout,
  refresh,
};
