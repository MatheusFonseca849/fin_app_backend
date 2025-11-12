# 📚 MongoDB Migration Guide - Part 1: Understanding & Setup

## 🎯 Overview

This guide walks you through migrating FinApp from **in-memory storage** to **MongoDB**.

---

## 1. Your Current Architecture

### **Current: In-Memory Storage**

```javascript
// src/data/userData.js
let userData = [createMockUser()]; // ❌ Data in RAM

module.exports = {
    getUserData: () => userData,
    findUserById: (id) => userData.find(...),
    addUser: (user) => userData.push(user)
};
```

### **Problems:**
- ❌ **Data Loss** - Server restart = all data gone
- ❌ **No Scalability** - Can't handle millions of users
- ❌ **No Persistence** - Everything temporary

### **Your Data Model (Perfect for MongoDB!):**
```javascript
User {
    id, name, email, password, balance,
    transactions: [],      // Embedded
    categories: [],        // Embedded
    recurrentCredits: [],  // Embedded
    recurrentDebits: []    // Embedded
}
```

---

## 2. What is MongoDB?

### **Document Database**
- **Database** = Filing cabinet
- **Collection** = Drawer ("users", "transactions")
- **Document** = File (one user's data)

### **Why Embedded Data is Good:**
```javascript
// ✅ One query gets everything
{
  _id: ObjectId("..."),
  name: "Matheus",
  transactions: [...]  // All transactions here
}
```

---

## 3. Installation

### **Step 1: Install Packages**
```bash
cd fin_app_backend
npm install mongoose
```

### **Step 2: MongoDB Options**

**Option A: MongoDB Atlas (Cloud - RECOMMENDED)**
1. Go to mongodb.com/cloud/atlas
2. Create free account → Create free cluster
3. Get connection string

**Option B: Local MongoDB (Mac)**
```bash
brew tap mongodb/brew
brew install mongodb-community@7.0
brew services start mongodb-community@7.0
```

**Option C: Docker**
```bash
docker run -d -p 27017:27017 --name mongodb mongo:7.0
```

### **Step 3: Update .env**
```env
# Add to your .env file
MONGODB_URI=mongodb://localhost:27017/finapp
# OR for Atlas:
# MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/finapp
```

---

## 4. Understanding Mongoose

**Mongoose = ODM (Object-Document Mapper)**

### **Core Concepts:**

**1. Schema = Blueprint**
```javascript
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, required: true, unique: true }
});
```

**2. Model = Factory**
```javascript
const User = mongoose.model('User', userSchema);

// Create users:
const user = new User({ name: "Matheus" });
await user.save();
```

**3. Document = Instance**
```javascript
const user = await User.findById(id);
user.name = "New Name";
await user.save();
```

### **Key Features:**
- ✅ `required` - Validation
- ✅ `unique` - No duplicates
- ✅ `default` - Default values
- ✅ `enum` - Limited choices
- ✅ `timestamps` - Auto createdAt/updatedAt

---

## Next: Part 2 - Creating Schemas & Models

Continue to `MONGODB_GUIDE_PART2.md` for implementation details.
