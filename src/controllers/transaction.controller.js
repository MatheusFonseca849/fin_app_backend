const userService = require('../services/user.service');
const transactionService = require('../services/transaction.service');
const categoryService = require('../services/category.service');
const csvImportService = require('../services/csvImport.service');
const createError = require('../middlewares/createError');
const { TRANSACTION_TYPE_VALUES } = require('../constants/transactionTypes');
const { PAYMENT_MODE_VALUES } = require('../constants/paymentModes');
const { BANK_MAPPINGS } = require('../config/bankMappings');
const cacheService = require('../services/cache.service');
const { acquireLock } = require('../utils/lock.utils');
const redisClient = require('../config/redis');
const { withTransaction } = require('../utils/withTransaction');
const AppError = require('../utils/AppError');
const Transaction = require('../models/schemas/transaction.schema');

/**
 * Parse a YYYY-MM-DD string strictly.
 * Returns a Date at midnight UTC, or null if the format is wrong
 * or the date rolls over (e.g. 2024-02-30 → March).
 */
const parseStrictDate = (str) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  const [y, m, d] = str.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date;
};

const getAll = async (req, res) => {
  try {
    const { page, limit, type, category, isRecurrent, isPaid, paymentMode, startDate, endDate } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 50));
    if (isNaN(pageNum) || isNaN(limitNum)) {
      return res.status(400).json(createError(400, 'page e limit devem ser números válidos'));
    }

    // Validate query params against allowed values to prevent NoSQL injection
    if (type && !TRANSACTION_TYPE_VALUES.includes(type)) {
      return res.status(400).json(createError(400, 'Tipo inválido'));
    }
    if (paymentMode && !PAYMENT_MODE_VALUES.includes(paymentMode)) {
      return res.status(400).json(createError(400, 'Modo de pagamento inválido'));
    }
    if (category && !/^[a-f\d]{24}$/i.test(category)) {
      return res.status(400).json(createError(400, 'Categoria inválida'));
    }
    // Validate date filters when present
    let parsedStartDate, parsedEndDate;
    if (startDate) {
      parsedStartDate = parseStrictDate(startDate);
      if (!parsedStartDate) {
        return res.status(400).json(createError(400, 'startDate inválido. Use o formato YYYY-MM-DD'));
      }
    }
    if (endDate) {
      parsedEndDate = parseStrictDate(endDate);
      if (!parsedEndDate) {
        return res.status(400).json(createError(400, 'endDate inválido. Use o formato YYYY-MM-DD'));
      }
    }

    const options = {
      page: pageNum,
      limit: limitNum,
    };
    if (type) options.type = type;
    if (category) options.category = category;
    if (parsedStartDate) options.startDate = startDate;
    if (parsedEndDate) options.endDate = endDate;
    if (isRecurrent !== undefined) options.isRecurrent = isRecurrent === 'true';
    if (isPaid !== undefined) options.isPaid = isPaid === 'true';
    if (paymentMode) options.paymentMode = paymentMode;

    // Cache uses a composite key from all filters — works for filtered and unfiltered queries
    const cached = await cacheService.getCachedTransactions(req.user.id, options);
    if (cached) return res.json(cached);

    // Pass parsed Date objects to the service (cache key uses the string form)
    const serviceOptions = { ...options };
    if (parsedStartDate) serviceOptions.startDate = parsedStartDate;
    if (parsedEndDate) serviceOptions.endDate = parsedEndDate;

    const { data, total, page: safePage, limit: safeLimit } = await transactionService.getTransactions(req.user.id, serviceOptions);

    const response = {
      data,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        pages: Math.ceil(total / safeLimit) || 1
      }
    };

    await cacheService.cacheTransactions(req.user.id, options, response);
    res.json(response);
  } catch (error) {
    console.error("Get transactions error:", error);
    res.status(500).json(createError(500, "Erro ao buscar transações"));
  }
};

const getCalendar = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json(createError(400, "startDate e endDate são obrigatórios"));
    }

    const start = parseStrictDate(startDate);
    const end = parseStrictDate(endDate);
    if (!start || !end) {
      return res.status(400).json(createError(400, "Datas inválidas. Use o formato YYYY-MM-DD"));
    }

    const MAX_RANGE_DAYS = 93;
    const diffDays = (end - start) / (1000 * 60 * 60 * 24);
    if (diffDays < 0 || diffDays > MAX_RANGE_DAYS) {
      return res.status(400).json(createError(400, `Intervalo máximo permitido: ${MAX_RANGE_DAYS} dias`));
    }

    const data = await transactionService.getCalendarTransactions(req.user.id, start, end);
    res.json({ data });
  } catch (error) {
    console.error("Get calendar transactions error:", error);
    res.status(500).json(createError(500, "Erro ao buscar transações do calendário"));
  }
};

const getMonthlySummary = async (req, res) => {
  try {
    const { months } = req.query;
    const opts = {};
    const hasMonthsFilter = months !== undefined;
    if (hasMonthsFilter) {
      if (typeof months !== 'string') {
        return res.status(400).json(createError(400, 'months deve ser um número válido entre 1 e 120'));
      }
      opts.months = parseInt(months);
      if (isNaN(opts.months) || opts.months < 1 || opts.months > 120) {
        return res.status(400).json(createError(400, 'months deve ser um número válido entre 1 e 120'));
      }
    }

    const cached = await cacheService.getCachedMonthlySummary(req.user.id, opts.months);
    if (cached) return res.json(cached);

    const raw = await transactionService.getMonthlyAggregation(req.user.id, opts);

    const data = raw.map(r => ({
      year: r._id.year,
      month: r._id.month,
      expenses: r.expenses,
      creditCardTotal: r.creditCardTotal,
      income: r.income,
      balance: r.income - r.expenses
    }));

    const response = { data };
    await cacheService.cacheMonthlySummary(req.user.id, opts.months, response);

    res.json(response);
  } catch (error) {
    console.error("Monthly summary error:", error);
    res.status(500).json(createError(500, "Erro ao buscar resumo mensal"));
  }
};

const create = async (req, res) => {
  try {
    const { description, value, type, category, isRecurrent, billingDay, isPaid, paymentMode, date } = req.body;

    // Validate category exists by ID
    if (category) {
      const categoryExists = await categoryService.getCategoryById(req.user.id, category);
      if (!categoryExists) {
        return res.status(400).json(createError(400, "Categoria não encontrada"));
      }
    }

    const transactionData = { description, value, type, category };
    if (isRecurrent) {
      transactionData.isRecurrent = true;
      transactionData.billingDay = billingDay;
    }
    // Set paymentMode: null for income, default 'debit' for expense
    if (type === 'income') {
      transactionData.paymentMode = null;
      transactionData.isPaid = true;
    } else {
      transactionData.paymentMode = paymentMode || 'debit';
      if (isPaid !== undefined) {
        transactionData.isPaid = isPaid;
      }
    }
    if (date) transactionData.timestamp = new Date(date);

    const { transaction, balance } = await withTransaction(async (session) => {
      const tx = await transactionService.addTransaction(req.user.id, transactionData, { session });

      // Credit card expenses never affect balance immediately
      // Only adjust balance when the transaction is marked as paid AND not credit card
      let bal;
      if (tx.isPaid && tx.paymentMode !== 'credit') {
        const delta = userService.getBalanceDelta(tx.value, tx.type);
        const updatedUser = await userService.adjustBalance(req.user.id, delta, { session });
        bal = updatedUser.balance;
      } else {
        const user = await userService.findById(req.user.id, { session });
        bal = user.balance;
      }

      return { transaction: tx, balance: bal };
    });

    await cacheService.invalidateUser(req.user.id);
    await cacheService.invalidateTransactions(req.user.id);
    res.status(201).json({ transaction, balance });
  } catch (error) {
    console.error("Create transaction error:", error);
    res.status(500).json(createError(500, "Erro ao criar transação"));
  }
};

const getImportBanks = (req, res) => {
  const banks = Object.entries(BANK_MAPPINGS).map(([key, mapping]) => ({
    key,
    label: mapping.label,
    creditCard: !!mapping.creditCard
  }));
  // Always include the custom option
  banks.push({ key: 'custom', label: 'Importação Customizada', creditCard: false });
  res.json(banks);
};

const importPreview = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json(createError(400, "Nenhum arquivo enviado"));
    }

    const { bankKey } = req.body;
    if (!bankKey) {
      return res.status(400).json(createError(400, "Selecione um banco ou importação customizada"));
    }

    let customMapping;
    if (bankKey === 'custom') {
      try {
        customMapping = JSON.parse(req.body.customMapping || '{}');
      } catch {
        return res.status(400).json(createError(400, "Mapeamento customizado inválido"));
      }
    }

    const { rows, errors, headers, creditCard, bankLabel } = await csvImportService.generatePreview(
      req.file.buffer,
      req.user.id,
      bankKey,
      customMapping
    );

    res.json({ rows, errors, headers, creditCard, bankLabel });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(createError(error.statusCode, error.message));
    }
    console.error("Import preview error:", error);
    res.status(500).json(createError(500, "Erro ao processar CSV"));
  }
};

const importConfirm = async (req, res) => {
  try {
    const { transactions } = req.body;

    if (!Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json(createError(400, "Nenhuma transação para importar"));
    }

    // Batch-load all user categories once (avoids N+1 queries in the loop)
    const userCategories = await categoryService.getCategories(req.user.id);
    const validCategoryIds = new Set(userCategories.map(c => c._id.toString()));

    // Validate and transform rows
    const docs = [];
    const validationErrors = [];

    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      const lineLabel = `Transação ${i + 1}`;

      if (!tx.description || !tx.value || !tx.type || !tx.categoryId || !tx.date) {
        validationErrors.push(`${lineLabel}: campos obrigatórios faltando`);
        continue;
      }

      if (!TRANSACTION_TYPE_VALUES.includes(tx.type)) {
        validationErrors.push(`${lineLabel}: tipo inválido "${tx.type}"`);
        continue;
      }

      // Value is already in cents (sanitized by validator)
      if (!tx.value || tx.value <= 0) {
        validationErrors.push(`${lineLabel}: valor inválido`);
        continue;
      }

      // Verify category belongs to user (in-memory lookup)
      if (!validCategoryIds.has(tx.categoryId)) {
        validationErrors.push(`${lineLabel}: categoria não encontrada`);
        continue;
      }

      const paymentMode = tx.type === 'income' ? null : (tx.paymentMode || 'debit');

      const doc = {
        description: tx.description,
        value: tx.value,
        type: tx.type,
        paymentMode,
        category: tx.categoryId,
        timestamp: new Date(tx.date),
        isPaid: tx.type === 'income' ? true : (tx.isPaid || false)
      };
      if (tx.source) doc.source = tx.source;
      docs.push(doc);
    }

    if (docs.length === 0) {
      return res.status(400).json(createError(400, "Nenhuma transação válida para importar", validationErrors));
    }

    // Per-user lock: prevent duplicate imports from concurrent requests
    let release = null;
    if (redisClient.isConnected) {
      release = await acquireLock(`lock:user:${req.user.id}:bulk`, 60);
      if (!release) {
        return res.status(409).json(createError(409, "Outra operação em massa está em andamento. Aguarde."));
      }
    }

    try {
      const importResult = await withTransaction(async (session) => {
        // Bulk add
        const result = await transactionService.bulkAddTransactions(req.user.id, docs, { session });

        // Adjust balance for paid transactions (skip credit card expenses)
        if (result.createdCount > 0 && result.insertedDocs) {
          let netDelta = 0;
          for (const tx of result.insertedDocs) {
            if (tx.isPaid && tx.paymentMode !== 'credit') {
              netDelta += userService.getBalanceDelta(tx.value, tx.type);
            }
          }
          if (netDelta !== 0) {
            await userService.adjustBalance(req.user.id, netDelta, { session });
          }
        }

        // Read balance inside the transaction for consistency
        const user = await userService.findById(req.user.id, { session });

        return {
          createdCount: result.createdCount,
          skippedCount: result.skippedCount,
          errorCount: result.errorCount,
          errors: result.errors,
          balance: user.balance
        };
      });

      await cacheService.invalidateUser(req.user.id);
      await cacheService.invalidateTransactions(req.user.id);

      res.status(201).json({
        message: "Importação concluída",
        createdCount: importResult.createdCount,
        skippedCount: importResult.skippedCount,
        errorCount: importResult.errorCount + validationErrors.length,
        errors: [...validationErrors, ...importResult.errors],
        balance: importResult.balance
      });
    } finally {
      if (release) await release();
    }
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(createError(error.statusCode, error.message));
    }
    console.error("Import confirm error:", error);
    res.status(500).json(createError(500, "Erro ao importar transações"));
  }
};

const bulkDelete = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json(createError(400, "ids deve ser um array não vazio"));
    }
    if (ids.length > 200) {
      return res.status(400).json(createError(400, "Máximo de 200 transações por operação"));
    }

    // Per-user lock: prevent concurrent bulk mutations
    let release = null;
    if (redisClient.isConnected) {
      release = await acquireLock(`lock:user:${req.user.id}:bulk`, 60);
      if (!release) {
        return res.status(409).json(createError(409, "Outra operação em massa está em andamento. Aguarde."));
      }
    }

    try {
      const { deletedCount, balance } = await withTransaction(async (session) => {
        const { deletedCount: count, deletedTransactions } = await transactionService.bulkDeleteTransactions(req.user.id, ids, { session });

        // Reverse balance for paid transactions (skip credit card expenses)
        let netDelta = 0;
        for (const tx of deletedTransactions) {
          if (tx.isPaid && tx.paymentMode !== 'credit') {
            netDelta -= userService.getBalanceDelta(tx.value, tx.type);
          }
        }

        let bal;
        if (netDelta !== 0) {
          const updatedUser = await userService.adjustBalance(req.user.id, netDelta, { session });
          bal = updatedUser.balance;
        } else {
          const user = await userService.findById(req.user.id, { session });
          bal = user.balance;
        }

        return { deletedCount: count, balance: bal };
      });

      await cacheService.invalidateUser(req.user.id);
      await cacheService.invalidateTransactions(req.user.id);
      res.json({ message: `${deletedCount} transação(ões) excluída(s)`, deletedCount, balance });
    } finally {
      if (release) await release();
    }
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(createError(error.statusCode, error.message));
    }
    console.error("Bulk delete error:", error);
    res.status(500).json(createError(500, "Erro ao excluir transações"));
  }
};

const bulkUpdate = async (req, res) => {
  try {
    const { ids, updates } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json(createError(400, "ids deve ser um array não vazio"));
    }
    if (ids.length > 200) {
      return res.status(400).json(createError(400, "Máximo de 200 transações por operação"));
    }
    if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
      return res.status(400).json(createError(400, "updates deve conter pelo menos um campo"));
    }

    // Validate category if provided
    if (updates.category) {
      const categoryExists = await categoryService.getCategoryById(req.user.id, updates.category);
      if (!categoryExists) {
        return res.status(400).json(createError(400, "Categoria não encontrada"));
      }
    }

    // Build safe updates object
    const safeUpdates = {};
    const allowedFields = ['description', 'value', 'type', 'category', 'isPaid', 'paymentMode', 'isRecurrent', 'billingDay'];
    for (const field of allowedFields) {
      if (updates[field] !== undefined) safeUpdates[field] = updates[field];
    }
    if (updates.date !== undefined) safeUpdates.timestamp = new Date(updates.date);

    // Income transactions are always paid with null paymentMode.
    // If changing type to income, force isPaid = true and paymentMode = null.
    // Otherwise, split: income txs always keep isPaid = true, expense txs use provided value.
    if (safeUpdates.type === 'income') {
      safeUpdates.isPaid = true;
      safeUpdates.paymentMode = null;
    }

    // Per-user lock: prevent concurrent bulk mutations
    let release = null;
    if (redisClient.isConnected) {
      release = await acquireLock(`lock:user:${req.user.id}:bulk`, 60);
      if (!release) {
        return res.status(409).json(createError(409, "Outra operação em massa está em andamento. Aguarde."));
      }
    }

    try {
      const { updatedCount, balance } = await withTransaction(async (session) => {
        let uCount, oldTransactions, newTransactions;

        if (safeUpdates.type !== 'income' && safeUpdates.isPaid !== undefined) {
          // Need to protect existing income transactions from isPaid = false.
          // Single fetch, then two targeted updateMany calls to avoid redundant queries.
          const targetTxs = await Transaction.find({ _id: { $in: ids }, userId: req.user.id }).session(session);
          const incomeTxs = targetTxs.filter(tx => tx.type === 'income');
          const expenseTxs = targetTxs.filter(tx => tx.type !== 'income');

          const incomeUpdates = { ...safeUpdates, isPaid: true };

          if (incomeTxs.length > 0) {
            await Transaction.updateMany(
              { _id: { $in: incomeTxs.map(tx => tx._id) }, userId: req.user.id },
              { $set: incomeUpdates },
              { runValidators: true, session }
            );
          }
          if (expenseTxs.length > 0) {
            await Transaction.updateMany(
              { _id: { $in: expenseTxs.map(tx => tx._id) }, userId: req.user.id },
              { $set: safeUpdates },
              { runValidators: true, session }
            );
          }

          oldTransactions = targetTxs;
          newTransactions = targetTxs.map(tx => {
            const obj = tx.toObject();
            const applied = tx.type === 'income' ? incomeUpdates : safeUpdates;
            return { ...obj, ...applied };
          });
          uCount = targetTxs.length;
        } else {
          const result = await transactionService.bulkUpdateTransactions(req.user.id, ids, safeUpdates, { session });
          uCount = result.updatedCount;
          oldTransactions = result.oldTransactions;
          newTransactions = result.newTransactions;
        }

        // Recalculate balance delta (skip credit card expenses)
        let netDelta = 0;
        for (const oldTx of oldTransactions) {
          if (oldTx.isPaid && oldTx.paymentMode !== 'credit') {
            netDelta -= userService.getBalanceDelta(oldTx.value, oldTx.type);
          }
        }
        for (const newTx of newTransactions) {
          if (newTx.isPaid && newTx.paymentMode !== 'credit') {
            netDelta += userService.getBalanceDelta(newTx.value, newTx.type);
          }
        }

        let bal;
        if (netDelta !== 0) {
          const updatedUser = await userService.adjustBalance(req.user.id, netDelta, { session });
          bal = updatedUser.balance;
        } else {
          const user = await userService.findById(req.user.id, { session });
          bal = user.balance;
        }

        return { updatedCount: uCount, balance: bal };
      });

      await cacheService.invalidateUser(req.user.id);
      await cacheService.invalidateTransactions(req.user.id);
      res.json({ message: `${updatedCount} transação(ões) atualizada(s)`, updatedCount, balance });
    } finally {
      if (release) await release();
    }
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(createError(error.statusCode, error.message));
    }
    console.error("Bulk update error:", error);
    res.status(500).json(createError(500, "Erro ao atualizar transações"));
  }
};

const getById = async (req, res) => {
  try {
    const transaction = await transactionService.getTransactionById(req.user.id, req.params.id);

    if (!transaction) {
      return res.status(404).json(createError(404, "Transação não encontrada"));
    }

    res.json(transaction);
  } catch (error) {
    console.error("Get transaction error:", error);
    res.status(500).json(createError(500, "Erro ao buscar transação"));
  }
};

const update = async (req, res) => {
  try {
    const { description, value, type, category, date, isRecurrent, billingDay, isActive, isPaid, paymentMode } = req.body;

    // Validate category exists by ID if provided
    if (category) {
      const categoryExists = await categoryService.getCategoryById(req.user.id, category);
      if (!categoryExists) {
        return res.status(400).json(createError(400, "Categoria não encontrada"));
      }
    }

    const updates = {};
    if (description !== undefined) updates.description = description;
    if (value !== undefined) updates.value = value;
    if (type !== undefined) updates.type = type;
    if (category !== undefined) updates.category = category;
    if (date !== undefined) updates.timestamp = new Date(date);
    if (isRecurrent !== undefined) updates.isRecurrent = isRecurrent;
    if (billingDay !== undefined) updates.billingDay = billingDay;
    if (isActive !== undefined) updates.isActive = isActive;
    if (isPaid !== undefined) updates.isPaid = isPaid;
    if (paymentMode !== undefined) updates.paymentMode = paymentMode;

    const { newTransaction, balance } = await withTransaction(async (session) => {
      const { oldTransaction, newTransaction: newTx } = await transactionService.updateTransaction(
        req.user.id,
        req.params.id,
        updates,
        { session }
      );

      // Income transactions are always considered paid and have null paymentMode
      const effectiveType = type || oldTransaction.type;
      if (effectiveType === 'income') {
        let needsSave = false;
        if (!newTx.isPaid) {
          newTx.isPaid = true;
          needsSave = true;
        }
        if (newTx.paymentMode !== null) {
          newTx.paymentMode = null;
          needsSave = true;
        }
        if (needsSave) {
          await newTx.save({ session });
          await newTx.populate('category');
        }
      }

      // Balance adjustment depends on isPaid state transition
      // Credit card expenses never affect balance directly
      const wasPaid = oldTransaction.isPaid && oldTransaction.paymentMode !== 'credit';
      const nowPaid = newTx.isPaid && newTx.paymentMode !== 'credit';

      let netDelta = 0;
      if (wasPaid) netDelta -= userService.getBalanceDelta(oldTransaction.value, oldTransaction.type);
      if (nowPaid) netDelta += userService.getBalanceDelta(newTx.value, newTx.type);

      let bal;
      if (netDelta !== 0) {
        const updatedUser = await userService.adjustBalance(req.user.id, netDelta, { session });
        bal = updatedUser.balance;
      } else {
        const user = await userService.findById(req.user.id, { session });
        bal = user.balance;
      }

      return { newTransaction: newTx, balance: bal };
    });

    await cacheService.invalidateUser(req.user.id);
    await cacheService.invalidateTransactions(req.user.id);
    res.json({ transaction: newTransaction, balance });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(createError(error.statusCode, error.message));
    }
    console.error("Update transaction error:", error);
    res.status(500).json(createError(500, "Erro ao atualizar transação"));
  }
};

const remove = async (req, res) => {
  try {
    const balance = await withTransaction(async (session) => {
      const deleted = await transactionService.deleteTransaction(req.user.id, req.params.id, { session });

      // Only reverse balance if the deleted transaction was paid and not a credit card expense
      if (deleted.isPaid && deleted.paymentMode !== 'credit') {
        const delta = userService.getBalanceDelta(deleted.value, deleted.type);
        const updatedUser = await userService.adjustBalance(req.user.id, -delta, { session });
        return updatedUser.balance;
      }
      const user = await userService.findById(req.user.id, { session });
      return user.balance;
    });

    await cacheService.invalidateUser(req.user.id);
    await cacheService.invalidateTransactions(req.user.id);
    res.json({ message: "Transação excluída com sucesso", balance });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(createError(error.statusCode, error.message));
    }
    console.error("Delete transaction error:", error);
    res.status(500).json(createError(500, "Erro ao excluir transação"));
  }
};

const getDashboard = async (req, res) => {
  try {
    const cached = await cacheService.getCachedDashboard(req.user.id);
    if (cached) return res.json(cached);

    const data = await transactionService.getDashboardData(req.user.id);

    await cacheService.cacheDashboard(req.user.id, data);
    res.json(data);
  } catch (error) {
    console.error("Dashboard data error:", error);
    res.status(500).json(createError(500, "Erro ao buscar dados do dashboard"));
  }
};

module.exports = {
  getAll,
  getCalendar,
  getMonthlySummary,
  getDashboard,
  create,
  getImportBanks,
  importPreview,
  importConfirm,
  bulkDelete,
  bulkUpdate,
  getById,
  update,
  remove,
};
