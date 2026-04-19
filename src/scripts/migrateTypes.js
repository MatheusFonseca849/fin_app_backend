/**
 * Migration script: Rename transaction types from credito/debito to income/expense.
 *
 * Updates both the `transactions` and `categories` collections.
 * Safe to run multiple times (idempotent) — only matches old values.
 *
 * Usage:
 *   node src/scripts/migrateTypes.js
 */
require('dotenv').config();
const database = require('../config/database');
const Transaction = require('../models/schemas/transaction.schema');
const Category = require('../models/schemas/category.schema');

async function migrate() {
  try {
    await database.connect();
    console.log('🔄 Starting type migration: credito→income, debito→expense\n');

    // --- Transactions ---
    const txCreditResult = await Transaction.updateMany(
      { type: 'credito' },
      { $set: { type: 'income' } }
    );
    console.log(`  transactions: credito→income  : ${txCreditResult.modifiedCount} updated`);

    const txDebitResult = await Transaction.updateMany(
      { type: 'debito' },
      { $set: { type: 'expense' } }
    );
    console.log(`  transactions: debito→expense   : ${txDebitResult.modifiedCount} updated`);

    // --- Categories ---
    const catCreditResult = await Category.updateMany(
      { type: 'credito' },
      { $set: { type: 'income' } }
    );
    console.log(`  categories:   credito→income  : ${catCreditResult.modifiedCount} updated`);

    const catDebitResult = await Category.updateMany(
      { type: 'debito' },
      { $set: { type: 'expense' } }
    );
    console.log(`  categories:   debito→expense   : ${catDebitResult.modifiedCount} updated`);

    const totalModified = txCreditResult.modifiedCount + txDebitResult.modifiedCount
      + catCreditResult.modifiedCount + catDebitResult.modifiedCount;

    console.log(`\n✅ Migration complete. ${totalModified} documents updated.`);

    await database.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration error:', error);
    await database.disconnect();
    process.exit(1);
  }
}

migrate();