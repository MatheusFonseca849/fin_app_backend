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