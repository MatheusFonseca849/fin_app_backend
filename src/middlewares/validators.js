const { body, param, validationResult } = require('express-validator');
const { TRANSACTION_TYPE_VALUES } = require('../constants/transactionTypes');

// Reusable error handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: {
        status: 400,
        message: 'Validation failed',
        details: errors.array().map(err => ({
          field: err.path,
          message: err.msg
        })),
        timestamp: new Date().toISOString()
      }
    });
  }
  next();
};

// ============ USER VALIDATIONS ============

const registerValidation = [
  body('firstName')
    .trim()
    .notEmpty().withMessage('First name is required')
    .isLength({ min: 2, max: 100 }).withMessage('First name must be between 2 and 100 characters')
    .escape(),
  
  body('lastName')
    .trim()
    .notEmpty().withMessage('Last name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Last name must be between 2 and 100 characters')
    .escape(),
  
  body('email')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  
  body('password')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
    .custom((value) => {
      const passwordValidation = require('../utils/password.utils').validatePasswordStrength(value);
      if (!passwordValidation.isValid) {
        throw new Error(passwordValidation.message);
      }
      return true;
    }),
  
  handleValidationErrors
];

const loginValidation = [
  body('email')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  
  body('password')
    .notEmpty().withMessage('Password is required'),
  
  handleValidationErrors
];

// ============ TRANSACTION VALIDATIONS ============

const createTransactionValidation = [
  body('description')
    .trim()
    .notEmpty().withMessage('Description is required')
    .isLength({ max: 500 }).withMessage('Description too long')
    .escape(),
  
  body('value')
    .isFloat({ min: 0.01 }).withMessage('Value must be a positive number')
    .customSanitizer(value => Math.round(value * 100)), // Convert to cents
  
  body('type')
    .isIn(TRANSACTION_TYPE_VALUES).withMessage('Type must be "credito" or "debito"'),
  
  body('category')
    .optional()
    .trim()
    .escape(),
  
  handleValidationErrors
];

const updateTransactionValidation = [
  param('id')
    .isMongoId().withMessage('Invalid transaction ID'),
  
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Description too long')
    .escape(),
  
  body('value')
    .optional()
    .isFloat({ min: 0.01 }).withMessage('Value must be a positive number')
    .customSanitizer(value => Math.round(value * 100)), // Convert to cents
  
  body('type')
    .optional()
    .isIn(TRANSACTION_TYPE_VALUES).withMessage('Type must be "credito" or "debito"'),
  
  handleValidationErrors
];

const transactionIdValidation = [
  param('id')
    .isMongoId().withMessage('Invalid transaction ID'),
  
  handleValidationErrors
];

// ============ ADMIN VALIDATIONS ============

const adminUserIdValidation = [
  param('id')
    .isMongoId().withMessage('Invalid user ID'),
  
  handleValidationErrors
];

const adminUpdateUserValidation = [
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('First name must be between 2 and 100 characters')
    .escape(),
  
  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('Last name must be between 2 and 100 characters')
    .escape(),
  
  body('email')
    .optional()
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  
  body('role')
    .optional()
    .isIn(['user', 'admin']).withMessage('Role must be "user" or "admin"'),
  
  handleValidationErrors
];

// ============ RECURRENT TRANSACTION VALIDATIONS ============

const recurrentTypeValidation = [
  param('type')
    .isIn(TRANSACTION_TYPE_VALUES).withMessage('Type must be "credito" or "debito"'),
  
  handleValidationErrors
];

const createRecurrentValidation = [
  param('type')
    .isIn(TRANSACTION_TYPE_VALUES).withMessage('Type must be "credito" or "debito"'),

  body('description')
    .trim()
    .notEmpty().withMessage('Description is required')
    .isLength({ max: 500 }).withMessage('Description too long')
    .escape(),
  
  body('value')
    .isFloat({ min: 0.01 }).withMessage('Value must be a positive number')
    .customSanitizer(value => Math.round(value * 100)),
  
  body('category')
    .trim()
    .notEmpty().withMessage('Category is required')
    .escape(),
  
  body('billingDay')
    .isInt({ min: 1, max: 31 }).withMessage('Billing day must be between 1 and 31'),
  
  handleValidationErrors
];

const updateRecurrentValidation = [
  param('type')
    .isIn(TRANSACTION_TYPE_VALUES).withMessage('Type must be "credito" or "debito"'),

  param('id')
    .isMongoId().withMessage('Invalid recurrent transaction ID'),
  
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Description too long')
    .escape(),
  
  body('value')
    .optional()
    .isFloat({ min: 0.01 }).withMessage('Value must be a positive number')
    .customSanitizer(value => Math.round(value * 100)),
  
  body('category')
    .optional()
    .trim()
    .escape(),
  
  body('billingDay')
    .optional()
    .isInt({ min: 1, max: 31 }).withMessage('Billing day must be between 1 and 31'),
  
  body('isActive')
    .optional()
    .isBoolean().withMessage('isActive must be a boolean'),
  
  handleValidationErrors
];

const deleteRecurrentValidation = [
  param('type')
    .isIn(TRANSACTION_TYPE_VALUES).withMessage('Type must be "credito" or "debito"'),

  param('id')
    .isMongoId().withMessage('Invalid recurrent transaction ID'),
  
  handleValidationErrors
];

// ============ CATEGORY VALIDATIONS ============

const createCategoryValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Category name is required')
    .isLength({ max: 50 }).withMessage('Category name too long')
    .escape(),
  
  body('type')
    .isIn(TRANSACTION_TYPE_VALUES).withMessage('Type must be "credito" or "debito"'),
  
  body('color')
    .optional()
    .matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Color must be a valid hex code (e.g., #FF5733)'),
  
  handleValidationErrors
];

const categoryIdValidation = [
  param('id')
    .isMongoId().withMessage('Invalid category ID'),
  
  handleValidationErrors
];

module.exports = {
  registerValidation,
  loginValidation,
  createTransactionValidation,
  updateTransactionValidation,
  transactionIdValidation,
  createCategoryValidation,
  categoryIdValidation,
  adminUserIdValidation,
  adminUpdateUserValidation,
  recurrentTypeValidation,
  createRecurrentValidation,
  updateRecurrentValidation,
  deleteRecurrentValidation
};