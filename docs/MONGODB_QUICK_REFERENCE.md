# 🚀 MongoDB Quick Reference Card

## Most Common Operations

### Connect to Database
```javascript
const database = require('./config/database');
await database.connect();
```

---

## User Operations

### Create User
```javascript
const User = require('./models/User.model');

const user = new User({
  name: "Matheus",
  email: "email@example.com",
  password: hashedPassword,
  categories: User.getDefaultCategories()
});

await user.save();
```

### Find User
```javascript
// By ID
const user = await User.findById(id);

// By Email
const user = await User.findByEmail(email);
const user = await User.findOne({ email });

// All users
const users = await User.find();
```

### Update User
```javascript
// Method 1: Find and update
const user = await User.findByIdAndUpdate(
  id,
  { name: "New Name" },
  { new: true, runValidators: true }
);

// Method 2: Find, modify, save
const user = await User.findById(id);
user.name = "New Name";
await user.save();
```

### Delete User
```javascript
await User.findByIdAndDelete(id);
```

---

## Transaction Operations

### Add Transaction
```javascript
const user = await User.findById(userId);
user.transactions.push({
  description: "Supermercado",
  value: -150.50,
  type: "debito",
  category: "Alimentação"
});
await user.save();
```

### Get Transactions
```javascript
const user = await User.findById(userId).select('transactions');
const transactions = user.transactions;
```

### Update Transaction
```javascript
const user = await User.findById(userId);
const transaction = user.transactions.id(transactionId);
transaction.description = "Updated";
transaction.value = -200.00;
await user.save();
```

### Delete Transaction
```javascript
const user = await User.findById(userId);
user.transactions.pull(transactionId);
await user.save();
```

---

## Category Operations

### Add Category
```javascript
const user = await User.findById(userId);
user.categories.push({
  name: "Educação",
  type: "debito",
  color: "#9B59B6",
  isDefault: false
});
await user.save();
```

### Find Category
```javascript
const user = await User.findById(userId);
const category = user.categories.id(categoryId);
// Or by name
const category = user.categories.find(c => c.name === "Educação");
```

### Update Category
```javascript
const user = await User.findById(userId);
const category = user.categories.id(categoryId);
category.name = "New Name";
category.color = "#FF0000";
await user.save();
```

### Delete Category
```javascript
const user = await User.findById(userId);
user.categories.pull(categoryId);
await user.save();
```

---

## Query Patterns

### Select Specific Fields
```javascript
// Only get email and name
const user = await User.findById(id).select('name email');

// Exclude password
const user = await User.findById(id).select('-password');
```

### Query with Conditions
```javascript
// Find users created after date
const users = await User.find({
  createdAt: { $gte: new Date('2025-01-01') }
});

// Find users with transactions
const users = await User.find({
  'transactions.0': { $exists: true }
});
```

### Limit and Sort
```javascript
// Get 10 most recent users
const users = await User.find()
  .sort({ createdAt: -1 })
  .limit(10);
```

---

## Common Checks

### Check if Exists
```javascript
const exists = await User.exists({ email });
if (exists) {
  // User already exists
}
```

### Count Documents
```javascript
const count = await User.countDocuments({ email: { $exists: true } });
```

### Validate ObjectId
```javascript
const mongoose = require('mongoose');

if (!mongoose.Types.ObjectId.isValid(id)) {
  throw new Error('Invalid ID');
}
```

---

## Error Handling

### Try/Catch Pattern
```javascript
try {
  const user = await User.findById(id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json(user);
} catch (error) {
  console.error('Error:', error);
  res.status(500).json({ error: 'Internal server error' });
}
```

### Handle Validation Errors
```javascript
try {
  await user.save();
} catch (error) {
  if (error.name === 'ValidationError') {
    return res.status(400).json({ error: error.message });
  }
  throw error;
}
```

---

## Aggregation Examples

### Count Transactions by Type
```javascript
const result = await User.aggregate([
  { $match: { _id: mongoose.Types.ObjectId(userId) } },
  { $unwind: '$transactions' },
  { $group: {
    _id: '$transactions.type',
    count: { $sum: 1 },
    total: { $sum: '$transactions.value' }
  }}
]);
```

### Get Monthly Summary
```javascript
const summary = await User.aggregate([
  { $match: { _id: mongoose.Types.ObjectId(userId) } },
  { $unwind: '$transactions' },
  { $group: {
    _id: {
      year: { $year: '$transactions.timestamp' },
      month: { $month: '$transactions.timestamp' }
    },
    income: {
      $sum: {
        $cond: [
          { $eq: ['$transactions.type', 'credito'] },
          '$transactions.value',
          0
        ]
      }
    },
    expenses: {
      $sum: {
        $cond: [
          { $eq: ['$transactions.type', 'debito'] },
          { $abs: '$transactions.value' },
          0
        ]
      }
    }
  }}
]);
```

---

## Useful Commands

### Mongo Shell
```bash
# Connect
mongosh mongodb://localhost:27017/finapp

# Show databases
show dbs

# Use database
use finapp

# Show collections
show collections

# Find all users
db.users.find()

# Find one user
db.users.findOne({ email: "test@example.com" })

# Count users
db.users.countDocuments()

# Delete all data (careful!)
db.users.deleteMany({})

# Drop collection
db.users.drop()

# Drop database
db.dropDatabase()
```

### Backup/Restore
```bash
# Backup
mongodump --db=finapp --out=./backup

# Restore
mongorestore --db=finapp ./backup/finapp

# Export to JSON
mongoexport --db=finapp --collection=users --out=users.json

# Import from JSON
mongoimport --db=finapp --collection=users --file=users.json
```

---

## Tips & Tricks

### Always await
```javascript
// ❌ Wrong
const user = User.findById(id);

// ✅ Correct
const user = await User.findById(id);
```

### Always save after modifying
```javascript
const user = await User.findById(id);
user.name = "New Name";
await user.save();  // ✅ Don't forget!
```

### Use .id() for subdocuments
```javascript
// ✅ Easiest way
const transaction = user.transactions.id(transactionId);

// ✅ Alternative
const transaction = user.transactions.find(
  t => t._id.toString() === transactionId
);
```

### Convert ObjectId to string
```javascript
const userId = user._id.toString();
```

### Check if document exists
```javascript
const user = await User.findById(id);
if (!user) {
  throw new Error('User not found');
}
```

---

## Common Mistakes to Avoid

### ❌ Forgetting await
```javascript
const user = User.findById(id);  // Returns Promise!
user.name = "Test";  // Crashes!
```

### ❌ Not calling save()
```javascript
const user = await User.findById(id);
user.transactions[0].value = -200;  // Won't persist!
```

### ❌ Comparing ObjectIds directly
```javascript
if (transaction._id === id)  // ❌ Always false!
if (transaction._id.toString() === id)  // ✅ Works!
```

### ❌ Not handling errors
```javascript
// ❌ No error handling
await User.findById(invalidId);

// ✅ With error handling
try {
  await User.findById(invalidId);
} catch (error) {
  console.error(error);
}
```

---

## Performance Tips

### Use indexes
```javascript
// In schema
userSchema.index({ email: 1 });
userSchema.index({ 'transactions.timestamp': -1 });
```

### Select only needed fields
```javascript
// ❌ Gets everything
const user = await User.findById(id);

// ✅ Only what you need
const user = await User.findById(id).select('name email');
```

### Use lean() for read-only
```javascript
// Returns plain JavaScript object (faster)
const user = await User.findById(id).lean();
```

---

Keep this reference handy! 📌
