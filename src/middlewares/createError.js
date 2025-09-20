const createError = (status, message, details = null) => ({
    error: {
        status,
        message,
        details,
        timestamp: new Date().toISOString()
    }
});

module.exports = createError;