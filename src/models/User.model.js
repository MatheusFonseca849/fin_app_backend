const mongoose = require('mongoose');

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
  pendingEmail: {
    type: String,
    default: null,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Email inválido']
  },
  pendingEmailToken: {
    type: String,
    select: false
  },
  pendingEmailTokenExpires: {
    type: Date,
    select: false
  },
  password: {
    type: String,
    required: [true, 'Senha é obrigatória'],
    minlength: [8, 'Senha muito curta']
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
  resetPasswordToken: {
    type: String,
    select: false
  },
  resetPasswordExpires: {
    type: Date,
    select: false
  },
  tokenVersion: {
    type: Number,
    default: 0
  },
  failedLoginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: {
    type: Date,
    default: null
  },
  balance: {
    type: Number,
    default: 0 // Balance in cents
  },
  preferences: {
    darkMode: {
      type: Boolean,
      default: false
    },
    language: {
      type: String,
      enum: ['pt-BR', 'en-US', 'es-MX'],
      default: 'pt-BR'
    },
    currency: {
      type: String,
      enum: ['BRL', 'USD', 'MXN'],
      default: 'BRL'
    },
    allowForeignCurrency: {
      type: Boolean,
      default: false
    }
  }
}, {
  timestamps: true,  // Adds createdAt/updatedAt
  collection: 'users'
});

// ============================================
// INSTANCE METHODS
// ============================================

userSchema.methods.getFullName = function () {
  return `${this.firstName} ${this.lastName}`;
};

// ============================================
// STATIC METHODS
// ============================================

userSchema.statics.findByEmail = function (email) {
  return this.findOne({ email: email.toLowerCase() });
};

// ============================================
// MIDDLEWARE
// ============================================

userSchema.pre('save', function (next) {
  if (this.isModified('email')) {
    this.email = this.email.toLowerCase();
  }
  next();
});

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.failedLoginAttempts;
  delete obj.lockUntil;
  delete obj.tokenVersion;
  delete obj.__v;
  delete obj.verificationToken;
  delete obj.verificationTokenExpires;
  delete obj.resetPasswordToken;
  delete obj.resetPasswordExpires;
  delete obj.pendingEmailToken;
  delete obj.pendingEmailTokenExpires;
  return obj;
};

const User = mongoose.model('User', userSchema);

module.exports = User;