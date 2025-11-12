# 📚 MongoDB Migration Guide - Part 2: Creating Schemas

## Creating Your MongoDB Models

### Step 1: Create Directory Structure
```bash
cd src
mkdir models
mkdir models/schemas
```

---

## Subdocument Schemas

### File: `src/models/schemas/transaction.schema.js`
```javascript
const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  description: {
    type: String,
    required: [true, 'Descrição é obrigatória'],
    trim: true,
    maxlength: [500, 'Descrição muito longa']
  },
  value: {
    type: Number,
    required: [true, 'Valor é obrigatório']
  },
  type: {
    type: String,
    required: [true, 'Tipo é obrigatório'],
    enum: {
      values: ['credito', 'debito'],
      message: 'Tipo deve ser "credito" ou "debito"'
    }
  },
  category: {
    type: String,
    required: [true, 'Categoria é obrigatória']
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

module.exports = transactionSchema;
```

**Why this design?**
- `_id: true` - Each transaction has unique ID
- `enum` - Prevents typos
- `required` - Enforces data integrity
- `default` - Auto-sets timestamp

---

### File: `src/models/schemas/category.schema.js`
```javascript
const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Nome da categoria é obrigatório'],
    trim: true,
    maxlength: [100, 'Nome muito longo']
  },
  type: {
    type: String,
    required: [true, 'Tipo é obrigatório'],
    enum: ['credito', 'debito']
  },
  color: {
    type: String,
    required: [true, 'Cor é obrigatória'],
    match: [/^#[0-9A-F]{6}$/i, 'Cor inválida (use #RRGGBB)']
  },
  isDefault: {
    type: Boolean,
    default: false
  }
}, { _id: true });

module.exports = categorySchema;
```

**Why this design?**
- `match` - Validates hex color format
- `isDefault` - Marks system categories

---

## User Model

### File: `src/models/User.model.js`
```javascript
const mongoose = require('mongoose');
const transactionSchema = require('./schemas/transaction.schema');
const categorySchema = require('./schemas/category.schema');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Nome é obrigatório'],
    trim: true,
    minlength: [2, 'Nome muito curto'],
    maxlength: [200, 'Nome muito longo']
  },
  email: {
    type: String,
    required: [true, 'Email é obrigatório'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Email inválido']
  },
  password: {
    type: String,
    required: [true, 'Senha é obrigatória'],
    minlength: [6, 'Senha muito curta']
  },
  balance: {
    type: Number,
    default: 0
  },
  
  // Embedded arrays
  transactions: {
    type: [transactionSchema],
    default: []
  },
  recurrentCredits: {
    type: [transactionSchema],
    default: []
  },
  recurrentDebits: {
    type: [transactionSchema],
    default: []
  },
  categories: {
    type: [categorySchema],
    default: []
  }
}, {
  timestamps: true,  // Adds createdAt/updatedAt
  collection: 'users'
});

// ============================================
// INDEXES
// ============================================
userSchema.index({ 'transactions.timestamp': -1 });

// ============================================
// INSTANCE METHODS
// ============================================

userSchema.methods.calculateBalance = function() {
  return this.transactions.reduce((sum, t) => sum + t.value, 0);
};

userSchema.methods.findCategory = function(identifier) {
  return this.categories.find(c => 
    c.name === identifier || c._id.toString() === identifier
  );
};

// ============================================
// STATIC METHODS
// ============================================

userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

userSchema.statics.getDefaultCategories = function() {
  return [
    { name: 'Alimentação', type: 'debito', color: '#FF6B6B', isDefault: true },
    { name: 'Transporte', type: 'debito', color: '#4ECDC4', isDefault: true },
    { name: 'Saúde', type: 'debito', color: '#45B7D1', isDefault: true },
    { name: 'Contas', type: 'debito', color: '#FFA07A', isDefault: true },
    { name: 'Lazer', type: 'debito', color: '#98D8C8', isDefault: true },
    { name: 'Outros', type: 'debito', color: '#F7DC6F', isDefault: true },
    { name: 'Salário', type: 'credito', color: '#82E0AA', isDefault: true },
    { name: 'Freelance', type: 'credito', color: '#AED6F1', isDefault: true },
    { name: 'Sem Categoria', type: 'debito', color: '#D5DBDB', isDefault: true }
  ];
};

// ============================================
// MIDDLEWARE
// ============================================

userSchema.pre('save', function(next) {
  if (this.isModified('email')) {
    this.email = this.email.toLowerCase();
  }
  next();
});

userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;  // Don't return password in JSON
  return obj;
};

const User = mongoose.model('User', userSchema);

module.exports = User;
```

### **Key Features Explained:**

| Feature | Purpose |
|---------|---------|
| `unique: true` | No duplicate emails |
| `lowercase: true` | Auto-converts email |
| `timestamps: true` | Auto createdAt/updatedAt |
| Instance methods | Called on documents: `user.calculateBalance()` |
| Static methods | Called on Model: `User.findByEmail()` |
| Middleware | Auto-runs before/after operations |
| `toJSON` | Hide password when sending JSON |

---

## Next: Part 3 - Database Connection

Continue to `MONGODB_GUIDE_PART3_CONNECTION.md`
