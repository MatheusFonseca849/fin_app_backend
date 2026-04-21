const cron = require('node-cron');
const mongoose = require('mongoose');
const Transaction = require('../models/schemas/transaction.schema');
const User = require('../models/User.model');
const categoryService = require('./category.service');
const userService = require('./user.service');
const cacheService = require('./cache.service');
const { acquireLock } = require('../utils/lock.utils');
const { withTransaction } = require('../utils/withTransaction');

const MONTH_NAMES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

class CreditCardService {

  start() {
    // Run every day at 00:10 (after recurrence at 00:05)
    this.job = cron.schedule('10 0 * * *', async () => {
      console.log('💳 [CreditCard] Running daily closing-day check...');

      const release = await acquireLock('lock:creditcard:daily', 120);
      if (!release) {
        console.log('⏭️ [CreditCard] Skipped — another instance holds the lock');
        return;
      }

      try {
        await this.processAllClosings();
      } catch (error) {
        console.error('❌ [CreditCard] Processing error:', error.message);
      } finally {
        await release();
      }
    });

    console.log('🕐 [CreditCard] Scheduler started (runs daily at 00:10)');
  }

  stop() {
    if (this.job) {
      this.job.stop();
      console.log('🛑 [CreditCard] Scheduler stopped');
    }
  }

  /**
   * Find all users whose creditCardClosingDay matches today
   * and generate/update their Fatura transactions.
   */
  async processAllClosings() {
    const today = new Date();
    const currentDay = today.getDate();

    // Find users whose closing day is today
    const users = await User.find({
      'preferences.creditCardClosingDay': currentDay
    }).lean();

    if (users.length === 0) {
      console.log('✅ [CreditCard] No users with closing day today.');
      return 0;
    }

    let successCount = 0;

    for (const user of users) {
      try {
        await this.generateFatura(user._id.toString(), user.preferences);
        successCount++;
      } catch (error) {
        console.error(`❌ [CreditCard] Failed for user ${user._id}: ${error.message}`);
      }
    }

    console.log(`✅ [CreditCard] Done. Generated ${successCount} fatura(s) for ${users.length} user(s).`);
    return successCount;
  }

  /**
   * Generate Fatura transactions for a user.
   * Groups all uncompiled credit card expenses by source (bank) and creates
   * one "Fatura - {Month} {Year} - {Bank}" transaction per source.
   *
   * @param {string} userId
   * @param {Object} preferences - User preferences (creditCardClosingDay, creditCardDueDay)
   * @returns {Object[]|null} The created fatura transactions, or null if nothing to compile
   */
  async generateFatura(userId, preferences) {
    const objectId = mongoose.Types.ObjectId.createFromHexString(userId);
    const dueDay = preferences?.creditCardDueDay || 1;

    // Find all credit card expenses not yet compiled into a fatura
    const ccExpenses = await Transaction.find({
      userId: objectId,
      type: 'expense',
      paymentMode: 'credit',
      isRecurrent: false,
      isPaid: false
    }).lean();

    if (ccExpenses.length === 0) {
      return null;
    }

    // Group by source (bank)
    const groups = {};
    for (const tx of ccExpenses) {
      const key = tx.source || 'Cartão';
      if (!groups[key]) groups[key] = [];
      groups[key].push(tx);
    }

    // Determine fatura month label based on current date
    const now = new Date();
    const monthName = MONTH_NAMES_PT[now.getMonth()];
    const year = now.getFullYear();

    // Calculate vencimento date
    const vencimento = new Date(Date.UTC(now.getFullYear(), now.getMonth(), dueDay));
    const closingDay = preferences?.creditCardClosingDay || 1;
    if (dueDay <= closingDay) {
      vencimento.setUTCMonth(vencimento.getUTCMonth() + 1);
    }

    // Get "Sem Categoria" as fallback for the fatura
    const semCategoria = await categoryService.ensureSemCategoria(userId);

    const faturas = await withTransaction(async (session) => {
      const created = [];

      for (const [source, expenses] of Object.entries(groups)) {
        const totalCents = expenses.reduce((sum, tx) => sum + tx.value, 0);
        const faturaDescription = `Fatura - ${monthName} ${year} - ${source}`;

        // Mark compiled CC expenses as paid
        const expenseIds = expenses.map(tx => tx._id);
        await Transaction.updateMany(
          { _id: { $in: expenseIds } },
          { $set: { isPaid: true } },
          { session }
        );

        // Create the fatura transaction as a debit expense
        const [fatura] = await Transaction.create([{
          userId: objectId,
          description: faturaDescription,
          value: totalCents,
          type: 'expense',
          paymentMode: 'debit',
          category: semCategoria._id,
          isRecurrent: false,
          isPaid: false,
          timestamp: vencimento
        }], { session });

        created.push(fatura);
        console.log(`💳 [CreditCard] Generated fatura for user ${userId}: ${faturaDescription} = ${totalCents} cents`);
      }

      return created;
    });

    // Invalidate caches
    await cacheService.invalidateTransactions(userId);
    await cacheService.invalidateUser(userId);

    return faturas;
  }

  /**
   * Manually recompile a user's credit card faturas.
   * Deletes existing faturas for the current month (matching "Fatura - {Month} {Year}"),
   * then regenerates them grouped by bank source.
   *
   * @param {string} userId
   * @returns {Object} { faturas, deletedCount }
   */
  async recompileFatura(userId) {
    const objectId = mongoose.Types.ObjectId.createFromHexString(userId);
    const user = await userService.findById(userId);
    const preferences = user.preferences;

    const now = new Date();
    const monthName = MONTH_NAMES_PT[now.getMonth()];
    const year = now.getFullYear();
    const faturaPrefix = `Fatura - ${monthName} ${year}`;

    let deletedCount = 0;

    await withTransaction(async (session) => {
      // Find and delete all existing faturas for this month (any bank)
      const existingFaturas = await Transaction.find({
        userId: objectId,
        description: { $regex: `^${faturaPrefix}` },
        paymentMode: 'debit',
        isRecurrent: false
      }).session(session);

      for (const fatura of existingFaturas) {
        if (fatura.isPaid) {
          const delta = userService.getBalanceDelta(fatura.value, fatura.type);
          await userService.adjustBalance(userId, -delta, { session });
        }
        await Transaction.deleteOne({ _id: fatura._id }, { session });
        deletedCount++;
      }

      // Un-mark all CC expenses that were compiled
      await Transaction.updateMany(
        {
          userId: objectId,
          type: 'expense',
          paymentMode: 'credit',
          isRecurrent: false,
          isPaid: true
        },
        { $set: { isPaid: false } },
        { session }
      );
    });

    // Now regenerate the faturas (grouped by source)
    const faturas = await this.generateFatura(userId, preferences);

    return { faturas, deletedCount };
  }
}

module.exports = new CreditCardService();
