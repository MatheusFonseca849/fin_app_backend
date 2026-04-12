const mongoose = require('mongoose');
const { TRANSACTION_TYPE_VALUES } = require('../../constants/transactionTypes');

const transactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Usuário é obrigatório'],
    index: true
  },
  description: {
    type: String,
    required: [true, 'Descrição é obrigatória'],
    trim: true,
    maxlength: [500, 'Descrição muito longa']
  },
  value: {
    type: Number,
    required: [true, 'Valor é obrigatório'],
    min: [1, 'Valor deve ser positivo']
  },
  type: {
    type: String,
    required: [true, 'Tipo é obrigatório'],
    enum: {
      values: TRANSACTION_TYPE_VALUES,
      message: 'Tipo deve ser "credito" ou "debito"'
    }
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: [true, 'Categoria é obrigatória']
  },
  isRecurrent: {
    type: Boolean,
    default: false
  },
  billingDay: {
    type: Number,
    default: null,
    min: [1, 'Dia deve ser entre 1 e 31'],
    max: [31, 'Dia deve ser entre 1 e 31'],
    validate: {
      validator: function(value) {
        // billingDay is required when isRecurrent is true
        if (this.isRecurrent && (value === null || value === undefined)) {
          return false;
        }
        return true;
      },
      message: 'Dia de cobrança é obrigatório para transações recorrentes'
    }
  },
  isPaid: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastApplied: {
    type: Date,
    default: null
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'transactions',
  toJSON: {
    transform(doc, ret) {
      delete ret.__v;
      return ret;
    }
  }
});

// ============================================
// INDEXES
// ============================================
transactionSchema.index({ userId: 1, timestamp: -1 });
transactionSchema.index({ userId: 1, isRecurrent: 1 });
transactionSchema.index({ userId: 1, category: 1 });
transactionSchema.index({ isRecurrent: 1, isActive: 1, billingDay: 1 });

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;