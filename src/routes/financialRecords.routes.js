const router = require("express").Router();
const userService = require("../services/user.service");
const transactionService = require("../services/transaction.service");
const categoryService = require("../services/category.service");
const { authenticateToken } = require("../middlewares/auth.middleware");
const createError = require("../middlewares/createError");
const multer = require("multer");
const { parse } = require("csv-parse/sync");
const { TRANSACTION_TYPE_VALUES } = require('../constants/transactionTypes');
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
 * POST /records/import
 * Import transactions from CSV file
 * Expected CSV format:
 * date,type,category,description,value
 * 2024-01-15,debito,Alimentação,Almoço,35.50
 */
router.post(
  "/import",
  authenticateToken,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json(createError(400, "Nenhum arquivo enviado"));
      }

      // Parse CSV
      const csvContent = req.file.buffer.toString("utf-8");

      let records;
      try {
        records = parse(csvContent, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
        });
      } catch (parseError) {
        return res
          .status(400)
          .json(
            createError(400, "Erro ao processar CSV: " + parseError.message),
          );
      }

      if (!records || records.length === 0) {
        return res
          .status(400)
          .json(createError(400, "Arquivo CSV vazio ou inválido"));
      }

      // Transform CSV records to transaction format
      const transactions = records.map((record, index) => {
        // Validate required fields
        if (
          !record.date ||
          !record.type ||
          !record.category ||
          !record.description ||
          !record.value
        ) {
          throw new Error(
            `Linha ${index + 2}: Campos obrigatórios faltando (date, type, category, description, value)`,
          );
        }

        // Validate type
        if (!TRANSACTION_TYPE_VALUES.includes(record.type)) {
          throw new Error(
            `Linha ${index + 2}: Tipo inválido "${record.type}". Use "credito" ou "debito"`,
          );
        }

        // Parse value and convert to cents
        const value = parseFloat(record.value);
        if (isNaN(value)) {
          throw new Error(
            `Linha ${index + 2}: Valor inválido "${record.value}"`,
          );
        }
        return {
          description: record.description,
          value: Math.round(value * 100), // Convert to cents
          type: record.type,
          category: record.category,
          timestamp: new Date(record.date),
        };
      });

      // Bulk add transactions
      const result = await transactionService.bulkAddTransactions(
        req.user.id,
        transactions,
      );

      // Compute net balance delta only for paid transactions
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
      res.status(201).json({
        message: "Importação concluída",
        createdCount: result.createdCount,
        skippedCount: result.skippedCount,
        errorCount: result.errorCount,
        errors: result.errors,
      });
    } catch (error) {
      console.error("Import CSV error:", error);
      res
        .status(500)
        .json(createError(500, error.message || "Erro ao importar CSV"));
    }
  },
);

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
