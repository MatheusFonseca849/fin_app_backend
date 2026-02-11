const router = require('express').Router();
const userService = require('../services/user.service');
const { authenticateToken } = require('../middlewares/auth.middleware');
const createError = require('../middlewares/createError');
const {
  recurrentTypeValidation,
  createRecurrentValidation,
  updateRecurrentValidation,
  deleteRecurrentValidation
} = require('../middlewares/validators');

/**
 * GET /recurrent/:type
 * List all recurrent transactions of a given type (credito or debito)
 */
router.get('/:type', authenticateToken, recurrentTypeValidation, async (req, res) => {
  try {
    const transactions = await userService.getRecurrentTransactions(req.user.id, req.params.type);
    res.json(transactions);
  } catch (error) {
    console.error('Get recurrent error:', error);
    res.status(500).json(createError(500, error.message));
  }
});

/**
 * POST /recurrent/:type
 * Create a new recurrent transaction
 */
router.post('/:type', authenticateToken, createRecurrentValidation, async (req, res) => {
  try {
    const { description, value, category, dayOfMonth } = req.body;

    const transaction = await userService.addRecurrentTransaction(
      req.user.id,
      req.params.type,
      {
        description,
        value,
        type: req.params.type,
        category,
        dayOfMonth
      }
    );

    res.status(201).json(transaction);
  } catch (error) {
    console.error('Create recurrent error:', error);
    const status = error.message === 'Categoria não encontrada' ? 400 : 500;
    res.status(status).json(createError(status, error.message));
  }
});

/**
 * PUT /recurrent/:type/:id
 * Update a recurrent transaction
 */
router.put('/:type/:id', authenticateToken, updateRecurrentValidation, async (req, res) => {
  try {
    const { description, value, category, dayOfMonth, isActive } = req.body;

    const updates = {};
    if (description !== undefined) updates.description = description;
    if (value !== undefined) updates.value = value;
    if (category !== undefined) updates.category = category;
    if (dayOfMonth !== undefined) updates.dayOfMonth = dayOfMonth;
    if (isActive !== undefined) updates.isActive = isActive;

    const transaction = await userService.updateRecurrentTransaction(
      req.user.id,
      req.params.type,
      req.params.id,
      updates
    );

    res.json(transaction);
  } catch (error) {
    console.error('Update recurrent error:', error);
    const status = error.message.includes('não encontrad') ? 404 : 500;
    res.status(status).json(createError(status, error.message));
  }
});

/**
 * DELETE /recurrent/:type/:id
 * Delete a recurrent transaction
 */
router.delete('/:type/:id', authenticateToken, deleteRecurrentValidation, async (req, res) => {
  try {
    await userService.deleteRecurrentTransaction(req.user.id, req.params.type, req.params.id);
    res.json({ message: 'Transação recorrente excluída com sucesso' });
  } catch (error) {
    console.error('Delete recurrent error:', error);
    const status = error.message.includes('não encontrad') ? 404 : 500;
    res.status(status).json(createError(status, error.message));
  }
});

module.exports = router;
