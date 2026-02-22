const Transaction = require('../models/schemas/transaction.schema');

class TransactionService {

  // ============================================
  // Transaction Operations
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
    const docs = transactions.map(txData => ({ ...txData, userId }));

    try {
      const result = await Transaction.insertMany(docs, { ordered: false });
      return {
        createdCount: result.length,
        errorCount: 0,
        errors: []
      };
    } catch (error) {
      // ordered:false continues past individual failures
      const insertedCount = error.insertedDocs?.length || 0;
      const errorDetails = (error.writeErrors || []).map(e => ({
        transaction: docs[e.index],
        error: e.errmsg || e.message
      }));

      return {
        createdCount: insertedCount,
        errorCount: errorDetails.length,
        errors: errorDetails
      };
    }
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
