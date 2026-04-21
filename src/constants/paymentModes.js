const PAYMENT_MODES = Object.freeze({
  DEBIT: 'debit',
  CREDIT: 'credit'
});

const PAYMENT_MODE_VALUES = Object.values(PAYMENT_MODES);

module.exports = { PAYMENT_MODES, PAYMENT_MODE_VALUES };
