const Category = require('../models/schemas/category.schema');
const { TRANSACTION_TYPES } = require('../constants/transactionTypes');
const AppError = require('../utils/AppError');

class CategoryService {

  // ============================================
  // CRUD Operations
  // ============================================

  async getCategories(userId) {
    return await Category.find({ userId }).sort({ type: 1, name: 1 });
  }

  async getCategoryById(userId, categoryId) {
    return await Category.findOne({ _id: categoryId, userId });
  }

  async findByName(userId, name) {
    return await Category.findOne({ userId, name });
  }

  async addCategory(userId, data) {
    const exists = await Category.findOne({ userId, name: data.name });
    if (exists) throw new AppError(409, 'Categoria já existe');

    const category = new Category({ ...data, userId });
    return await category.save();
  }

  async updateCategory(userId, categoryId, updates) {
    const category = await Category.findOneAndUpdate(
      { _id: categoryId, userId },
      updates,
      { new: true, runValidators: true }
    );
    if (!category) throw new AppError(404, 'Categoria não encontrada');
    return category;
  }

  async ensureSemCategoria(userId, { session } = {}) {
    const existing = await Category.findOne({ userId, name: 'Sem Categoria' }).session(session || null);
    if (existing) return existing;

    const created = new Category({
      userId,
      name: 'Sem Categoria',
      type: TRANSACTION_TYPES.EXPENSE,
      color: '#D5DBDB',
    });
    return await created.save({ session });
  }

  async deleteCategory(userId, categoryId, { session } = {}) {
    const category = await Category.findOne({ _id: categoryId, userId }).session(session);
    if (!category) throw new AppError(404, 'Categoria não encontrada');

    // Guarantee fallback category exists for transaction reassignment
    const defaultCat = await this.ensureSemCategoria(userId, { session });
    const fallbackId = defaultCat._id.equals(categoryId) ? null : defaultCat._id;

    const deletedId = category._id;
    await Category.deleteOne({ _id: categoryId, userId }, { session });

    return { deletedId, fallbackId };
  }

  // ============================================
  // Default Categories (called on user registration)
  // ============================================

  async createDefaultCategories(userId) {
    const defaults = [
      { name: 'Alimentação', type: TRANSACTION_TYPES.EXPENSE, color: '#FF6B6B' },
      { name: 'Transporte', type: TRANSACTION_TYPES.EXPENSE, color: '#4ECDC4' },
      { name: 'Saúde', type: TRANSACTION_TYPES.EXPENSE, color: '#45B7D1' },
      { name: 'Contas', type: TRANSACTION_TYPES.EXPENSE, color: '#FFA07A' },
      { name: 'Lazer', type: TRANSACTION_TYPES.EXPENSE, color: '#98D8C8' },
      { name: 'Outros', type: TRANSACTION_TYPES.EXPENSE, color: '#F7DC6F' },
      { name: 'Salário', type: TRANSACTION_TYPES.INCOME, color: '#82E0AA' },
      { name: 'Freelance', type: TRANSACTION_TYPES.INCOME, color: '#AED6F1' },
      { name: 'Sem Categoria', type: TRANSACTION_TYPES.EXPENSE, color: '#D5DBDB' }
    ];

    const docs = defaults.map(d => ({ ...d, userId }));
    return await Category.insertMany(docs);
  }

  async getCategoryCount(userId) {
    return await Category.countDocuments({ userId });
  }

  // ============================================
  // Cleanup
  // ============================================

  async deleteAllUserCategories(userId, { session } = {}) {
    return await Category.deleteMany({ userId }, { session });
  }
}

module.exports = new CategoryService();
