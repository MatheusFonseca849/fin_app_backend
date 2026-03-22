const crypto = require('crypto');
const redisClient = require('../config/redis');

// Lua script for safe lock release: only delete if the token matches
const RELEASE_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;

/**
 * Acquire a distributed lock using Redis SET NX EX.
 * Returns a release function on success, or null if the lock is already held.
 *
 * @param {string} key - Lock key (e.g. "lock:recurrence" or "lock:user:<id>:balance")
 * @param {number} ttlSeconds - Auto-expire time in seconds (safety net for crashed holders)
 * @returns {Promise<(() => Promise<boolean>) | null>} release function, or null if not acquired
 */
async function acquireLock(key, ttlSeconds = 30) {
  try {
    const client = redisClient.getClient();
    if (!redisClient.isConnected) return null;

    const token = crypto.randomUUID();
    const result = await client.set(key, token, 'EX', ttlSeconds, 'NX');

    if (result !== 'OK') return null; // Lock already held

    // Return a release function bound to this token
    const release = async () => {
      try {
        const released = await client.eval(RELEASE_SCRIPT, 1, key, token);
        return released === 1;
      } catch (error) {
        console.error(`Lock release error [${key}]:`, error.message);
        return false;
      }
    };

    return release;
  } catch (error) {
    console.error(`Lock acquire error [${key}]:`, error.message);
    return null;
  }
}

/**
 * Execute a function while holding a distributed lock.
 * If the lock cannot be acquired, returns { locked: false }.
 * If the function succeeds, returns { locked: true, result }.
 * If the function throws, the lock is released and the error is re-thrown.
 *
 * @param {string} key - Lock key
 * @param {Function} fn - Async function to run under lock
 * @param {number} ttlSeconds - Lock TTL
 * @returns {Promise<{ locked: boolean, result?: any }>}
 */
async function withLock(key, fn, ttlSeconds = 30) {
  const release = await acquireLock(key, ttlSeconds);

  // If Redis is down or lock unavailable, proceed without lock (graceful degradation)
  if (!release) {
    return { locked: false };
  }

  try {
    const result = await fn();
    return { locked: true, result };
  } finally {
    await release();
  }
}

module.exports = { acquireLock, withLock };
