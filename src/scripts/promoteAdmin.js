require('dotenv').config();
const database = require('../config/database');
const User = require('../models/User.model');

async function promoteAdmin() {
  const email = process.argv[2];

  if (!email) {
    console.error('❌ Usage: node src/scripts/promoteAdmin.js <email>');
    console.error('   Example: node src/scripts/promoteAdmin.js matheus@example.com');
    process.exit(1);
  }

  try {
    await database.connect();

    const user = await User.findByEmail(email);
    if (!user) {
      console.error('❌ User not found with email:', email);
      await database.disconnect();
      process.exit(1);
    }

    if (user.role === 'admin') {
      console.log('ℹ️  User is already an admin');
      console.log('📧 Email:', user.email);
      console.log('👤 Name:', user.name);
      await database.disconnect();
      process.exit(0);
    }

    user.role = 'admin';
    await user.save();

    console.log('✅ User promoted to admin successfully');
    console.log('📧 Email:', user.email);
    console.log('👤 Name:', user.name);
    console.log('🔑 Role:', user.role);

    await database.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error promoting user:', error.message);
    await database.disconnect();
    process.exit(1);
  }
}

promoteAdmin();
