const cron = require('node-cron');
const mongoose = require('mongoose');
const Transaction = require('../models/schemas/transaction.schema');
const User = require('../models/User.model');
const categoryService = require('./category.service');
const userService = require('./user.service');
const cacheService = require('./cache.service');
const { acquireLock } = require('../utils/lock.utils');
const { withTransaction } = require('../utils/withTransaction');

/**
 * Escape special regex metacharacters in a string so it can be
 * safely interpolated into a RegExp / MongoDB $regex pattern.
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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

    // Cursor-based iteration — streams users one at a time instead of
    // loading all matching users into memory at once (SCALE-2).
    const cursor = User.find({
      'preferences.creditCardClosingDay': currentDay
    }).lean().cursor();

    let successCount = 0;
    let totalCount = 0;

    for await (const user of cursor) {
      totalCount++;
      try {
        await this.generateFatura(user._id.toString(), user.preferences);
        successCount++;
      } catch (error) {
        console.error(`❌ [CreditCard] Failed for user ${user._id}: ${error.message}`);
      }
    }

    if (totalCount === 0) {
      console.log('✅ [CreditCard] No users with closing day today.');
      return 0;
    }

    console.log(`✅ [CreditCard] Done. Generated ${successCount} fatura(s) for ${totalCount} user(s).`);
    return successCount;
  }

  /**
   * Determine which billing cycle an expense belongs to.
   * If the expense date is after the closing day, it rolls into the next month's cycle.
   * Returns a { month, year } object representing the fatura's label month.
   */
  _getCycleKey(timestamp, closingDay) {
    const d = new Date(timestamp);
    let month = d.getUTCMonth();
    let year = d.getUTCFullYear();
    if (d.getUTCDate() > closingDay) {
      month++;
      if (month > 11) { month = 0; year++; }
    }
    return `${year}-${month}`;
  }

  /**
   * Core fatura creation logic. Streams unpaid CC expenses, buckets them
   * by billing cycle + source, and creates one fatura per bucket.
   * Must be called within an existing MongoDB transaction.
   *
   * @param {string} userId
   * @param {Object} preferences
   * @param {import('mongoose').ClientSession} session
   * @returns {Object[]|null}
   */
  async _createFaturas(userId, preferences, session) {
    const objectId = mongoose.Types.ObjectId.createFromHexString(userId);
    const dueDay = preferences?.creditCardDueDay || 1;
    const closingDay = preferences?.creditCardClosingDay || 1;

    // Stream all unpaid CC expenses via cursor to avoid loading
    // months of backlog into memory at once (SCALE-5).
    const query = Transaction.find({
      userId: objectId,
      type: 'expense',
      paymentMode: 'credit',
      isRecurrent: false,
      isPaid: false
    }).lean();
    if (session) query.session(session);
    const cursor = query.cursor();

    // Bucket by cycle+source. Only IDs and values are kept — not full docs.
    // Key: "year-month|source"
    const buckets = {};
    let totalCount = 0;

    for await (const tx of cursor) {
      totalCount++;
      const cycleKey = this._getCycleKey(tx.timestamp, closingDay);
      const source = tx.source || 'Cartão';
      const key = `${cycleKey}|${source}`;

      if (!buckets[key]) {
        buckets[key] = { cycleKey, source, ids: [], totalCents: 0 };
      }
      buckets[key].ids.push(tx._id);
      buckets[key].totalCents += tx.value;
    }

    if (totalCount === 0) {
      return null;
    }

    // Get "Sem Categoria" as fallback for the fatura
    const semCategoria = await categoryService.ensureSemCategoria(userId, { session });
    const created = [];

    for (const bucket of Object.values(buckets)) {
      const [yearStr, monthStr] = bucket.cycleKey.split('-');
      const cycleMonth = parseInt(monthStr, 10);
      const cycleYear = parseInt(yearStr, 10);

      const monthName = MONTH_NAMES_PT[cycleMonth];
      const faturaDescription = `Fatura - ${monthName} ${cycleYear} - ${bucket.source}`;

      // Calculate vencimento for this specific cycle
      const vencimento = new Date(Date.UTC(cycleYear, cycleMonth, dueDay));
      if (dueDay <= closingDay) {
        vencimento.setUTCMonth(vencimento.getUTCMonth() + 1);
      }

      // Mark compiled CC expenses as paid
      await Transaction.updateMany(
        { _id: { $in: bucket.ids } },
        { $set: { isPaid: true } },
        { session }
      );

      // Create the fatura transaction as a debit expense
      const [fatura] = await Transaction.create([{
        userId: objectId,
        description: faturaDescription,
        value: bucket.totalCents,
        type: 'expense',
        paymentMode: 'debit',
        category: semCategoria._id,
        isRecurrent: false,
        isPaid: false,
        timestamp: vencimento
      }], { session });

      created.push(fatura);
      console.log(`💳 [CreditCard] Generated fatura for user ${userId}: ${faturaDescription} = ${bucket.totalCents} cents`);
    }

    return created;
  }

  /**
   * Generate Fatura transactions for a user.
   * Wraps _createFaturas in a transaction and invalidates caches.
   *
   * @param {string} userId
   * @param {Object} preferences - User preferences (creditCardClosingDay, creditCardDueDay)
   * @returns {Object[]|null} The created fatura transactions, or null if nothing to compile
   */
  async generateFatura(userId, preferences) {
    const faturas = await withTransaction(async (session) => {
      return await this._createFaturas(userId, preferences, session);
    });

    if (faturas) {
      await cacheService.invalidateTransactions(userId);
      await cacheService.invalidateUser(userId);
    }

    return faturas;
  }

  /**
   * Manually recompile a user's credit card faturas.
   * Atomically deletes ALL existing faturas, un-marks their source CC
   * expenses, and regenerates faturas grouped by billing cycle + bank source.
   *
   * @param {string} userId
   * @returns {Object} { faturas, deletedCount }
   */
  async recompileFatura(userId) {
    const objectId = mongoose.Types.ObjectId.createFromHexString(userId);
    const user = await userService.findById(userId);
    const preferences = user.preferences;

    let deletedCount = 0;

    const faturas = await withTransaction(async (session) => {
      // 1. Delete ALL existing faturas (any month), reversing balance effects
      const existingFaturas = await Transaction.find({
        userId: objectId,
        description: { $regex: `^${escapeRegex('Fatura - ')}` },
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

      // 2. Un-mark ALL CC expenses as unpaid
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

      // 3. Re-create all faturas from scratch (within same transaction)
      return await this._createFaturas(userId, preferences, session);
    });

    // Invalidate caches
    await cacheService.invalidateTransactions(userId);
    await cacheService.invalidateUser(userId);

    return { faturas, deletedCount };
  }
}

module.exports = new CreditCardService();
