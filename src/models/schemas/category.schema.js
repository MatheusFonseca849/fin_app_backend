const mongoose = require('mongoose');
const { TRANSACTION_TYPE_VALUES } = require('../../constants/transactionTypes');

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
    enum: TRANSACTION_TYPE_VALUES
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