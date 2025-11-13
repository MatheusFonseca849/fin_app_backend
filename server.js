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
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();