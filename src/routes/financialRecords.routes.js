const router = require("express").Router();
const userService = require("../services/user.service");
const transactionService = require("../services/transaction.service");
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
    const { page, limit, type } = req.query;
    const transactions = await transactionService.getTransactions(req.user.id, {
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
      type,
      isRecurrent: false
    });
    res.json(transactions);
  } catch (error) {
    console.error("Get transactions error:", error);
    res.status(500).json(createError(500, "Erro ao buscar transações"));
  }
});

/**
 * POST /records
 * Create new transaction
 */
router.post("/", authenticateToken, createTransactionValidation, async (req, res) => {
  try {
    const { description, value, type, category } = req.body;

    // Validate category exists
    const user = await userService.findById(req.user.id);
    const categoryExists = user.findCategory(category);

    if (!categoryExists) {
      return res.status(400).json(createError(400, "Categoria não encontrada"));
    }

    const transaction = await transactionService.addTransaction(req.user.id, {
      description,
      value,
      type,
      category,
    });

    res.status(201).json(transaction);
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
            `Row ${index + 2}: Invalid type "${record.type}". Use "credito" or "debito"`,
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

      res.status(201).json({
        message: "Importação concluída",
        createdCount: result.createdCount,
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
    const { description, value, type, category, date } = req.body;

    const updates = {};
    if (description !== undefined) updates.description = description;
    if (value !== undefined) updates.value = value;
    if (type !== undefined) updates.type = type;
    if (category !== undefined) updates.category = category;
    if (date !== undefined) updates.timestamp = new Date(date);

    const transaction = await transactionService.updateTransaction(
      req.user.id,
      req.params.id,
      updates,
    );

    res.json(transaction);
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
    await transactionService.deleteTransaction(req.user.id, req.params.id);
    res.json({ message: "Transação excluída com sucesso" });
  } catch (error) {
    console.error("Delete transaction error:", error);
    res.status(500).json(createError(500, error.message));
  }
});

module.exports = router;
