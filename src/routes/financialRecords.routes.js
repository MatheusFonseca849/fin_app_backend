const { v4: uuidv4 } = require('uuid');
const router = require('express').Router();
const { findUserById } = require('../data/userData');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const createError = require('../middlewares/createError');
const validateUserExists = require('../middlewares/userValidation');

const upload = multer({ storage: multer.memoryStorage() });

router.get('/', validateUserExists, (req, res) => {
    res.json(req.user.transactions || []);
});

router.post('/', validateUserExists, (req, res) => {
    const { description, value, type, category } = req.body;
    
    const financialRecord = {
        id: uuidv4(),
        timestamp: new Date(),
        description,
        value,
        type,
        category,
        userId: req.user.id
    };
    
    req.user.transactions.push(financialRecord);
    res.status(201).json(financialRecord);
});

router.get('/:id', validateUserExists, (req, res) => {
    const { id } = req.params;
    const financialRecord = req.user.transactions.find(record => record.id === id);
    if (!financialRecord) {
        return res.status(404).json(createError(404, 'Transaction not found'));
    }
    res.status(200).json(financialRecord);
});

router.put('/:id', validateUserExists, (req, res) => {
    const { id } = req.params;
    const { description, value, type, category, date } = req.body;
    
    const financialRecord = req.user.transactions.find(record => record.id === id);
    
    if (!financialRecord) {
        return res.status(404).json(createError(404, 'Transaction not found'));
    }
    
    if (description !== undefined) financialRecord.description = description;
    if (value !== undefined) financialRecord.value = value;
    if (type !== undefined) financialRecord.type = type;
    if (category !== undefined) financialRecord.category = category;
    if (date !== undefined) financialRecord.timestamp = new Date(date);
    
    return res.status(200).json(financialRecord);
});

router.delete('/:id', validateUserExists, (req, res) => {
    const { id } = req.params;
    
    const recordToDelete = req.user.transactions.find(record => record.id === id);
    
    if (!recordToDelete) {
        return res.status(404).json(createError(404, 'Transaction not found'));
    }
    
    req.user.transactions = req.user.transactions.filter(record => record.id !== id);
    
    res.status(200).json({ message: 'Transaction deleted successfully' });
});

// Accepts multipart/form-data with fields:
// - file: CSV file with headers [date, type, category, description, amount]
router.post('/import', upload.any(), (req, res) => {
    try {

        const { userId } = req.body;
        
        if (!userId) {
            return res.status(400).json(createError(400, 'userId is required'));
        }

        const user = findUserById(userId);
        if (!user) {
            return res.status(404).json(createError(404, 'User not found'));
        }

        const uploadedFile = req.files && req.files.find(f => f.fieldname === 'file');
        if (!uploadedFile || !uploadedFile.buffer) {
            return res.status(400).json(createError(400, 'CSV file is required'));
        }

        const csvString = uploadedFile.buffer.toString('utf-8');

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
                const type = (row.type || row.tipo || '').toString().toLowerCase();
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
                    userId: user.id
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
        return res.status(500).json(createError(500, 'Failed to import CSV', err.message));
    }
});

module.exports = router;
