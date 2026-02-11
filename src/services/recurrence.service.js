const cron = require('node-cron');
const User = require('../models/User.model');
const { TRANSACTION_TYPES } = require('../constants/transactionTypes');

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

    // Find users who have active recurrent transactions matching today's day
    const users = await User.find({
      $or: [
        { 'recurrentCredits': { $elemMatch: { dayOfMonth: currentDay, isActive: true } } },
        { 'recurrentDebits': { $elemMatch: { dayOfMonth: currentDay, isActive: true } } }
      ]
    });

    let totalApplied = 0;

    for (const user of users) {
      try {
        const applied = await this._processUserRecurrences(user, currentDay, currentMonth, currentYear);
        totalApplied += applied;
      } catch (error) {
        console.error(`❌ [Recurrence] Error for user ${user._id}:`, error.message);
      }
    }

    console.log(`✅ [Recurrence] Done. Applied ${totalApplied} transaction(s) for ${users.length} user(s).`);
    return totalApplied;
  }

  async _processUserRecurrences(user, currentDay, currentMonth, currentYear) {
    let applied = 0;
    const periodStart = new Date(currentYear, currentMonth, 1);

    // Process recurrent credits
    for (const recurrent of user.recurrentCredits) {
      if (!recurrent.isActive || recurrent.dayOfMonth !== currentDay) continue;
      if (recurrent.lastApplied && recurrent.lastApplied >= periodStart) continue;

      user.transactions.push({
        description: recurrent.description,
        value: recurrent.value,
        type: TRANSACTION_TYPES.CREDIT,
        category: recurrent.category,
        timestamp: new Date()
      });

      recurrent.lastApplied = new Date();
      applied++;
    }

    // Process recurrent debits
    for (const recurrent of user.recurrentDebits) {
      if (!recurrent.isActive || recurrent.dayOfMonth !== currentDay) continue;
      if (recurrent.lastApplied && recurrent.lastApplied >= periodStart) continue;

      user.transactions.push({
        description: recurrent.description,
        value: recurrent.value,
        type: TRANSACTION_TYPES.DEBIT,
        category: recurrent.category,
        timestamp: new Date()
      });

      recurrent.lastApplied = new Date();
      applied++;
    }

    if (applied > 0) {
      await user.save();
      console.log(`  📌 User ${user.email}: ${applied} recurrence(s) applied`);
    }

    return applied;
  }
}

module.exports = new RecurrenceService();
