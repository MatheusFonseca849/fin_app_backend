const Transaction = require('../models/schemas/transaction.schema');

class TransactionService {

  // ============================================
  // Regular Transaction Operations
  // ============================================

  async getTransactions(userId, { page = 1, limit = 50, type, isRecurrent } = {}) {
    const filter = { userId };
    if (type) filter.type = type;
    if (isRecurrent !== undefined) filter.isRecurrent = isRecurrent;

    return await Transaction.find(filter)
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
  }

  async getTransactionCount(userId) {
    return await Transaction.countDocuments({ userId });
  }

  async getTransactionById(userId, transactionId) {
    return await Transaction.findOne({ _id: transactionId, userId });
  }

  async addTransaction(userId, transactionData) {
    const transaction = new Transaction({
      ...transactionData,
      userId
    });
    return await transaction.save();
  }

  async updateTransaction(userId, transactionId, updates) {
    const transaction = await Transaction.findOneAndUpdate(
      { _id: transactionId, userId },
      updates,
      { new: true, runValidators: true }
    );
    if (!transaction) throw new Error('Transação não encontrada');
    return transaction;
  }

  async deleteTransaction(userId, transactionId) {
    const transaction = await Transaction.findOneAndDelete({ _id: transactionId, userId });
    if (!transaction) throw new Error('Transação não encontrada');
    return { message: 'Transação excluída' };
  }

  async bulkAddTransactions(userId, transactions) {
    let created = 0;
    let errors = 0;
    const errorDetails = [];

    for (const txData of transactions) {
      try {
        const transaction = new Transaction({ ...txData, userId });
        await transaction.save();
        created++;
      } catch (error) {
        errors++;
        errorDetails.push({
          transaction: txData,
          error: error.message
        });
      }
    }

    return {
      createdCount: created,
      errorCount: errors,
      errors: errorDetails
    };
  }

  // ============================================
  // Recurrent Transaction Operations
  // ============================================

  async getRecurrentTransactions(userId, type) {
    const filter = { userId, isRecurrent: true };
    if (type) filter.type = type;
    return await Transaction.find(filter).sort({ billingDay: 1 });
  }

  async addRecurrentTransaction(userId, transactionData) {
    const transaction = new Transaction({
      ...transactionData,
      userId,
      isRecurrent: true
    });
    return await transaction.save();
  }

  async updateRecurrentTransaction(userId, transactionId, updates) {
    const transaction = await Transaction.findOneAndUpdate(
      { _id: transactionId, userId, isRecurrent: true },
      updates,
      { new: true, runValidators: true }
    );
    if (!transaction) throw new Error('Transação recorrente não encontrada');
    return transaction;
  }

  async deleteRecurrentTransaction(userId, transactionId) {
    const transaction = await Transaction.findOneAndDelete({
      _id: transactionId,
      userId,
      isRecurrent: true
    });
    if (!transaction) throw new Error('Transação recorrente não encontrada');
    return { message: 'Transação recorrente excluída' };
  }

  // ============================================
  // Aggregation / Stats
  // ============================================

  async getUserBalance(userId) {
    const result = await Transaction.aggregate([
      { $match: { userId: require('mongoose').Types.ObjectId.createFromHexString(userId), isRecurrent: false } },
      { $group: { _id: null, total: { $sum: '$value' } } }
    ]);
    return result[0]?.total || 0;
  }

  async getSystemTransactionCount() {
    return await Transaction.countDocuments({ isRecurrent: false });
  }

  async deleteAllUserTransactions(userId) {
    return await Transaction.deleteMany({ userId });
  }

  async reassignCategory(userId, oldCategoryName, newCategoryName) {
    return await Transaction.updateMany(
      { userId, category: oldCategoryName },
      { $set: { category: newCategoryName } }
    );
  }
}

module.exports = new TransactionService();
