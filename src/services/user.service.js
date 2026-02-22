const User = require('../models/User.model');
const transactionService = require('./transaction.service');
const { deleteAvatar } = require('../utils/upload.utils');

class UserService {
  
  // ============================================
  // User CRUD Operations
  // ============================================

  async createUser(userData) {
    const user = new User({
      ...userData,
      categories: User.getDefaultCategories()
    });
    return await user.save();
  }

  async findById(id) {
    return await User.findById(id);
  }

  async findByEmail(email) {
    return await User.findByEmail(email);
  }

  async findByEmailWithVerification(email) {
    return await User.findOne({ email: email.toLowerCase() })
      .select('+verificationToken +verificationTokenExpires');
  }

  async updateUser(id, updates) {
    return await User.findByIdAndUpdate(
      id,
      updates,
      { 
        new: true,          // Return updated doc
        runValidators: true // Validate
      }
    );
  }

  async deleteUser(id) {
    const user = await User.findById(id);
    if (!user) throw new Error('Usuário não encontrado');

    await transactionService.deleteAllUserTransactions(id);
    await deleteAvatar(id);  // Clean up cloud storage
    return await User.findByIdAndDelete(id);
  }

  async getAllUsers() {
    return await User.find().select('-password');
  }

  // ============================================
  // Admin Operations
  // ============================================

  async getAllUsersSafe() {
    return await User.find()
      .select('-password')
      .sort({ createdAt: -1 });
  }

  async getUserSummary(userId) {
    const user = await User.findById(userId).select('-password');
    if (!user) throw new Error('Usuário não encontrado');

    const transactionCount = await transactionService.getTransactionCount(userId);
    
    const summary = user.toObject();
    summary.stats = {
      transactionCount,
      categoryCount: user.categories.length,
      balance: user.balance
    };
    return summary;
  }

  async adminUpdateUser(userId, updates) {
    const allowedFields = ['firstName', 'lastName', 'email', 'role'];
    const safeUpdates = {};
    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        safeUpdates[key] = updates[key];
      }
    }

    const user = await User.findByIdAndUpdate(
      userId,
      safeUpdates,
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) throw new Error('Usuário não encontrado');
    return user;
  }

  async adminDeleteUser(userId) {
    const user = await User.findById(userId);
    if (!user) throw new Error('Usuário não encontrado');
    if (user.role === 'admin') {
      throw new Error('Não é possível excluir outro administrador');
    }

    await transactionService.deleteAllUserTransactions(userId);
    await deleteAvatar(userId);  // Clean up cloud storage
    return await User.findByIdAndDelete(userId);
  }

  async updateUserRole(userId, role) {
    const user = await User.findByIdAndUpdate(
      userId,
      { role },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) throw new Error('Usuário não encontrado');
    return user;
  }

  async getSystemStats() {
    const totalUsers = await User.countDocuments();
    const adminCount = await User.countDocuments({ role: 'admin' });
    const userCount = await User.countDocuments({ role: 'user' });
    const totalTransactions = await transactionService.getSystemTransactionCount();

    return {
      users: {
        total: totalUsers,
        admins: adminCount,
        regular: userCount
      },
      transactions: {
        total: totalTransactions
      }
    };
  }

  // ============================================
  // Category Operations
  // ============================================

  async getCategories(userId) {
    const user = await User.findById(userId).select('categories');
    return user ? user.categories : [];
  }

  async addCategory(userId, category) {
    const user = await User.findById(userId);
    if (!user) throw new Error('Usuário não encontrado');

    const exists = user.categories.find(c => c.name === category.name);
    if (exists) throw new Error('Categoria já existe');

    user.categories.push(category);
    await user.save();
    
    return user.categories[user.categories.length - 1];
  }

  async updateCategory(userId, categoryId, updates) {
    const user = await User.findById(userId);
    if (!user) throw new Error('Usuário não encontrado');

    const category = user.categories.id(categoryId);
    if (!category) throw new Error('Categoria não encontrada');
    if (category.isDefault) {
      throw new Error('Categoria padrão não pode ser editada');
    }

    Object.assign(category, updates);
    await user.save();
    
    return category;
  }

  async deleteCategory(userId, categoryId) {
    const user = await User.findById(userId);
    if (!user) throw new Error('Usuário não encontrado');

    const category = user.categories.id(categoryId);
    if (!category) throw new Error('Categoria não encontrada');
    if (category.isDefault) {
      throw new Error('Categoria padrão não pode ser excluída');
    }

    // Find default category
    const defaultCat = user.categories.find(
      c => c.name === 'Sem Categoria' && c.isDefault
    );

    // Reassign transactions in the separate collection
    await transactionService.reassignCategory(userId, category.name, defaultCat.name);

    user.categories.pull(categoryId);
    await user.save();
    
    return { message: 'Categoria excluída' };
  }
}

module.exports = new UserService();