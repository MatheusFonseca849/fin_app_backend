const createError = require('./createError');

/**
 * CSRF protection via Origin / Referer header validation.
 *
 * For state-changing requests (POST, PUT, PATCH, DELETE) that carry
 * cookies, the browser always sends an Origin (or at minimum a Referer)
 * header.  This middleware rejects requests whose origin does not match
 * the expected CLIENT_URL.
 *
 * Safe methods (GET, HEAD, OPTIONS) are allowed through unconditionally.
 */
const csrfProtection = (req, res, next) => {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) return next();

  const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:3001')
    .split(',')
    .map(o => o.trim().replace(/\/+$/, ''));

  // Prefer Origin header; fall back to Referer
  const origin = req.headers.origin;
  const referer = req.headers.referer;

  if (origin) {
    if (allowedOrigins.includes(origin.replace(/\/+$/, ''))) return next();
    console.warn(`[CSRF] Blocked request from origin: ${origin}`);
    return res.status(403).json(createError(403, 'Origem não permitida'));
  }

  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      if (allowedOrigins.includes(refererOrigin)) return next();
    } catch {
      // malformed Referer — fall through to rejection
    }
    console.warn(`[CSRF] Blocked request from referer: ${referer}`);
    return res.status(403).json(createError(403, 'Origem não permitida'));
  }

  // No Origin and no Referer on a state-changing request is suspicious,
  // but some legitimate clients (e.g. Postman, curl, server-to-server)
  // may omit both.  In production we reject; in development we allow.
  if (process.env.NODE_ENV === 'production') {
    console.warn('[CSRF] Blocked request with no Origin/Referer header');
    return res.status(403).json(createError(403, 'Origem não permitida'));
  }

  next();
};

module.exports = { csrfProtection };
