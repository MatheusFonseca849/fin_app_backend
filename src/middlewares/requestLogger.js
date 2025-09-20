const requestLogger = (req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`, {
        params: req.params,
        query: req.query,
        body: req.body
    });
    next();
};

module.exports = requestLogger;