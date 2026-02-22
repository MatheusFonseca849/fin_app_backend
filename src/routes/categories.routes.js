const router = require('express').Router();
const userService = require('../services/user.service');
const { authenticateToken } = require('../middlewares/auth.middleware');
const createError = require('../middlewares/createError');
const { createCategoryValidation, categoryIdValidation } = require('../middlewares/validators');
const cacheService = require('../services/cache.service');

/**
 * GET /categories
 * Get all categories
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const cached = await cacheService.getCachedCategories(req.user.id);
    if (cached) return res.json(cached);

    const categories = await userService.getCategories(req.user.id);
    await cacheService.cacheCategories(req.user.id, categories);
    res.json(categories);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json(createError(500, 'Erro ao buscar categorias'));
  }
});

/**
 * POST /categories
 * Create category
 */
router.post('/', authenticateToken, createCategoryValidation, async (req, res) => {
  try {
    const { name, type, color } = req.body;
    
    const category = await userService.addCategory(req.user.id, {
      name,
      type,
      color,
      isDefault: false
    });

    await cacheService.invalidateCategories(req.user.id);
    res.status(201).json(category);
  } catch (error) {
    console.error('Create category error:', error);
    res.status(400).json(createError(400, error.message));
  }
});

/**
 * PUT /categories/:id
 * Update category
 */
router.put('/:id', authenticateToken, categoryIdValidation, async (req, res) => {
  try {
    const { name, type, color } = req.body;
    
    const category = await userService.updateCategory(
      req.user.id,
      req.params.id,
      { name, type, color }
    );

    await cacheService.invalidateCategories(req.user.id);
    res.json(category);
  } catch (error) {
    console.error('Update category error:', error);
    res.status(400).json(createError(400, error.message));
  }
});

/**
 * DELETE /categories/:id
 * Delete category
 */
router.delete('/:id', authenticateToken, categoryIdValidation, async (req, res) => {
  try {
    await userService.deleteCategory(req.user.id, req.params.id);
    await cacheService.invalidateCategories(req.user.id);
    res.json({ 
      message: 'Categoria excluída. Transações movidas para "Sem Categoria"' 
    });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(400).json(createError(400, error.message));
  }
});

module.exports = router;