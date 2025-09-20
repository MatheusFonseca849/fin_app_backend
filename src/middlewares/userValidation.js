const createError = require('../middlewares/createError');
const findUserById = require('../data/userData').findUserById;

const validateUserExists = (req, res, next) => {
    // For user routes like /users/:id, use params.id
    // For financial records routes, use query.userId or body.userId
    let userId;
    
    // Check if this is a user route (like /users/:id)
    if (req.route && req.route.path === '/:id' && req.baseUrl.includes('/users')) {
        userId = req.params.id;
    } else {
        // For financial records routes, prioritize body.userId and query.userId
        userId = (req.body && req.body.userId) || req.query.userId;
    }
    
    if (!userId) {
        return res.status(400).json(createError(400, 'userId is required'));
    }
    
    const user = findUserById(userId);
    
    if (!user) {
        return res.status(404).json(createError(404, 'User not found'));
    }
    
    req.user = user; // Attach user to request
    next();
};

module.exports = validateUserExists;
