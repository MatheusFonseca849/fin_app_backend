const mongoose = require('mongoose');
const categorySchema = require('./schemas/category.schema');
const { TRANSACTION_TYPES } = require('../constants/transactionTypes');

const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: [true, 'Nome é obrigatório'],
    trim: true,
    minlength: [2, 'Nome muito curto'],
    maxlength: [100, 'Nome muito longo']
  },
  lastName: {
    type: String,
    required: [true, 'Sobrenome é obrigatório'],
    trim: true,
    minlength: [2, 'Sobrenome muito curto'],
    maxlength: [100, 'Sobrenome muito longo']
  },
  avatarUrl: {
    type: String,
    default: null,
    trim: true,
    maxlength: [500, 'URL do avatar muito longa']
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
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationToken: {
    type: String,
    select: false
  },
  verificationTokenExpires: {
    type: Date,
    select: false
  },
  balance: {
    type: Number,
    default: 0 // Balance in cents
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
userSchema.index({ email: 1 }, { unique: true });

// ============================================
// INSTANCE METHODS
// ============================================

userSchema.methods.findCategory = function(identifier) {
  return this.categories.find(c => 
    c.name === identifier || c._id.toString() === identifier
  );
};

userSchema.methods.getFullName = function() {
  return `${this.firstName} ${this.lastName}`;
};

// ============================================
// STATIC METHODS
// ============================================

userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

userSchema.statics.getDefaultCategories = function() {
  return [
    { name: 'Alimentação', type: TRANSACTION_TYPES.DEBIT, color: '#FF6B6B', isDefault: true },
    { name: 'Transporte', type: TRANSACTION_TYPES.DEBIT, color: '#4ECDC4', isDefault: true },
    { name: 'Saúde', type: TRANSACTION_TYPES.DEBIT, color: '#45B7D1', isDefault: true },
    { name: 'Contas', type: TRANSACTION_TYPES.DEBIT, color: '#FFA07A', isDefault: true },
    { name: 'Lazer', type: TRANSACTION_TYPES.DEBIT, color: '#98D8C8', isDefault: true },
    { name: 'Outros', type: TRANSACTION_TYPES.DEBIT, color: '#F7DC6F', isDefault: true },
    { name: 'Salário', type: TRANSACTION_TYPES.CREDIT, color: '#82E0AA', isDefault: true },
    { name: 'Freelance', type: TRANSACTION_TYPES.CREDIT, color: '#AED6F1', isDefault: true },
    { name: 'Sem Categoria', type: TRANSACTION_TYPES.DEBIT, color: '#D5DBDB', isDefault: true }
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