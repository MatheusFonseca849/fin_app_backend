const router = require('express').Router();
const adminController = require('../controllers/admin.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { isAdmin } = require('../middlewares/admin.middleware');
const { adminUpdateUserValidation, adminUserIdValidation } = require('../middlewares/validators');

// All admin routes require authentication + admin role
router.use(authenticateToken, isAdmin);

// ============================================
// USER MANAGEMENT
// ============================================

/** GET /admin/users */
router.get('/users', adminController.listUsers);

/** GET /admin/users/:id */
router.get('/users/:id', adminUserIdValidation, adminController.getUser);

/** PUT /admin/users/:id */
router.put('/users/:id', adminUserIdValidation, adminUpdateUserValidation, adminController.updateUser);

/** DELETE /admin/users/:id */
router.delete('/users/:id', adminUserIdValidation, adminController.deleteUser);

/** PATCH /admin/users/:id/role */
router.patch('/users/:id/role', adminUserIdValidation, adminController.updateRole);

// ============================================
// SYSTEM INFO
// ============================================

/** GET /admin/stats */
router.get('/stats', adminController.getStats);

module.exports = router;
