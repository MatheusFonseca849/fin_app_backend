const mongoose = require('mongoose');

/**
 * Execute a callback inside a MongoDB transaction.
 * Automatically commits on success and aborts on error.
 *
 * @param {(session: import('mongoose').ClientSession) => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withTransaction(fn) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const result = await fn(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

module.exports = { withTransaction };
