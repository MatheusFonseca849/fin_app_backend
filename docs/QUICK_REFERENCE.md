# JWT Authentication - Quick Reference

## Installation

```bash
npm install jsonwebtoken bcryptjs cookie-parser dotenv
```

## Environment Setup

```env
JWT_ACCESS_SECRET=<64-char-random-string>
JWT_REFRESH_SECRET=<64-char-random-string>
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d
NODE_ENV=development
FRONTEND_URL=http://localhost:3001
```

Generate secrets:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## Key Files to Create

```
src/
├── utils/
│   ├── jwt.utils.js          # Token generation/verification
│   └── password.utils.js     # Password hashing
├── middlewares/
│   └── auth.middleware.js    # Authentication middleware
└── routes/
    └── userData.routes.js    # Update with JWT endpoints
```

## Essential Code Snippets

### Generate Token
```javascript
const jwt = require('jsonwebtoken');

const token = jwt.sign(
    { userId: user.id, email: user.email },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '15m' }
);
```

### Verify Token
```javascript
try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    console.log(decoded.userId);
} catch (error) {
    console.error('Invalid token');
}
```

### Hash Password
```javascript
const bcrypt = require('bcryptjs');

// Hash
const hashed = await bcrypt.hash(password, 10);

// Compare
const match = await bcrypt.compare(password, hashed);
```

### Set HTTP-Only Cookie
```javascript
res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
});
```

### Authentication Middleware
```javascript
const authenticateToken = async (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Token required' });
    }
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        req.user = findUserById(decoded.userId);
        next();
    } catch (error) {
        return res.status(403).json({ error: 'Invalid token' });
    }
};
```

### Protected Route
```javascript
router.get('/protected', authenticateToken, (req, res) => {
    res.json({ user: req.user });
});
```

## API Endpoints

### POST /users/register
```json
Request:
{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "securepassword"
}

Response (201):
{
    "accessToken": "eyJhbGc...",
    "user": { "id": "...", "name": "John Doe", ... }
}
```

### POST /users/login
```json
Request:
{
    "email": "john@example.com",
    "password": "securepassword"
}

Response (200):
{
    "accessToken": "eyJhbGc...",
    "user": { "id": "...", "name": "John Doe", ... }
}
```

### POST /users/refresh
```json
Request: (with refreshToken cookie)

Response (200):
{
    "accessToken": "eyJhbGc..."
}
```

### POST /users/logout
```json
Request: Authorization: Bearer <token>

Response (200):
{
    "message": "Logout realizado com sucesso"
}
```

### GET /users/me
```json
Request: Authorization: Bearer <token>

Response (200):
{
    "id": "...",
    "name": "John Doe",
    "email": "john@example.com",
    ...
}
```

## Frontend Integration

### API Request with Token
```javascript
const response = await fetch('http://localhost:3000/records', {
    headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
    },
    credentials: 'include' // Important for cookies!
});
```

### Auto-Refresh Pattern
```javascript
const apiRequest = async (url, options = {}) => {
    let response = await fetch(url, {
        ...options,
        headers: {
            ...options.headers,
            'Authorization': `Bearer ${accessToken}`
        },
        credentials: 'include'
    });
    
    // If token expired, refresh and retry
    if (response.status === 403) {
        await refreshAccessToken();
        response = await fetch(url, {
            ...options,
            headers: {
                ...options.headers,
                'Authorization': `Bearer ${accessToken}`
            },
            credentials: 'include'
        });
    }
    
    return response;
};
```

## Common HTTP Status Codes

| Code | Meaning | Use Case |
|------|---------|----------|
| 200 | OK | Successful request |
| 201 | Created | User/resource created |
| 400 | Bad Request | Invalid input |
| 401 | Unauthorized | Missing/invalid credentials |
| 403 | Forbidden | Valid token but no permission |
| 404 | Not Found | Resource doesn't exist |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |

## Security Best Practices

### ✅ DO
- Use strong, random secrets (min 32 chars)
- Hash passwords with bcrypt (salt rounds: 10-12)
- Use HTTP-only cookies for refresh tokens
- Short expiration for access tokens (15 min)
- Enable CORS with specific origins
- Validate all inputs
- Log authentication events
- Use HTTPS in production
- Implement rate limiting
- Never log passwords or tokens

### ❌ DON'T
- Hardcode secrets in code
- Store passwords in plain text
- Store refresh tokens in localStorage
- Use long expiration for access tokens (>1 hour)
- Allow CORS from `*` with credentials
- Reveal if email exists in error messages
- Store sensitive data in JWT payload
- Use synchronous bcrypt in routes
- Allow unlimited login attempts
- Commit `.env` to Git

## Testing with Postman

1. **Login/Register**: Save `accessToken` from response
2. **Protected Routes**: Add header: `Authorization: Bearer <token>`
3. **Refresh**: Ensure cookies are enabled in Postman settings
4. **Logout**: Send request with token, verify cookie is cleared

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Token required" | Add `Authorization: Bearer <token>` header |
| CORS error | Check `credentials: true` in CORS config |
| Cookie not set | Verify `credentials: 'include'` in fetch |
| "Invalid token" | Check secrets match, restart server |
| "Token expired" | Implement refresh token flow |
| Infinite redirects | Check loading state in protected routes |

## Token Lifecycle

```
1. User logs in
   ↓
2. Server generates access token (15min) + refresh token (7d)
   ↓
3. Access token sent in response, refresh token in cookie
   ↓
4. Client stores access token in memory
   ↓
5. Client sends access token with each request
   ↓
6. After 15 minutes, access token expires
   ↓
7. Client calls /refresh with cookie
   ↓
8. Server verifies refresh token, issues new access token
   ↓
9. Repeat from step 5
   ↓
10. After 7 days, refresh token expires
    ↓
11. User must login again
```

## File Structure

```
fin_app_backend/
├── .env                          # Environment variables
├── .gitignore                    # Must include .env
├── package.json
├── server.js
├── docs/                         # This guide
│   ├── JWT_GUIDE.md
│   ├── 01_understanding_jwt.md
│   ├── 02_setup.md
│   ├── 03_implementation.md
│   ├── 04_security.md
│   ├── 05_testing.md
│   ├── 06_frontend.md
│   ├── 07_advanced_topics.md
│   └── QUICK_REFERENCE.md       # You are here
└── src/
    ├── app.js                    # Express app with CORS
    ├── data/
    │   └── userData.js           # User data (hash passwords!)
    ├── middlewares/
    │   ├── auth.middleware.js    # JWT verification
    │   ├── createError.js
    │   ├── requestLogger.js
    │   └── userValidation.js
    ├── routes/
    │   ├── categories.routes.js  # Protected with JWT
    │   ├── financialRecords.routes.js  # Protected with JWT
    │   └── userData.routes.js    # Auth endpoints
    └── utils/
        ├── jwt.utils.js          # Token functions
        └── password.utils.js     # Password functions
```

## Next Steps

1. Read the full guide in `docs/JWT_GUIDE.md`
2. Implement step by step following parts 1-6
3. Test thoroughly using part 5
4. Consider advanced features in part 7
5. Deploy securely to production

## Resources

- [JWT.io](https://jwt.io) - Decode and verify JWTs
- [jsonwebtoken npm](https://www.npmjs.com/package/jsonwebtoken)
- [bcryptjs npm](https://www.npmjs.com/package/bcryptjs)
- [RFC 7519](https://tools.ietf.org/html/rfc7519) - JWT Standard
- [OWASP Auth Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

---

**Good luck with your implementation!** 🚀
