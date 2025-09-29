const createError = require('../middlewares/createError');

const validateCategory = (req, res, next) => {
    const { name, type, color } = req.body;
    
    if (!name || !type || !color) {
        return res.status(400).json(createError(400, 'nome, tipo e cor são obrigatórios'));
    }
    
    if (type !== 'credito' && type !== 'debito') {
        return res.status(400).json(createError(400, 'tipo deve ser "credito" ou "debito"'));
    }
    
    if (!color.startsWith('#')) {
        return res.status(400).json(createError(400, 'cor deve ser em formato hex (começa com #)'));
    }
    
    next();
};

module.exports = validateCategory;
