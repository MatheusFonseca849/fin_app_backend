const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const redisClient = require('../config/redis');

const isTest = process.env.NODE_ENV === 'test';

/**
 * Build a Redis-backed store for express-rate-limit.
 * Falls back to the default in-memory store if Redis is unavailable.
 *
 * The sendCommand wrapper handles two distinct call sites:
 * 1. Construction time — RedisStore's constructor fires loadIncrementScript()
 *    (async, fire-and-forget). If Redis is down, we resolve with a dummy value
 *    to prevent an unhandled promise rejection that would crash the process.
 * 2. Request time — increment()/decrement() calls. If Redis is down, we reject
 *    immediately so withStoreErrorFallback can catch and allow the request through.
 *
 * When Redis recovers, EVALSHA with the stale SHA triggers a NOSCRIPT error;
 * rate-limit-redis catches it, reloads the script, and resumes normally.
 */
function createStore(prefix) {
  if (isTest) return undefined; // Use default MemoryStore in tests

  try {
    const client = redisClient.getClient();
    return new RedisStore({
      sendCommand: (...args) => {
        if (!redisClient.isConnected) {
          // SCRIPT LOAD is called from the constructor (cannot be awaited).
          // Resolve with a dummy value to prevent unhandled promise rejection.
          if (args[0] === 'SCRIPT') {
            return Promise.resolve('');
          }
          // All other commands (request-time) reject immediately.
          // withStoreErrorFallback will catch these and allow the request through.
          return Promise.reject(new Error('Redis not connected'));
        }
        return client.call(...args);
      },
      prefix: `rl:${prefix}:`,
    });
  } catch (error) {
    console.warn(`[RateLimiter] Redis store unavailable for "${prefix}", falling back to memory:`, error.message);
    return undefined;
  }
}

/**
 * Wrap a rate-limiter middleware so that Redis store errors
 * allow the request through instead of returning 500.
 * When Redis is down, rate limiting is effectively disabled
 * rather than breaking the entire API.
 */
function withStoreErrorFallback(limiter) {
  return (req, res, next) => {
    limiter(req, res, (err) => {
      if (err) {
        console.warn('[RateLimiter] Store error, allowing request through:', err.message);
        return next();
      }
      next();
    });
  };
}

// Strict limiter for authentication endpoints (login/register)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: { error: { message: 'Muitas tentativas de login. Tente novamente em 15 minutos.', status: 429 } },
  standardHeaders: true,
  legacyHeaders: false,
  store: createStore('auth'),
  skip: () => isTest,
});

// General API limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: { error: { message: 'Muitas requisições. Tente novamente mais tarde.', status: 429 } },
  standardHeaders: true,
  legacyHeaders: false,
  store: createStore('api'),
  skip: () => isTest,
});

// Strict limiter for email-sending endpoints (resend verification, forgot password, etc.)
const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // 3 emails per window
  message: { error: { message: 'Muitas solicitações de email. Tente novamente em 15 minutos.', status: 429 } },
  standardHeaders: true,
  legacyHeaders: false,
  store: createStore('email'),
  skip: () => isTest,
});

module.exports = {
  authLimiter: withStoreErrorFallback(authLimiter),
  apiLimiter: withStoreErrorFallback(apiLimiter),
  emailLimiter: withStoreErrorFallback(emailLimiter),
};