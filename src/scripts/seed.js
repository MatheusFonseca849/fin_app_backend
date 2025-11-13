require('dotenv').config();
const database = require('../config/database');
const User = require('../models/User.model');
const bcrypt = require('bcryptjs');

async function seedDatabase() {
  try {
    await database.connect();

    // Check if user exists
    const existing = await User.findByEmail('matheusfonseca@gmail.com');
    if (existing) {
      console.log('✅ User already exists');
      console.log('📧 Email:', existing.email);
      console.log('📊 Transactions:', existing.transactions.length);
      await database.disconnect();
      process.exit(0);
    }

    // Create user with hashed password
    const hashedPassword = await bcrypt.hash('123456', 10);
    
    const user = new User({
      name: 'Matheus Fonseca',
      email: 'matheusfonseca@gmail.com',
      password: hashedPassword,
      balance: 0,
      categories: User.getDefaultCategories(),
      transactions: [
        {
          description: 'Supermercado',
          value: -150.50,
          type: 'debito',
          category: 'Alimentação',
          timestamp: new Date('2025-10-05')
        },
        {
          description: 'Salário Outubro',
          value: 3500.00,
          type: 'credito',
          category: 'Salário',
          timestamp: new Date('2025-10-01')
        }
      ]
    });

    await user.save();
    console.log('✅ Database seeded successfully');
    console.log('📧 Email:', user.email);
    console.log('🔑 Password: 123456');
    console.log('📊 User ID:', user._id);
    console.log('📊 Transactions:', user.transactions.length);
    
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