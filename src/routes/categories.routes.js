const router = require('express').Router();
const categoryController = require('../controllers/category.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { createCategoryValidation, updateCategoryValidation, categoryIdValidation } = require('../middlewares/validators');

/**
 * GET /categories
 * Get all categories
 */
router.get('/', authenticateToken, categoryController.getAll);

/**
 * POST /categories
 * Create category
 */
router.post('/', authenticateToken, createCategoryValidation, categoryController.create);

/**
 * PUT /categories/:id
 * Update category
 */
router.put('/:id', authenticateToken, updateCategoryValidation, categoryController.update);

/**
 * DELETE /categories/:id
 * Delete category
 */
router.delete('/:id', authenticateToken, categoryIdValidation, categoryController.remove);

module.exports = router;