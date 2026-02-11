const User = require('../models/User.model');
const { TRANSACTION_TYPES } = require('../constants/transactionTypes');

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
      .select('-password -transactions -recurrentCredits -recurrentDebits')
      .sort({ createdAt: -1 });
  }

  async getUserSummary(userId) {
    const user = await User.findById(userId)
      .select('-password -transactions -recurrentCredits -recurrentDebits');
    if (!user) throw new Error('Usuário não encontrado');

    // Get transaction count and balance separately for summary stats
    const fullUser = await User.findById(userId).select('transactions balance');
    
    const summary = user.toObject();
    summary.stats = {
      transactionCount: fullUser.transactions.length,
      categoryCount: user.categories.length,
      balance: fullUser.balance
    };
    return summary;
  }

  async adminUpdateUser(userId, updates) {
    const allowedFields = ['name', 'email', 'role'];
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
    ).select('-password -transactions -recurrentCredits -recurrentDebits');

    if (!user) throw new Error('Usuário não encontrado');
    return user;
  }

  async adminDeleteUser(userId) {
    const user = await User.findById(userId);
    if (!user) throw new Error('Usuário não encontrado');
    if (user.role === 'admin') {
      throw new Error('Não é possível excluir outro administrador');
    }
    return await User.findByIdAndDelete(userId);
  }

  async updateUserRole(userId, role) {
    const user = await User.findByIdAndUpdate(
      userId,
      { role },
      { new: true, runValidators: true }
    ).select('-password -transactions -recurrentCredits -recurrentDebits');

    if (!user) throw new Error('Usuário não encontrado');
    return user;
  }

  async getSystemStats() {
    const totalUsers = await User.countDocuments();
    const adminCount = await User.countDocuments({ role: 'admin' });
    const userCount = await User.countDocuments({ role: 'user' });

    // Aggregate transaction counts across all users
    const transactionStats = await User.aggregate([
      {
        $project: {
          transactionCount: { $size: '$transactions' }
        }
      },
      {
        $group: {
          _id: null,
          totalTransactions: { $sum: '$transactionCount' }
        }
      }
    ]);

    return {
      users: {
        total: totalUsers,
        admins: adminCount,
        regular: userCount
      },
      transactions: {
        total: transactionStats[0]?.totalTransactions || 0
      }
    };
  }

  // ============================================
  // Transaction Operations
  // ============================================

  async getTransactions(userId) {
    const user = await User.findById(userId).select('transactions');
    return user ? user.transactions : [];
  }

  async addTransaction(userId, transaction) {
    const user = await User.findById(userId);
    if (!user) throw new Error('Usuário não encontrado');

    user.transactions.push(transaction);
    await user.save();
    
    return user.transactions[user.transactions.length - 1];
  }

  async updateTransaction(userId, transactionId, updates) {
    const user = await User.findById(userId);
    if (!user) throw new Error('Usuário não encontrado');

    const transaction = user.transactions.id(transactionId);
    if (!transaction) throw new Error('Transação não encontrada');

    Object.assign(transaction, updates);
    await user.save();
    
    return transaction;
  }

  async deleteTransaction(userId, transactionId) {
    const user = await User.findById(userId);
    if (!user) throw new Error('Usuário não encontrado');

    user.transactions.pull(transactionId);
    await user.save();
    
    return { message: 'Transação excluída' };
  }

  async bulkAddTransactions(userId, transactions) {
    const user = await User.findById(userId);
    if (!user) throw new Error('Usuário não encontrado');

    let created = 0;
    let errors = 0;
    const errorDetails = [];

    for (const transaction of transactions) {
      try {
        // Validate category exists
        const categoryExists = user.findCategory(transaction.category);
        if (!categoryExists) {
          errors++;
          errorDetails.push({
            transaction,
            error: 'Categoria não encontrada'
          });
          continue;
        }

        user.transactions.push(transaction);
        created++;
      } catch (error) {
        errors++;
        errorDetails.push({
          transaction,
          error: error.message
        });
      }
    }

    await user.save();
    
    return {
      createdCount: created,
      errorCount: errors,
      errors: errorDetails
    };
  }

  // ============================================
  // Recurrent Operations
  // ============================================

  _getRecurrentField(type) {
    if (type === TRANSACTION_TYPES.CREDIT) return 'recurrentCredits';
    if (type === TRANSACTION_TYPES.DEBIT) return 'recurrentDebits';
    throw new Error('Invalid type. Use "credito" or "debito"');
  }

  async getRecurrentTransactions(userId, type) {
    const field = this._getRecurrentField(type);
    const user = await User.findById(userId).select(field);
    if (!user) throw new Error('Usuário não encontrado');
    return user[field];
  }

  async addRecurrentTransaction(userId, type, transaction) {
    const field = this._getRecurrentField(type);
    const user = await User.findById(userId);
    if (!user) throw new Error('Usuário não encontrado');

    const categoryExists = user.findCategory(transaction.category);
    if (!categoryExists) throw new Error('Categoria não encontrada');

    user[field].push(transaction);
    await user.save();

    return user[field][user[field].length - 1];
  }

  async updateRecurrentTransaction(userId, type, transactionId, updates) {
    const field = this._getRecurrentField(type);
    const user = await User.findById(userId);
    if (!user) throw new Error('Usuário não encontrado');

    const transaction = user[field].id(transactionId);
    if (!transaction) throw new Error('Transação recorrente não encontrada');

    Object.assign(transaction, updates);
    await user.save();

    return transaction;
  }

  async deleteRecurrentTransaction(userId, type, transactionId) {
    const field = this._getRecurrentField(type);
    const user = await User.findById(userId);
    if (!user) throw new Error('Usuário não encontrado');

    const transaction = user[field].id(transactionId);
    if (!transaction) throw new Error('Transação recorrente não encontrada');

    user[field].pull(transactionId);
    await user.save();

    return { message: 'Transação recorrente excluída' };
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

    // Reassign transactions
    user.transactions.forEach(t => {
      if (t.category === category.name) {
        t.category = defaultCat.name;
      }
    });

    user.categories.pull(categoryId);
    await user.save();
    
    return { message: 'Categoria excluída' };
  }
}

module.exports = new UserService();