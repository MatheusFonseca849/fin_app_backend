const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { getUserData, addUser, findUserByEmail, findUserById, createDefaultCategories } = require('../data/userData');
const createError = require('../middlewares/createError');
const { hashPassword, comparePassword, validatePasswordStrength } = require('../utils/password.utils');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt.utils');
const { authenticateToken } = require('../middlewares/auth.middleware');

router.get('/', authenticateToken, (req, res) => {
    const user = req.user;
    res.json(getUserData());
});

// router.post('/', (req, res) => {
//     const { name, email, password } = req.body;
//     const userId = uuidv4();
//     const user = {
//         id: userId,
//         name,
//         email,
//         password,
//         balance: 0,
//         recurrentCredits: [],
//         recurrentDebits: [],
//         transactions: [],
//         categories: createDefaultCategories(userId),
//     };
//     addUser(user);
//     res.status(201).json(user);
// });

router.get('/:id', authenticateToken, (req, res) => {
    // Check if user is accessing their own data
    if (req.params.id !== req.user.id) {
        return res.status(403).json(
            createError(403, 'Acesso negado: você só pode acessar seus próprios dados')
        );
    }
    res.status(200).json(req.user);
});

router.put('/:id', authenticateToken, async (req, res) => {
    try {
        // Check if user is updating their own data
        if (req.params.id !== req.user.id) {
            return res.status(403).json(
                createError(403, 'Acesso negado: você só pode atualizar seus próprios dados')
            );
        }
        
        // Get the actual user object from userData to modify
        const user = findUserById(req.user.id);
        const { name, email, password } = req.body;
        
        if (name !== undefined) user.name = name;
        if (email !== undefined) user.email = email;
        if (password !== undefined) {
            // Hash the new password
            user.password = await hashPassword(password);
        }
        
        // Return user without password
        const { password: _, ...userWithoutPassword } = user;
        return res.status(200).json(userWithoutPassword);
    } catch (error) {
        console.error('Update user error:', error);
        return res.status(500).json(
            createError(500, 'Erro ao atualizar usuário')
        );
    }
});

router.delete('/:id', authenticateToken, (req, res) => {
    // Check if user is deleting their own account
    if (req.params.id !== req.user.id) {
        return res.status(403).json(
            createError(403, 'Acesso negado: você só pode excluir sua própria conta')
        );
    }
    
    const userData = getUserData();
    const filteredUsers = userData.filter(user => user.id !== req.user.id);

    if (filteredUsers.length === userData.length) {
        return res.status(404).json(createError(404, 'Usuário não encontrado'));
    }

    require('../data/userData').setUserData(filteredUsers);
    res.status(200).json({ message: 'Usuário excluído com sucesso' });
});

// Authentication endpoints
router.post('/login', async (req, res) => {
    try {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json(
            createError(400, 'Email e senha são obrigatórios')
        );
    }

    const user = findUserByEmail(email);
    if (!user) {
        return res.status(401).json(
            createError(401, 'Credenciais inválidas')
        );
    }

    const passwordMatch = await comparePassword(password, user.password);
    if (!passwordMatch) {
        return res.status(401).json(
            createError(401, 'Credenciais inválidas')
        );
    }

    const accessToken = generateAccessToken({
        userId: user.id,
        email: user.email
    });

    const refreshToken = generateRefreshToken({
        userId: user.id
    });

    // Set refresh token in HTTP-only cookie
    res.cookie('refreshToken', refreshToken, {
        httpOnly: true,  // Cannot be accessed by JavaScript
        secure: process.env.NODE_ENV === 'production', // HTTPS only in production
        sameSite: 'strict', // CSRF protection
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds
    });

    const { password: _, ...userWithoutPassword } = user;
    res.status(200).json({
        accessToken,
        user: userWithoutPassword
    });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json(
            createError(500, 'Erro ao fazer login')
        );
    }
});

router.post('/register', async (req, res) => {
    try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json(
            createError(400, 'Nome, email e senha são obrigatórios')
        );
    }

    // Check if user already exists
    const existingUser = findUserByEmail(email);
    if (existingUser) {
        return res.status(400).json(createError(400, 'Usuário já existe'));
    }

    const passwordValidation = validatePasswordStrength(password);
        if (!passwordValidation.valid) {
            return res.status(400).json(
                createError(400, passwordValidation.message)
            );
        }

    const hashedPassword = await hashPassword(password);

    const userId = uuidv4();
        const newUser = {
            id: userId,
            name,
            email,
            password: hashedPassword,
            balance: 0,
            recurrentCredits: [],
            recurrentDebits: [],
            transactions: [],
            categories: createDefaultCategories(userId),
        };

    addUser(newUser);
    const accessToken = generateAccessToken({
        userId: newUser.id,
        email: newUser.email
    });
    
    const refreshToken = generateRefreshToken({
        userId: newUser.id
    });
    
    // Set refresh token in HTTP-only cookie
    res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000
    });
    
    // Return access token and user data
    const { password: _, ...userWithoutPassword } = newUser;
    res.status(201).json({
        accessToken,
        user: userWithoutPassword
    });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json(
            createError(500, 'Erro ao registrar usuário')
        );
    }
});

router.post('/refresh', (req, res) => {
    try {
        // Get refresh token from cookie
        const refreshToken = req.cookies.refreshToken;
        
        if (!refreshToken) {
            return res.status(401).json(
                createError(401, 'Refresh token não fornecido')
            );
        }
        
        // Verify refresh token
        const decoded = verifyRefreshToken(refreshToken);
        
        // Find user
        const user = findUserById(decoded.userId);
        if (!user) {
            return res.status(404).json(
                createError(404, 'Usuário não encontrado')
            );
        }
        
        // Generate new access token
        const accessToken = generateAccessToken({
            userId: user.id,
            email: user.email
        });
        
        res.status(200).json({ accessToken });
        
    } catch (error) {
        console.error('Refresh error:', error);
        res.status(403).json(
            createError(403, error.message || 'Refresh token inválido')
        );
    }
});

router.post('/logout', authenticateToken, (req, res) => {
    // Clear refresh token cookie
    res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    });
    
    res.status(200).json({ message: 'Logout realizado com sucesso' });
});

//Current user endpoint
router.get('/me', authenticateToken, (req, res) => {
    // User is already attached by authenticateToken middleware
    res.status(200).json(req.user);
});

module.exports = router;
