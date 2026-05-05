const Transaction = require('../models/schemas/transaction.schema');
const mongoose = require('mongoose');
const AppError = require('../utils/AppError');

class TransactionService {

  // ============================================
  // Transaction Operations
  // ============================================

  async getTransactions(userId, { page = 1, limit = 50, type, category, isRecurrent, isPaid, paymentMode, startDate, endDate } = {}) {
    const MAX_LIMIT = 200;
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), MAX_LIMIT);

    const filter = { userId };
    if (type) filter.type = type;
    if (category) filter.category = category;
    if (isRecurrent !== undefined) filter.isRecurrent = isRecurrent;
    if (isPaid !== undefined) filter.isPaid = isPaid;
    if (paymentMode === 'debit') {
      // "debit" includes both explicit 'debit' and null (legacy/income-adjacent expenses)
      filter.paymentMode = { $in: ['debit', null] };
    } else if (paymentMode) {
      filter.paymentMode = paymentMode;
    }
    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) filter.timestamp.$gte = startDate;
      if (endDate) {
        const endOfDay = new Date(endDate);
        endOfDay.setUTCHours(23, 59, 59, 999);
        filter.timestamp.$lte = endOfDay;
      }
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

  async getCalendarTransactions(userId, startDate, endDate) {
    const filter = { userId };
    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) filter.timestamp.$gte = startDate;
      if (endDate) {
        const endOfDay = new Date(endDate);
        endOfDay.setUTCHours(23, 59, 59, 999);
        filter.timestamp.$lte = endOfDay;
      }
    }

    return await Transaction.find(filter)
      .populate('category')
      .sort({ timestamp: -1 })
      .limit(5000)
      .lean();
  }

  async getTransactionCount(userId) {
    return await Transaction.countDocuments({ userId });
  }

  async getTransactionById(userId, transactionId) {
    return await Transaction.findOne({ _id: transactionId, userId }).populate('category').lean();
  }

  async addTransaction(userId, transactionData, { session } = {}) {
    const transaction = new Transaction({
      ...transactionData,
      userId
    });
    const saved = await transaction.save({ session });
    return await saved.populate('category');
  }

  async updateTransaction(userId, transactionId, updates, { session } = {}) {
    const oldTransaction = await Transaction.findOne({ _id: transactionId, userId }).session(session);
    if (!oldTransaction) throw new AppError(404, 'Transação não encontrada');

    const newTransaction = await Transaction.findOneAndUpdate(
      { _id: transactionId, userId },
      updates,
      { new: true, runValidators: true, session }
    ).populate('category');
    return { oldTransaction, newTransaction };
  }

  async deleteTransaction(userId, transactionId, { session } = {}) {
    const transaction = await Transaction.findOneAndDelete({ _id: transactionId, userId }, { session }).populate('category');
    if (!transaction) throw new AppError(404, 'Transação não encontrada');
    return transaction;
  }

  async bulkAddTransactions(userId, transactions, { session } = {}) {
    // Single-pass date range — avoids spreading into Math.min/max which
    // overflows the call stack on large arrays (SCALE-3).
    let minTs = Infinity;
    let maxTs = -Infinity;
    for (const tx of transactions) {
      const t = tx.timestamp.getTime();
      if (t < minTs) minTs = t;
      if (t > maxTs) maxTs = t;
    }
    const minDate = new Date(minTs);
    const maxDate = new Date(maxTs);
    minDate.setHours(0, 0, 0, 0);
    maxDate.setHours(23, 59, 59, 999);

    // Build fingerprint Set incrementally via cursor to avoid
    // materialising all existing transactions in memory at once.
    const fingerprint = (tx) => {
      const d = new Date(tx.timestamp);
      const catId = tx.category?._id?.toString?.() || tx.category?.toString?.() || '';
      return `${tx.description}|${tx.value}|${tx.type}|${catId}|${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    };

    const existingQuery = Transaction.find({
      userId,
      timestamp: { $gte: minDate, $lte: maxDate }
    }).lean();
    if (session) existingQuery.session(session);

    const existingSet = new Set();
    const cursor = existingQuery.cursor();
    for await (const doc of cursor) {
      existingSet.add(fingerprint(doc));
    }

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

    // Chunk inserts into batches to bound peak memory and stay
    // under MongoDB's 16 MB BSON document-size limit per operation.
    const BATCH_SIZE = 500;
    const allInserted = [];
    const allErrors = [];

    for (let i = 0; i < newTransactions.length; i += BATCH_SIZE) {
      const batch = newTransactions.slice(i, i + BATCH_SIZE).map(txData => ({ ...txData, userId }));

      if (session) {
        const result = await Transaction.insertMany(batch, { session });
        allInserted.push(...result);
      } else {
        try {
          const result = await Transaction.insertMany(batch, { ordered: false });
          allInserted.push(...result);
        } catch (error) {
          if (error.insertedDocs) allInserted.push(...error.insertedDocs);
          if (error.writeErrors) {
            for (const e of error.writeErrors) {
              allErrors.push({
                transaction: batch[e.index],
                error: e.errmsg || e.message
              });
            }
          }
        }
      }
    }

    return {
      createdCount: allInserted.length,
      insertedDocs: allInserted,
      skippedCount,
      errorCount: allErrors.length,
      errors: allErrors
    };
  }

  // ============================================
  // Aggregation / Stats
  // ============================================

  async getMonthlyAggregation(userId, { months } = {}) {
    
    const match = {
      userId: mongoose.Types.ObjectId.createFromHexString(userId),
      isRecurrent: false,
      isPaid: true
    };

    if (months) {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - (months - 1));
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
          expenses: {
            $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$value', 0] }
          },
          creditCardTotal: {
            $sum: { $cond: [{ $and: [{ $eq: ['$type', 'expense'] }, { $eq: ['$paymentMode', 'credit'] }] }, '$value', 0] }
          },
          income: {
            $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$value', 0] }
          }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);
  }

  /**
   * Returns current-month summary (expenses by category, totals) and upcoming unpaid expenses.
   * Single $facet aggregation — one index scan feeds three sub-pipelines.
   */
  async getDashboardData(userId) {
    const objectId = mongoose.Types.ObjectId.createFromHexString(userId);

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    // Two parallel queries:
    // 1. $facet aggregation for current-month data (one index scan feeds four sub-pipelines)
    // 2. Separate query for recurring expense templates (timestamps fall outside the month window)
    const [facetResults, recurringResults] = await Promise.all([
      Transaction.aggregate([
      {
        $match: {
          userId: objectId,
          timestamp: { $gte: monthStart }
        }
      },
      {
        $facet: {
          // Current month paid debit/income transactions grouped by category
          categoryBreakdown: [
            {
              $match: {
                isPaid: true,
                paymentMode: { $ne: 'credit' },
                timestamp: { $lte: monthEnd }
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
          ],

          // Current month credit card expenses grouped by category
          creditCardBreakdown: [
            {
              $match: {
                type: 'expense',
                paymentMode: 'credit',
                timestamp: { $lte: monthEnd }
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
                  categoryId: '$cat._id',
                  categoryName: { $ifNull: ['$cat.name', 'Sem Categoria'] },
                  categoryColor: { $ifNull: ['$cat.color', '#757575'] }
                },
                total: { $sum: '$value' }
              }
            }
          ],

          // Upcoming unpaid expenses (next 4, from today onwards)
          upcomingExpenses: [
            {
              $match: {
                type: 'expense',
                isPaid: false,
                paymentMode: { $ne: 'credit' },
                timestamp: { $gte: today }
              }
            },
            { $sort: { timestamp: 1 } },
            { $limit: 4 },
            {
              $lookup: {
                from: 'categories',
                localField: 'category',
                foreignField: '_id',
                as: 'categoryDoc'
              }
            },
            {
              $addFields: {
                category: { $arrayElemAt: ['$categoryDoc', 0] }
              }
            },
            { $project: { categoryDoc: 0 } }
          ],

          // All unpaid debit expenses this month (count + total, no limit)
          pendingExpensesSummary: [
            {
              $match: {
                type: 'expense',
                isPaid: false,
                paymentMode: { $ne: 'credit' },
                timestamp: { $lte: monthEnd }
              }
            },
            {
              $group: {
                _id: null,
                total: { $sum: '$value' },
                count: { $sum: 1 }
              }
            }
          ]
        }
      }
    ]),

      // Active recurring expense templates (timestamps outside the month window)
      Transaction.aggregate([
        {
          $match: {
            userId: objectId,
            isRecurrent: true,
            isActive: true,
            type: 'expense'
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$value' }
          }
        }
      ])
    ]);

    const result = facetResults[0];
    const { categoryBreakdown, creditCardBreakdown, upcomingExpenses, pendingExpensesSummary } = result;

    // Pending expenses summary
    const pendingSummary = pendingExpensesSummary[0] || { total: 0, count: 0 };

    // Recurring expenses total
    const monthlyRecurringExpenses = recurringResults[0]?.total ?? 0;

    // Process debit/income aggregation
    let monthlyDebitExpenses = 0;
    let monthlyIncome = 0;
    const expensesByCategory = [];

    for (const item of categoryBreakdown) {
      if (item._id.type === 'expense') {
        monthlyDebitExpenses += item.total;
        expensesByCategory.push({
          name: item._id.categoryName,
          color: item._id.categoryColor,
          value: item.total
        });
      } else {
        monthlyIncome += item.total;
      }
    }

    // Process credit card aggregation
    let monthlyCreditCardTotal = 0;
    const creditCardByCategory = [];

    for (const item of creditCardBreakdown) {
      monthlyCreditCardTotal += item.total;
      creditCardByCategory.push({
        name: item._id.categoryName,
        color: item._id.categoryColor,
        value: item.total
      });
    }

    const monthlyExpensesTotal = monthlyDebitExpenses + monthlyCreditCardTotal;

    return {
      monthlyDebitExpenses,
      monthlyCreditCardTotal,
      monthlyExpensesTotal,
      monthlyIncome,
      monthlyBalance: monthlyIncome - monthlyExpensesTotal,
      expensesByCategory,
      creditCardByCategory,
      upcomingExpenses,
      pendingExpensesTotal: pendingSummary.total,
      pendingExpensesCount: pendingSummary.count,
      monthlyRecurringExpenses
    };
  }

  async getSystemTransactionCount() {
    return await Transaction.countDocuments({ isRecurrent: false });
  }

  async deleteAllUserTransactions(userId, { session } = {}) {
    return await Transaction.deleteMany({ userId }, { session });
  }

  async reassignCategory(userId, oldCategoryId, newCategoryId, { session } = {}) {
    return await Transaction.updateMany(
      { userId, category: oldCategoryId },
      { $set: { category: newCategoryId } },
      { session }
    );
  }

  async bulkDeleteTransactions(userId, ids, { session } = {}) {
    const toDelete = await Transaction.find({ _id: { $in: ids }, userId }).session(session);
    if (toDelete.length === 0) return { deletedCount: 0, deletedTransactions: [] };

    const deleteIds = toDelete.map(tx => tx._id);
    await Transaction.deleteMany({ _id: { $in: deleteIds }, userId }, { session });

    return { deletedCount: toDelete.length, deletedTransactions: toDelete };
  }

  async bulkUpdateTransactions(userId, ids, updates, { session } = {}) {
    const toUpdate = await Transaction.find({ _id: { $in: ids }, userId }).session(session);
    if (toUpdate.length === 0) return { updatedCount: 0, oldTransactions: [], newTransactions: [] };

    const updateIds = toUpdate.map(tx => tx._id);
    await Transaction.updateMany(
      { _id: { $in: updateIds }, userId },
      { $set: updates },
      { runValidators: true, session }
    );

    // Compute new state in memory instead of a third DB round-trip.
    // Only primitive fields (isPaid, paymentMode, value, type) are needed
    // by the caller for balance delta calculation.
    const newTransactions = toUpdate.map(tx => {
      const obj = tx.toObject();
      return { ...obj, ...updates };
    });

    return { updatedCount: toUpdate.length, oldTransactions: toUpdate, newTransactions };
  }
}

module.exports = new TransactionService();
