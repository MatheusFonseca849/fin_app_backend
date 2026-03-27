const redisClient = require('../config/redis');

class CacheService {
  constructor() {
    this.defaultTTL = 300; // 5 minutes in seconds
  }

  /**
   * Returns null if cache not found or Redis is down.
   */
  async get(key) {
    try {
      const client = redisClient.getClient();
      if (!redisClient.isConnected) return null;

      const data = await client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Cache GET error:', error.message);
      return null;
    }
  }

  /**
   * Optional TTL (in seconds). Default is 5 minutes.
   */
  async set(key, value, ttl = this.defaultTTL) {
    try {
      const client = redisClient.getClient();
      if (!redisClient.isConnected) return;

      await client.set(key, JSON.stringify(value), 'EX', ttl);
    } catch (error) {
      console.error('Cache SET error:', error.message);
    }
  }

  async del(key) {
    try {
      const client = redisClient.getClient();
      if (!redisClient.isConnected) return;

      await client.del(key);
    } catch (error) {
      console.error('Cache DEL error:', error.message);
    }
  }

  /**
   * Delete all keys matching a pattern.
   * SCAN instead of KEYS to avoid blocking Redis.
   */
  async invalidatePattern(pattern) {
    try {
      const client = redisClient.getClient();
      if (!redisClient.isConnected) return;

      let cursor = '0';
      do {
        const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        if (keys.length > 0) {
          await client.del(...keys);
        }
      } while (cursor !== '0');
    } catch (error) {
      console.error('Cache INVALIDATE error:', error.message);
    }
  }

  // ===================
  // Cache Key Builders
  // ===================

  keys = {
    userProfile: (userId) => `user:${userId}:profile`,
    userCategories: (userId) => `user:${userId}:categories`,
    userTransactions: (userId, page = 1) => `user:${userId}:transactions:page:${page}`,
    userMonthlySummary: (userId) => `user:${userId}:transactions:monthly-summary`,
    userDashboard: (userId) => `user:${userId}:dashboard`,
    allUserKeys: (userId) => `user:${userId}:*`
  };

  // ========================
  // Domain-Specific Helpers
  // ========================

  async getCachedUserProfile(userId) {
    return this.get(this.keys.userProfile(userId));
  }

  async cacheUserProfile(userId, profile) {
    await this.set(this.keys.userProfile(userId), profile, 300); // 5 min
  }

  async getCachedCategories(userId) {
    return this.get(this.keys.userCategories(userId));
  }

  async cacheCategories(userId, categories) {
    await this.set(this.keys.userCategories(userId), categories, 600); // 10 min
  }

  async getCachedTransactions(userId, page = 1) {
    return this.get(this.keys.userTransactions(userId, page));
  }

  async cacheTransactions(userId, page, transactions) {
    await this.set(this.keys.userTransactions(userId, page), transactions, 120); // 2 min
  }

  async getCachedMonthlySummary(userId) {
    return this.get(this.keys.userMonthlySummary(userId));
  }

  async cacheMonthlySummary(userId, data) {
    await this.set(this.keys.userMonthlySummary(userId), data, 300); // 5 min
  }

  async getCachedDashboard(userId) {
    return this.get(this.keys.userDashboard(userId));
  }

  async cacheDashboard(userId, data) {
    await this.set(this.keys.userDashboard(userId), data, 300); // 5 min
  }

  async invalidateUser(userId) {
    await this.invalidatePattern(this.keys.allUserKeys(userId));
    await this.del(`auth:user:${userId}`);
  }

  async invalidateCategories(userId) {
    await this.del(this.keys.userCategories(userId));
  }

  async invalidateTransactions(userId) {
    await this.invalidatePattern(`user:${userId}:transactions:*`);
    await this.del(this.keys.userDashboard(userId));
  }
}

module.exports = new CacheService();
