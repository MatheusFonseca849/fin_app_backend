const createError = require('./createError');
const AppError = require('../utils/AppError');

/**
 * Global error handler middleware.
 * Must be registered AFTER all routes in app.js.
 * Express recognizes it as an error handler by the 4-param signature.
 */
const errorHandler = (err, req, res, next) => {
  // Only log stack traces in non-production for readability
  if (process.env.NODE_ENV === 'production') {
    console.error('Unhandled error:', err.message);
  } else {
    console.error('Unhandled error:', err);
  }

  // Operational errors thrown via AppError
  if (err instanceof AppError) {
    return res.status(err.statusCode).json(createError(err.statusCode, err.message, err.details));
  }

  // CORS errors
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json(createError(403, 'Origin not allowed'));
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors).map(e => ({
      field: e.path,
      message: e.message
    }));
    return res.status(400).json(createError(400, 'Erro de validação', details));
  }

  // Mongoose cast error (invalid ObjectId, etc.)
  if (err.name === 'CastError') {
    return res.status(400).json(createError(400, 'Formato de dado inválido'));
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    return res.status(409).json(createError(409, `${field} já está em uso`));
  }

  // Multer file size error
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json(createError(413, 'Arquivo muito grande'));
  }

  // Multer general error
  if (err.name === 'MulterError') {
    return res.status(400).json(createError(400, err.message));
  }

  // JSON parse error
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json(createError(400, 'JSON inválido no corpo da requisição'));
  }

  // Default: internal server error
  const status = err.status || err.statusCode || 500;
  const message = status === 500
    ? 'Erro interno do servidor'
    : err.message;

  res.status(status).json(createError(status, message));
};

module.exports = errorHandler;
