const mongoose = require('mongoose');
const { TRANSACTION_TYPE_VALUES } = require('../../constants/transactionTypes');

const recurrentTransactionSchema = new mongoose.Schema({
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
      message: 'Type must be "credito" or "debito"'
    }
  },
  category: {
    type: String,
    required: [true, 'Categoria é obrigatória']
  },
  dayOfMonth: {
    type: Number,
    required: [true, 'Dia do mês é obrigatório'],
    min: [1, 'Dia deve ser entre 1 e 31'],
    max: [31, 'Dia deve ser entre 1 e 31']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastApplied: {
    type: Date,
    default: null
  }
}, { _id: true });

module.exports = recurrentTransactionSchema;
