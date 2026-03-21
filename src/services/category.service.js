const Category = require('../models/schemas/category.schema');
const { TRANSACTION_TYPES } = require('../constants/transactionTypes');

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
    if (exists) throw new Error('Categoria já existe');

    const category = new Category({ ...data, userId });
    return await category.save();
  }

  async updateCategory(userId, categoryId, updates) {
    const category = await Category.findOneAndUpdate(
      { _id: categoryId, userId },
      updates,
      { new: true, runValidators: true }
    );
    if (!category) throw new Error('Categoria não encontrada');
    return category;
  }

  async deleteCategory(userId, categoryId) {
    const category = await Category.findOne({ _id: categoryId, userId });
    if (!category) throw new Error('Categoria não encontrada');

    // Find fallback category for transaction reassignment
    const defaultCat = await Category.findOne({
      userId,
      name: 'Sem Categoria',
      _id: { $ne: categoryId }
    });

    const deletedId = category._id;
    await Category.deleteOne({ _id: categoryId, userId });

    return { deletedId, fallbackId: defaultCat?._id || null };
  }

  // ============================================
  // Default Categories (called on user registration)
  // ============================================

  async createDefaultCategories(userId) {
    const defaults = [
      { name: 'Alimentação', type: TRANSACTION_TYPES.DEBIT, color: '#FF6B6B' },
      { name: 'Transporte', type: TRANSACTION_TYPES.DEBIT, color: '#4ECDC4' },
      { name: 'Saúde', type: TRANSACTION_TYPES.DEBIT, color: '#45B7D1' },
      { name: 'Contas', type: TRANSACTION_TYPES.DEBIT, color: '#FFA07A' },
      { name: 'Lazer', type: TRANSACTION_TYPES.DEBIT, color: '#98D8C8' },
      { name: 'Outros', type: TRANSACTION_TYPES.DEBIT, color: '#F7DC6F' },
      { name: 'Salário', type: TRANSACTION_TYPES.CREDIT, color: '#82E0AA' },
      { name: 'Freelance', type: TRANSACTION_TYPES.CREDIT, color: '#AED6F1' },
      { name: 'Sem Categoria', type: TRANSACTION_TYPES.DEBIT, color: '#D5DBDB' }
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

  async deleteAllUserCategories(userId) {
    return await Category.deleteMany({ userId });
  }
}

module.exports = new CategoryService();
