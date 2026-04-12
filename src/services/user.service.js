const User = require('../models/User.model');
const transactionService = require('./transaction.service');
const categoryService = require('./category.service');
const { deleteAvatar } = require('../utils/upload.utils');
const { withTransaction } = require('../utils/withTransaction');
const AppError = require('../utils/AppError');

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

  async findById(id, { session } = {}) {
    return await User.findById(id).session(session);
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
    if (!user) throw new AppError(404, 'Usuário não encontrado');

    await withTransaction(async (session) => {
      await transactionService.deleteAllUserTransactions(id, { session });
      await categoryService.deleteAllUserCategories(id, { session });
      await User.findByIdAndDelete(id, { session });
    });

    // Best-effort cloud cleanup (outside transaction)
    try {
      await deleteAvatar(id);
    } catch (error) {
      console.error(`Failed to delete avatar for user ${id}:`, error.message);
    }
  }

  async getAllUsers() {
    return await User.find().select('-password').lean();
  }

  // ============================================
  // Admin Operations
  // ============================================

  async getAllUsersSafe({ page = 1, limit = 20 } = {}) {
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      User.find()
        .select('-password')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments()
    ]);
    return { users, total, page, limit };
  }

  async getUserSummary(userId) {
    const user = await User.findById(userId).select('-password').lean();
    if (!user) throw new AppError(404, 'Usuário não encontrado');

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

    if (!user) throw new AppError(404, 'Usuário não encontrado');
    return user;
  }

  async adminDeleteUser(userId) {
    const user = await User.findById(userId);
    if (!user) throw new AppError(404, 'Usuário não encontrado');
    if (user.role === 'admin') {
      throw new AppError(403, 'Não é possível excluir outro administrador');
    }

    await withTransaction(async (session) => {
      await transactionService.deleteAllUserTransactions(userId, { session });
      await categoryService.deleteAllUserCategories(userId, { session });
      await User.findByIdAndDelete(userId, { session });
    });

    // Best-effort cloud cleanup (outside transaction)
    try {
      await deleteAvatar(userId);
    } catch (error) {
      console.error(`Failed to delete avatar for user ${userId}:`, error.message);
    }
  }

  async updateUserRole(userId, role) {
    const user = await User.findByIdAndUpdate(
      userId,
      { role },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) throw new AppError(404, 'Usuário não encontrado');
    return user;
  }

  async getSystemStats() {
    const [roleCounts, totalTransactions] = await Promise.all([
      User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
      transactionService.getSystemTransactionCount(),
    ]);

    const countByRole = Object.fromEntries(roleCounts.map(r => [r._id, r.count]));

    return {
      users: {
        total: (countByRole.admin || 0) + (countByRole.user || 0),
        admins: countByRole.admin || 0,
        regular: countByRole.user || 0
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
  async adjustBalance(userId, delta, { session } = {}) {
    return await User.findByIdAndUpdate(
      userId,
      { $inc: { balance: delta } },
      { new: true, session }
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