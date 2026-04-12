const router = require("express").Router();
const transactionController = require("../controllers/transaction.controller");
const { authenticateToken } = require("../middlewares/auth.middleware");
const multer = require("multer");
const { 
  createTransactionValidation, 
  updateTransactionValidation,
  transactionIdValidation,
  bulkDeleteValidation,
  bulkUpdateValidation,
  importConfirmValidation
} = require('../middlewares/validators');

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

/** GET /records */
router.get("/", authenticateToken, transactionController.getAll);

/** GET /records/calendar */
router.get("/calendar", authenticateToken, transactionController.getCalendar);

/** GET /records/monthly-summary */
router.get("/monthly-summary", authenticateToken, transactionController.getMonthlySummary);

/** GET /records/dashboard */
router.get("/dashboard", authenticateToken, transactionController.getDashboard);

/** POST /records */
router.post("/", authenticateToken, createTransactionValidation, transactionController.create);

/** GET /records/import/banks */
router.get("/import/banks", authenticateToken, transactionController.getImportBanks);

/** POST /records/import/preview */
router.post("/import/preview", authenticateToken, upload.single("file"), transactionController.importPreview);

/** POST /records/import/confirm */
router.post("/import/confirm", authenticateToken, importConfirmValidation, transactionController.importConfirm);

/** POST /records/bulk-delete */
router.post("/bulk-delete", authenticateToken, bulkDeleteValidation, transactionController.bulkDelete);

/** POST /records/bulk-update */
router.post("/bulk-update", authenticateToken, bulkUpdateValidation, transactionController.bulkUpdate);

/** GET /records/:id */
router.get("/:id", authenticateToken, transactionIdValidation, transactionController.getById);

/** PUT /records/:id */
router.put("/:id", authenticateToken, updateTransactionValidation, transactionController.update);

/** DELETE /records/:id */
router.delete("/:id", authenticateToken, transactionIdValidation, transactionController.remove);

module.exports = router;
