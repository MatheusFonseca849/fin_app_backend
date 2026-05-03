/**
 * Migration: Add paymentMode field to existing transactions.
 * - income transactions → paymentMode = null
 * - expense transactions → paymentMode = 'debit'
 *
 * Run: node src/scripts/migratePaymentMode.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;

async function migrate() {
  console.log('🔄 Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected.');

  const db = mongoose.connection.db;
  const collection = db.collection('transactions');

  // Set paymentMode = null for income transactions
  const incomeResult = await collection.updateMany(
    { type: 'income', paymentMode: { $exists: false } },
    { $set: { paymentMode: null } }
  );
  console.log(`✅ Income transactions updated: ${incomeResult.modifiedCount}`);

  // Set paymentMode = 'debit' for expense transactions
  const expenseResult = await collection.updateMany(
    { type: 'expense', paymentMode: { $exists: false } },
    { $set: { paymentMode: 'debit' } }
  );
  console.log(`✅ Expense transactions updated: ${expenseResult.modifiedCount}`);

  // Also handle any transactions that have paymentMode: undefined (edge case)
  const nullResult = await collection.updateMany(
    { paymentMode: { $exists: true, $type: 'undefined' } },
    { $set: { paymentMode: null } }
  );
  console.log(`✅ Undefined paymentMode fixed: ${nullResult.modifiedCount}`);

  console.log('🎉 Migration complete.');
  await mongoose.disconnect();
  process.exit(0);
}

migrate().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
