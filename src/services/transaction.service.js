const Transaction = require('../models/schemas/transaction.schema');

class TransactionService {

  // ============================================
  // Transaction Operations
  // ============================================

  async getTransactions(userId, { page = 1, limit = 50, type, category, isRecurrent, isPaid, startDate, endDate } = {}) {
    const MAX_LIMIT = 200;
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), MAX_LIMIT);

    const filter = { userId };
    if (type) filter.type = type;
    if (category) filter.category = category;
    if (isRecurrent !== undefined) filter.isRecurrent = isRecurrent;
    if (isPaid !== undefined) filter.isPaid = isPaid;
    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) filter.timestamp.$gte = new Date(startDate);
      if (endDate) filter.timestamp.$lte = new Date(endDate);
    }

    const [data, total] = await Promise.all([
      Transaction.find(filter)
        .populate('category')
        .sort({ timestamp: -1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .lean(),
      Transaction.countDocuments(filter)
    ]);

    return { data, total, page: safePage, limit: safeLimit };
  }

  async getTransactionCount(userId) {
    return await Transaction.countDocuments({ userId });
  }

  async getTransactionById(userId, transactionId) {
    return await Transaction.findOne({ _id: transactionId, userId }).populate('category').lean();
  }

  async addTransaction(userId, transactionData) {
    const transaction = new Transaction({
      ...transactionData,
      userId
    });
    const saved = await transaction.save();
    return await saved.populate('category');
  }

  async updateTransaction(userId, transactionId, updates) {
    const oldTransaction = await Transaction.findOne({ _id: transactionId, userId });
    if (!oldTransaction) throw new Error('Transação não encontrada');

    const newTransaction = await Transaction.findOneAndUpdate(
      { _id: transactionId, userId },
      updates,
      { new: true, runValidators: true }
    ).populate('category');
    return { oldTransaction, newTransaction };
  }

  async deleteTransaction(userId, transactionId) {
    const transaction = await Transaction.findOneAndDelete({ _id: transactionId, userId }).populate('category');
    if (!transaction) throw new Error('Transação não encontrada');
    return transaction;
  }

  async bulkAddTransactions(userId, transactions) {
    // Build date range from incoming transactions for scoped query
    const timestamps = transactions.map(tx => tx.timestamp);
    const minDate = new Date(Math.min(...timestamps.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...timestamps.map(d => d.getTime())));
    minDate.setHours(0, 0, 0, 0);
    maxDate.setHours(23, 59, 59, 999);

    // Fetch existing transactions within the date range
    const existing = await Transaction.find({
      userId,
      timestamp: { $gte: minDate, $lte: maxDate }
    }).lean();

    // Build a Set of fingerprints for fast lookup
    const fingerprint = (tx) => {
      const d = new Date(tx.timestamp);
      const catId = tx.category?._id?.toString?.() || tx.category?.toString?.() || '';
      return `${tx.description}|${tx.value}|${tx.type}|${catId}|${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    };

    const existingSet = new Set(existing.map(fingerprint));

    // Partition into new vs duplicate
    const newTransactions = [];
    let skippedCount = 0;
    for (const tx of transactions) {
      if (existingSet.has(fingerprint(tx))) {
        skippedCount++;
      } else {
        newTransactions.push(tx);
      }
    }

    if (newTransactions.length === 0) {
      return {
        createdCount: 0,
        skippedCount,
        errorCount: 0,
        errors: []
      };
    }

    const docs = newTransactions.map(txData => ({ ...txData, userId }));

    try {
      const result = await Transaction.insertMany(docs, { ordered: false });
      return {
        createdCount: result.length,
        insertedDocs: result,
        skippedCount,
        errorCount: 0,
        errors: []
      };
    } catch (error) {
      const insertedDocs = error.insertedDocs || [];
      const errorDetails = (error.writeErrors || []).map(e => ({
        transaction: docs[e.index],
        error: e.errmsg || e.message
      }));

      return {
        createdCount: insertedDocs.length,
        insertedDocs,
        skippedCount,
        errorCount: errorDetails.length,
        errors: errorDetails
      };
    }
  }

  // ============================================
  // Aggregation / Stats
  // ============================================

  async getMonthlyAggregation(userId, { months } = {}) {
    const mongoose = require('mongoose');
    const match = {
      userId: mongoose.Types.ObjectId.createFromHexString(userId),
      isRecurrent: false,
      isPaid: true
    };

    if (months) {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - months);
      cutoff.setDate(1);
      cutoff.setHours(0, 0, 0, 0);
      match.timestamp = { $gte: cutoff };
    }

    return await Transaction.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            year: { $year: '$timestamp' },
            month: { $month: '$timestamp' }
          },
          despesas: {
            $sum: { $cond: [{ $eq: ['$type', 'debito'] }, '$value', 0] }
          },
          receitas: {
            $sum: { $cond: [{ $eq: ['$type', 'credito'] }, '$value', 0] }
          }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);
  }

  /**
   * Returns current-month summary (expenses by category, totals) and upcoming unpaid expenses.
   * Single aggregation + one query — replaces the need for the frontend to fetch ALL transactions.
   */
  async getDashboardData(userId) {
    const mongoose = require('mongoose');
    const objectId = mongoose.Types.ObjectId.createFromHexString(userId);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [categoryBreakdown, upcomingExpenses] = await Promise.all([
      // Current month paid transactions grouped by category
      Transaction.aggregate([
        {
          $match: {
            userId: objectId,
            isPaid: true,
            timestamp: { $gte: monthStart, $lte: monthEnd }
          }
        },
        {
          $lookup: {
            from: 'categories',
            localField: 'category',
            foreignField: '_id',
            as: 'cat'
          }
        },
        { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: {
              type: '$type',
              categoryId: '$cat._id',
              categoryName: { $ifNull: ['$cat.name', 'Sem Categoria'] },
              categoryColor: { $ifNull: ['$cat.color', '#757575'] }
            },
            total: { $sum: '$value' }
          }
        }
      ]),

      // Upcoming unpaid expenses (next 4, from today onwards)
      Transaction.find({
        userId: objectId,
        type: 'debito',
        isPaid: false,
        timestamp: { $gte: today }
      })
        .populate('category')
        .sort({ timestamp: 1 })
        .limit(4)
        .lean()
    ]);

    // Process aggregation into structured response
    let monthlyExpenses = 0;
    let monthlyIncome = 0;
    const expensesByCategory = [];

    for (const item of categoryBreakdown) {
      if (item._id.type === 'debito') {
        monthlyExpenses += item.total;
        expensesByCategory.push({
          name: item._id.categoryName,
          color: item._id.categoryColor,
          value: item.total
        });
      } else {
        monthlyIncome += item.total;
      }
    }

    return {
      monthlyExpenses,
      monthlyIncome,
      monthlyBalance: monthlyIncome - monthlyExpenses,
      expensesByCategory,
      upcomingExpenses
    };
  }

  async getUserBalance(userId) {
    const result = await Transaction.aggregate([
      { $match: { userId: require('mongoose').Types.ObjectId.createFromHexString(userId), isRecurrent: false, isPaid: true } },
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

  async reassignCategory(userId, oldCategoryId, newCategoryId) {
    return await Transaction.updateMany(
      { userId, category: oldCategoryId },
      { $set: { category: newCategoryId } }
    );
  }

  async bulkDeleteTransactions(userId, ids) {
    const toDelete = await Transaction.find({ _id: { $in: ids }, userId });
    if (toDelete.length === 0) return { deletedCount: 0, deletedTransactions: [] };

    const deleteIds = toDelete.map(tx => tx._id);
    await Transaction.deleteMany({ _id: { $in: deleteIds } });

    return { deletedCount: toDelete.length, deletedTransactions: toDelete };
  }

  async bulkUpdateTransactions(userId, ids, updates) {
    const toUpdate = await Transaction.find({ _id: { $in: ids }, userId });
    if (toUpdate.length === 0) return { updatedCount: 0, oldTransactions: [], newTransactions: [] };

    const updateIds = toUpdate.map(tx => tx._id);
    await Transaction.updateMany(
      { _id: { $in: updateIds } },
      { $set: updates },
      { runValidators: true }
    );

    const newTransactions = await Transaction.find({ _id: { $in: updateIds } }).populate('category');
    return { updatedCount: newTransactions.length, oldTransactions: toUpdate, newTransactions };
  }
}

module.exports = new TransactionService();
