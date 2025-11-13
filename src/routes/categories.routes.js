const router = require('express').Router();
const userService = require('../services/user.service');
const { authenticateToken } = require('../middlewares/auth.middleware');
const createError = require('../middlewares/createError');
const validateCategory = require('../middlewares/validateCategory');

/**
 * GET /categories
 * Get all categories
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const categories = await userService.getCategories(req.user.id);
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
router.post('/', authenticateToken, validateCategory, async (req, res) => {
  try {
    const { name, type, color } = req.body;
    
    const category = await userService.addCategory(req.user.id, {
      name,
      type,
      color,
      isDefault: false
    });

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
router.put('/:id', authenticateToken, validateCategory, async (req, res) => {
  try {
    const { name, type, color } = req.body;
    
    const category = await userService.updateCategory(
      req.user.id,
      req.params.id,
      { name, type, color }
    );

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
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    await userService.deleteCategory(req.user.id, req.params.id);
    res.json({ 
      message: 'Categoria excluída. Transações movidas para "Sem Categoria"' 
    });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(400).json(createError(400, error.message));
  }
});

module.exports = router;