const router = require('express').Router();
const userController = require('../controllers/user.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { registerValidation, loginValidation, updateUserValidation, forgotPasswordValidation, resetPasswordValidation } = require('../middlewares/validators');
const multer = require('multer');

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

/** POST /users/register */
router.post('/register', registerValidation, userController.register);

/** POST /users/verify-email */
router.post('/verify-email', userController.verifyEmail);

/** POST /users/resend-verification */
router.post('/resend-verification', userController.resendVerification);

/** POST /users/forgot-password */
router.post('/forgot-password', forgotPasswordValidation, userController.forgotPassword);

/** POST /users/reset-password */
router.post('/reset-password', resetPasswordValidation, userController.resetPassword);

/** POST /users/login */
router.post('/login', loginValidation, userController.login);

/** POST /users/refresh */
router.post('/refresh', userController.refresh);

/** POST /users/verify-email-change */
router.post('/verify-email-change', userController.verifyEmailChange);

// ============================================
// AUTHENTICATED ROUTES
// ============================================

/** GET /users/me */
router.get('/me', authenticateToken, userController.getMe);

/** GET /users/balance */
router.get('/balance', authenticateToken, userController.getBalance);

/** PUT /users/balance */
router.put('/balance', authenticateToken, userController.setBalance);

/** PUT /users/avatar */
router.put('/avatar', authenticateToken, avatarUpload.single('avatar'), userController.updateAvatar);

/** PUT /users/:id */
router.put('/:id', authenticateToken, updateUserValidation, userController.updateUser);

/** POST /users/cancel-email-change */
router.post('/cancel-email-change', authenticateToken, userController.cancelEmailChange);

/** POST /users/resend-email-change */
router.post('/resend-email-change', authenticateToken, userController.resendEmailChange);

/** DELETE /users/:id */
router.delete('/:id', authenticateToken, userController.deleteUser);

/** POST /users/logout */
router.post('/logout', authenticateToken, userController.logout);

module.exports = router;