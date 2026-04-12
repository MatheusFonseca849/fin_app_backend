const { verifyAccessToken } = require('../utils/jwt.utils');
const userService = require('../services/user.service');
const cacheService = require('../services/cache.service');
const createError = require('./createError');

const AUTH_CACHE_TTL = 60; // 60 seconds — short TTL to keep tokenVersion checks fresh
const AUTH_CACHE_PREFIX = 'auth:user:';

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json(
        createError(401, 'Token não fornecido')
      );
    }

    const decoded = verifyAccessToken(token);

    // Try Redis cache first, fall back to DB
    const cacheKey = `${AUTH_CACHE_PREFIX}${decoded.id}`;
    let user = await cacheService.get(cacheKey);

    if (!user) {
      user = await userService.findById(decoded.id);
      if (user) {
        // Cache the lean user object for subsequent requests
        await cacheService.set(cacheKey, user.toObject(), AUTH_CACHE_TTL);
      }
    }

    if (!user) {
      return res.status(401).json(
        createError(401, 'Usuário não encontrado')
      );
    }

    // Validate tokenVersion — reject revoked access tokens
    const tokenVersion = user.tokenVersion;
    if (decoded.tokenVersion !== undefined && decoded.tokenVersion !== tokenVersion) {
      // Evict stale cache on revocation
      await cacheService.del(cacheKey);
      return res.status(401).json(
        createError(401, 'Token revogado')
      );
    }

    // Attach user to request (use toJSON if Mongoose doc, otherwise strip manually)
    const userObj = typeof user.toJSON === 'function' ? user.toJSON() : user;
    const { password, failedLoginAttempts, lockUntil, __v, ...safeUser } = userObj;
    req.user = { ...safeUser, id: (user._id || user.id).toString() };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json(
      createError(401, 'Token inválido ou expirado')
    );
  }
};

module.exports = { authenticateToken };