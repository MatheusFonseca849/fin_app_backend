const User = require('../models/User.model');

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