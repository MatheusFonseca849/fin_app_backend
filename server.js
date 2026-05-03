require('dotenv').config();
const { validateEnv } = require('./src/utils/envValidator');

// Fail fast if required env vars are missing
validateEnv();

const app = require('./src/app');
const database = require('./src/config/database');
const recurrenceService = require('./src/services/recurrence.service');
const creditCardService = require('./src/services/creditCard.service');
const redisClient = require('./src/config/redis');

const PORT = process.env.PORT || 3000;
const SHUTDOWN_TIMEOUT_MS = 10_000;

let server;

async function startServer() {
  try {
    // 1. Connect to database
    await database.connect();
    
    // 2. Connect to Redis cache
    redisClient.connect();
    
    // 3. Then start HTTP server
    server = app.listen(PORT, () => {
      console.log('🚀 Server running on http://localhost:' + PORT);
      console.log('📊 MongoDB status:', database.getStatus());
    });

    // 4. Start schedulers
    recurrenceService.start();
    creditCardService.start();
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// ============================================
// Graceful Shutdown
// ============================================

let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n⏳ ${signal} received — starting graceful shutdown...`);

  // Force exit if shutdown takes too long
  const forceTimer = setTimeout(() => {
    console.error('❌ Shutdown timed out — forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceTimer.unref();

  try {
    // 1. Stop accepting new connections, let in-flight requests finish
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      console.log('✅ HTTP server closed');
    }

    // 2. Stop schedulers
    recurrenceService.stop();
    creditCardService.stop();

    // 3. Disconnect Redis
    await redisClient.disconnect();

    // 4. Disconnect MongoDB
    await database.disconnect();

    console.log('👋 Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startServer();