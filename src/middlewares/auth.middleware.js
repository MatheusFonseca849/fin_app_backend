const { verifyAccessToken } = require('../utils/jwt.utils');
const { findUserById } = require('../data/userData');
const createError = require('./createError');

const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        
        if (!token) {
            return res.status(401).json(
                createError(401, 'Token de acesso não fornecido')
            );
        }
        
        const decoded = verifyAccessToken(token);
        const user = findUserById(decoded.userId);
        
        if (!user) {
            return res.status(404).json(
                createError(404, 'Usuário não encontrado')
            );
        }
        
        const { password, ...userWithoutPassword } = user;
        req.user = userWithoutPassword;
        
        next();
    } catch (error) {
        return res.status(403).json(
            createError(403, error.message || 'Token inválido')
        );
    }
}

module.exports = {
    authenticateToken
}
