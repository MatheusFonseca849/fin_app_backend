# Part 3: Core Implementation

This is where you'll write the actual authentication code. Follow each step carefully.

## Step 1: Create JWT Utilities

Create `src/utils/jwt.utils.js`:

```javascript
const jwt = require('jsonwebtoken');

/**
 * Generate an access token (short-lived)
 * @param {Object} payload - Data to encode (userId, email, etc.)
 * @returns {string} JWT access token
 */
const generateAccessToken = (payload) => {
    return jwt.sign(
        payload,
        process.env.JWT_ACCESS_SECRET,
        { expiresIn: process.env.JWT_ACCESS_EXPIRATION || '15m' }
    );
};

/**
 * Generate a refresh token (long-lived)
 * @param {Object} payload - Data to encode (usually just userId)
 * @returns {string} JWT refresh token
 */
const generateRefreshToken = (payload) => {
    return jwt.sign(
        payload,
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: process.env.JWT_REFRESH_EXPIRATION || '7d' }
    );
};

/**
 * Verify an access token
 * @param {string} token - JWT to verify
 * @returns {Object} Decoded payload
 * @throws {Error} If token is invalid or expired
 */
const verifyAccessToken = (token) => {
    try {
        return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            throw new Error('Token expirado');
        }
        if (error.name === 'JsonWebTokenError') {
            throw new Error('Token inválido');
        }
        throw error;
    }
};

/**
 * Verify a refresh token
 * @param {string} token - JWT to verify
 * @returns {Object} Decoded payload
 * @throws {Error} If token is invalid or expired
 */
const verifyRefreshToken = (token) => {
    try {
        return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            throw new Error('Refresh token expirado');
        }
        if (error.name === 'JsonWebTokenError') {
            throw new Error('Refresh token inválido');
        }
        throw error;
    }
};

module.exports = {
    generateAccessToken,
    generateRefreshToken,
    verifyAccessToken,
    verifyRefreshToken
};
```

### Key Concepts:
- **Different secrets**: Access and refresh tokens use different secrets
- **Error handling**: Distinguish between expired and invalid tokens
- **Payload**: Can include any non-sensitive data
- **Expiration**: Automatically handled by jsonwebtoken

## Step 2: Create Password Utilities

Create `src/utils/password.utils.js`:

```javascript
const bcrypt = require('bcryptjs');

/**
 * Hash a plain-text password
 * @param {string} password - Plain-text password
 * @returns {Promise<string>} Hashed password
 */
const hashPassword = async (password) => {
    const saltRounds = 10; // Balance between security and performance
    return await bcrypt.hash(password, saltRounds);
};

/**
 * Compare a plain-text password with a hash
 * @param {string} password - Plain-text password
 * @param {string} hashedPassword - Hashed password from database
 * @returns {Promise<boolean>} True if passwords match
 */
const comparePassword = async (password, hashedPassword) => {
    return await bcrypt.compare(password, hashedPassword);
};

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {Object} { valid: boolean, message: string }
 */
const validatePasswordStrength = (password) => {
    if (!password || password.length < 6) {
        return { 
            valid: false, 
            message: 'Senha deve ter no mínimo 6 caracteres' 
        };
    }
    
    // For production, add more rules:
    // - At least one uppercase letter
    // - At least one lowercase letter
    // - At least one number
    // - At least one special character
    
    return { valid: true, message: 'Senha válida' };
};

module.exports = {
    hashPassword,
    comparePassword,
    validatePasswordStrength
};
```

### Key Concepts:
- **Async operations**: bcrypt is CPU-intensive, so use async versions
- **Salt rounds**: 10 is good balance (higher = slower but more secure)
- **Never compare passwords directly**: Always use bcrypt.compare()
- **Validation**: Enforce password rules before hashing

## Step 3: Create Authentication Middleware

Create `src/middlewares/auth.middleware.js`:

```javascript
const { verifyAccessToken } = require('../utils/jwt.utils');
const { findUserById } = require('../data/userData');
const createError = require('./createError');

/**
 * Middleware to verify JWT access token and attach user to request
 * Usage: Add to routes that require authentication
 */
const authenticateToken = async (req, res, next) => {
    try {
        // 1. Get token from Authorization header
        // Expected format: "Bearer <token>"
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        
        if (!token) {
            return res.status(401).json(
                createError(401, 'Token de acesso não fornecido')
            );
        }
        
        // 2. Verify token signature and expiration
        const decoded = verifyAccessToken(token);
        
        // 3. Get user from database
        const user = findUserById(decoded.userId);
        
        if (!user) {
            return res.status(404).json(
                createError(404, 'Usuário não encontrado')
            );
        }
        
        // 4. Attach user to request (without password)
        const { password, ...userWithoutPassword } = user;
        req.user = userWithoutPassword;
        
        next(); // Proceed to route handler
    } catch (error) {
        // Token verification failed
        return res.status(403).json(
            createError(403, error.message || 'Token inválido')
        );
    }
};

/**
 * Optional authentication middleware
 * Authenticates if token is present, but doesn't fail if not
 * Useful for routes that change behavior based on auth status
 */
const optionalAuthentication = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        
        if (token) {
            const decoded = verifyAccessToken(token);
            const user = findUserById(decoded.userId);
            
            if (user) {
                const { password, ...userWithoutPassword } = user;
                req.user = userWithoutPassword;
            }
        }
    } catch (error) {
        // Silently fail - authentication is optional
    }
    
    next();
};

module.exports = {
    authenticateToken,
    optionalAuthentication
};
```

### Key Concepts:
- **Authorization header**: Format is "Bearer <token>"
- **Middleware pattern**: Attaches data to req object for next handlers
- **Status codes**: 401 (Unauthorized) vs 403 (Forbidden)
- **Always remove password**: Never send password to client

## Step 4: Update User Data Module

Update `src/data/userData.js` to hash the mock user's password:

```javascript
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs'); // ADD THIS

// ... keep createDefaultCategories function ...

// UPDATE the createMockUser function:
const createMockUser = () => {
    const userId = '317f632f-6149-4f77-aa02-1af65cad1750';
    
    // Hash the password (synchronously for initialization)
    // In a real database, passwords would already be hashed
    const hashedPassword = bcrypt.hashSync('123456', 10);
    
    return {
        id: userId,
        name: 'Matheus Fonseca',
        email: 'matheusfonseca@gmail.com',
        password: hashedPassword, // NOW HASHED!
        balance: 0,
        recurrentCredits: [
            // ... keep existing data ...
        ],
        recurrentDebits: [
            // ... keep existing data ...
        ],
        transactions: [
            // ... keep existing data ...
        ],
        categories: createDefaultCategories(userId),
    };
};

// ... keep the rest of the file ...
```

### Why hashSync here?
This is the **only** place you should use synchronous hashing. It's OK because:
1. Runs once during server startup
2. Not in a request handler
3. Mock data initialization

**In route handlers, ALWAYS use async `hashPassword()`**

## Step 5: Update Authentication Routes

Update `src/routes/userData.routes.js`. Add these imports at the top:

```javascript
const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { getUserData, addUser, findUserByEmail, findUserById, createDefaultCategories } = require('../data/userData');
const createError = require('../middlewares/createError');

// NEW IMPORTS:
const { hashPassword, comparePassword, validatePasswordStrength } = require('../utils/password.utils');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt.utils');
const { authenticateToken } = require('../middlewares/auth.middleware');
```

Now replace or update these endpoints:

### Login Endpoint

```javascript
// POST /users/login - User login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Validate input
        if (!email || !password) {
            return res.status(400).json(
                createError(400, 'Email e senha são obrigatórios')
            );
        }
        
        // Find user
        const user = findUserByEmail(email);
        if (!user) {
            // Don't reveal if email exists (security best practice)
            return res.status(401).json(
                createError(401, 'Credenciais inválidas')
            );
        }
        
        // Compare password with hash
        const passwordMatch = await comparePassword(password, user.password);
        if (!passwordMatch) {
            return res.status(401).json(
                createError(401, 'Credenciais inválidas')
            );
        }
        
        // Generate tokens
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
        
        // Return access token and user data (without password)
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
```

### Register Endpoint

```javascript
// POST /users/register - User registration
router.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        
        // Validate input
        if (!name || !email || !password) {
            return res.status(400).json(
                createError(400, 'Nome, email e senha são obrigatórios')
            );
        }
        
        // Validate password strength
        const passwordValidation = validatePasswordStrength(password);
        if (!passwordValidation.valid) {
            return res.status(400).json(
                createError(400, passwordValidation.message)
            );
        }
        
        // Check if user already exists
        const existingUser = findUserByEmail(email);
        if (existingUser) {
            return res.status(400).json(
                createError(400, 'Usuário já existe')
            );
        }
        
        // Hash password
        const hashedPassword = await hashPassword(password);
        
        // Create new user
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
        
        // Generate tokens
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
```

### Refresh Token Endpoint

```javascript
// POST /users/refresh - Get new access token using refresh token
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
```

### Logout Endpoint

```javascript
// POST /users/logout - Logout user (clear refresh token)
router.post('/logout', authenticateToken, (req, res) => {
    // Clear refresh token cookie
    res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    });
    
    res.status(200).json({ message: 'Logout realizado com sucesso' });
});
```

### Get Current User Endpoint

```javascript
// GET /users/me - Get current authenticated user
router.get('/me', authenticateToken, (req, res) => {
    // User is already attached by authenticateToken middleware
    res.status(200).json(req.user);
});
```

## Step 6: Protect Existing Routes

Now update your other routes to use JWT authentication instead of the old validation.

### Update Financial Records Routes

In `src/routes/financialRecords.routes.js`, replace `validateUserExists` with `authenticateToken`:

```javascript
// Change the import
const { authenticateToken } = require('../middlewares/auth.middleware');

// Update routes - example:
router.get('/', authenticateToken, (req, res) => {
    // req.user is now set by JWT middleware
    res.json(req.user.transactions || []);
});

router.post('/', authenticateToken, (req, res) => {
    const { description, value, type, category } = req.body;
    
    // Get the actual user object to modify
    const { findUserById } = require('../data/userData');
    const userInData = findUserById(req.user.id);
    
    // Validate category
    const categoryExists = userInData.categories.find(cat => 
        cat.name === category || cat.id === category
    );
    
    if (!categoryExists) {
        return res.status(400).json(createError(400, 'Categoria não encontrada'));
    }
    
    // Create transaction
    const financialRecord = {
        id: uuidv4(),
        timestamp: new Date(),
        description,
        value,
        type,
        category,
        userId: req.user.id
    };
    
    userInData.transactions.push(financialRecord);
    res.status(201).json(financialRecord);
});

// Update all other routes similarly
```

### Update User Routes

Protect user-specific routes:

```javascript
router.get('/:id', authenticateToken, (req, res) => {
    // Ensure user can only access their own data
    if (req.params.id !== req.user.id) {
        return res.status(403).json(
            createError(403, 'Acesso negado')
        );
    }
    res.status(200).json(req.user);
});

router.put('/:id', authenticateToken, async (req, res) => {
    if (req.params.id !== req.user.id) {
        return res.status(403).json(
            createError(403, 'Acesso negado')
        );
    }
    
    const user = findUserById(req.user.id);
    const { name, email, password } = req.body;
    
    if (name !== undefined) user.name = name;
    if (email !== undefined) user.email = email;
    if (password !== undefined) {
        user.password = await hashPassword(password);
    }
    
    const { password: _, ...userWithoutPassword } = user;
    res.status(200).json(userWithoutPassword);
});
```

## Implementation Checklist

- [ ] Created `src/utils/jwt.utils.js`
- [ ] Created `src/utils/password.utils.js`
- [ ] Created `src/middlewares/auth.middleware.js`
- [ ] Updated mock user password to be hashed
- [ ] Updated login endpoint
- [ ] Updated register endpoint
- [ ] Created refresh endpoint
- [ ] Created logout endpoint
- [ ] Created /me endpoint
- [ ] Updated financial records routes
- [ ] Updated user routes

## Next Steps

Your authentication is implemented! Now let's ensure it's secure.

**Continue to [Part 4: Security Best Practices](./04_security.md)**
