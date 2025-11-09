# Part 7: Advanced Topics & Best Practices

## Token Blacklisting (Logout Mechanism)

Currently, JWTs are valid until expiration. For better security, implement token blacklisting.

### Simple In-Memory Blacklist

```javascript
// src/utils/tokenBlacklist.js
const blacklistedTokens = new Set();

/**
 * Add token to blacklist
 * @param {string} token - JWT to blacklist
 * @param {number} expirationMs - Time until token naturally expires
 */
const blacklistToken = (token, expirationMs) => {
    blacklistedTokens.add(token);
    
    // Auto-remove after expiration (cleanup)
    setTimeout(() => {
        blacklistedTokens.delete(token);
    }, expirationMs);
};

/**
 * Check if token is blacklisted
 * @param {string} token - JWT to check
 * @returns {boolean}
 */
const isBlacklisted = (token) => {
    return blacklistedTokens.has(token);
};

module.exports = {
    blacklistToken,
    isBlacklisted
};
```

### Update Auth Middleware

```javascript
// src/middlewares/auth.middleware.js
const { isBlacklisted } = require('../utils/tokenBlacklist');

const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        
        if (!token) {
            return res.status(401).json(
                createError(401, 'Token de acesso não fornecido')
            );
        }
        
        // Check blacklist
        if (isBlacklisted(token)) {
            return res.status(401).json(
                createError(401, 'Token revogado')
            );
        }
        
        // ... rest of verification
    } catch (error) {
        // ...
    }
};
```

### Update Logout Endpoint

```javascript
// src/routes/userData.routes.js
const { blacklistToken } = require('../utils/tokenBlacklist');
const jwt = require('jsonwebtoken');

router.post('/logout', authenticateToken, (req, res) => {
    const token = req.headers['authorization'].split(' ')[1];
    
    // Decode to get expiration
    const decoded = jwt.decode(token);
    const expiresIn = (decoded.exp * 1000) - Date.now();
    
    // Blacklist the access token
    blacklistToken(token, expiresIn);
    
    // Clear refresh token cookie
    res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    });
    
    res.status(200).json({ message: 'Logout realizado com sucesso' });
});
```

### Redis-Based Blacklist (Production)

For production with multiple servers, use Redis:

```javascript
// npm install redis

const redis = require('redis');
const client = redis.createClient({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
});

const blacklistToken = async (token, expirationSeconds) => {
    await client.setex(`blacklist:${token}`, expirationSeconds, 'true');
};

const isBlacklisted = async (token) => {
    const result = await client.get(`blacklist:${token}`);
    return result === 'true';
};
```

---

## Rate Limiting

Protect against brute force attacks.

### Install express-rate-limit

```bash
npm install express-rate-limit
```

### Implement Rate Limiting

```javascript
// src/middlewares/rateLimiter.js
const rateLimit = require('express-rate-limit');

// General API rate limiter
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Muitas requisições deste IP, tente novamente mais tarde.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Strict limiter for auth endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Only 5 attempts
    skipSuccessfulRequests: true, // Don't count successful logins
    message: 'Muitas tentativas de login. Tente novamente em 15 minutos.',
});

// Password reset limiter
const resetPasswordLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // Only 3 attempts per hour
    message: 'Muitas solicitações de redefinição de senha.',
});

module.exports = {
    apiLimiter,
    authLimiter,
    resetPasswordLimiter
};
```

### Apply Rate Limiting

```javascript
// src/app.js
const { apiLimiter } = require('./middlewares/rateLimiter');

// Apply to all routes
app.use('/api/', apiLimiter);

// src/routes/userData.routes.js
const { authLimiter } = require('../middlewares/rateLimiter');

router.post('/login', authLimiter, async (req, res) => {
    // ... login logic
});

router.post('/register', authLimiter, async (req, res) => {
    // ... register logic
});
```

---

## Email Verification

Add email verification for new users.

### Generate Verification Token

```javascript
// src/utils/jwt.utils.js

const generateVerificationToken = (payload) => {
    return jwt.sign(
        payload,
        process.env.JWT_VERIFICATION_SECRET,
        { expiresIn: '24h' } // Token valid for 24 hours
    );
};

const verifyVerificationToken = (token) => {
    try {
        return jwt.verify(token, process.env.JWT_VERIFICATION_SECRET);
    } catch (error) {
        throw new Error('Token de verificação inválido ou expirado');
    }
};
```

### Update Registration

```javascript
router.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        
        // ... validation and user creation ...
        
        const newUser = {
            id: userId,
            name,
            email,
            password: hashedPassword,
            emailVerified: false, // NEW
            balance: 0,
            // ... rest
        };
        
        addUser(newUser);
        
        // Generate verification token
        const verificationToken = generateVerificationToken({
            userId: newUser.id,
            email: newUser.email
        });
        
        // Send verification email (implement email service)
        await sendVerificationEmail(email, verificationToken);
        
        res.status(201).json({
            message: 'Usuário criado. Verifique seu email.',
            userId: newUser.id
        });
        
    } catch (error) {
        // ...
    }
});
```

### Email Verification Endpoint

```javascript
router.get('/verify-email/:token', async (req, res) => {
    try {
        const { token } = req.params;
        
        // Verify token
        const decoded = verifyVerificationToken(token);
        
        // Find user
        const user = findUserById(decoded.userId);
        if (!user) {
            return res.status(404).json(
                createError(404, 'Usuário não encontrado')
            );
        }
        
        // Mark as verified
        user.emailVerified = true;
        
        res.status(200).json({
            message: 'Email verificado com sucesso!'
        });
        
    } catch (error) {
        res.status(400).json(
            createError(400, error.message)
        );
    }
});
```

### Require Email Verification

```javascript
router.post('/login', async (req, res) => {
    try {
        // ... password verification ...
        
        if (!user.emailVerified) {
            return res.status(403).json(
                createError(403, 'Por favor, verifique seu email antes de fazer login')
            );
        }
        
        // ... generate tokens ...
    } catch (error) {
        // ...
    }
});
```

---

## Password Reset

Implement forgot password functionality.

### Request Password Reset

```javascript
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        
        const user = findUserByEmail(email);
        if (!user) {
            // Don't reveal if email exists
            return res.status(200).json({
                message: 'Se o email existir, você receberá um link de redefinição'
            });
        }
        
        // Generate reset token
        const resetToken = generateVerificationToken({
            userId: user.id,
            purpose: 'password-reset'
        });
        
        // Send reset email
        await sendPasswordResetEmail(email, resetToken);
        
        res.status(200).json({
            message: 'Se o email existir, você receberá um link de redefinição'
        });
        
    } catch (error) {
        res.status(500).json(
            createError(500, 'Erro ao processar solicitação')
        );
    }
});
```

### Reset Password

```javascript
router.post('/reset-password/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const { newPassword } = req.body;
        
        // Validate password
        const validation = validatePasswordStrength(newPassword);
        if (!validation.valid) {
            return res.status(400).json(
                createError(400, validation.message)
            );
        }
        
        // Verify token
        const decoded = verifyVerificationToken(token);
        
        if (decoded.purpose !== 'password-reset') {
            return res.status(400).json(
                createError(400, 'Token inválido')
            );
        }
        
        // Find user
        const user = findUserById(decoded.userId);
        if (!user) {
            return res.status(404).json(
                createError(404, 'Usuário não encontrado')
            );
        }
        
        // Update password
        user.password = await hashPassword(newPassword);
        
        res.status(200).json({
            message: 'Senha redefinida com sucesso'
        });
        
    } catch (error) {
        res.status(400).json(
            createError(400, error.message)
        );
    }
});
```

---

## User Roles & Permissions

Add role-based access control (RBAC).

### Add Role to User

```javascript
const newUser = {
    id: userId,
    name,
    email,
    password: hashedPassword,
    role: 'user', // or 'admin', 'moderator', etc.
    // ... rest
};
```

### Include Role in JWT

```javascript
const accessToken = generateAccessToken({
    userId: user.id,
    email: user.email,
    role: user.role // Include role
});
```

### Role Middleware

```javascript
// src/middlewares/checkRole.js

/**
 * Middleware to check user role
 * @param {Array<string>} allowedRoles - Roles that can access the route
 */
const checkRole = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json(
                createError(401, 'Não autenticado')
            );
        }
        
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json(
                createError(403, 'Acesso negado: permissões insuficientes')
            );
        }
        
        next();
    };
};

module.exports = checkRole;
```

### Protect Routes by Role

```javascript
const { authenticateToken } = require('../middlewares/auth.middleware');
const checkRole = require('../middlewares/checkRole');

// Only admins can access
router.get('/admin/users', 
    authenticateToken, 
    checkRole(['admin']), 
    (req, res) => {
        // ... admin logic
    }
);

// Admins and moderators can access
router.delete('/records/:id', 
    authenticateToken,
    checkRole(['admin', 'moderator']),
    (req, res) => {
        // ... delete logic
    }
);
```

---

## Session Management

Track user sessions for better security.

### Session Model

```javascript
// src/data/sessions.js
const sessions = new Map();

const createSession = (userId, refreshToken, ipAddress, userAgent) => {
    const sessionId = uuidv4();
    const session = {
        id: sessionId,
        userId,
        refreshToken,
        ipAddress,
        userAgent,
        createdAt: new Date(),
        lastActivity: new Date()
    };
    
    sessions.set(sessionId, session);
    return session;
};

const getSessionsByUser = (userId) => {
    return Array.from(sessions.values())
        .filter(session => session.userId === userId);
};

const revokeSession = (sessionId) => {
    sessions.delete(sessionId);
};

const revokeAllUserSessions = (userId) => {
    const userSessions = getSessionsByUser(userId);
    userSessions.forEach(session => sessions.delete(session.id));
};

module.exports = {
    createSession,
    getSessionsByUser,
    revokeSession,
    revokeAllUserSessions
};
```

### Update Login

```javascript
router.post('/login', async (req, res) => {
    try {
        // ... authentication ...
        
        const refreshToken = generateRefreshToken({ userId: user.id });
        
        // Create session
        const session = createSession(
            user.id,
            refreshToken,
            req.ip,
            req.get('user-agent')
        );
        
        // Store session ID in refresh token
        const refreshTokenWithSession = generateRefreshToken({
            userId: user.id,
            sessionId: session.id
        });
        
        res.cookie('refreshToken', refreshTokenWithSession, { /* ... */ });
        
        // ...
    } catch (error) {
        // ...
    }
});
```

### View Active Sessions

```javascript
router.get('/sessions', authenticateToken, (req, res) => {
    const sessions = getSessionsByUser(req.user.id);
    
    // Don't send full refresh tokens
    const safeSessions = sessions.map(session => ({
        id: session.id,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        createdAt: session.createdAt,
        lastActivity: session.lastActivity
    }));
    
    res.json(safeSessions);
});
```

### Revoke Session

```javascript
router.delete('/sessions/:sessionId', authenticateToken, (req, res) => {
    const { sessionId } = req.params;
    
    // Verify session belongs to user
    const session = sessions.get(sessionId);
    if (!session || session.userId !== req.user.id) {
        return res.status(404).json(
            createError(404, 'Sessão não encontrada')
        );
    }
    
    revokeSession(sessionId);
    res.json({ message: 'Sessão revogada com sucesso' });
});
```

---

## Monitoring & Logging

Track authentication events for security.

### Create Logger

```javascript
// src/utils/logger.js
const winston = require('winston');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
    ],
});

if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.simple(),
    }));
}

module.exports = logger;
```

### Log Authentication Events

```javascript
const logger = require('../utils/logger');

router.post('/login', async (req, res) => {
    try {
        const { email } = req.body;
        // ... authentication ...
        
        if (passwordMatch) {
            logger.info('Login successful', {
                userId: user.id,
                email: user.email,
                ip: req.ip,
                userAgent: req.get('user-agent'),
                timestamp: new Date()
            });
        } else {
            logger.warn('Login failed - wrong password', {
                email,
                ip: req.ip,
                timestamp: new Date()
            });
        }
        
    } catch (error) {
        logger.error('Login error', {
            error: error.message,
            stack: error.stack,
            ip: req.ip
        });
    }
});
```

---

## Performance Optimization

### Cache User Data

```javascript
// src/utils/cache.js
const NodeCache = require('node-cache');
const userCache = new NodeCache({ stdTTL: 600 }); // 10 minutes

const getCachedUser = (userId) => {
    return userCache.get(userId);
};

const cacheUser = (userId, user) => {
    userCache.set(userId, user);
};

const invalidateUserCache = (userId) => {
    userCache.del(userId);
};
```

### Update Middleware

```javascript
const authenticateToken = async (req, res, next) => {
    try {
        const token = /* ... */;
        const decoded = verifyAccessToken(token);
        
        // Try cache first
        let user = getCachedUser(decoded.userId);
        
        if (!user) {
            // Cache miss - get from database
            user = findUserById(decoded.userId);
            if (user) {
                cacheUser(decoded.userId, user);
            }
        }
        
        // ...
    } catch (error) {
        // ...
    }
};
```

---

## Production Deployment

### Environment Variables

```env
# Production .env
NODE_ENV=production
PORT=3000

# JWT Secrets (use strong, unique values)
JWT_ACCESS_SECRET=<64-char-random-string>
JWT_REFRESH_SECRET=<64-char-random-string>
JWT_VERIFICATION_SECRET=<64-char-random-string>
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d

# Database
DATABASE_URL=postgresql://user:password@host:5432/database

# Redis (for token blacklist)
REDIS_URL=redis://host:6379

# Email Service
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password

# Frontend URL
FRONTEND_URL=https://yourdomain.com

# Security
COOKIE_SECURE=true
COOKIE_SAMESITE=strict
```

### Docker Deployment

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  backend:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=redis://redis:6379
    env_file:
      - .env
    depends_on:
      - redis
      
  redis:
    image: redis:alpine
    ports:
      - "6379:6379"
```

---

## Security Checklist

### Development
- [x] Environment variables in .env file
- [x] .env in .gitignore
- [x] Password hashing with bcrypt
- [x] JWT with secure secrets
- [x] HTTP-only cookies for refresh tokens
- [x] CORS with credentials

### Production
- [ ] HTTPS enabled
- [ ] Secure cookies (`secure: true`)
- [ ] Rate limiting implemented
- [ ] Token blacklisting
- [ ] Session management
- [ ] Email verification
- [ ] Password reset flow
- [ ] Role-based access control
- [ ] Audit logging
- [ ] Input validation
- [ ] SQL injection prevention
- [ ] XSS protection
- [ ] CSRF protection
- [ ] Security headers (helmet)
- [ ] Regular dependency updates
- [ ] Penetration testing
- [ ] Error handling (no sensitive data leaks)

---

## Conclusion

You now have knowledge of:
- ✅ Basic JWT authentication
- ✅ Token refresh mechanism
- ✅ Token blacklisting
- ✅ Rate limiting
- ✅ Email verification
- ✅ Password reset
- ✅ Role-based access
- ✅ Session management
- ✅ Security logging
- ✅ Production deployment

**Keep learning:**
- OAuth 2.0 / OpenID Connect
- Two-factor authentication (2FA)
- Biometric authentication
- Single Sign-On (SSO)
- Zero Trust Architecture

Good luck with your implementation! 🚀
