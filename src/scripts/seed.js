require('dotenv').config();
const database = require('../config/database');
const User = require('../models/User.model');
const Transaction = require('../models/schemas/transaction.schema');
const bcrypt = require('bcryptjs');
const { TRANSACTION_TYPES } = require('../constants/transactionTypes');

async function seedDatabase() {
  try {
    await database.connect();

    // Check if user exists
    const existing = await User.findByEmail('matheusfonseca@gmail.com');
    if (existing) {
      const txCount = await Transaction.countDocuments({ userId: existing._id });
      console.log('✅ User already exists');
      console.log('📧 Email:', existing.email);
      console.log('📊 Transactions:', txCount);
      await database.disconnect();
      process.exit(0);
    }

    // Create user with hashed password
    const hashedPassword = await bcrypt.hash('123456', 10);
    
    const user = new User({
      firstName: 'Matheus',
      lastName: 'Fonseca',
      email: 'matheusfonseca@gmail.com',
      password: hashedPassword,
      balance: 0,
      categories: User.getDefaultCategories()
    });

    await user.save();

    // Create seed transactions in the separate collection
    const seedTransactions = [
      {
        userId: user._id,
        description: 'Supermercado',
        value: 150.50,
        type: TRANSACTION_TYPES.DEBIT,
        category: 'Alimentação',
        timestamp: new Date('2025-10-05')
      },
      {
        userId: user._id,
        description: 'Salário Outubro',
        value: 3500.00,
        type: TRANSACTION_TYPES.CREDIT,
        category: 'Salário',
        timestamp: new Date('2025-10-01')
      }
    ];

    await Transaction.insertMany(seedTransactions);

    console.log('✅ Database seeded successfully');
    console.log('📧 Email:', user.email);
    console.log('🔑 Password: 123456');
    console.log('📊 User ID:', user._id);
    console.log('📊 Transactions:', seedTransactions.length);
    
    // IMPORTANT: Disconnect properly before exit
    await database.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed error:', error);
    await database.disconnect();
    process.exit(1);
  }
}

seedDatabase();