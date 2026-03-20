const mongoose = require('mongoose');
const { TRANSACTION_TYPE_VALUES } = require('../../constants/transactionTypes');

const categorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Usuário é obrigatório'],
    index: true
  },
  name: {
    type: String,
    required: [true, 'Nome da categoria é obrigatório'],
    trim: true,
    maxlength: [100, 'Nome muito longo']
  },
  type: {
    type: String,
    required: [true, 'Tipo é obrigatório'],
    enum: TRANSACTION_TYPE_VALUES
  },
  color: {
    type: String,
    required: [true, 'Cor é obrigatória'],
    match: [/^#[0-9A-F]{6}$/i, 'Cor inválida (use #RRGGBB)']
  },
  keywords: {
    type: [String],
    default: [],
    validate: {
      validator: (arr) => arr.length <= 50,
      message: 'Máximo de 50 palavras-chave por categoria'
    }
  }
}, {
  timestamps: true,
  collection: 'categories'
});

// ============================================
// INDEXES
// ============================================
categorySchema.index({ userId: 1, name: 1 }, { unique: true });
categorySchema.index({ userId: 1, type: 1 });

const Category = mongoose.model('Category', categorySchema);

module.exports = Category;