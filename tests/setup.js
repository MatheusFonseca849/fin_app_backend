/**
 * Shared test database lifecycle for all test files.
 *
 * Uses MongoMemoryReplSet (replica set) to support MongoDB transactions
 * required by withTransaction() in controllers and services.
 *
 * Usage in each test file:
 *   const { setupTestDB } = require('./setup');
 *   setupTestDB();
 */
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-key-12345';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-12345';
process.env.CLIENT_URL = 'http://localhost:3001';

function setupTestDB() {
  let replSet;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
    });
    const uri = replSet.getUri();
    await mongoose.connect(uri);
  }, 60000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (replSet) await replSet.stop();
  });

  afterEach(async () => {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  });
}

module.exports = { setupTestDB };
