const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { getUserData, addUser, findUserById, findUserByEmail, createDefaultCategories } = require('../data/userData');
const validateUserExists = require('../middlewares/userValidation');
const createError = require('../middlewares/createError');

router.get('/', (req, res) => {
    res.json(getUserData());
});

router.post('/', (req, res) => {
    const { name, email, password } = req.body;
    const userId = uuidv4();
    const user = {
        id: userId,
        name,
        email,
        password,
        balance: 0,
        recurrentCredits: [],
        recurrentDebits: [],
        transactions: [],
        categories: createDefaultCategories(userId),
    };
    addUser(user);
    res.status(201).json(user);
});

router.get('/:id', validateUserExists, (req, res) => {
    const user = req.user;
    res.status(200).json(user);
});

router.put('/:id', validateUserExists, (req, res) => {
    const user = req.user;
    const { name, email, password } = req.body;
    if (name !== undefined) user.name = name;
    if (email !== undefined) user.email = email;
    if (password !== undefined) user.password = password;
    return res.status(200).json(user);
});

router.delete('/:id', validateUserExists, (req, res) => {
    const userToDelete = req.user;
    const userData = getUserData();
    const filteredUsers = userData.filter(user => user.id !== userToDelete.id);

    if (filteredUsers.length === userData.length) {
        return res.status(404).json(createError(404, 'Usuário não encontrado'));
    }

    require('../data/userData').setUserData(filteredUsers);
    res.status(200).json({ message: 'Usuário excluído com sucesso' });
});

// Authentication endpoints
router.post('/login', (req, res) => {
    const { email, password } = req.body;
    const user = findUserByEmail(email);
    if (!user || user.password !== password) {
        return res.status(401).json(createError(401, 'Credenciais inválidas'));
    }
    // In a real app, you'd generate a JWT token here
    const { password: _, ...userWithoutPassword } = user;
    res.status(200).json(userWithoutPassword);
});

router.post('/register', (req, res) => {
    const { name, email, password } = req.body;
    
    // Check if user already exists
    const existingUser = findUserByEmail(email);
    if (existingUser) {
        return res.status(400).json(createError(400, 'Usuário já existe'));
    }
    
    const userId = uuidv4();
    const newUser = {
        id: userId,
        name,
        email,
        password,
        balance: 0,
        recurrentCredits: [],
        recurrentDebits: [],
        transactions: [],
        categories: createDefaultCategories(userId),
    };
    
    addUser(newUser);
    const { password: _, ...userWithoutPassword } = newUser;
    res.status(201).json(userWithoutPassword);
});

module.exports = router;
