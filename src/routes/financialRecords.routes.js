const router = require("express").Router();
const userService = require("../services/user.service");
const transactionService = require("../services/transaction.service");
const categoryService = require("../services/category.service");
const { authenticateToken } = require("../middlewares/auth.middleware");
const createError = require("../middlewares/createError");
const multer = require("multer");
const { parse } = require("csv-parse/sync");
const { TRANSACTION_TYPE_VALUES } = require('../constants/transactionTypes');
const csvImportService = require('../services/csvImport.service');
const { BANK_MAPPINGS } = require('../config/bankMappings');
const { 
  createTransactionValidation, 
  updateTransactionValidation,
  transactionIdValidation 
} = require('../middlewares/validators');
const cacheService = require('../services/cache.service');

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }

});

/**
 * GET /records
 * Get all transactions for user
 */
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { page, limit, type, isRecurrent, isPaid, startDate, endDate } = req.query;
    const pageNum = page ? parseInt(page) : 1;
    const limitNum = limit ? parseInt(limit) : 50;
    const hasFilters = type !== undefined || isRecurrent !== undefined || isPaid !== undefined || startDate || endDate || limitNum !== 50;

    const cached = await cacheService.getCachedTransactions(req.user.id, pageNum);
    if (cached && !hasFilters) return res.json(cached);

    const options = {
      page: pageNum,
      limit: limitNum,
      type,
      startDate,
      endDate
    };
    if (isRecurrent !== undefined) {
      options.isRecurrent = isRecurrent === 'true';
    }
    if (isPaid !== undefined) {
      options.isPaid = isPaid === 'true';
    }

    const { data, total, page: safePage, limit: safeLimit } = await transactionService.getTransactions(req.user.id, options);

    const response = {
      data,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        pages: Math.ceil(total / safeLimit) || 1
      }
    };

    if (!hasFilters) {
      await cacheService.cacheTransactions(req.user.id, pageNum, response);
    }

    res.json(response);
  } catch (error) {
    console.error("Get transactions error:", error);
    res.status(500).json(createError(500, "Erro ao buscar transações"));
  }
});

/**
 * GET /records/monthly-summary
 * Get monthly income/expense aggregation for the authenticated user.
 * Query params: months (optional, number of months back from now)
 */
router.get("/monthly-summary", authenticateToken, async (req, res) => {
  try {
    const { months } = req.query;
    const opts = {};
    const hasMonthsFilter = months !== undefined;
    if (hasMonthsFilter) opts.months = parseInt(months);

    // Serve from cache when fetching the full (unfiltered) summary
    if (!hasMonthsFilter) {
      const cached = await cacheService.getCachedMonthlySummary(req.user.id);
      if (cached) return res.json(cached);
    }

    const raw = await transactionService.getMonthlyAggregation(req.user.id, opts);

    const data = raw.map(r => ({
      year: r._id.year,
      month: r._id.month,
      despesas: r.despesas,
      receitas: r.receitas,
      saldo: r.receitas - r.despesas
    }));

    const response = { data };

    if (!hasMonthsFilter) {
      await cacheService.cacheMonthlySummary(req.user.id, response);
    }

    res.json(response);
  } catch (error) {
    console.error("Monthly summary error:", error);
    res.status(500).json(createError(500, "Erro ao buscar resumo mensal"));
  }
});

/**
 * POST /records
 * Create new transaction
 */
router.post("/", authenticateToken, createTransactionValidation, async (req, res) => {
  try {
    const { description, value, type, category, isRecurrent, billingDay, isPaid, date } = req.body;

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
    // Income transactions are always considered paid
    if (type === 'credito') {
      transactionData.isPaid = true;
    } else if (isPaid !== undefined) {
      transactionData.isPaid = isPaid;
    }
    if (date) transactionData.timestamp = new Date(date);

    const transaction = await transactionService.addTransaction(req.user.id, transactionData);

    // Only adjust balance when the transaction is marked as paid
    let balance;
    if (transaction.isPaid) {
      const delta = userService.getBalanceDelta(transaction.value, transaction.type);
      const updatedUser = await userService.adjustBalance(req.user.id, delta);
      await cacheService.invalidateUser(req.user.id);
      balance = updatedUser.balance;
    } else {
      const user = await userService.findById(req.user.id);
      balance = user.balance;
    }

    await cacheService.invalidateTransactions(req.user.id);
    res.status(201).json({ transaction, balance });
  } catch (error) {
    console.error("Create transaction error:", error);
    res.status(500).json(createError(500, "Erro ao criar transação"));
  }
});

/**
 * GET /records/import/banks
 * List available bank mapping options
 */
router.get("/import/banks", authenticateToken, (req, res) => {
  const banks = Object.entries(BANK_MAPPINGS).map(([key, mapping]) => ({
    key,
    label: mapping.label
  }));
  // Always include the custom option
  banks.push({ key: 'custom', label: 'Importação Customizada' });
  res.json(banks);
});

/**
 * POST /records/import/preview
 * Upload CSV + bank selection → returns parsed preview rows for user review.
 * Body (multipart): file, bankKey, customMapping (JSON string, only for bankKey=custom)
 */
router.post(
  "/import/preview",
  authenticateToken,
  upload.single("file"),
  async (req, res) => {
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

      const { rows, errors, headers } = await csvImportService.generatePreview(
        req.file.buffer,
        req.user.id,
        bankKey,
        customMapping
      );

      res.json({ rows, errors, headers });
    } catch (error) {
      console.error("Import preview error:", error);
      res.status(400).json(createError(400, error.message || "Erro ao processar CSV"));
    }
  }
);

/**
 * POST /records/import/confirm
 * Receive user-reviewed transaction rows and bulk-create them.
 * Body: { transactions: [{ description, value, type, categoryId, date, isPaid }] }
 */
router.post("/import/confirm", authenticateToken, async (req, res) => {
  try {
    const { transactions } = req.body;

    if (!Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json(createError(400, "Nenhuma transação para importar"));
    }

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

      const value = parseFloat(tx.value);
      if (isNaN(value) || value <= 0) {
        validationErrors.push(`${lineLabel}: valor inválido`);
        continue;
      }

      // Verify category belongs to user
      const category = await categoryService.getCategoryById(req.user.id, tx.categoryId);
      if (!category) {
        validationErrors.push(`${lineLabel}: categoria não encontrada`);
        continue;
      }

      docs.push({
        description: tx.description,
        value: Math.round(value * 100),
        type: tx.type,
        category: tx.categoryId,
        timestamp: new Date(tx.date),
        isPaid: tx.type === 'credito' ? true : (tx.isPaid || false)
      });
    }

    if (docs.length === 0) {
      return res.status(400).json(createError(400, "Nenhuma transação válida para importar", validationErrors));
    }

    // Bulk add
    const result = await transactionService.bulkAddTransactions(req.user.id, docs);

    // Adjust balance for paid transactions
    if (result.createdCount > 0 && result.insertedDocs) {
      let netDelta = 0;
      for (const tx of result.insertedDocs) {
        if (tx.isPaid) {
          netDelta += userService.getBalanceDelta(tx.value, tx.type);
        }
      }
      if (netDelta !== 0) {
        await userService.adjustBalance(req.user.id, netDelta);
        await cacheService.invalidateUser(req.user.id);
      }
    }

    await cacheService.invalidateTransactions(req.user.id);

    // Return updated balance
    const user = await userService.findById(req.user.id);

    res.status(201).json({
      message: "Importação concluída",
      createdCount: result.createdCount,
      skippedCount: result.skippedCount,
      errorCount: result.errorCount + validationErrors.length,
      errors: [...validationErrors, ...result.errors],
      balance: user.balance
    });
  } catch (error) {
    console.error("Import confirm error:", error);
    res.status(500).json(createError(500, error.message || "Erro ao importar transações"));
  }
});

/**
 * POST /records/bulk-delete
 * Delete multiple transactions by IDs
 */
router.post("/bulk-delete", authenticateToken, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json(createError(400, "ids deve ser um array não vazio"));
    }
    if (ids.length > 200) {
      return res.status(400).json(createError(400, "Máximo de 200 transações por operação"));
    }

    const { deletedCount, deletedTransactions } = await transactionService.bulkDeleteTransactions(req.user.id, ids);

    // Reverse balance for paid transactions
    let netDelta = 0;
    for (const tx of deletedTransactions) {
      if (tx.isPaid) {
        netDelta -= userService.getBalanceDelta(tx.value, tx.type);
      }
    }

    let balance;
    if (netDelta !== 0) {
      const updatedUser = await userService.adjustBalance(req.user.id, netDelta);
      await cacheService.invalidateUser(req.user.id);
      balance = updatedUser.balance;
    } else {
      const user = await userService.findById(req.user.id);
      balance = user.balance;
    }

    await cacheService.invalidateTransactions(req.user.id);
    res.json({ message: `${deletedCount} transação(ões) excluída(s)`, deletedCount, balance });
  } catch (error) {
    console.error("Bulk delete error:", error);
    res.status(500).json(createError(500, error.message || "Erro ao excluir transações"));
  }
});

/**
 * POST /records/bulk-update
 * Update multiple transactions with the same field values
 */
router.post("/bulk-update", authenticateToken, async (req, res) => {
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
    const allowedFields = ['description', 'value', 'type', 'category', 'isPaid', 'isRecurrent', 'billingDay'];
    for (const field of allowedFields) {
      if (updates[field] !== undefined) safeUpdates[field] = updates[field];
    }
    if (updates.date !== undefined) safeUpdates.timestamp = new Date(updates.date);

    // Income transactions are always paid.
    // If changing type to credito, force isPaid = true for all.
    // Otherwise, split: credito txs always keep isPaid = true, debito txs use provided value.
    if (safeUpdates.type === 'credito') {
      safeUpdates.isPaid = true;
    }

    let updatedCount, oldTransactions, newTransactions;

    if (safeUpdates.type !== 'credito' && safeUpdates.isPaid !== undefined) {
      // Need to protect existing credito transactions from isPaid = false
      const Transaction = require('../models/schemas/transaction.schema');
      const targetTxs = await Transaction.find({ _id: { $in: ids }, userId: req.user.id });
      const creditoIds = targetTxs.filter(tx => tx.type === 'credito').map(tx => tx._id.toString());
      const debitoIds = targetTxs.filter(tx => tx.type !== 'credito').map(tx => tx._id.toString());

      // Update credito transactions with isPaid forced to true
      const creditoUpdates = { ...safeUpdates, isPaid: true };
      const creditoResult = creditoIds.length > 0
        ? await transactionService.bulkUpdateTransactions(req.user.id, creditoIds, creditoUpdates)
        : { updatedCount: 0, oldTransactions: [], newTransactions: [] };

      // Update debito transactions normally
      const debitoResult = debitoIds.length > 0
        ? await transactionService.bulkUpdateTransactions(req.user.id, debitoIds, safeUpdates)
        : { updatedCount: 0, oldTransactions: [], newTransactions: [] };

      updatedCount = creditoResult.updatedCount + debitoResult.updatedCount;
      oldTransactions = [...creditoResult.oldTransactions, ...debitoResult.oldTransactions];
      newTransactions = [...creditoResult.newTransactions, ...debitoResult.newTransactions];
    } else {
      const result = await transactionService.bulkUpdateTransactions(req.user.id, ids, safeUpdates);
      updatedCount = result.updatedCount;
      oldTransactions = result.oldTransactions;
      newTransactions = result.newTransactions;
    }

    // Recalculate balance delta
    let netDelta = 0;
    for (const oldTx of oldTransactions) {
      if (oldTx.isPaid) {
        netDelta -= userService.getBalanceDelta(oldTx.value, oldTx.type);
      }
    }
    for (const newTx of newTransactions) {
      if (newTx.isPaid) {
        netDelta += userService.getBalanceDelta(newTx.value, newTx.type);
      }
    }

    let balance;
    if (netDelta !== 0) {
      const updatedUser = await userService.adjustBalance(req.user.id, netDelta);
      await cacheService.invalidateUser(req.user.id);
      balance = updatedUser.balance;
    } else {
      const user = await userService.findById(req.user.id);
      balance = user.balance;
    }

    await cacheService.invalidateTransactions(req.user.id);
    res.json({ message: `${updatedCount} transação(ões) atualizada(s)`, updatedCount, balance });
  } catch (error) {
    console.error("Bulk update error:", error);
    res.status(500).json(createError(500, error.message || "Erro ao atualizar transações"));
  }
});

/**
 * GET /records/:id
 * Get single transaction
 */
router.get("/:id", authenticateToken, transactionIdValidation, async (req, res) => {
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
});

/**
 * PUT /records/:id
 * Update transaction
 */
router.put("/:id", authenticateToken, updateTransactionValidation, async (req, res) => {
  try {
    const { description, value, type, category, date, isRecurrent, billingDay, isActive, isPaid } = req.body;

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

    // Income transactions are always considered paid
    const effectiveType = type || (await transactionService.getTransactionById(req.user.id, req.params.id))?.type;
    if (effectiveType === 'credito') updates.isPaid = true;

    const { oldTransaction, newTransaction } = await transactionService.updateTransaction(
      req.user.id,
      req.params.id,
      updates,
    );

    // Balance adjustment depends on isPaid state transition:
    //   unpaid → paid:   apply new delta
    //   paid → unpaid:   reverse old delta
    //   paid → paid:     reverse old, apply new (net change)
    //   unpaid → unpaid: no balance change
    const wasPaid = oldTransaction.isPaid;
    const nowPaid = newTransaction.isPaid;

    let netDelta = 0;
    if (wasPaid) netDelta -= userService.getBalanceDelta(oldTransaction.value, oldTransaction.type);
    if (nowPaid) netDelta += userService.getBalanceDelta(newTransaction.value, newTransaction.type);

    let balance;
    if (netDelta !== 0) {
      const updatedUser = await userService.adjustBalance(req.user.id, netDelta);
      await cacheService.invalidateUser(req.user.id);
      balance = updatedUser.balance;
    } else {
      const user = await userService.findById(req.user.id);
      balance = user.balance;
    }

    await cacheService.invalidateTransactions(req.user.id);
    res.json({ transaction: newTransaction, balance });
  } catch (error) {
    console.error("Update transaction error:", error);
    res.status(500).json(createError(500, error.message));
  }
});

/**
 * DELETE /records/:id
 * Delete transaction
 */
router.delete("/:id", authenticateToken, transactionIdValidation, async (req, res) => {
  try {
    const deleted = await transactionService.deleteTransaction(req.user.id, req.params.id);

    // Only reverse balance if the deleted transaction was paid
    let balance;
    if (deleted.isPaid) {
      const delta = userService.getBalanceDelta(deleted.value, deleted.type);
      const updatedUser = await userService.adjustBalance(req.user.id, -delta);
      await cacheService.invalidateUser(req.user.id);
      balance = updatedUser.balance;
    } else {
      const user = await userService.findById(req.user.id);
      balance = user.balance;
    }

    await cacheService.invalidateTransactions(req.user.id);
    res.json({ message: "Transação excluída com sucesso", balance });
  } catch (error) {
    console.error("Delete transaction error:", error);
    res.status(500).json(createError(500, error.message));
  }
});

module.exports = router;
