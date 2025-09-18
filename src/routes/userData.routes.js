const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { getUserData, addUser, findUserById, findUserByEmail } = require('../data/userData');

router.get('/', (req, res) => {
    res.json(getUserData());
});

router.post('/', (req, res) => {
    const { name, email, password } = req.body;
    const user = {
        id: uuidv4(),
        name,
        email,
        password,
        balance: 0,
        recurrentCredits: [],
        recurrentDebits: [],
        transactions: [],
    };
    addUser(user);
    res.status(201).json(user);
});

router.get('/:id', (req, res) => {
    const { id } = req.params;
    const user = findUserById(id);
    if (!user) {
        return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json(user);
});

router.put('/:id', (req, res) => {
    const { id } = req.params;
    const { name, email, password } = req.body;
    const user = findUserById(id);
    if (!user) {
        return res.status(404).json({ message: 'User not found' });
    }
    if (name !== undefined) user.name = name;
    if (email !== undefined) user.email = email;
    if (password !== undefined) user.password = password;
    return res.status(200).json(user);
});

router.delete('/:id', (req, res) => {
    const { id } = req.params;
    const userToDelete = findUserById(id);
    if (!userToDelete) {
        return res.status(404).json({ message: 'User not found' });
    }
    const userData = getUserData();
    const filteredUsers = userData.filter(user => user.id !== id);
    require('../data/userData').setUserData(filteredUsers);
    res.status(200).json({ message: 'User deleted successfully' });
});

// Authentication endpoints
router.post('/login', (req, res) => {
    const { email, password } = req.body;
    const user = findUserByEmail(email);
    if (!user || user.password !== password) {
        return res.status(401).json({ message: 'Invalid credentials' });
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
        return res.status(400).json({ message: 'User already exists' });
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
    };
    
    addUser(newUser);
    const { password: _, ...userWithoutPassword } = newUser;
    res.status(201).json(userWithoutPassword);
});

module.exports = router;
