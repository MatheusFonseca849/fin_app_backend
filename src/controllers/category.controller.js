const categoryService = require('../services/category.service');
const transactionService = require('../services/transaction.service');
const createError = require('../middlewares/createError');
const cacheService = require('../services/cache.service');
const { withTransaction } = require('../utils/withTransaction');
const AppError = require('../utils/AppError');

const getAll = async (req, res) => {
  try {
    const cached = await cacheService.getCachedCategories(req.user.id);
    if (cached) return res.json(cached);

    const categories = await categoryService.getCategories(req.user.id);
    await cacheService.cacheCategories(req.user.id, categories);
    res.json(categories);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json(createError(500, 'Erro ao buscar categorias'));
  }
};

const create = async (req, res) => {
  try {
    const { name, type, color, keywords } = req.body;

    const category = await categoryService.addCategory(req.user.id, {
      name,
      type,
      color,
      keywords
    });

    await cacheService.invalidateCategories(req.user.id);
    res.status(201).json(category);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(createError(error.statusCode, error.message));
    }
    console.error('Create category error:', error);
    res.status(500).json(createError(500, 'Erro ao criar categoria'));
  }
};

const update = async (req, res) => {
  try {
    const { name, type, color, keywords } = req.body;

    // Prevent renaming "Sem Categoria"
    const target = await categoryService.getCategoryById(req.user.id, req.params.id);
    if (target && target.name === 'Sem Categoria' && name !== undefined && name !== 'Sem Categoria') {
      return res.status(400).json(createError(400, 'A categoria "Sem Categoria" não pode ser renomeada'));
    }

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (type !== undefined) updates.type = type;
    if (color !== undefined) updates.color = color;
    if (keywords !== undefined) updates.keywords = keywords;

    const category = await categoryService.updateCategory(
      req.user.id,
      req.params.id,
      updates
    );

    await cacheService.invalidateCategories(req.user.id);
    res.json(category);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(createError(error.statusCode, error.message));
    }
    console.error('Update category error:', error);
    res.status(500).json(createError(500, 'Erro ao atualizar categoria'));
  }
};

const remove = async (req, res) => {
  try {
    // Prevent deletion of "Sem Categoria"
    const target = await categoryService.getCategoryById(req.user.id, req.params.id);
    if (target && target.name === 'Sem Categoria') {
      return res.status(400).json(createError(400, 'A categoria "Sem Categoria" não pode ser excluída'));
    }

    await withTransaction(async (session) => {
      const { deletedId, fallbackId } = await categoryService.deleteCategory(
        req.user.id,
        req.params.id,
        { session }
      );

      // Reassign transactions from the deleted category to the fallback
      if (fallbackId) {
        await transactionService.reassignCategory(req.user.id, deletedId, fallbackId, { session });
      }
    });

    await cacheService.invalidateCategories(req.user.id);
    await cacheService.invalidateTransactions(req.user.id);
    res.json({
      message: 'Categoria excluída. Transações movidas para "Sem Categoria"'
    });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(createError(error.statusCode, error.message));
    }
    console.error('Delete category error:', error);
    res.status(500).json(createError(500, 'Erro ao excluir categoria'));
  }
};

module.exports = {
  getAll,
  create,
  update,
  remove,
};
