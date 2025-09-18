const { v4: uuidv4 } = require('uuid');
const router = require('express').Router();
const { findUserById } = require('../data/userData');

// Get all transactions for a specific user
router.get('/', (req, res) => {
    const { userId } = req.query;
    
    if (!userId) {
        return res.status(400).json({ message: 'userId query parameter is required' });
    }
    
    const user = findUserById(userId);
    
    if (!user) {
        return res.status(404).json({ message: 'User not found' });
    }
    
    res.json(user.transactions || []);
});

router.post('/', (req, res) => {
    const { description, value, type, category, userId } = req.body;
    
    if (!userId) {
        return res.status(400).json({ message: 'userId is required' });
    }
    
    const user = findUserById(userId);
    
    if (!user) {
        return res.status(404).json({ message: 'User not found' });
    }
    
    const financialRecord = {
        id: uuidv4(),
        timestamp: new Date(),
        description,
        value,
        type,
        category,
        userId
    };
    
    user.transactions.push(financialRecord);
    res.status(201).json(financialRecord);
});

router.get('/:id', (req, res) => {
    const { id } = req.params;
    const { userId } = req.query;
    
    if (!userId) {
        return res.status(400).json({ message: 'userId query parameter is required' });
    }
    
    const user = findUserById(userId);
    
    if (!user) {
        return res.status(404).json({ message: 'User not found' });
    }
    
    const financialRecord = user.transactions.find(record => record.id === id);
    
    if (!financialRecord) {
        return res.status(404).json({ message: 'Transaction not found' });
    }
    
    res.status(200).json(financialRecord);
});

router.put('/:id', (req, res) => {
    const { id } = req.params;
    const { description, value, type, category, userId } = req.body;
    
    if (!userId) {
        return res.status(400).json({ message: 'userId is required' });
    }
    
    const user = findUserById(userId);
    
    if (!user) {
        return res.status(404).json({ message: 'User not found' });
    }
    
    const financialRecord = user.transactions.find(record => record.id === id);
    
    if (!financialRecord) {
        return res.status(404).json({ message: 'Transaction not found' });
    }
    
    if (description !== undefined) financialRecord.description = description;
    if (value !== undefined) financialRecord.value = value;
    if (type !== undefined) financialRecord.type = type;
    if (category !== undefined) financialRecord.category = category;
    
    return res.status(200).json(financialRecord);
});

router.delete('/:id', (req, res) => {
    const { id } = req.params;
    const { userId } = req.query;
    
    if (!userId) {
        return res.status(400).json({ message: 'userId query parameter is required' });
    }
    
    const user = findUserById(userId);
    
    if (!user) {
        return res.status(404).json({ message: 'User not found' });
    }
    
    const recordToDelete = user.transactions.find(record => record.id === id);
    
    if (!recordToDelete) {
        return res.status(404).json({ message: 'Transaction not found' });
    }
    
    user.transactions = user.transactions.filter(record => record.id !== id);
    
    res.status(200).json({ message: 'Transaction deleted successfully' });
});

module.exports = router;
