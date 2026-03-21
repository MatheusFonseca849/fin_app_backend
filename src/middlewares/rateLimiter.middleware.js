const rateLimit = require('express-rate-limit');

const isTest = process.env.NODE_ENV === 'test';

// Strict limiter for authentication endpoints (login/register)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: { error: { message: 'Muitas tentativas de login. Tente novamente em 15 minutos.', status: 429 } },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
});

// General API limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: { error: { message: 'Muitas requisições. Tente novamente mais tarde.', status: 429 } },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
});

// Strict limiter for email-sending endpoints (resend verification, forgot password, etc.)
const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // 3 emails per window
  message: { error: { message: 'Muitas solicitações de email. Tente novamente em 15 minutos.', status: 429 } },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
});

module.exports = { authLimiter, apiLimiter, emailLimiter };