const router = require('express').Router();
const userService = require('../services/user.service');
const { authenticateToken } = require('../middlewares/auth.middleware');
const createError = require('../middlewares/createError');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage() });

/**
 * GET /records
 * Get all transactions for user
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const transactions = await userService.getTransactions(req.user.id);
    res.json(transactions);
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json(createError(500, 'Erro ao buscar transações'));
  }
});

/**
 * POST /records
 * Create new transaction
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { description, value, type, category } = req.body;

    // Validate category exists
    const user = await userService.findById(req.user.id);
    const categoryExists = user.findCategory(category);
    
    if (!categoryExists) {
      return res.status(400).json(
        createError(400, 'Categoria não encontrada')
      );
    }

    const transaction = await userService.addTransaction(req.user.id, {
      description,
      value,
      type,
      category
    });

    res.status(201).json(transaction);
  } catch (error) {
    console.error('Create transaction error:', error);
    res.status(500).json(createError(500, 'Erro ao criar transação'));
  }
});

/**
 * GET /records/:id
 * Get single transaction
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const transactions = await userService.getTransactions(req.user.id);
    const transaction = transactions.find(t => t._id.toString() === req.params.id);
    
    if (!transaction) {
      return res.status(404).json(
        createError(404, 'Transação não encontrada')
      );
    }
    
    res.json(transaction);
  } catch (error) {
    console.error('Get transaction error:', error);
    res.status(500).json(createError(500, 'Erro ao buscar transação'));
  }
});

/**
 * PUT /records/:id
 * Update transaction
 */
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { description, value, type, category, date } = req.body;
    
    const updates = {};
    if (description !== undefined) updates.description = description;
    if (value !== undefined) updates.value = value;
    if (type !== undefined) updates.type = type;
    if (category !== undefined) updates.category = category;
    if (date !== undefined) updates.timestamp = new Date(date);

    const transaction = await userService.updateTransaction(
      req.user.id,
      req.params.id,
      updates
    );

    res.json(transaction);
  } catch (error) {
    console.error('Update transaction error:', error);
    res.status(500).json(createError(500, error.message));
  }
});

/**
 * DELETE /records/:id
 * Delete transaction
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    await userService.deleteTransaction(req.user.id, req.params.id);
    res.json({ message: 'Transação excluída com sucesso' });
  } catch (error) {
    console.error('Delete transaction error:', error);
    res.status(500).json(createError(500, error.message));
  }
});

module.exports = router;