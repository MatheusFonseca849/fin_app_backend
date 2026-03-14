/**
 * Migration Script: Convert transaction.category from string (name)
 * to ObjectId reference pointing to the categories collection.
 *
 * Prerequisites:
 *   - Categories must already exist in the standalone 'categories' collection
 *     (run migrateCategories.js first if needed)
 *
 * Usage:
 *   node src/scripts/migrateCategoryRefs.js
 *
 * This script is idempotent — it skips transactions whose category
 * is already an ObjectId.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const database = require('../config/database');
const Transaction = require('../models/schemas/transaction.schema');
const Category = require('../models/schemas/category.schema');

async function migrate() {
  try {
    await database.connect();
    console.log('🔄 Starting transaction category ref migration...\n');

    // Work with raw collection to bypass schema validation
    const txCollection = Transaction.collection;

    // Find all transactions where category is a string (not an ObjectId)
    const allTransactions = await txCollection.find({}).toArray();

    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const missingCategories = new Set();

    // Build a per-user category name→_id lookup cache
    const categoryCache = {};

    for (const tx of allTransactions) {
      // Skip if category is already an ObjectId
      if (tx.category instanceof mongoose.Types.ObjectId) {
        skippedCount++;
        continue;
      }

      // Skip if category is null/undefined
      if (!tx.category) {
        skippedCount++;
        continue;
      }

      const userId = tx.userId.toString();
      const categoryName = String(tx.category);

      // Build cache for this user if not present
      if (!categoryCache[userId]) {
        const userCats = await Category.find({ userId: tx.userId }).lean();
        categoryCache[userId] = {};
        for (const cat of userCats) {
          categoryCache[userId][cat.name] = cat._id;
        }
      }

      const categoryId = categoryCache[userId][categoryName];

      if (!categoryId) {
        // Try "Sem Categoria" as fallback
        const fallbackId = categoryCache[userId]['Sem Categoria'];
        if (fallbackId) {
          await txCollection.updateOne(
            { _id: tx._id },
            { $set: { category: fallbackId } }
          );
          missingCategories.add(`${categoryName} (user: ${userId})`);
          updatedCount++;
        } else {
          console.error(`❌ Transaction ${tx._id}: category "${categoryName}" not found and no fallback for user ${userId}`);
          errorCount++;
        }
        continue;
      }

      await txCollection.updateOne(
        { _id: tx._id },
        { $set: { category: categoryId } }
      );
      updatedCount++;
    }

    if (missingCategories.size > 0) {
      console.log('\n⚠️  The following categories were not found and were mapped to "Sem Categoria":');
      for (const cat of missingCategories) {
        console.log(`   - ${cat}`);
      }
    }

    console.log('\n========================================');
    console.log('✅ Migration complete');
    console.log(`   Transactions updated:  ${updatedCount}`);
    console.log(`   Transactions skipped:  ${skippedCount}`);
    console.log(`   Errors:                ${errorCount}`);
    console.log('========================================\n');

    await database.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    await database.disconnect();
    process.exit(1);
  }
}

migrate();
