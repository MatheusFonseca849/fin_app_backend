const createError = require('./createError');

const isAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json(
      createError(403, 'Acesso restrito a administradores')
    );
  }
  next();
};

module.exports = { isAdmin };
