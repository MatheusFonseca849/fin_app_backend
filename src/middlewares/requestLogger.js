const SENSITIVE_FIELDS = ['password', 'token', 'refreshToken', 'accessToken', 'secret', 'email', 'firstName', 'lastName'];

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
    const logData = {
        params: req.params,
        query: sanitizeObject(req.query),
    };

    if (process.env.NODE_ENV !== 'production') {
        logData.body = sanitizeObject(req.body);
    }

    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`, logData);
    next();
};

module.exports = requestLogger;