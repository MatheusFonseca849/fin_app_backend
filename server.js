require('dotenv').config();
const { validateEnv } = require('./src/utils/envValidator');

// Fail fast if required env vars are missing
validateEnv();

const app = require('./src/app');
const database = require('./src/config/database');
const recurrenceService = require('./src/services/recurrence.service');
const redisClient = require('./src/config/redis');

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // 1. Connect to database
    await database.connect();
    
    // 2. Connect to Redis cache
    redisClient.connect();
    
    // 3. Then start HTTP server
    app.listen(PORT, () => {
      console.log('🚀 Server running on http://localhost:' + PORT);
      console.log('📊 MongoDB status:', database.getStatus());
    });

    // 4. Start recurrence scheduler
    recurrenceService.start();
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();