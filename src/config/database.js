const mongoose = require('mongoose');

class Database {
  constructor() {
    this.isConnected = false;
  }

  async connect() {
    if (this.isConnected) {
      console.log('📊 Already connected to MongoDB');
      return;
    }

    try {
      const options = {
        maxPoolSize: 10,      // Connection pool
        minPoolSize: 2,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        family: 4  // IPv4
      };

      const mongoUri = process.env.MONGODB_URI;
      
      if (!mongoUri) {
        throw new Error('MONGODB_URI not found in .env');
      }

      console.log('📊 Connecting to MongoDB...');
      await mongoose.connect(mongoUri, options);
      
      this.isConnected = true;
      console.log('✅ MongoDB connected!');
      console.log(`📍 Database: ${mongoose.connection.name}`);

    } catch (error) {
      console.error('❌ MongoDB connection error:', error.message);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('\n💡 Tips:');
        console.log('1. Check if MongoDB is running');
        console.log('2. Verify connection string in .env');
        console.log('3. If using Atlas, check IP whitelist\n');
      }
      
      process.exit(1);
    }
  }

  async disconnect() {
    if (!this.isConnected) return;

    try {
      await mongoose.disconnect();
      this.isConnected = false;
      console.log('✅ MongoDB disconnected');
    } catch (error) {
      console.error('❌ Disconnect error:', error.message);
    }
  }

  getStatus() {
    return {
      isConnected: this.isConnected,
      readyState: mongoose.connection.readyState,
      // 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
      host: mongoose.connection.host,
      name: mongoose.connection.name
    };
  }
}

const database = new Database();

// ============================================
// EVENT LISTENERS
// ============================================

mongoose.connection.on('connected', () => {
  console.log('📊 Mongoose connected');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ Connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('📊 Mongoose disconnected');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await database.disconnect();
  console.log('👋 Application terminated');
  process.exit(0);
});

module.exports = database;