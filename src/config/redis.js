const Redis = require('ioredis');

class RedisClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  connect() {
    if (this.client) return this.client;

    const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        // Reconnect after increasing delay, max 3 seconds
        const delay = Math.min(times * 200, 3000);
        return delay;
      },
      lazyConnect: false
    });

    this.client.on('connect', () => {
      this.isConnected = true;
      console.log('✅ Redis connected');
    });

    this.client.on('error', (err) => {
      this.isConnected = false;
      console.error('❌ Redis error:', err.message);
    });

    this.client.on('close', () => {
      this.isConnected = false;
    });

    return this.client;
  }

  getClient() {
    if (!this.client) this.connect();
    return this.client;
  }

  async disconnect() {
    if (this.client) {
      await this.client.quit();
      this.isConnected = false;
      console.log('✅ Redis disconnected');
    }
  }
}

module.exports = new RedisClient();
