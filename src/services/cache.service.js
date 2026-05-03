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
   * Get the current cache generation for a user's transaction data.
   * Returns '0' if no generation exists yet.
   */
  async getTxGeneration(userId) {
    try {
      const client = redisClient.getClient();
      if (!redisClient.isConnected) return '0';

      const gen = await client.get(this.keys.userTxGen(userId));
      return gen || '0';
    } catch (error) {
      console.error('Cache GET gen error:', error.message);
      return '0';
    }
  }

  /**
   * Bump the cache generation for a user's transaction data.
   * All previously cached transaction/dashboard/summary keys become
   * orphaned and expire naturally via their TTL.
   */
  async bumpTxGeneration(userId) {
    try {
      const client = redisClient.getClient();
      if (!redisClient.isConnected) return;

      await client.incr(this.keys.userTxGen(userId));
    } catch (error) {
      console.error('Cache INCR gen error:', error.message);
    }
  }

  // ===================
  // Cache Key Builders
  // ===================

  keys = {
    userProfile: (userId) => `user:${userId}:profile`,
    userCategories: (userId) => `user:${userId}:categories`,
    userTxGen: (userId) => `user:${userId}:txgen`,
    userTransactions: (userId, gen, filterHash) => `user:${userId}:tx:${gen}:q:${filterHash}`,
    userMonthlySummary: (userId, gen) => `user:${userId}:tx:${gen}:monthly`,
    userDashboard: (userId, gen) => `user:${userId}:tx:${gen}:dashboard`,
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

  /**
   * Build a deterministic hash from query filters for use as a cache key.
   * Identical filter combinations produce the same hash.
   */
  buildFilterHash(filters = {}) {
    const parts = [];
    const keys = Object.keys(filters).sort();
    for (const key of keys) {
      if (filters[key] !== undefined && filters[key] !== null && filters[key] !== '') {
        parts.push(`${key}=${filters[key]}`);
      }
    }
    return parts.length > 0 ? parts.join('&') : 'default';
  }

  async getCachedTransactions(userId, filters = {}) {
    const gen = await this.getTxGeneration(userId);
    const hash = this.buildFilterHash(filters);
    return this.get(this.keys.userTransactions(userId, gen, hash));
  }

  async cacheTransactions(userId, filters, transactions) {
    const gen = await this.getTxGeneration(userId);
    const hash = this.buildFilterHash(filters);
    await this.set(this.keys.userTransactions(userId, gen, hash), transactions, 120); // 2 min
  }

  async getCachedMonthlySummary(userId) {
    const gen = await this.getTxGeneration(userId);
    return this.get(this.keys.userMonthlySummary(userId, gen));
  }

  async cacheMonthlySummary(userId, data) {
    const gen = await this.getTxGeneration(userId);
    await this.set(this.keys.userMonthlySummary(userId, gen), data, 300); // 5 min
  }

  async getCachedDashboard(userId) {
    const gen = await this.getTxGeneration(userId);
    return this.get(this.keys.userDashboard(userId, gen));
  }

  async cacheDashboard(userId, data) {
    const gen = await this.getTxGeneration(userId);
    await this.set(this.keys.userDashboard(userId, gen), data, 300); // 5 min
  }

  async invalidateUser(userId) {
    await this.bumpTxGeneration(userId);
    await this.del(this.keys.userProfile(userId));
    await this.del(this.keys.userCategories(userId));
    await this.del(`auth:user:${userId}`);
  }

  async invalidateCategories(userId) {
    await this.del(this.keys.userCategories(userId));
  }

  async invalidateTransactions(userId) {
    await this.bumpTxGeneration(userId);
  }
}

module.exports = new CacheService();
