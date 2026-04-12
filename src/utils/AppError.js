/**
 * Application-level error with an HTTP status code.
 *
 * Throw from services / controllers so that catch blocks and the global
 * errorHandler can return the correct status without fragile string matching.
 *
 * @example
 *   throw new AppError(404, 'Usuário não encontrado');
 *   throw new AppError(409, 'Categoria já existe');
 */
class AppError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
