const { v4: uuidv4 } = require('uuid');
const router = require('express').Router();
const { findUserById } = require('../data/userData');
const multer = require('multer');
const { parse } = require('csv-parse/sync');

// Configure multer for in-memory storage
const upload = multer({ storage: multer.memoryStorage() });

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

// CSV Import: POST /records/import
// Accepts multipart/form-data with fields:
// - file: CSV file with headers [date, type, category, description, amount]
// - userId: the target user id
router.post('/import', upload.single('file'), (req, res) => {
    try {
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ message: 'userId is required' });
        }

        const user = findUserById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ message: 'CSV file is required' });
        }

        const csvString = req.file.buffer.toString('utf-8');
        // Parse CSV with headers
        const records = parse(csvString, {
            columns: true,
            skip_empty_lines: true,
            trim: true
        });

        const created = [];
        const errors = [];

        records.forEach((row, index) => {
            try {
                const description = row.description || row.Descricao || row.Descrição || '';
                const rawAmount = row.amount ?? row.valor ?? row.value;
                const type = (row.type || row.tipo || '').toString().toLowerCase(); // 'credito' or 'debito'
                const category = (row.category || row.categoria || '').toString();
                const dateStr = row.date || row.data;

                if (!rawAmount || !type || !category || !dateStr) {
                    throw new Error('Missing required fields (amount, type, category, date)');
                }

                const amount = Number(rawAmount);
                if (Number.isNaN(amount)) {
                    throw new Error('Invalid amount');
                }

                const timestamp = new Date(dateStr);
                if (isNaN(timestamp.getTime())) {
                    throw new Error('Invalid date');
                }

                // Enforce app convention: positive for credito, negative for debito
                const value = (type === 'credito') ? Math.abs(amount) : -Math.abs(amount);
                if (type !== 'credito' && type !== 'debito') {
                    throw new Error("Type must be 'credito' or 'debito'");
                }

                const record = {
                    id: uuidv4(),
                    timestamp,
                    description,
                    value,
                    type,
                    category,
                    userId
                };
                user.transactions.push(record);
                created.push(record);
            } catch (e) {
                errors.push({ row: index + 1, message: e.message });
            }
        });

        return res.status(201).json({ createdCount: created.length, errorCount: errors.length, errors, records: created });
    } catch (err) {
        console.error('CSV import failed:', err);
        return res.status(500).json({ message: 'Failed to import CSV', error: err.message });
    }
});
