# Part 2: Setup & Configuration

## Step 1: Install Dependencies

Run this command in your backend directory:

```bash
npm install jsonwebtoken bcryptjs cookie-parser dotenv
```

### What Each Package Does

| Package | Purpose |
|---------|---------|
| `jsonwebtoken` | Create and verify JWT tokens |
| `bcryptjs` | Hash and compare passwords securely |
| `cookie-parser` | Parse HTTP cookies from requests |
| `dotenv` | Load environment variables from .env file |

## Step 2: Create Environment File

Create `.env` file in your backend root:

```bash
# JWT Configuration
JWT_ACCESS_SECRET=your_access_secret_here_minimum_32_characters_required
JWT_REFRESH_SECRET=your_refresh_secret_here_minimum_32_characters_required
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d

# Server Configuration
NODE_ENV=development
PORT=3000

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:3001
```

### Generate Secure Secrets

**IMPORTANT**: Never use weak secrets! Run this command **3 times** to generate 3 different secrets:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Copy each output to:
1. `JWT_ACCESS_SECRET`
2. `JWT_REFRESH_SECRET`
3. Create a `COOKIE_SECRET` (optional, for signed cookies)

### Example Output
```
f8e7d6c5b4a3920918273645f8e7d6c5b4a3920918273645f8e7d6c5b4a39209
```

## Step 3: Secure Your .env File

Add `.env` to your `.gitignore`:

```gitignore
# Environment variables
.env
.env.local
.env.*.local

# Already in your .gitignore probably:
node_modules/
```

**⚠️ Critical:** NEVER commit `.env` to Git!

## Step 4: Update app.js

Load environment variables and configure middleware:

```javascript
// Add at the VERY TOP of app.js (before any other imports)
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser'); // NEW

const financialRecordsRouter = require('./routes/financialRecords.routes.js');
const userDataRouter = require('./routes/userData.routes.js');
const categoriesRouter = require('./routes/categories.routes.js');
const requestLogger = require('./middlewares/requestLogger');

const app = express();

// Update CORS configuration to allow credentials
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3001',
    credentials: true, // IMPORTANT: Allows cookies to be sent
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(cookieParser()); // NEW: Parse cookies
app.use(requestLogger);

app.use('/records', financialRecordsRouter);
app.use('/users', userDataRouter);
app.use('/categories', categoriesRouter);

module.exports = app;
```

### What Changed?
1. **`dotenv`**: Loads environment variables from `.env`
2. **`cookie-parser`**: Parses cookies from requests
3. **CORS credentials**: Allows cookies to be sent cross-origin
4. **CORS origin**: Restricts to your frontend URL only

## Step 5: Verify Configuration

Create a test endpoint to verify env variables are loading:

```javascript
// Add to app.js temporarily (remove after testing)
app.get('/test-env', (req, res) => {
    res.json({
        hasAccessSecret: !!process.env.JWT_ACCESS_SECRET,
        hasRefreshSecret: !!process.env.JWT_REFRESH_SECRET,
        nodeEnv: process.env.NODE_ENV,
        frontendUrl: process.env.FRONTEND_URL
    });
});
```

Start your server and visit: `http://localhost:3000/test-env`

Expected output:
```json
{
  "hasAccessSecret": true,
  "hasRefreshSecret": true,
  "nodeEnv": "development",
  "frontendUrl": "http://localhost:3001"
}
```

✅ If all values are correct, you're good to go!
❌ If `hasAccessSecret` or `hasRefreshSecret` is false, check your `.env` file.

## Step 6: Create Directory Structure

Create these new directories and files:

```bash
mkdir -p src/utils
mkdir -p src/middlewares
```

Your structure should look like:
```
fin_app_backend/
├── .env                    # NEW - Environment variables
├── .gitignore             
├── package.json
├── server.js
└── src/
    ├── app.js             # UPDATED
    ├── data/
    │   └── userData.js
    ├── middlewares/
    │   ├── auth.middleware.js    # TO CREATE
    │   ├── createError.js
    │   ├── requestLogger.js
    │   └── userValidation.js
    ├── routes/
    │   ├── categories.routes.js
    │   ├── financialRecords.routes.js
    │   └── userData.routes.js    # TO UPDATE
    └── utils/                     # NEW DIRECTORY
        ├── jwt.utils.js          # TO CREATE
        └── password.utils.js     # TO CREATE
```

## Configuration Checklist

Before moving to Part 3, verify:

- [ ] All npm packages installed
- [ ] `.env` file created with secure secrets
- [ ] `.env` added to `.gitignore`
- [ ] `app.js` updated with dotenv and cookie-parser
- [ ] CORS configured with `credentials: true`
- [ ] Test endpoint shows secrets are loaded
- [ ] Directory structure created

## Troubleshooting

### Issue: "Cannot find module 'dotenv'"
**Solution**: Run `npm install dotenv`

### Issue: Environment variables are undefined
**Solution**: 
1. Make sure `.env` is in the backend root (same level as `package.json`)
2. Check for typos in variable names
3. Restart your server after creating/editing `.env`

### Issue: CORS errors with cookies
**Solution**: 
1. Verify `credentials: true` in CORS config
2. Check `origin` matches your frontend URL exactly
3. Ensure frontend sends `credentials: 'include'` in fetch requests

## Next Steps

Environment is configured! Now let's write the authentication code.

**Continue to [Part 3: Core Implementation](./03_implementation.md)**
