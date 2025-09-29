const router = require('express').Router();
const validateUserExists = require('../middlewares/userValidation');
const { v4: uuidv4 } = require('uuid');
const createError = require('../middlewares/createError');
const validateCategory = require('../middlewares/validateCategory');

router.get('/', validateUserExists, (req, res) => {
    res.json(req.user.categories || []);
});

router.post('/', validateUserExists, validateCategory, (req, res) => {
    const { name, type, color } = req.body;
    
    // Ensure categories array exists
    if (!req.user.categories) {
        req.user.categories = [];
    }
    
    // Check for duplicate category name
    const existingCategory = req.user.categories.find(cat => cat.name === name);
    if (existingCategory) {
        return res.status(400).json(createError(400, 'Nome da categoria já existe'));
    }

    const category = {
        id: uuidv4(),
        name,
        type,
        color,
        isDefault: false,
        userId: req.user.id
    };

    req.user.categories.push(category);
    res.status(201).json(category);
});

router.put('/:id', validateUserExists, validateCategory, (req, res) => {
    const { id } = req.params;
    const { name, type, color } = req.body;

    const category = req.user.categories.find(category => category.id === id);

    const otherCategoryNames = req.user.categories
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

router.delete('/:id', validateUserExists, (req, res) => {
    const { id } = req.params;

    const category = req.user.categories.find(category => category.id === id);

    if (!category) {
        return res.status(404).json(createError(404, 'Categoria não encontrada'));
    }

    if (category.isDefault) {
        return res.status(400).json(createError(400, 'Categoria padrão não pode ser excluída'));
    }

    // Find the default category BEFORE using it
    const defaultCategory = req.user.categories.find(cat =>
        cat.name === 'Sem Categoria' && cat.isDefault
    );
    
    if (!defaultCategory) {
        return res.status(500).json(createError(500, 'Categoria padrão "Sem Categoria" não encontrada'));
    }

    // Update all transactions using this category
    req.user.transactions.forEach(transaction => {
        if (transaction.category === category.name || transaction.category === id) {
            transaction.category = defaultCategory.name;
        }
    });

    // Update recurrent credits
    req.user.recurrentCredits.forEach(entry => {
        if (entry.category === category.name || entry.category === id) {
            entry.category = defaultCategory.name;
        }
    });

    // Update recurrent debits
    req.user.recurrentDebits.forEach(entry => {
        if (entry.category === category.name || entry.category === id) {
            entry.category = defaultCategory.name;
        }
    });

    // Remove the category
    req.user.categories = req.user.categories.filter(cat => cat.id !== id);

    return res.status(200).json({
        message: 'Categoria excluída com sucesso. Transações movidas para "Sem Categoria"'
    });
});

module.exports = router;