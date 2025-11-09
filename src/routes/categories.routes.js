const router = require('express').Router();
const { authenticateToken } = require('../middlewares/auth.middleware');
const { findUserById } = require('../data/userData');
const { v4: uuidv4 } = require('uuid');
const createError = require('../middlewares/createError');
const validateCategory = require('../middlewares/validateCategory');

router.get('/', authenticateToken, (req, res) => {
    res.json(req.user.categories || []);
});

router.post('/', authenticateToken, validateCategory, (req, res) => {
    const { name, type, color } = req.body;
    
    // Get the actual user object from userData to modify
    const user = findUserById(req.user.id);
    
    // Ensure categories array exists
    if (!user.categories) {
        user.categories = [];
    }
    
    // Check for duplicate category name
    const existingCategory = user.categories.find(cat => cat.name === name);
    if (existingCategory) {
        return res.status(400).json(createError(400, 'Nome da categoria já existe'));
    }

    const category = {
        id: uuidv4(),
        name,
        type,
        color,
        isDefault: false,
        userId: user.id
    };

    user.categories.push(category);
    res.status(201).json(category);
});

router.put('/:id', authenticateToken, validateCategory, (req, res) => {
    const { id } = req.params;
    const { name, type, color } = req.body;

    // Get the actual user object from userData to modify
    const user = findUserById(req.user.id);
    const category = user.categories.find(category => category.id === id);

    const otherCategoryNames = user.categories
        .filter(cat => cat.id !== id)
        .map(cat => cat.name);

    if (otherCategoryNames.includes(name)) {
        return res.status(400).json(createError(400, 'Nome da categoria já existe'));
    }

    if (!category) {
        return res.status(404).json(createError(404, 'Categoria não encontrada'));
    }

    if (category.isDefault) {
        return res.status(400).json(createError(400, 'Categoria padrão não pode ser editada'));
    }

    if (name !== undefined) category.name = name;
    if (type !== undefined) category.type = type;
    if (color !== undefined) category.color = color;

    return res.status(200).json(category);
});

router.delete('/:id', authenticateToken, (req, res) => {
    const { id } = req.params;

    // Get the actual user object from userData to modify
    const user = findUserById(req.user.id);
    const category = user.categories.find(category => category.id === id);

    if (!category) {
        return res.status(404).json(createError(404, 'Categoria não encontrada'));
    }

    if (category.isDefault) {
        return res.status(400).json(createError(400, 'Categoria padrão não pode ser excluída'));
    }

    // Find the default category BEFORE using it
    const defaultCategory = user.categories.find(cat =>
        cat.name === 'Sem Categoria' && cat.isDefault
    );
    
    if (!defaultCategory) {
        return res.status(500).json(createError(500, 'Categoria padrão "Sem Categoria" não encontrada'));
    }

    // Update all transactions using this category
    user.transactions.forEach(transaction => {
        if (transaction.category === category.name || transaction.category === id) {
            transaction.category = defaultCategory.name;
        }
    });

    // Update recurrent credits
    user.recurrentCredits.forEach(entry => {
        if (entry.category === category.name || entry.category === id) {
            entry.category = defaultCategory.name;
        }
    });

    // Update recurrent debits
    user.recurrentDebits.forEach(entry => {
        if (entry.category === category.name || entry.category === id) {
            entry.category = defaultCategory.name;
        }
    });

    // Remove the category
    user.categories = user.categories.filter(cat => cat.id !== id);

    return res.status(200).json({
        message: 'Categoria excluída com sucesso. Transações movidas para "Sem Categoria"'
    });
});

module.exports = router;