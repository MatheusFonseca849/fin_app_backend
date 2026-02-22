const cron = require('node-cron');
const Transaction = require('../models/schemas/transaction.schema');

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
      timestamp: now
    }));

    let insertedCount = 0;
    try {
      const result = await Transaction.insertMany(newTransactions, { ordered: false });
      insertedCount = result.length;
    } catch (error) {
      // ordered:false means it continues past individual failures
      insertedCount = error.insertedDocs?.length || 0;
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

    console.log(`✅ [Recurrence] Done. Applied ${insertedCount} transaction(s) from ${recurrents.length} recurrence(s).`);
    return insertedCount;
  }
}

module.exports = new RecurrenceService();
