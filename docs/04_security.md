# Part 4: Security Best Practices

## Core Security Principles

### 1. Secret Key Security

#### ❌ Never Do This:
```javascript
// NEVER hardcode secrets
const secret = 'mysecret123';
const token = jwt.sign(payload, secret);
```

#### ✅ Always Do This:
```javascript
// Always use environment variables
const token = jwt.sign(payload, process.env.JWT_ACCESS_SECRET);
```

#### Best Practices:
- **Minimum length**: 32 characters
- **Random generation**: Use crypto.randomBytes()
- **Different secrets**: Access and refresh tokens need different secrets
- **Rotation**: Change secrets periodically in production
- **Never commit**: Add `.env` to `.gitignore`

```bash
# Generate secure secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 2. Password Security

#### Hashing Rules:
```javascript
// ✅ Good: Async hashing in route handlers
const hashedPassword = await hashPassword(password);

// ❌ Bad: Synchronous hashing (blocks event loop)
const hashedPassword = bcrypt.hashSync(password, 10);

// ❌ NEVER store plain passwords
user.password = password; // NEVER!

// ❌ NEVER log passwords
console.log('User password:', password); // NEVER!
```

#### Salt Rounds Guide:
```javascript
const saltRounds = 10; // Default - good for most cases
// 8  = Fast, less secure (not recommended)
// 10 = Balanced (recommended for education/medium apps)
// 12 = Slower, more secure (recommended for production)
// 14+ = Very slow, maximum security (banking apps)
```

#### Password Validation:
```javascript
const validatePasswordStrength = (password) => {
    const rules = [];
    
    if (password.length < 8) {
        rules.push('Mínimo 8 caracteres');
    }
    
    if (!/[A-Z]/.test(password)) {
        rules.push('Pelo menos uma letra maiúscula');
    }
    
    if (!/[a-z]/.test(password)) {
        rules.push('Pelo menos uma letra minúscula');
    }
    
    if (!/[0-9]/.test(password)) {
        rules.push('Pelo menos um número');
    }
    
    if (!/[!@#$%^&*]/.test(password)) {
        rules.push('Pelo menos um caractere especial (!@#$%^&*)');
    }
    
    return {
        valid: rules.length === 0,
        message: rules.join(', ')
    };
};
```

### 3. Token Security

#### Access Token Storage (Frontend)
```javascript
// ✅ Best: Store in memory (cleared on page refresh)
let accessToken = null;

// ⚠️ OK for educational purposes: localStorage
localStorage.setItem('accessToken', token);

// ❌ Bad: Regular cookie (accessible by JavaScript)
document.cookie = `accessToken=${token}`;
```

#### Refresh Token Storage
```javascript
// ✅ Only correct way: HTTP-only cookie
res.cookie('refreshToken', token, {
    httpOnly: true,  // Cannot be accessed by JavaScript
    secure: true,    // HTTPS only
    sameSite: 'strict' // CSRF protection
});

// ❌ NEVER store refresh token in localStorage
localStorage.setItem('refreshToken', token); // NEVER!
```

#### Token Expiration Strategy
```javascript
// ✅ Recommended
JWT_ACCESS_EXPIRATION=15m   // Short-lived
JWT_REFRESH_EXPIRATION=7d   // Long-lived

// ⚠️ For development (not production)
JWT_ACCESS_EXPIRATION=1h
JWT_REFRESH_EXPIRATION=30d

// ❌ Insecure
JWT_ACCESS_EXPIRATION=1y    // Too long!
JWT_REFRESH_EXPIRATION=never // Never expires!
```

### 4. Cookie Security

#### Development vs Production
```javascript
res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // HTTP in dev, HTTPS in prod
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    domain: process.env.NODE_ENV === 'production' ? '.yourdomain.com' : undefined
});
```

#### SameSite Attribute:
- `strict`: Most secure, blocks all cross-site requests
- `lax`: Blocks most cross-site, allows top-level navigation
- `none`: Allows all cross-site (requires `secure: true`)

### 5. CORS Configuration

#### ❌ Insecure:
```javascript
app.use(cors({
    origin: '*', // Allows ANY domain!
    credentials: true
}));
```

#### ✅ Secure:
```javascript
app.use(cors({
    origin: process.env.FRONTEND_URL, // Specific domain only
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    maxAge: 600 // Cache preflight requests for 10 minutes
}));
```

#### Multiple Origins:
```javascript
const allowedOrigins = [
    'http://localhost:3001',
    'https://yourdomain.com',
    'https://www.yourdomain.com'
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));
```

## Common Attack Vectors & Defenses

### 1. XSS (Cross-Site Scripting)

**Attack**: Injecting malicious scripts
```javascript
// Attacker sends:
{ "name": "<script>alert('XSS')</script>" }
```

**Defense**:
```javascript
// ✅ Sanitize input
const sanitize = require('sanitize-html');
user.name = sanitize(req.body.name);

// ✅ Never render user input as HTML
// React does this automatically with JSX

// ✅ Use HTTP-only cookies for tokens
// JavaScript cannot access them
```

### 2. CSRF (Cross-Site Request Forgery)

**Attack**: Tricking user's browser into making unwanted requests

**Defense**:
```javascript
// ✅ SameSite cookies
res.cookie('refreshToken', token, {
    sameSite: 'strict' // Blocks cross-site requests
});

// ✅ Verify origin header
app.use((req, res, next) => {
    const origin = req.get('origin');
    if (origin && origin !== process.env.FRONTEND_URL) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    next();
});
```

### 3. JWT Theft

**Scenario**: Attacker steals a valid JWT

**Defense**:
```javascript
// ✅ Short expiration
JWT_ACCESS_EXPIRATION=15m

// ✅ Implement token blacklist (advanced)
const blacklistedTokens = new Set();

router.post('/logout', authenticateToken, (req, res) => {
    const token = req.headers['authorization'].split(' ')[1];
    blacklistedTokens.add(token);
    res.clearCookie('refreshToken');
    res.json({ message: 'Logged out' });
});

// Check blacklist in middleware
const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    
    if (blacklistedTokens.has(token)) {
        return res.status(401).json({ error: 'Token revoked' });
    }
    // ... rest of verification
};
```

### 4. Brute Force Attacks

**Attack**: Trying many password combinations

**Defense**:
```javascript
// Option 1: Install rate limiter
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts
    message: 'Muitas tentativas de login. Tente novamente em 15 minutos.',
    standardHeaders: true,
    legacyHeaders: false,
});

router.post('/login', loginLimiter, async (req, res) => {
    // ... login logic
});

// Option 2: Manual attempt tracking (simple version)
const loginAttempts = new Map();

router.post('/login', async (req, res) => {
    const { email } = req.body;
    const attempts = loginAttempts.get(email) || 0;
    
    if (attempts >= 5) {
        return res.status(429).json({
            error: 'Muitas tentativas. Tente novamente mais tarde.'
        });
    }
    
    const user = findUserByEmail(email);
    const passwordMatch = await comparePassword(req.body.password, user.password);
    
    if (!passwordMatch) {
        loginAttempts.set(email, attempts + 1);
        return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    
    // Success - reset attempts
    loginAttempts.delete(email);
    // ... rest of login
});
```

### 5. Timing Attacks

**Attack**: Determining if email exists by response time

**Defense**:
```javascript
// ❌ Reveals if email exists
const user = findUserByEmail(email);
if (!user) {
    return res.status(401).json({ error: 'Email não encontrado' });
}
if (!await comparePassword(password, user.password)) {
    return res.status(401).json({ error: 'Senha incorreta' });
}

// ✅ Same response for both cases
const user = findUserByEmail(email);
if (!user) {
    // Still compare with dummy hash to maintain timing
    await bcrypt.compare(password, '$2a$10$dummy.hash.to.maintain.timing.consistency');
    return res.status(401).json({ error: 'Credenciais inválidas' });
}

const passwordMatch = await comparePassword(password, user.password);
if (!passwordMatch) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
}
```

## Environment-Specific Security

### Development
```env
NODE_ENV=development
JWT_ACCESS_EXPIRATION=1h
JWT_REFRESH_EXPIRATION=30d
COOKIE_SECURE=false
```

### Production
```env
NODE_ENV=production
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d
COOKIE_SECURE=true
```

### Production Checklist

- [ ] All secrets are environment variables
- [ ] `.env` is in `.gitignore`
- [ ] HTTPS enabled (`secure: true` cookies)
- [ ] CORS restricted to specific origins
- [ ] Rate limiting implemented
- [ ] Password requirements enforced
- [ ] Error messages don't reveal sensitive info
- [ ] Logging doesn't include passwords/tokens
- [ ] Dependencies updated (`npm audit`)
- [ ] Input validation on all endpoints
- [ ] SQL injection prevention (if using DB)
- [ ] Token expiration appropriate for use case

## Secure Logging

#### ❌ Bad Logging:
```javascript
console.log('Login attempt:', req.body); // Contains password!
console.log('Token:', accessToken); // Exposes token!
```

#### ✅ Good Logging:
```javascript
console.log('Login attempt:', { email: req.body.email });
console.log('Token generated for user:', userId);

// Sanitize errors before logging
catch (error) {
    console.error('Login error:', {
        message: error.message,
        userId: user?.id
        // Don't log: password, token, stack trace in production
    });
}
```

## Security Headers

Add security headers middleware:

```javascript
// Install helmet
// npm install helmet

const helmet = require('helmet');

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
        },
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));
```

## Data Privacy

### What to Include in JWT:
- ✅ User ID
- ✅ Email
- ✅ User role/permissions
- ✅ Non-sensitive preferences

### What NOT to Include:
- ❌ Password (even hashed)
- ❌ Credit card info
- ❌ Social security numbers
- ❌ Private keys
- ❌ API secrets

**Remember**: JWT payload can be decoded by anyone!

```javascript
// Anyone can do this:
const payload = JSON.parse(atob(token.split('.')[1]));
console.log(payload); // Sees all data!
```

## Next Steps

Your authentication is now secure! Time to test it.

**Continue to [Part 5: Testing](./05_testing.md)**
