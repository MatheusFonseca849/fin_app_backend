// DEPRECATED: Recurrent transactions are now unified into the Transaction model.
// Use Transaction (./transaction.schema.js) with isRecurrent: true instead.
// This file is kept only to avoid breaking any residual imports during migration.

const Transaction = require('./transaction.schema');
module.exports = Transaction;
