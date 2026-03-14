const cron = require('node-cron');
const Transaction = require('../models/schemas/transaction.schema');
const userService = require('./user.service');

class RecurrenceService {

  start() {
    // Run every day at 00:05 (5 minutes past midnight)
    this.job = cron.schedule('5 0 * * *', async () => {
      console.log('🔄 [Recurrence] Running daily check...');
      try {
        await this.processAllRecurrences();
      } catch (error) {
        console.error('❌ [Recurrence] Processing error:', error.message);
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

    // 1. Batch insert all new transaction entries at once
    const newTransactions = recurrents.map(r => ({
      userId: r.userId,
      description: r.description,
      value: r.value,
      type: r.type,
      category: r.category,
      isRecurrent: false,
      isPaid: r.type === 'credito', // Income is always paid; expenses need manual confirmation
      timestamp: now
    }));

    let insertedDocs = [];
    try {
      const result = await Transaction.insertMany(newTransactions, { ordered: false });
      insertedDocs = result;
    } catch (error) {
      // ordered:false means it continues past individual failures
      insertedDocs = error.insertedDocs || [];
      console.error(`❌ [Recurrence] insertMany partial failure: ${error.message}`);
    }

    // 2. Batch update all recurrent lastApplied timestamps via bulkWrite
    const bulkOps = recurrents.map(r => ({
      updateOne: {
        filter: { _id: r._id },
        update: { $set: { lastApplied: now } }
      }
    }));

    try {
      await Transaction.bulkWrite(bulkOps, { ordered: false });
    } catch (error) {
      console.error(`❌ [Recurrence] bulkWrite error: ${error.message}`);
    }

    // 3. Adjust balances only for paid transactions (income is auto-paid).
    //    Expense transactions remain unpaid until the user marks them.
    const balanceDeltas = {};
    for (const doc of insertedDocs) {
      if (!doc.isPaid) continue;
      const uid = doc.userId.toString();
      const delta = userService.getBalanceDelta(doc.value, doc.type);
      balanceDeltas[uid] = (balanceDeltas[uid] || 0) + delta;
    }

    for (const [uid, delta] of Object.entries(balanceDeltas)) {
      try {
        await userService.adjustBalance(uid, delta);
      } catch (error) {
        console.error(`❌ [Recurrence] Failed to adjust balance for user ${uid}:`, error.message);
      }
    }

    console.log(`✅ [Recurrence] Done. Created ${insertedDocs.length} transaction(s) from ${recurrents.length} recurrence(s).`);
    return insertedDocs.length;
  }
}

module.exports = new RecurrenceService();
