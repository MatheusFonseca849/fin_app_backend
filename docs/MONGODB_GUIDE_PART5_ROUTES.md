# 📚 MongoDB Migration Guide - Part 5: Updating Routes

## Migrating Routes to MongoDB

**Strategy:** Update routes to use UserService instead of in-memory userData.

---

## 1. User Routes (userData.routes.js)

### Key Changes Needed:

| Old (In-Memory) | New (MongoDB) |
|----------------|---------------|
| `findUserById(id)` | `await userService.findById(id)` |
| `findUserByEmail(email)` | `await userService.findByEmail(email)` |
| `addUser(user)` | `await userService.createUser(user)` |
| Synchronous | **Async/Await** |

### Updated File: `src/routes/userData.routes.js`

```javascript
const router = require('express').Router();
const userService = require('../services/user.service');
const createError = require('../middlewares/createError');
const { hashPassword, comparePassword, validatePasswordStrength } = require('../utils/password.utils');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt.utils');
const { authenticateToken } = require('../middlewares/auth.middleware');

// ============================================
// PUBLIC ROUTES (No Auth Required)
// ============================================

/**
 * POST /users/register
 * Register new user
 */
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validate password strength
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json(
        createError(400, passwordValidation.message)
      );
    }

    // Check if user exists
    const existingUser = await userService.findByEmail(email);
    if (existingUser) {
      return res.status(400).json(
        createError(400, 'Email já cadastrado')
      );
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const user = await userService.createUser({
      name,
      email,
      password: hashedPassword
    });

    // Generate tokens
    const accessToken = generateAccessToken({ id: user._id, email: user.email });
    const refreshToken = generateRefreshToken({ id: user._id });

    // Set refresh token cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    // Return user without password
    const { password: _, ...userWithoutPassword } = user.toObject();

    res.status(201).json({
      accessToken,
      user: userWithoutPassword
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json(createError(500, 'Erro ao registrar usuário'));
  }
});

/**
 * POST /users/login
 * Login user
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await userService.findByEmail(email);
    if (!user) {
      return res.status(401).json(
        createError(401, 'Email ou senha incorretos')
      );
    }

    // Check password
    const isValid = await comparePassword(password, user.password);
    if (!isValid) {
      return res.status(401).json(
        createError(401, 'Email ou senha incorretos')
      );
    }

    // Generate tokens
    const accessToken = generateAccessToken({ id: user._id, email: user.email });
    const refreshToken = generateRefreshToken({ id: user._id });

    // Set cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    // Return user without password
    const { password: _, ...userWithoutPassword } = user.toObject();

    res.json({
      accessToken,
      user: userWithoutPassword
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json(createError(500, 'Erro ao fazer login'));
  }
});

// ============================================
// PROTECTED ROUTES (Auth Required)
// ============================================

/**
 * GET /users/me
 * Get current user
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await userService.findById(req.user.id);
    if (!user) {
      return res.status(404).json(createError(404, 'Usuário não encontrado'));
    }
    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json(createError(500, 'Erro ao buscar usuário'));
  }
});

/**
 * PUT /users/:id
 * Update user
 */
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    // Check ownership
    if (req.params.id !== req.user.id) {
      return res.status(403).json(
        createError(403, 'Acesso negado')
      );
    }

    const { name, email, password } = req.body;
    const updates = {};

    if (name) updates.name = name;
    if (email) updates.email = email;
    if (password) {
      updates.password = await hashPassword(password);
    }

    const user = await userService.updateUser(req.user.id, updates);
    res.json(user);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json(createError(500, 'Erro ao atualizar usuário'));
  }
});

/**
 * DELETE /users/:id
 * Delete user
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    if (req.params.id !== req.user.id) {
      return res.status(403).json(
        createError(403, 'Acesso negado')
      );
    }

    await userService.deleteUser(req.user.id);
    res.json({ message: 'Usuário excluído com sucesso' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json(createError(500, 'Erro ao excluir usuário'));
  }
});

/**
 * POST /users/logout
 * Logout user
 */
router.post('/logout', authenticateToken, (req, res) => {
  res.clearCookie('refreshToken');
  res.json({ message: 'Logout realizado com sucesso' });
});

/**
 * POST /users/refresh
 * Refresh access token
 */
router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    
    if (!refreshToken) {
      return res.status(401).json(
        createError(401, 'Refresh token não encontrado')
      );
    }

    const decoded = verifyRefreshToken(refreshToken);
    const user = await userService.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json(
        createError(401, 'Usuário não encontrado')
      );
    }

    const accessToken = generateAccessToken({ id: user._id, email: user.email });
    res.json({ accessToken });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(401).json(createError(401, 'Token inválido'));
  }
});

module.exports = router;
```

**Key Changes:**
- ✅ All database operations are now `async/await`
- ✅ Uses `userService` instead of `userData`
- ✅ Uses `user._id` (MongoDB ObjectId) instead of `user.id` (UUID)
- ✅ Uses `user.toObject()` to convert Mongoose document

---

## 2. Financial Records Routes

### Updated File: `src/routes/financialRecords.routes.js`

```javascript
const router = require('express').Router();
const userService = require('../services/user.service');
const { authenticateToken } = require('../middlewares/auth.middleware');
const createError = require('../middlewares/createError');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage() });

/**
 * GET /records
 * Get all transactions for user
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const transactions = await userService.getTransactions(req.user.id);
    res.json(transactions);
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json(createError(500, 'Erro ao buscar transações'));
  }
});

/**
 * POST /records
 * Create new transaction
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { description, value, type, category } = req.body;

    // Validate category exists
    const user = await userService.findById(req.user.id);
    const categoryExists = user.findCategory(category);
    
    if (!categoryExists) {
      return res.status(400).json(
        createError(400, 'Categoria não encontrada')
      );
    }

    const transaction = await userService.addTransaction(req.user.id, {
      description,
      value,
      type,
      category
    });

    res.status(201).json(transaction);
  } catch (error) {
    console.error('Create transaction error:', error);
    res.status(500).json(createError(500, 'Erro ao criar transação'));
  }
});

/**
 * GET /records/:id
 * Get single transaction
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const transactions = await userService.getTransactions(req.user.id);
    const transaction = transactions.find(t => t._id.toString() === req.params.id);
    
    if (!transaction) {
      return res.status(404).json(
        createError(404, 'Transação não encontrada')
      );
    }
    
    res.json(transaction);
  } catch (error) {
    console.error('Get transaction error:', error);
    res.status(500).json(createError(500, 'Erro ao buscar transação'));
  }
});

/**
 * PUT /records/:id
 * Update transaction
 */
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { description, value, type, category, date } = req.body;
    
    const updates = {};
    if (description !== undefined) updates.description = description;
    if (value !== undefined) updates.value = value;
    if (type !== undefined) updates.type = type;
    if (category !== undefined) updates.category = category;
    if (date !== undefined) updates.timestamp = new Date(date);

    const transaction = await userService.updateTransaction(
      req.user.id,
      req.params.id,
      updates
    );

    res.json(transaction);
  } catch (error) {
    console.error('Update transaction error:', error);
    res.status(500).json(createError(500, error.message));
  }
});

/**
 * DELETE /records/:id
 * Delete transaction
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    await userService.deleteTransaction(req.user.id, req.params.id);
    res.json({ message: 'Transação excluída com sucesso' });
  } catch (error) {
    console.error('Delete transaction error:', error);
    res.status(500).json(createError(500, error.message));
  }
});

module.exports = router;
```

**Key Changes:**
- ✅ Use `userService` methods
- ✅ Use `_id.toString()` for comparison (MongoDB ObjectId)
- ✅ All async/await

---

## 3. Categories Routes

### Updated File: `src/routes/categories.routes.js`

```javascript
const router = require('express').Router();
const userService = require('../services/user.service');
const { authenticateToken } = require('../middlewares/auth.middleware');
const createError = require('../middlewares/createError');
const validateCategory = require('../middlewares/validateCategory');

/**
 * GET /categories
 * Get all categories
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const categories = await userService.getCategories(req.user.id);
    res.json(categories);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json(createError(500, 'Erro ao buscar categorias'));
  }
});

/**
 * POST /categories
 * Create category
 */
router.post('/', authenticateToken, validateCategory, async (req, res) => {
  try {
    const { name, type, color } = req.body;
    
    const category = await userService.addCategory(req.user.id, {
      name,
      type,
      color,
      isDefault: false
    });

    res.status(201).json(category);
  } catch (error) {
    console.error('Create category error:', error);
    res.status(400).json(createError(400, error.message));
  }
});

/**
 * PUT /categories/:id
 * Update category
 */
router.put('/:id', authenticateToken, validateCategory, async (req, res) => {
  try {
    const { name, type, color } = req.body;
    
    const category = await userService.updateCategory(
      req.user.id,
      req.params.id,
      { name, type, color }
    );

    res.json(category);
  } catch (error) {
    console.error('Update category error:', error);
    res.status(400).json(createError(400, error.message));
  }
});

/**
 * DELETE /categories/:id
 * Delete category
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    await userService.deleteCategory(req.user.id, req.params.id);
    res.json({ 
      message: 'Categoria excluída. Transações movidas para "Sem Categoria"' 
    });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(400).json(createError(400, error.message));
  }
});

module.exports = router;
```

---

## 4. Update Auth Middleware

**IMPORTANT:** Update to work with MongoDB ObjectId.

### File: `src/middlewares/auth.middleware.js`

```javascript
const { verifyAccessToken } = require('../utils/jwt.utils');
const userService = require('../services/user.service');
const createError = require('./createError');

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json(
        createError(401, 'Token não fornecido')
      );
    }

    const decoded = verifyAccessToken(token);
    
    // Fetch user from database
    const user = await userService.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json(
        createError(401, 'Usuário não encontrado')
      );
    }

    // Attach user to request (without password)
    const { password, ...userWithoutPassword } = user.toObject();
    req.user = { ...userWithoutPassword, id: user._id.toString() };
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(403).json(
      createError(403, 'Token inválido ou expirado')
    );
  }
};

module.exports = { authenticateToken };
```

**Critical Change:**
- ✅ Now fetches user from MongoDB instead of memory
- ✅ Converts `_id` to string for consistency
- ✅ Async/await

---

## Next: Part 6 - Testing & Migration

Continue to `MONGODB_GUIDE_PART6_TESTING.md`
