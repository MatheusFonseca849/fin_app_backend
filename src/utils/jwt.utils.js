const jwt = require('jsonwebtoken');
const crypto = require('crypto');

/**
 * Generate a fingerprint hash from user-agent string.
 * Binds refresh tokens to the client that created them.
 */
const generateFingerprint = (userAgent) => {
    if (!userAgent) return undefined;
    return crypto.createHash('sha256').update(userAgent).digest('hex').substring(0, 16);
};

const generateAccessToken = (payload) => {
    return jwt.sign(payload, process.env.JWT_ACCESS_SECRET, { expiresIn: '15m' });
};

const generateRefreshToken = (payload) => {
    return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
};

const verifyAccessToken = (token) => {
    try {
        return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            throw new Error('Token expirado');
        }
        if (error.name === 'JsonWebTokenError') {
            throw new Error('Token inválido');
        }
        throw error;
    }
};

const verifyRefreshToken = (token) => {
    try {
        return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            throw new Error('Refresh token expirado');
        }
        if (error.name === 'JsonWebTokenError') {
            throw new Error('Refresh token inválido');
        }
        throw error;
    }
};

module.exports = {
    generateAccessToken,
    generateRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
    generateFingerprint
};