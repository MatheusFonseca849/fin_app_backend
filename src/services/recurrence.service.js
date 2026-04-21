const cron = require('node-cron');
const Transaction = require('../models/schemas/transaction.schema');
const userService = require('./user.service');
const cacheService = require('./cache.service');
const { acquireLock } = require('../utils/lock.utils');
const { withTransaction } = require('../utils/withTransaction');

class RecurrenceService {

  start() {
    // Run every day at 00:05 (5 minutes past midnight)
    this.job = cron.schedule('5 0 * * *', async () => {
      console.log('🔄 [Recurrence] Running daily check...');

      // Distributed lock: only one instance processes recurrences
      const release = await acquireLock('lock:recurrence:daily', 120); // 2 min TTL
      if (!release) {
        console.log('⏭️ [Recurrence] Skipped — another instance holds the lock');
        return;
      }

      try {
        await this.processAllRecurrences();
      } catch (error) {
        console.error('❌ [Recurrence] Processing error:', error.message);
      } finally {
        await release();
      }
    });

    console.log('🕐 [Recurrence] Scheduler started (runs daily at 00:05)');
  }

  stop() {
    if (this.job) {
      this.job.stop();
      console.log('🛑 [Recurrence] Scheduler stopped');
    }
  }

  /**
   * Process a single recurrent transaction atomically:
   * insert the new entry, stamp lastApplied, and adjust balance
   * all within one MongoDB transaction.
   */
  async processSingleRecurrence(recurrent, now) {
    return withTransaction(async (session) => {
      const isPaid = recurrent.type === 'income';
      // Propagate paymentMode from the recurrent template
      const paymentMode = recurrent.type === 'income' ? null : (recurrent.paymentMode || 'debit');

      // 1. Insert the new transaction entry
      const [created] = await Transaction.create([{
        userId: recurrent.userId,
        description: recurrent.description,
        value: recurrent.value,
        type: recurrent.type,
        paymentMode,
        category: recurrent.category,
        isRecurrent: false,
        isPaid: paymentMode === 'credit' ? false : isPaid,
        timestamp: now
      }], { session });

      // 2. Stamp lastApplied on the recurrent template
      await Transaction.updateOne(
        { _id: recurrent._id },
        { $set: { lastApplied: now } },
        { session }
      );

      // 3. Adjust balance for auto-paid transactions (income only; credit card never)
      if (isPaid && paymentMode !== 'credit') {
        const delta = userService.getBalanceDelta(created.value, created.type);
        await userService.adjustBalance(recurrent.userId.toString(), delta, { session });
      }

      return created;
    });
  }

  async processAllRecurrences() {
    const today = new Date();
    const currentDay = today.getDate();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const periodStart = new Date(currentYear, currentMonth, 1);
    const now = new Date();

    // Find all active recurrent transactions matching today's billingDay
    const recurrents = await Transaction.find({
      isRecurrent: true,
      isActive: true,
      billingDay: currentDay,
      $or: [
        { lastApplied: null },
        { lastApplied: { $lt: periodStart } }
      ]
    });

    if (recurrents.length === 0) {
      console.log('✅ [Recurrence] No recurrences to apply today.');
      return 0;
    }

    // Process each recurrent atomically — failures are isolated per recurrence
    let successCount = 0;
    const affectedUserIds = new Set();

    for (const recurrent of recurrents) {
      try {
        await this.processSingleRecurrence(recurrent, now);
        successCount++;
        affectedUserIds.add(recurrent.userId.toString());
      } catch (error) {
        // Transaction rolled back — this recurrent keeps its old lastApplied,
        // so it will be retried on the next run. No duplicate, no data loss.
        console.error(`❌ [Recurrence] Failed for recurrence ${recurrent._id}: ${error.message}`);
      }
    }

    // Invalidate caches for all affected users
    for (const uid of affectedUserIds) {
      try {
        await cacheService.invalidateTransactions(uid);
        await cacheService.invalidateUser(uid);
      } catch (error) {
        console.error(`❌ [Recurrence] Failed to invalidate cache for user ${uid}:`, error.message);
      }
    }

    console.log(`✅ [Recurrence] Done. Created ${successCount} transaction(s) from ${recurrents.length} recurrence(s).`);
    return successCount;
  }
}

module.exports = new RecurrenceService();
