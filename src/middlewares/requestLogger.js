const SENSITIVE_FIELDS = ['password', 'token', 'refreshToken', 'accessToken', 'secret'];

const sanitizeObject = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    
    const sanitized = { ...obj };
    for (const key of Object.keys(sanitized)) {
        if (SENSITIVE_FIELDS.some(field => key.toLowerCase().includes(field))) {
            sanitized[key] = '[REDACTED]';
        }
    }
    return sanitized;
};

const requestLogger = (req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`, {
        params: req.params,
        query: sanitizeObject(req.query),
        body: sanitizeObject(req.body)
    });
    next();
};

module.exports = requestLogger;