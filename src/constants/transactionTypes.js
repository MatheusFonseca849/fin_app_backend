const TRANSACTION_TYPES = Object.freeze({
  CREDIT: 'credito',
  DEBIT: 'debito'
});

const TRANSACTION_TYPE_VALUES = Object.values(TRANSACTION_TYPES);

module.exports = { TRANSACTION_TYPES, TRANSACTION_TYPE_VALUES };
