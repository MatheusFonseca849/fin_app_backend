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