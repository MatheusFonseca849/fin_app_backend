const TRANSACTION_TYPES = Object.freeze({
  INCOME: 'income',
  EXPENSE: 'expense'
});

const TRANSACTION_TYPE_VALUES = Object.values(TRANSACTION_TYPES);

module.exports = { TRANSACTION_TYPES, TRANSACTION_TYPE_VALUES };
