const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const redisClient = require('../config/redis');

const isTest = process.env.NODE_ENV === 'test';

/**
 * Build a Redis-backed store for express-rate-limit.
 * Falls back to the default in-memory store if Redis is unavailable.
 */
function createStore(prefix) {
  if (isTest) return undefined; // Use default MemoryStore in tests

  try {
    const client = redisClient.getClient();
    return new RedisStore({
      sendCommand: (...args) => client.call(...args),
      prefix: `rl:${prefix}:`,
    });
  } catch (error) {
    console.warn(`[RateLimiter] Redis store unavailable for "${prefix}", falling back to memory:`, error.message);
    return undefined;
  }
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

module.exports = { authLimiter, apiLimiter, emailLimiter };