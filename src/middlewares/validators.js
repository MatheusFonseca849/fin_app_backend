const { body, param, validationResult } = require('express-validator');
const { TRANSACTION_TYPE_VALUES } = require('../constants/transactionTypes');
const { PAYMENT_MODE_VALUES } = require('../constants/paymentModes');
const createError = require('./createError');

// Reusable error handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const details = errors.array().map(err => ({
      field: err.path,
      message: err.msg
    }));
    return res.status(400).json(createError(400, 'Erro de validação', details));
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
    .normalizeEmail({ gmail_remove_dots: false }),
  
  body('password')
    .isLength({ min: 8 }).withMessage('Senha deve ter no mínimo 8 caracteres')
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
    .normalizeEmail({ gmail_remove_dots: false }),
  
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
    .normalizeEmail({ gmail_remove_dots: false }),
  
  body('preferences.darkMode')
    .optional()
    .isBoolean().withMessage('darkMode deve ser verdadeiro ou falso'),

  body('preferences.language')
    .optional()
    .isIn(['pt-BR', 'en-US', 'es-MX']).withMessage('Idioma inválido'),

  body('preferences.currency')
    .optional()
    .isIn(['BRL', 'USD', 'MXN']).withMessage('Moeda inválida'),

  body('preferences.allowForeignCurrency')
    .optional()
    .isBoolean().withMessage('allowForeignCurrency deve ser verdadeiro ou falso'),

  body('preferences.creditCardClosingDay')
    .optional()
    .isInt({ min: 1, max: 31 }).withMessage('Dia de fechamento deve ser entre 1 e 31'),

  body('preferences.creditCardDueDay')
    .optional()
    .isInt({ min: 1, max: 31 }).withMessage('Dia de vencimento deve ser entre 1 e 31'),

  body('currentPassword')
    .if(body('password').exists())
    .notEmpty().withMessage('Senha atual é obrigatória para alterar a senha'),

  body('password')
    .optional()
    .isLength({ min: 8 }).withMessage('Senha deve ter no mínimo 8 caracteres')
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
    .isIn(TRANSACTION_TYPE_VALUES).withMessage('Tipo deve ser "income" ou "expense"'),
  
  body('category')
    .optional()
    .isMongoId().withMessage('ID de categoria inválido'),
  
  body('isRecurrent')
    .optional()
    .isBoolean().withMessage('Recorrente deve ser verdadeiro ou falso'),
  
  body('billingDay')
    .optional()
    .isInt({ min: 1, max: 31 }).withMessage('Dia de cobrança deve ser entre 1 e 31')
    .custom((value, { req }) => {
      if (req.body.isRecurrent && !value) {
        throw new Error('Dia de cobrança é obrigatório para transações recorrentes');
      }
      return true;
    }),
  
  body('isPaid')
    .optional()
    .isBoolean().withMessage('Pago deve ser verdadeiro ou falso'),

  body('paymentMode')
    .optional({ nullable: true })
    .isIn(PAYMENT_MODE_VALUES).withMessage('Modo de pagamento deve ser "debit" ou "credit"'),

  body('date')
    .notEmpty().withMessage('Data é obrigatória')
    .isISO8601({ strict: true, strictSeparator: true }).withMessage('Data deve estar no formato ISO 8601 (YYYY-MM-DD ou YYYY-MM-DDTHH:mm:ss)'),

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
    .isIn(TRANSACTION_TYPE_VALUES).withMessage('Tipo deve ser "income" ou "expense"'),
  
  body('category')
    .optional()
    .isMongoId().withMessage('ID de categoria inválido'),
  
  body('isRecurrent')
    .optional()
    .isBoolean().withMessage('isRecurrent deve ser verdadeiro ou falso'),
  
  body('billingDay')
    .optional()
    .isInt({ min: 1, max: 31 }).withMessage('Dia de cobrança deve ser entre 1 e 31'),
  
  body('isActive')
    .optional()
    .isBoolean().withMessage('isActive deve ser verdadeiro ou falso'),

  body('isPaid')
    .optional()
    .isBoolean().withMessage('isPaid deve ser verdadeiro ou falso'),

  body('paymentMode')
    .optional({ nullable: true })
    .isIn([...PAYMENT_MODE_VALUES, null]).withMessage('Modo de pagamento deve ser "debit", "credit" ou null'),

  body('date')
    .optional()
    .isISO8601({ strict: true, strictSeparator: true }).withMessage('Data deve estar no formato ISO 8601 (YYYY-MM-DD ou YYYY-MM-DDTHH:mm:ss)'),

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
    .normalizeEmail({ gmail_remove_dots: false }),
  
  body('role')
    .optional()
    .isIn(['user', 'admin']).withMessage('Cargo deve ser "user" ou "admin"'),

  body('currentPassword')
    .if(body('password').exists())
    .notEmpty().withMessage('Senha do administrador é obrigatória para alterar a senha do usuário'),

  body('password')
    .optional()
    .isLength({ min: 8 }).withMessage('Senha deve ter no mínimo 8 caracteres')
    .custom((value) => {
      const passwordValidation = require('../utils/password.utils').validatePasswordStrength(value);
      if (!passwordValidation.isValid) {
        throw new Error(passwordValidation.message);
      }
      return true;
    }),
  
  handleValidationErrors
];

// ============ PASSWORD RESET VALIDATIONS ============

const forgotPasswordValidation = [
  body('email')
    .isEmail().withMessage('Formato de email inválido')
    .normalizeEmail({ gmail_remove_dots: false }),
  
  handleValidationErrors
];

const resetPasswordValidation = [
  body('token')
    .notEmpty().withMessage('Token é obrigatório'),
  
  body('email')
    .isEmail().withMessage('Formato de email inválido')
    .normalizeEmail({ gmail_remove_dots: false }),
  
  body('password')
    .isLength({ min: 8 }).withMessage('Senha deve ter no mínimo 8 caracteres')
    .custom((value) => {
      const passwordValidation = require('../utils/password.utils').validatePasswordStrength(value);
      if (!passwordValidation.isValid) {
        throw new Error(passwordValidation.message);
      }
      return true;
    }),
  
  handleValidationErrors
];

// ============ EMAIL VERIFICATION VALIDATIONS ============

const verifyEmailValidation = [
  body('token')
    .trim()
    .notEmpty().withMessage('Token é obrigatório'),
  
  body('email')
    .isEmail().withMessage('Formato de email inválido')
    .normalizeEmail({ gmail_remove_dots: false }),
  
  handleValidationErrors
];

const verifyEmailChangeValidation = [
  body('token')
    .trim()
    .notEmpty().withMessage('Token é obrigatório'),
  
  body('email')
    .isEmail().withMessage('Formato de email inválido')
    .normalizeEmail({ gmail_remove_dots: false }),
  
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
    .isIn(TRANSACTION_TYPE_VALUES).withMessage('Tipo deve ser "income" ou "expense"'),
  
  body('color')
    .optional()
    .matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Cor deve ser um código hex válido (ex: #FF5733)'),
  
  body('keywords')
    .optional()
    .isArray({ max: 50 }).withMessage('keywords deve ser um array com no máximo 50 itens'),
  
  body('keywords.*')
    .optional()
    .isString().withMessage('Cada keyword deve ser uma string')
    .trim()
    .isLength({ min: 1, max: 100 }).withMessage('Keyword deve ter entre 1 e 100 caracteres'),
  
  handleValidationErrors
];

const updateCategoryValidation = [
  param('id')
    .isMongoId().withMessage('ID de categoria inválido'),
  
  body('name')
    .optional()
    .trim()
    .isLength({ max: 50 }).withMessage('Nome da categoria muito longo')
    .escape(),
  
  body('type')
    .optional()
    .isIn(TRANSACTION_TYPE_VALUES).withMessage('Tipo deve ser "income" ou "expense"'),
  
  body('color')
    .optional()
    .matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Cor deve ser um código hex válido (ex: #FF5733)'),
  
  body('keywords')
    .optional()
    .isArray({ max: 50 }).withMessage('keywords deve ser um array com no máximo 50 itens'),
  
  body('keywords.*')
    .optional()
    .isString().withMessage('Cada keyword deve ser uma string')
    .trim()
    .isLength({ min: 1, max: 100 }).withMessage('Keyword deve ter entre 1 e 100 caracteres'),
  
  handleValidationErrors
];

const categoryIdValidation = [
  param('id')
    .isMongoId().withMessage('ID de categoria inválido'),
  
  handleValidationErrors
];

// ============ BULK OPERATION VALIDATIONS ============

const bulkDeleteValidation = [
  body('ids')
    .isArray({ min: 1 }).withMessage('ids deve ser um array não vazio')
    .custom((ids) => {
      if (ids.length > 200) throw new Error('Máximo de 200 transações por operação');
      return true;
    }),

  body('ids.*')
    .isMongoId().withMessage('Cada id deve ser um ObjectId válido'),

  handleValidationErrors
];

const bulkUpdateValidation = [
  body('ids')
    .isArray({ min: 1 }).withMessage('ids deve ser um array não vazio')
    .custom((ids) => {
      if (ids.length > 200) throw new Error('Máximo de 200 transações por operação');
      return true;
    }),

  body('ids.*')
    .isMongoId().withMessage('Cada id deve ser um ObjectId válido'),

  body('updates')
    .isObject().withMessage('updates deve ser um objeto')
    .custom((updates) => {
      if (Object.keys(updates).length === 0) throw new Error('updates deve conter pelo menos um campo');
      return true;
    }),

  body('updates.description')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Descrição muito longa')
    .escape(),

  body('updates.value')
    .optional()
    .isFloat({ min: 0.01 }).withMessage('Valor deve ser um número positivo')
    .customSanitizer(value => Math.round(value * 100)),

  body('updates.type')
    .optional()
    .isIn(TRANSACTION_TYPE_VALUES).withMessage('Tipo deve ser "income" ou "expense"'),

  body('updates.category')
    .optional()
    .isMongoId().withMessage('ID de categoria inválido'),

  body('updates.date')
    .optional()
    .isISO8601().withMessage('Data deve ser uma data válida'),

  body('updates.isPaid')
    .optional()
    .isBoolean().withMessage('isPaid deve ser verdadeiro ou falso'),

  body('updates.paymentMode')
    .optional({ nullable: true })
    .isIn([...PAYMENT_MODE_VALUES, null]).withMessage('Modo de pagamento deve ser "debit", "credit" ou null'),

  body('updates.isRecurrent')
    .optional()
    .isBoolean().withMessage('isRecurrent deve ser verdadeiro ou falso'),

  body('updates.billingDay')
    .optional()
    .isInt({ min: 1, max: 31 }).withMessage('Dia de cobrança deve ser entre 1 e 31'),

  handleValidationErrors
];

const importConfirmValidation = [
  body('transactions')
    .isArray({ min: 1 }).withMessage('Nenhuma transação para importar'),

  body('transactions.*.description')
    .trim()
    .notEmpty().withMessage('Descrição é obrigatória')
    .isLength({ max: 500 }).withMessage('Descrição muito longa')
    .escape(),

  body('transactions.*.value')
    .isFloat({ min: 0.01 }).withMessage('Valor deve ser um número positivo')
    .customSanitizer(value => Math.round(value * 100)),

  body('transactions.*.type')
    .isIn(TRANSACTION_TYPE_VALUES).withMessage('Tipo deve ser "income" ou "expense"'),

  body('transactions.*.categoryId')
    .isMongoId().withMessage('ID de categoria inválido'),

  body('transactions.*.date')
    .notEmpty().withMessage('Data é obrigatória')
    .isISO8601().withMessage('Data deve ser uma data válida'),

  body('transactions.*.isPaid')
    .optional()
    .isBoolean().withMessage('isPaid deve ser verdadeiro ou falso'),

  body('transactions.*.paymentMode')
    .optional({ nullable: true })
    .isIn(PAYMENT_MODE_VALUES).withMessage('Modo de pagamento deve ser "debit" ou "credit"'),

  body('transactions.*.source')
    .optional({ nullable: true })
    .isString().withMessage('Fonte deve ser uma string')
    .isLength({ max: 100 }).withMessage('Fonte muito longa'),

  handleValidationErrors
];

// ============ BALANCE VALIDATIONS ============

const setBalanceValidation = [
  body('balance')
    .exists({ checkNull: true }).withMessage('Valor do saldo é obrigatório')
    .isInt({ min: -999999999, max: 999999999 }).withMessage('Saldo deve ser um número inteiro entre -999999999 e 999999999 (em centavos)'),

  handleValidationErrors
];

module.exports = {
  registerValidation,
  loginValidation,
  updateUserValidation,
  forgotPasswordValidation,
  resetPasswordValidation,
  createTransactionValidation,
  updateTransactionValidation,
  transactionIdValidation,
  createCategoryValidation,
  updateCategoryValidation,
  categoryIdValidation,
  adminUserIdValidation,
  adminUpdateUserValidation,
  bulkDeleteValidation,
  bulkUpdateValidation,
  importConfirmValidation,
  verifyEmailValidation,
  verifyEmailChangeValidation,
  setBalanceValidation
};