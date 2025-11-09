# Part 5: Testing Your JWT Implementation

## Manual Testing with Postman/Insomnia

### Setup

1. Download [Postman](https://www.postman.com/) or [Insomnia](https://insomnia.rest/)
2. Start your backend server: `npm run dev`
3. Test each endpoint below

---

## Test 1: User Registration

### Request
```http
POST http://localhost:3000/users/register
Content-Type: application/json

{
    "name": "Test User",
    "email": "test@example.com",
    "password": "securepassword123"
}
```

### Expected Response (201 Created)
```json
{
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
        "id": "some-uuid",
        "name": "Test User",
        "email": "test@example.com",
        "balance": 0,
        "recurrentCredits": [],
        "recurrentDebits": [],
        "transactions": [],
        "categories": [...]
    }
}
```

### Verify
- ✅ Status code is 201
- ✅ Response includes `accessToken`
- ✅ User object doesn't include `password`
- ✅ Cookie named `refreshToken` is set (check cookies tab)
- ✅ Cookie has `HttpOnly` flag

### Test Failures

**Duplicate Email:**
```http
POST http://localhost:3000/users/register
Content-Type: application/json

{
    "name": "Test User 2",
    "email": "test@example.com",
    "password": "password123"
}
```

Expected: `400 Bad Request` - "Usuário já existe"

**Weak Password:**
```json
{
    "name": "Test User",
    "email": "weak@example.com",
    "password": "123"
}
```

Expected: `400 Bad Request` - "Senha deve ter no mínimo 6 caracteres"

---

## Test 2: User Login

### Request
```http
POST http://localhost:3000/users/login
Content-Type: application/json

{
    "email": "matheusfonseca@gmail.com",
    "password": "123456"
}
```

### Expected Response (200 OK)
```json
{
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
        "id": "317f632f-6149-4f77-aa02-1af65cad1750",
        "name": "Matheus Fonseca",
        "email": "matheusfonseca@gmail.com",
        ...
    }
}
```

### Verify
- ✅ Status code is 200
- ✅ Access token returned
- ✅ Refresh token cookie set
- ✅ No password in response

### Test Failures

**Wrong Password:**
```json
{
    "email": "matheusfonseca@gmail.com",
    "password": "wrongpassword"
}
```

Expected: `401 Unauthorized` - "Credenciais inválidas"

**Non-existent Email:**
```json
{
    "email": "notfound@example.com",
    "password": "123456"
}
```

Expected: `401 Unauthorized` - "Credenciais inválidas"

---

## Test 3: Access Protected Route

### Request
```http
GET http://localhost:3000/records
Authorization: Bearer <paste_your_access_token_here>
```

**How to get token:**
1. Copy `accessToken` from login/register response
2. In Postman: Headers tab → Add `Authorization: Bearer <token>`
3. In Insomnia: Auth tab → Bearer Token → Paste token

### Expected Response (200 OK)
```json
[
    {
        "id": "...",
        "timestamp": "2025-10-05T00:00:00.000Z",
        "description": "Supermercado",
        "value": -150.50,
        "type": "debito",
        "category": "Alimentação",
        "userId": "317f632f-6149-4f77-aa02-1af65cad1750"
    },
    ...
]
```

### Test Failures

**No Token:**
```http
GET http://localhost:3000/records
```

Expected: `401 Unauthorized` - "Token de acesso não fornecido"

**Invalid Token:**
```http
GET http://localhost:3000/records
Authorization: Bearer invalid_token_here
```

Expected: `403 Forbidden` - "Token inválido"

**Expired Token:**
(Wait 15+ minutes or change JWT_ACCESS_EXPIRATION to 1m for testing)

Expected: `403 Forbidden` - "Token expirado"

---

## Test 4: Get Current User

### Request
```http
GET http://localhost:3000/users/me
Authorization: Bearer <your_access_token>
```

### Expected Response (200 OK)
```json
{
    "id": "317f632f-6149-4f77-aa02-1af65cad1750",
    "name": "Matheus Fonseca",
    "email": "matheusfonseca@gmail.com",
    "balance": 0,
    ...
}
```

### Verify
- ✅ Returns current user's data
- ✅ No password field

---

## Test 5: Refresh Access Token

### Request
```http
POST http://localhost:3000/users/refresh
```

**Important**: You must include cookies from previous login!

**In Postman:**
- Cookies are automatically included if you made the login request in the same Postman tab
- Or manually add Cookie header: `Cookie: refreshToken=<token>`

**In Insomnia:**
- Check "Automatically send cookies" in settings

### Expected Response (200 OK)
```json
{
    "accessToken": "new_token_here..."
}
```

### Verify
- ✅ New access token is different from old one
- ✅ New token works for protected routes

### Test Failures

**No Refresh Token:**
```http
POST http://localhost:3000/users/refresh
(without cookies)
```

Expected: `401 Unauthorized` - "Refresh token não fornecido"

---

## Test 6: Logout

### Request
```http
POST http://localhost:3000/users/logout
Authorization: Bearer <your_access_token>
```

### Expected Response (200 OK)
```json
{
    "message": "Logout realizado com sucesso"
}
```

### Verify
- ✅ Refresh token cookie is cleared
- ✅ Subsequent /refresh calls fail

---

## Test 7: Create Transaction

### Request
```http
POST http://localhost:3000/records
Authorization: Bearer <your_access_token>
Content-Type: application/json

{
    "description": "Test Transaction",
    "value": -50.00,
    "type": "debito",
    "category": "Alimentação"
}
```

### Expected Response (201 Created)
```json
{
    "id": "new-uuid",
    "timestamp": "2025-10-09T...",
    "description": "Test Transaction",
    "value": -50.00,
    "type": "debito",
    "category": "Alimentação",
    "userId": "your-user-id"
}
```

---

## Testing JWT Decode

You can decode JWTs to see their contents (remember: anyone can do this!).

### Online Tool
Visit [jwt.io](https://jwt.io) and paste your access token.

### In Browser Console
```javascript
function decodeJWT(token) {
    const parts = token.split('.');
    const payload = JSON.parse(atob(parts[1]));
    console.log(payload);
}

decodeJWT('your_token_here');
```

### Expected Payload
```json
{
    "userId": "317f632f-6149-4f77-aa02-1af65cad1750",
    "email": "matheusfonseca@gmail.com",
    "iat": 1696867200,
    "exp": 1696868100
}
```

**Verify:**
- ✅ `userId` matches logged-in user
- ✅ `exp` (expiration) is ~15 minutes after `iat` (issued at)
- ✅ No sensitive data (password, etc.)

---

## Automated Testing with Jest

Create `tests/auth.test.js`:

```javascript
const request = require('supertest');
const app = require('../src/app');

describe('JWT Authentication', () => {
    let accessToken;
    let testUser = {
        name: 'Test User',
        email: `test${Date.now()}@example.com`,
        password: 'testpassword123'
    };

    describe('POST /users/register', () => {
        it('should register a new user', async () => {
            const res = await request(app)
                .post('/users/register')
                .send(testUser)
                .expect(201);

            expect(res.body).toHaveProperty('accessToken');
            expect(res.body.user).toHaveProperty('id');
            expect(res.body.user.email).toBe(testUser.email);
            expect(res.body.user).not.toHaveProperty('password');
        });

        it('should reject duplicate email', async () => {
            await request(app)
                .post('/users/register')
                .send(testUser)
                .expect(400);
        });

        it('should reject weak password', async () => {
            await request(app)
                .post('/users/register')
                .send({
                    name: 'Test',
                    email: 'weak@test.com',
                    password: '123'
                })
                .expect(400);
        });
    });

    describe('POST /users/login', () => {
        it('should login with correct credentials', async () => {
            const res = await request(app)
                .post('/users/login')
                .send({
                    email: testUser.email,
                    password: testUser.password
                })
                .expect(200);

            expect(res.body).toHaveProperty('accessToken');
            accessToken = res.body.accessToken;
        });

        it('should reject wrong password', async () => {
            await request(app)
                .post('/users/login')
                .send({
                    email: testUser.email,
                    password: 'wrongpassword'
                })
                .expect(401);
        });
    });

    describe('GET /users/me', () => {
        it('should get current user with valid token', async () => {
            const res = await request(app)
                .get('/users/me')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(200);

            expect(res.body.email).toBe(testUser.email);
            expect(res.body).not.toHaveProperty('password');
        });

        it('should reject request without token', async () => {
            await request(app)
                .get('/users/me')
                .expect(401);
        });

        it('should reject invalid token', async () => {
            await request(app)
                .get('/users/me')
                .set('Authorization', 'Bearer invalid_token')
                .expect(403);
        });
    });

    describe('GET /records', () => {
        it('should get records with valid token', async () => {
            await request(app)
                .get('/records')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(200);
        });

        it('should reject without token', async () => {
            await request(app)
                .get('/records')
                .expect(401);
        });
    });
});
```

Run tests:
```bash
npm test
```

---

## Postman Collection

Create a collection for easy testing:

1. **Create Collection**: "FinApp Auth"
2. **Add Environment Variables**:
   - `baseUrl`: `http://localhost:3000`
   - `accessToken`: (will be set automatically)
   - `userId`: (will be set automatically)

3. **Add Pre-request Script to collection**:
```javascript
// Automatically use accessToken for authenticated requests
if (pm.environment.get('accessToken')) {
    pm.request.headers.add({
        key: 'Authorization',
        value: 'Bearer ' + pm.environment.get('accessToken')
    });
}
```

4. **Add Test Script to login/register**:
```javascript
// Save token after login/register
if (pm.response.code === 200 || pm.response.code === 201) {
    const response = pm.response.json();
    pm.environment.set('accessToken', response.accessToken);
    if (response.user) {
        pm.environment.set('userId', response.user.id);
    }
}
```

---

## Manual Testing Checklist

- [ ] User registration works
- [ ] Duplicate email rejected
- [ ] Weak password rejected
- [ ] Login with correct credentials works
- [ ] Login with wrong password fails
- [ ] Login with non-existent email fails
- [ ] Protected route works with token
- [ ] Protected route fails without token
- [ ] Protected route fails with invalid token
- [ ] /me endpoint returns current user
- [ ] Refresh token endpoint works
- [ ] Refresh fails without cookie
- [ ] Logout clears refresh token
- [ ] JWT decodes correctly at jwt.io
- [ ] Access token expires after 15 minutes
- [ ] Can refresh token before expiration

---

## Troubleshooting

### Issue: "Token de acesso não fornecido"
**Cause**: Missing Authorization header
**Fix**: Add header: `Authorization: Bearer <token>`

### Issue: "Token inválido"
**Cause**: Malformed token or wrong secret
**Fix**: 
1. Check .env has correct JWT_ACCESS_SECRET
2. Restart server after changing .env
3. Get a fresh token from /login

### Issue: "Refresh token não fornecido"
**Cause**: Cookie not being sent
**Fix**:
1. Enable "Send cookies" in Postman/Insomnia
2. Check CORS credentials are enabled
3. Verify cookie was set after login

### Issue: CORS errors
**Cause**: Credentials not configured
**Fix**:
```javascript
// Backend
app.use(cors({
    origin: 'http://localhost:3001',
    credentials: true
}));

// Frontend
fetch(url, {
    credentials: 'include'
});
```

---

## Next Steps

Everything working? Now let's integrate with your frontend!

**Continue to [Part 6: Frontend Integration](./06_frontend.md)**
