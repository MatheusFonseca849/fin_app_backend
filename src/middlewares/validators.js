const { body, param, validationResult } = require('express-validator');
const { TRANSACTION_TYPE_VALUES } = require('../constants/transactionTypes');

// Reusable error handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: {
        status: 400,
        message: 'Erro de validação',
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
    .notEmpty().withMessage('Nome é obrigatório')
    .isLength({ min: 2, max: 100 }).withMessage('Nome deve ter entre 2 e 100 caracteres')
    .escape(),
  
  body('lastName')
    .trim()
    .notEmpty().withMessage('Sobrenome é obrigatório')
    .isLength({ min: 2, max: 100 }).withMessage('Sobrenome deve ter entre 2 e 100 caracteres')
    .escape(),
  
  body('email')
    .isEmail().withMessage('Formato de email inválido')
    .normalizeEmail(),
  
  body('password')
    .isLength({ min: 6 }).withMessage('Senha deve ter no mínimo 6 caracteres')
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
    .isEmail().withMessage('Formato de email inválido')
    .normalizeEmail(),
  
  body('password')
    .notEmpty().withMessage('Senha é obrigatória'),
  
  handleValidationErrors
];

const updateUserValidation = [
  param('id')
    .isMongoId().withMessage('ID de usuário inválido'),

  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('Nome deve ter entre 2 e 100 caracteres')
    .escape(),
  
  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('Sobrenome deve ter entre 2 e 100 caracteres')
    .escape(),
  
  body('email')
    .optional()
    .isEmail().withMessage('Formato de email inválido')
    .normalizeEmail(),
  
  body('password')
    .optional()
    .isLength({ min: 6 }).withMessage('Senha deve ter no mínimo 6 caracteres')
    .custom((value) => {
      const passwordValidation = require('../utils/password.utils').validatePasswordStrength(value);
      if (!passwordValidation.isValid) {
        throw new Error(passwordValidation.message);
      }
      return true;
    }),
  
  handleValidationErrors
];

// ============ TRANSACTION VALIDATIONS ============

const createTransactionValidation = [
  body('description')
    .trim()
    .notEmpty().withMessage('Descrição é obrigatória')
    .isLength({ max: 500 }).withMessage('Descrição muito longa')
    .escape(),
  
  body('value')
    .isFloat({ min: 0.01 }).withMessage('Valor deve ser um número positivo')
    .customSanitizer(value => Math.round(value * 100)), // Convert to cents
  
  body('type')
    .isIn(TRANSACTION_TYPE_VALUES).withMessage('Tipo deve ser "credito" ou "debito"'),
  
  body('category')
    .optional()
    .trim()
    .escape(),
  
  body('isRecurrent')
    .optional()
    .isBoolean().withMessage('isRecurrent deve ser verdadeiro ou falso'),
  
  body('billingDay')
    .optional()
    .isInt({ min: 1, max: 31 }).withMessage('Dia de cobrança deve ser entre 1 e 31')
    .custom((value, { req }) => {
      if (req.body.isRecurrent && !value) {
        throw new Error('Dia de cobrança é obrigatório para transações recorrentes');
      }
      return true;
    }),
  
  handleValidationErrors
];

const updateTransactionValidation = [
  param('id')
    .isMongoId().withMessage('ID de transação inválido'),
  
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Descrição muito longa')
    .escape(),
  
  body('value')
    .optional()
    .isFloat({ min: 0.01 }).withMessage('Valor deve ser um número positivo')
    .customSanitizer(value => Math.round(value * 100)), // Convert to cents
  
  body('type')
    .optional()
    .isIn(TRANSACTION_TYPE_VALUES).withMessage('Tipo deve ser "credito" ou "debito"'),
  
  body('category')
    .optional()
    .trim()
    .escape(),
  
  body('isRecurrent')
    .optional()
    .isBoolean().withMessage('isRecurrent deve ser verdadeiro ou falso'),
  
  body('billingDay')
    .optional()
    .isInt({ min: 1, max: 31 }).withMessage('Dia de cobrança deve ser entre 1 e 31'),
  
  body('isActive')
    .optional()
    .isBoolean().withMessage('isActive deve ser verdadeiro ou falso'),

  handleValidationErrors
];

const transactionIdValidation = [
  param('id')
    .isMongoId().withMessage('ID de transação inválido'),
  
  handleValidationErrors
];

// ============ ADMIN VALIDATIONS ============

const adminUserIdValidation = [
  param('id')
    .isMongoId().withMessage('ID de usuário inválido'),
  
  handleValidationErrors
];

const adminUpdateUserValidation = [
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('Nome deve ter entre 2 e 100 caracteres')
    .escape(),
  
  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('Sobrenome deve ter entre 2 e 100 caracteres')
    .escape(),
  
  body('email')
    .optional()
    .isEmail().withMessage('Formato de email inválido')
    .normalizeEmail(),
  
  body('role')
    .optional()
    .isIn(['user', 'admin']).withMessage('Cargo deve ser "user" ou "admin"'),
  
  handleValidationErrors
];

// ============ CATEGORY VALIDATIONS ============

const createCategoryValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Nome da categoria é obrigatório')
    .isLength({ max: 50 }).withMessage('Nome da categoria muito longo')
    .escape(),
  
  body('type')
    .isIn(TRANSACTION_TYPE_VALUES).withMessage('Tipo deve ser "credito" ou "debito"'),
  
  body('color')
    .optional()
    .matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Cor deve ser um código hex válido (ex: #FF5733)'),
  
  handleValidationErrors
];

const categoryIdValidation = [
  param('id')
    .isMongoId().withMessage('ID de categoria inválido'),
  
  handleValidationErrors
];

module.exports = {
  registerValidation,
  loginValidation,
  updateUserValidation,
  createTransactionValidation,
  updateTransactionValidation,
  transactionIdValidation,
  createCategoryValidation,
  categoryIdValidation,
  adminUserIdValidation,
  adminUpdateUserValidation
};