/**
 * Migration Script: Move embedded categories from User documents
 * to the new standalone 'categories' collection.
 *
 * Usage:
 *   node src/scripts/migrateCategories.js
 *
 * This script is idempotent — it skips users who already have
 * categories in the new collection.
 */
require('dotenv').config();
const database = require('../config/database');
const User = require('../models/User.model');
const Category = require('../models/schemas/category.schema');

async function migrate() {
  try {
    await database.connect();
    console.log('🔄 Starting category migration...\n');

    // Find all users — use lean() to get raw docs (including the old 'categories' field
    // even though it's no longer in the schema)
    const users = await User.collection.find({}).toArray();

    let migratedCount = 0;
    let skippedCount = 0;
    let totalCategories = 0;

    for (const user of users) {
      const userId = user._id;
      const embedded = user.categories;

      // Skip users with no embedded categories
      if (!embedded || !Array.isArray(embedded) || embedded.length === 0) {
        skippedCount++;
        continue;
      }

      // Check if user already has categories in the new collection
      const existingCount = await Category.countDocuments({ userId });
      if (existingCount > 0) {
        console.log(`⏭️  User ${userId} (${user.email}) — already has ${existingCount} categories in new collection, skipping`);
        skippedCount++;
        continue;
      }

      // Insert embedded categories into the new collection
      const docs = embedded.map(c => ({
        userId,
        name: c.name,
        type: c.type,
        color: c.color,
        createdAt: new Date(),
        updatedAt: new Date()
      }));

      await Category.insertMany(docs, { ordered: false });
      totalCategories += docs.length;

      // Remove the old embedded array from the user document
      await User.collection.updateOne(
        { _id: userId },
        { $unset: { categories: '' } }
      );

      console.log(`✅ User ${userId} (${user.email}) — migrated ${docs.length} categories`);
      migratedCount++;
    }

    console.log('\n========================================');
    console.log(`✅ Migration complete`);
    console.log(`   Users migrated:  ${migratedCount}`);
    console.log(`   Users skipped:   ${skippedCount}`);
    console.log(`   Categories moved: ${totalCategories}`);
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
