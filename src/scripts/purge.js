require('dotenv').config();
const database = require('../config/database');
const User = require('../models/User.model');
const Transaction = require('../models/schemas/transaction.schema');

async function purgeDatabase() {
  try {
    await database.connect();

    const userCount = await User.countDocuments();
    const txCount = await Transaction.countDocuments();

    console.log(`🗑️  Purging database...`);
    console.log(`   Users to delete: ${userCount}`);
    console.log(`   Transactions to delete: ${txCount}`);

    await Transaction.deleteMany({});
    await User.deleteMany({});

    console.log('✅ Database purged successfully');

    await database.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Purge error:', error);
    await database.disconnect();
    process.exit(1);
  }
}

purgeDatabase();
