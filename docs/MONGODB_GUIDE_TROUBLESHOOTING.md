# 🔧 MongoDB Migration - Troubleshooting Guide

## Common Issues & Solutions

---

## 1. Connection Issues

### Error: "MONGODB_URI not found in .env"

**Cause:** Missing environment variable

**Solution:**
```bash
# Check .env file exists
ls -la .env

# Add MONGODB_URI
echo "MONGODB_URI=mongodb://localhost:27017/finapp" >> .env
```

---

### Error: "MongoServerError: connect ECONNREFUSED"

**Cause:** MongoDB not running

**Solution:**

**Mac:**
```bash
brew services start mongodb-community@7.0
```

**Docker:**
```bash
docker start mongodb
# Or create new:
docker run -d -p 27017:27017 --name mongodb mongo:7.0
```

**Verify:**
```bash
# Check if running
ps aux | grep mongod

# Or try connecting
mongosh
```

---

### Error: "MongoServerError: bad auth"

**Cause:** Wrong credentials

**Solution:**
```env
# Atlas connection string format:
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@cluster.mongodb.net/finapp

# Check:
# 1. Username is correct
# 2. Password doesn't have special characters (encode if needed)
# 3. Database name is correct
```

**Encode special characters:**
```javascript
// If password is: P@ss!word
// Encode it: P%40ss%21word
```

---

### Error: "IP not whitelisted" (Atlas)

**Cause:** Atlas blocks your IP

**Solution:**
1. Go to Atlas dashboard
2. Network Access → Add IP Address
3. For development: Add `0.0.0.0/0` (allows all)
4. For production: Add specific IPs

---

## 2. Schema/Validation Errors

### Error: "User validation failed: email: Email inválido"

**Cause:** Invalid email format

**Solution:**
```javascript
// Ensure email is valid
email: "user@example.com"  // ✅
email: "invalid-email"      // ❌
```

---

### Error: "E11000 duplicate key error"

**Cause:** Trying to create user with existing email

**Solution:**
```javascript
// Check if user exists before creating
const existing = await userService.findByEmail(email);
if (existing) {
  return res.status(400).json({ error: 'Email já cadastrado' });
}
```

---

### Error: "Cast to ObjectId failed"

**Cause:** Invalid ObjectId format

**Solution:**
```javascript
const mongoose = require('mongoose');

// Validate before querying
if (!mongoose.Types.ObjectId.isValid(id)) {
  return res.status(400).json({ error: 'ID inválido' });
}

const user = await User.findById(id);
```

---

## 3. Embedded Document Issues

### Problem: Changes not saving

**Wrong:**
```javascript
const user = await User.findById(id);
user.transactions[0].description = "New";  // ❌ Won't save!
```

**Correct:**
```javascript
const user = await User.findById(id);
const transaction = user.transactions.id(transactionId);
transaction.description = "New";
await user.save();  // ✅ Saves changes
```

---

### Problem: Can't find subdocument by ID

**Wrong:**
```javascript
const transaction = user.transactions.find(t => t._id === id);  // ❌
```

**Correct:**
```javascript
// Method 1: Use .id()
const transaction = user.transactions.id(id);  // ✅

// Method 2: Convert to string
const transaction = user.transactions.find(
  t => t._id.toString() === id
);  // ✅
```

---

## 4. Async/Await Issues

### Error: "Cannot read property 'transactions' of null"

**Cause:** Forgot to await

**Wrong:**
```javascript
const user = User.findById(id);  // ❌ Returns Promise!
user.transactions.push(...);     // ❌ Crashes
```

**Correct:**
```javascript
const user = await User.findById(id);  // ✅
user.transactions.push(...);           // ✅
await user.save();                     // ✅
```

---

### Error: "UnhandledPromiseRejectionWarning"

**Cause:** Missing try/catch

**Wrong:**
```javascript
router.post('/', async (req, res) => {
  const user = await User.findById(id);  // ❌ No error handling
  res.json(user);
});
```

**Correct:**
```javascript
router.post('/', async (req, res) => {
  try {
    const user = await User.findById(id);  // ✅
    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro interno' });
  }
});
```

---

## 5. JWT/Auth Issues

### Error: "User not found" after login

**Cause:** JWT contains old UUID instead of new ObjectId

**Solution:** Clear tokens and login again

**Frontend:**
```javascript
sessionStorage.clear();
localStorage.clear();
// Then login again
```

---

### Error: "Cannot read '_id' of undefined"

**Cause:** User document not properly attached to req

**Solution:**
```javascript
// In auth middleware
req.user = { 
  ...userWithoutPassword, 
  id: user._id.toString()  // ✅ Convert to string
};
```

---

## 6. Data Migration Issues

### Problem: Old UUID IDs in database

**Cause:** Mixed data from old and new system

**Solution:** Clean slate - drop database and reseed

```bash
# In mongo shell
use finapp
db.dropDatabase()

# Then reseed
npm run seed
```

---

### Problem: Missing default categories

**Cause:** User created without categories

**Solution:** Add categories to existing user

```javascript
// Migration script
const User = require('./models/User.model');

async function addDefaultCategories() {
  const users = await User.find({ categories: { $size: 0 } });
  
  for (const user of users) {
    user.categories = User.getDefaultCategories();
    await user.save();
  }
}
```

---

## 7. Performance Issues

### Problem: Slow queries

**Solution:** Add indexes

```javascript
// In User.model.js
userSchema.index({ email: 1 });
userSchema.index({ 'transactions.timestamp': -1 });
userSchema.index({ 'transactions.category': 1 });
```

---

### Problem: Large embedded arrays

**Cause:** User has 10,000+ transactions

**Solution:** Consider pagination

```javascript
// Get recent transactions
router.get('/records/recent', async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const user = await User.findById(req.user.id)
    .select({
      transactions: { $slice: -limit }  // Last N transactions
    });
  res.json(user.transactions);
});
```

---

## 8. Development vs Production

### Problem: Works locally, fails in production

**Common causes:**

1. **Environment variables:**
```bash
# Check production .env
MONGODB_URI=mongodb+srv://...  # ✅ Not localhost
NODE_ENV=production
```

2. **CORS:**
```javascript
// Update FRONTEND_URL for production
FRONTEND_URL=https://your-frontend.com
```

3. **SSL/TLS:**
```javascript
// Mongoose connection for production
const options = {
  ssl: true,  // Enable for Atlas
  sslValidate: true
};
```

---

## 9. Debugging Tips

### Enable Mongoose Debug Mode

```javascript
// In server.js or app.js
if (process.env.NODE_ENV === 'development') {
  mongoose.set('debug', true);  // Logs all queries
}
```

### Check Database Contents

```bash
# Connect to mongo shell
mongosh mongodb://localhost:27017/finapp

# View users
db.users.find().pretty()

# Count documents
db.users.countDocuments()

# Find specific user
db.users.findOne({ email: "test@example.com" })

# Check indexes
db.users.getIndexes()
```

### Monitor Connections

```javascript
// Add to database.js
mongoose.connection.on('connected', () => {
  console.log('✅ Connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️  MongoDB disconnected');
});
```

---

## 10. Getting Help

### Check Mongoose Docs
- https://mongoosejs.com/docs/guide.html

### MongoDB University (Free)
- https://university.mongodb.com/

### Stack Overflow
- Tag: `[mongoose]` and `[mongodb]`

### GitHub Issues
- Mongoose: https://github.com/Automattic/mongoose/issues

---

## Quick Fixes Summary

| Issue | Quick Fix |
|-------|-----------|
| Connection refused | `brew services start mongodb-community` |
| Bad auth | Check MONGODB_URI credentials |
| Duplicate email | Check if user exists before create |
| Cast to ObjectId | Validate ID with `mongoose.Types.ObjectId.isValid()` |
| Changes not saving | Call `await user.save()` |
| Can't find subdoc | Use `user.transactions.id(id)` |
| UnhandledPromiseRejection | Add try/catch |
| Slow queries | Add indexes |

---

## Still Having Issues?

1. **Check logs:** Look for error stack traces
2. **Isolate problem:** Test one endpoint at a time
3. **Use Postman:** Test API directly
4. **Check MongoDB Compass:** Verify data structure
5. **Enable debug mode:** See all queries
6. **Ask for help:** Provide error message + code

---

**Remember:** Most issues are from:
- ❌ Forgetting `await`
- ❌ Not calling `.save()`
- ❌ Wrong ID format
- ❌ Missing environment variables
