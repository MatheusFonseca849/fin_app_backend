const User = require('../models/User.model');
const transactionService = require('./transaction.service');
const categoryService = require('./category.service');
const { deleteAvatar } = require('../utils/upload.utils');

class UserService {
  
  // ============================================
  // User CRUD Operations
  // ============================================

  async createUser(userData) {
    const user = new User(userData);
    const savedUser = await user.save();

    // Seed default categories in the separate collection
    try {
      await categoryService.createDefaultCategories(savedUser._id);
    } catch (error) {
      console.error('Failed to seed default categories:', error.message);
    }

    return savedUser;
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

  async findByEmailWithResetToken(email) {
    return await User.findOne({ email: email.toLowerCase() })
      .select('+resetPasswordToken +resetPasswordExpires');
  }

  async findByPendingEmailWithToken(pendingEmail) {
    return await User.findOne({ pendingEmail: pendingEmail.toLowerCase() })
      .select('+pendingEmailToken +pendingEmailTokenExpires');
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
    await categoryService.deleteAllUserCategories(id);
    await deleteAvatar(id);  // Clean up cloud storage
    return await User.findByIdAndDelete(id);
  }

  async getAllUsers() {
    return await User.find().select('-password').lean();
  }

  // ============================================
  // Admin Operations
  // ============================================

  async getAllUsersSafe() {
    return await User.find()
      .select('-password')
      .sort({ createdAt: -1 })
      .lean();
  }

  async getUserSummary(userId) {
    const user = await User.findById(userId).select('-password').lean();
    if (!user) throw new Error('Usuário não encontrado');

    const transactionCount = await transactionService.getTransactionCount(userId);
    const categoryCount = await categoryService.getCategoryCount(userId);
    
    const summary = { ...user };
    summary.stats = {
      transactionCount,
      categoryCount,
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
    await categoryService.deleteAllUserCategories(userId);
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
  // Balance Operations
  // ============================================

  /**
   * Compute the signed balance delta for a transaction.
   * credito adds to balance, debito subtracts.
   * @param {number} value - value in cents (always positive)
   * @param {string} type - 'credito' or 'debito'
   * @returns {number} signed delta
   */
  getBalanceDelta(value, type) {
    return type === 'credito' ? value : -value;
  }

  /**
   * Atomically adjust the user's balance by a signed delta (in cents).
   * Uses $inc to avoid race conditions.
   */
  async adjustBalance(userId, delta) {
    return await User.findByIdAndUpdate(
      userId,
      { $inc: { balance: delta } },
      { new: true }
    );
  }

  /**
   * Set the user's balance to an explicit value (manual override).
   * @param {string} userId
   * @param {number} balanceInCents
   */
  async setBalance(userId, balanceInCents) {
    return await User.findByIdAndUpdate(
      userId,
      { $set: { balance: balanceInCents } },
      { new: true, runValidators: true }
    );
  }

  // ============================================
  // Token Revocation
  // ============================================

  async incrementTokenVersion(userId) {
    return await User.findByIdAndUpdate(
      userId,
      { $inc: { tokenVersion: 1 } },
      { new: true }
    );
  }
}

module.exports = new UserService();