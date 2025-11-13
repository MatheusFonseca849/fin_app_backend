const { verifyAccessToken } = require('../utils/jwt.utils');
const userService = require('../services/user.service');
const createError = require('./createError');

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
    
    // Fetch user from database
    const user = await userService.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json(
        createError(401, 'Usuário não encontrado')
      );
    }

    // Attach user to request (without password)
    const { password, ...userWithoutPassword } = user.toObject();
    req.user = { ...userWithoutPassword, id: user._id.toString() };
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(403).json(
      createError(403, 'Token inválido ou expirado')
    );
  }
};

module.exports = { authenticateToken };