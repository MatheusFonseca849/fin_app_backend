# 📚 MongoDB Migration Guide - Part 4: Service Layer

## Creating the Service Layer

**Why Services?**
- ✅ Separates business logic from routes
- ✅ Reusable across application
- ✅ Easier to test
- ✅ Cleaner code organization

---

## User Service

### Step 1: Create Services Directory
```bash
mkdir src/services
```

### File: `src/services/user.service.js`
```javascript
const User = require('../models/User.model');

class UserService {
  
  // ============================================
  // User CRUD Operations
  // ============================================

  async createUser(userData) {
    const user = new User({
      ...userData,
      categories: User.getDefaultCategories()
    });
    return await user.save();
  }

  async findById(id) {
    return await User.findById(id);
  }

  async findByEmail(email) {
    return await User.findByEmail(email);
  }

  async updateUser(id, updates) {
    return await User.findByIdAndUpdate(
      id,
      updates,
      { 
        new: true,          // Return updated doc
        runValidators: true // Validate
      }
    );
  }

  async deleteUser(id) {
    return await User.findByIdAndDelete(id);
  }

  async getAllUsers() {
    return await User.find().select('-password');
  }

  // ============================================
  // Transaction Operations
  // ============================================

  async getTransactions(userId) {
    const user = await User.findById(userId).select('transactions');
    return user ? user.transactions : [];
  }

  async addTransaction(userId, transaction) {
    const user = await User.findById(userId);
    if (!user) throw new Error('Usuário não encontrado');

    user.transactions.push(transaction);
    await user.save();
    
    return user.transactions[user.transactions.length - 1];
  }

  async updateTransaction(userId, transactionId, updates) {
    const user = await User.findById(userId);
    if (!user) throw new Error('Usuário não encontrado');

    const transaction = user.transactions.id(transactionId);
    if (!transaction) throw new Error('Transação não encontrada');

    Object.assign(transaction, updates);
    await user.save();
    
    return transaction;
  }

  async deleteTransaction(userId, transactionId) {
    const user = await User.findById(userId);
    if (!user) throw new Error('Usuário não encontrado');

    user.transactions.pull(transactionId);
    await user.save();
    
    return { message: 'Transação excluída' };
  }

  // ============================================
  // Category Operations
  // ============================================

  async getCategories(userId) {
    const user = await User.findById(userId).select('categories');
    return user ? user.categories : [];
  }

  async addCategory(userId, category) {
    const user = await User.findById(userId);
    if (!user) throw new Error('Usuário não encontrado');

    const exists = user.categories.find(c => c.name === category.name);
    if (exists) throw new Error('Categoria já existe');

    user.categories.push(category);
    await user.save();
    
    return user.categories[user.categories.length - 1];
  }

  async updateCategory(userId, categoryId, updates) {
    const user = await User.findById(userId);
    if (!user) throw new Error('Usuário não encontrado');

    const category = user.categories.id(categoryId);
    if (!category) throw new Error('Categoria não encontrada');
    if (category.isDefault) {
      throw new Error('Categoria padrão não pode ser editada');
    }

    Object.assign(category, updates);
    await user.save();
    
    return category;
  }

  async deleteCategory(userId, categoryId) {
    const user = await User.findById(userId);
    if (!user) throw new Error('Usuário não encontrado');

    const category = user.categories.id(categoryId);
    if (!category) throw new Error('Categoria não encontrada');
    if (category.isDefault) {
      throw new Error('Categoria padrão não pode ser excluída');
    }

    // Find default category
    const defaultCat = user.categories.find(
      c => c.name === 'Sem Categoria' && c.isDefault
    );

    // Reassign transactions
    user.transactions.forEach(t => {
      if (t.category === category.name) {
        t.category = defaultCat.name;
      }
    });

    user.categories.pull(categoryId);
    await user.save();
    
    return { message: 'Categoria excluída' };
  }
}

module.exports = new UserService();
```

---

## Key Differences from In-Memory

| Operation | In-Memory | MongoDB |
|-----------|-----------|---------|
| Find by ID | `userData.find(u => u.id === id)` | `await User.findById(id)` |
| Add transaction | `user.transactions.push(t)` | `user.transactions.push(t); await user.save()` |
| Update | Direct mutation | `Object.assign(doc, updates); await save()` |
| Delete | `array.filter()` | `array.pull(id); await save()` |

**Critical:** Always call `.save()` after modifying embedded documents!

---

## Seed Script

Create initial data for testing.

### File: `src/scripts/seed.js`
```javascript
require('dotenv').config();
const database = require('../config/database');
const User = require('../models/User.model');
const bcrypt = require('bcryptjs');

async function seedDatabase() {
  try {
    await database.connect();

    // Check if user exists
    const existing = await User.findByEmail('matheusfonseca@gmail.com');
    if (existing) {
      console.log('✅ User already exists');
      process.exit(0);
    }

    // Create user with hashed password
    const hashedPassword = await bcrypt.hash('123456', 10);
    
    const user = new User({
      name: 'Matheus Fonseca',
      email: 'matheusfonseca@gmail.com',
      password: hashedPassword,
      balance: 0,
      categories: User.getDefaultCategories(),
      transactions: [
        {
          description: 'Supermercado',
          value: -150.50,
          type: 'debito',
          category: 'Alimentação',
          timestamp: new Date('2025-10-05')
        },
        {
          description: 'Salário Outubro',
          value: 3500.00,
          type: 'credito',
          category: 'Salário',
          timestamp: new Date('2025-10-01')
        }
      ]
    });

    await user.save();
    console.log('✅ Database seeded successfully');
    console.log('📧 Email:', user.email);
    console.log('🔑 Password: 123456');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed error:', error);
    process.exit(1);
  }
}

seedDatabase();
```

### Add to package.json:
```json
"scripts": {
  "seed": "node src/scripts/seed.js"
}
```

### Run:
```bash
npm run seed
```

---

## Next: Part 5 - Updating Routes

Continue to `MONGODB_GUIDE_PART5_ROUTES.md`
