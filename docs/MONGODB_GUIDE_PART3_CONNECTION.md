# 📚 MongoDB Migration Guide - Part 3: Database Connection

## Setting Up MongoDB Connection

### Step 1: Create Config Directory
```bash
mkdir src/config
```

---

## Database Configuration

### File: `src/config/database.js`
```javascript
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
```

**Why this design?**
- ✅ **Singleton pattern** - Only one connection
- ✅ **Connection pooling** - Reuses connections
- ✅ **Error handling** - Helpful messages
- ✅ **Graceful shutdown** - Closes properly

---

## Update server.js

### File: `server.js`
```javascript
require('dotenv').config();
const app = require('./src/app');
const database = require('./src/config/database');

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // 1. Connect to database FIRST
    await database.connect();
    
    // 2. Then start HTTP server
    app.listen(PORT, () => {
      console.log('🚀 Server running on http://localhost:' + PORT);
      console.log('📊 MongoDB status:', database.getStatus());
    });
    
    // 3. Add health check route
    app.get('/health', (req, res) => {
      const dbStatus = database.getStatus();
      res.json({
        status: 'OK',
        database: {
          connected: dbStatus.isConnected,
          name: dbStatus.name
        },
        timestamp: new Date().toISOString()
      });
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
```

**Why this order?**
1. ✅ Connect to database first
2. ✅ Then accept HTTP requests
3. ✅ If database fails, server won't start

---

## Testing Connection

### Step 1: Update .env
```env
MONGODB_URI=mongodb://localhost:27017/finapp
# OR for Atlas:
# MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/finapp

JWT_ACCESS_SECRET=your-secret
JWT_REFRESH_SECRET=your-refresh-secret
FRONTEND_URL=http://localhost:3001
```

### Step 2: Start Server
```bash
npm run dev
```

### Expected Output:
```
📊 Connecting to MongoDB...
📊 Mongoose connected
✅ MongoDB connected!
📍 Database: finapp
🚀 Server running on http://localhost:3000
```

### If Connection Fails:

**Local MongoDB:**
```bash
# Mac
brew services start mongodb-community@7.0

# Check if running
ps aux | grep mongod
```

**Atlas:**
- Check connection string
- Verify IP whitelist (add 0.0.0.0/0 for testing)
- Check username/password

---

## Add Health Check Endpoint

### Update `src/app.js`:
```javascript
// Add this route
app.get('/health', (req, res) => {
  const dbStatus = require('./config/database').getStatus();
  res.json({
    status: 'OK',
    database: {
      connected: dbStatus.isConnected,
      name: dbStatus.name
    },
    timestamp: new Date().toISOString()
  });
});
```

### Test:
```bash
curl http://localhost:3000/health
```

---

## Next: Part 4 - Service Layer

Continue to `MONGODB_GUIDE_PART4_SERVICES.md`
