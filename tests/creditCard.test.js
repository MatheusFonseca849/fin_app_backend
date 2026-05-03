const request = require('supertest');
const { setupTestDB } = require('./setup');
const { createAuthenticatedUser, createDefaultCategories } = require('./helpers');

jest.mock('../src/config/redis', () => ({
  client: null,
  isConnected: false,
  connect: jest.fn(),
  getClient: jest.fn(() => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    scan: jest.fn().mockResolvedValue(['0', []]),
    quit: jest.fn().mockResolvedValue('OK'),
  })),
  disconnect: jest.fn(),
}));

jest.mock('../src/services/email.service', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(true),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
  sendEmailChangeVerification: jest.fn().mockResolvedValue(true),
}));

jest.mock('../src/utils/upload.utils', () => ({
  uploadAvatar: jest.fn().mockResolvedValue('https://example.com/avatar.jpg'),
  deleteAvatar: jest.fn().mockResolvedValue(true),
}));

const app = require('../src/app');
const Transaction = require('../src/models/schemas/transaction.schema');
const User = require('../src/models/User.model');
const creditCardService = require('../src/services/creditCard.service');

setupTestDB();

const ORIGIN = process.env.CLIENT_URL;

describe('Credit Card', () => {
  let authUser, token, expenseCategory, semCategoria;

  beforeEach(async () => {
    const result = await createAuthenticatedUser({
      preferences: {
        creditCardClosingDay: 15,
        creditCardDueDay: 5,
      },
    });
    authUser = result.user;
    token = result.accessToken;
    const cats = await createDefaultCategories(authUser._id);
    expenseCategory = cats.find(c => c.type === 'expense' && c.name !== 'Sem Categoria');
    semCategoria = cats.find(c => c.name === 'Sem Categoria');
  });

  // ============================================
  // _getCycleKey
  // ============================================
  describe('_getCycleKey', () => {
    it('should return current month when date is before closing day', () => {
      const date = new Date(Date.UTC(2025, 0, 10)); // Jan 10, closing=15
      const key = creditCardService._getCycleKey(date, 15);
      expect(key).toBe('2025-0');
    });

    it('should roll to next month when date is after closing day', () => {
      const date = new Date(Date.UTC(2025, 0, 20)); // Jan 20, closing=15
      const key = creditCardService._getCycleKey(date, 15);
      expect(key).toBe('2025-1');
    });

    it('should stay in current month on closing day itself', () => {
      const date = new Date(Date.UTC(2025, 0, 15)); // Jan 15, closing=15
      const key = creditCardService._getCycleKey(date, 15);
      expect(key).toBe('2025-0');
    });

    it('should roll to next year when December exceeds closing day', () => {
      const date = new Date(Date.UTC(2025, 11, 20)); // Dec 20, closing=15
      const key = creditCardService._getCycleKey(date, 15);
      expect(key).toBe('2026-0');
    });

    it('should handle closing day 1', () => {
      const date = new Date(Date.UTC(2025, 5, 2)); // Jun 2, closing=1
      const key = creditCardService._getCycleKey(date, 1);
      expect(key).toBe('2025-6'); // rolls to July
    });

    it('should handle closing day 31', () => {
      const date = new Date(Date.UTC(2025, 5, 15)); // Jun 15, closing=31
      const key = creditCardService._getCycleKey(date, 31);
      expect(key).toBe('2025-5'); // stays June
    });
  });

  // ============================================
  // generateFatura
  // ============================================
  describe('generateFatura', () => {
    it('should return null when no unpaid CC expenses exist', async () => {
      const result = await creditCardService.generateFatura(
        authUser._id.toString(),
        authUser.preferences
      );
      expect(result).toBeNull();
    });

    it('should create a fatura from unpaid CC expenses in same cycle', async () => {
      await Transaction.create([
        {
          userId: authUser._id,
          description: 'CC Expense 1',
          value: 5000,
          type: 'expense',
          paymentMode: 'credit',
          category: expenseCategory._id,
          isRecurrent: false,
          isPaid: false,
          timestamp: new Date(Date.UTC(2025, 3, 10)), // Apr 10 → April cycle
        },
        {
          userId: authUser._id,
          description: 'CC Expense 2',
          value: 3000,
          type: 'expense',
          paymentMode: 'credit',
          category: expenseCategory._id,
          isRecurrent: false,
          isPaid: false,
          timestamp: new Date(Date.UTC(2025, 3, 12)), // Apr 12 → April cycle
        },
      ]);

      const faturas = await creditCardService.generateFatura(
        authUser._id.toString(),
        authUser.preferences
      );

      expect(faturas).not.toBeNull();
      expect(faturas.length).toBe(1);
      expect(faturas[0].value).toBe(8000);
      expect(faturas[0].type).toBe('expense');
      expect(faturas[0].paymentMode).toBe('debit');
      expect(faturas[0].isPaid).toBe(false);
      expect(faturas[0].description).toMatch(/^Fatura - /);

      // Original CC expenses should now be marked as paid
      const ccExpenses = await Transaction.find({
        userId: authUser._id,
        paymentMode: 'credit',
      });
      expect(ccExpenses.every(e => e.isPaid === true)).toBe(true);
    });

    it('should bucket expenses into separate faturas by billing cycle', async () => {
      await Transaction.create([
        {
          userId: authUser._id,
          description: 'April expense',
          value: 2000,
          type: 'expense',
          paymentMode: 'credit',
          category: expenseCategory._id,
          isRecurrent: false,
          isPaid: false,
          timestamp: new Date(Date.UTC(2025, 3, 10)), // Apr 10 → April cycle
        },
        {
          userId: authUser._id,
          description: 'May expense',
          value: 3000,
          type: 'expense',
          paymentMode: 'credit',
          category: expenseCategory._id,
          isRecurrent: false,
          isPaid: false,
          timestamp: new Date(Date.UTC(2025, 3, 20)), // Apr 20 → May cycle (after closing=15)
        },
      ]);

      const faturas = await creditCardService.generateFatura(
        authUser._id.toString(),
        authUser.preferences
      );

      expect(faturas).not.toBeNull();
      expect(faturas.length).toBe(2);

      const values = faturas.map(f => f.value).sort((a, b) => a - b);
      expect(values).toEqual([2000, 3000]);
    });

    it('should bucket expenses by source (bank)', async () => {
      await Transaction.create([
        {
          userId: authUser._id,
          description: 'Nubank expense',
          value: 1000,
          type: 'expense',
          paymentMode: 'credit',
          source: 'Nubank',
          category: expenseCategory._id,
          isRecurrent: false,
          isPaid: false,
          timestamp: new Date(Date.UTC(2025, 3, 10)),
        },
        {
          userId: authUser._id,
          description: 'Itaú expense',
          value: 2000,
          type: 'expense',
          paymentMode: 'credit',
          source: 'Itaú',
          category: expenseCategory._id,
          isRecurrent: false,
          isPaid: false,
          timestamp: new Date(Date.UTC(2025, 3, 10)),
        },
      ]);

      const faturas = await creditCardService.generateFatura(
        authUser._id.toString(),
        authUser.preferences
      );

      expect(faturas).not.toBeNull();
      expect(faturas.length).toBe(2);

      const descriptions = faturas.map(f => f.description);
      expect(descriptions.some(d => d.includes('Nubank'))).toBe(true);
      expect(descriptions.some(d => d.includes('Itaú'))).toBe(true);
    });

    it('should not include recurrent templates in fatura', async () => {
      await Transaction.create([
        {
          userId: authUser._id,
          description: 'Recurrent subscription',
          value: 1500,
          type: 'expense',
          paymentMode: 'credit',
          category: expenseCategory._id,
          isRecurrent: true,
          billingDay: 10,
          isPaid: false,
        },
        {
          userId: authUser._id,
          description: 'One-time purchase',
          value: 3000,
          type: 'expense',
          paymentMode: 'credit',
          category: expenseCategory._id,
          isRecurrent: false,
          isPaid: false,
          timestamp: new Date(Date.UTC(2025, 3, 10)),
        },
      ]);

      const faturas = await creditCardService.generateFatura(
        authUser._id.toString(),
        authUser.preferences
      );

      expect(faturas).not.toBeNull();
      expect(faturas.length).toBe(1);
      expect(faturas[0].value).toBe(3000);
    });

    it('should not include already-paid CC expenses', async () => {
      await Transaction.create([
        {
          userId: authUser._id,
          description: 'Already paid CC',
          value: 5000,
          type: 'expense',
          paymentMode: 'credit',
          category: expenseCategory._id,
          isRecurrent: false,
          isPaid: true, // already compiled
          timestamp: new Date(Date.UTC(2025, 3, 10)),
        },
        {
          userId: authUser._id,
          description: 'New CC expense',
          value: 2000,
          type: 'expense',
          paymentMode: 'credit',
          category: expenseCategory._id,
          isRecurrent: false,
          isPaid: false,
          timestamp: new Date(Date.UTC(2025, 3, 12)),
        },
      ]);

      const faturas = await creditCardService.generateFatura(
        authUser._id.toString(),
        authUser.preferences
      );

      expect(faturas).not.toBeNull();
      expect(faturas.length).toBe(1);
      expect(faturas[0].value).toBe(2000);
    });

    it('should use Sem Categoria for fatura category', async () => {
      await Transaction.create({
        userId: authUser._id,
        description: 'CC purchase',
        value: 1000,
        type: 'expense',
        paymentMode: 'credit',
        category: expenseCategory._id,
        isRecurrent: false,
        isPaid: false,
        timestamp: new Date(Date.UTC(2025, 3, 10)),
      });

      const faturas = await creditCardService.generateFatura(
        authUser._id.toString(),
        authUser.preferences
      );

      expect(faturas[0].category.toString()).toBe(semCategoria._id.toString());
    });
  });

  // ============================================
  // recompileFatura
  // ============================================
  describe('recompileFatura', () => {
    it('should return null faturas and 0 deletedCount when no CC expenses', async () => {
      const result = await creditCardService.recompileFatura(authUser._id.toString());
      expect(result.faturas).toBeNull();
      expect(result.deletedCount).toBe(0);
    });

    it('should delete old faturas and regenerate with new expenses', async () => {
      // Create initial CC expense
      await Transaction.create({
        userId: authUser._id,
        description: 'CC Expense 1',
        value: 5000,
        type: 'expense',
        paymentMode: 'credit',
        category: expenseCategory._id,
        isRecurrent: false,
        isPaid: false,
        timestamp: new Date(Date.UTC(2025, 3, 10)),
      });

      // Generate initial fatura
      await creditCardService.generateFatura(
        authUser._id.toString(),
        authUser.preferences
      );

      let faturas = await Transaction.find({
        userId: authUser._id,
        description: { $regex: /^Fatura - / },
      });
      expect(faturas.length).toBe(1);
      expect(faturas[0].value).toBe(5000);

      // Add another CC expense
      await Transaction.create({
        userId: authUser._id,
        description: 'CC Expense 2',
        value: 3000,
        type: 'expense',
        paymentMode: 'credit',
        category: expenseCategory._id,
        isRecurrent: false,
        isPaid: false,
        timestamp: new Date(Date.UTC(2025, 3, 12)),
      });

      // Recompile
      const result = await creditCardService.recompileFatura(authUser._id.toString());

      expect(result.deletedCount).toBe(1);
      expect(result.faturas).not.toBeNull();

      // Should have a single fatura with combined value
      faturas = await Transaction.find({
        userId: authUser._id,
        description: { $regex: /^Fatura - / },
      });
      expect(faturas.length).toBe(1);
      expect(faturas[0].value).toBe(8000);
    });

    it('should not create duplicate faturas for past months', async () => {
      // Expenses in two different billing cycles
      await Transaction.create([
        {
          userId: authUser._id,
          description: 'March CC',
          value: 2000,
          type: 'expense',
          paymentMode: 'credit',
          category: expenseCategory._id,
          isRecurrent: false,
          isPaid: false,
          timestamp: new Date(Date.UTC(2025, 2, 10)), // March cycle
        },
        {
          userId: authUser._id,
          description: 'April CC',
          value: 4000,
          type: 'expense',
          paymentMode: 'credit',
          category: expenseCategory._id,
          isRecurrent: false,
          isPaid: false,
          timestamp: new Date(Date.UTC(2025, 3, 10)), // April cycle
        },
      ]);

      // Generate initial faturas
      await creditCardService.generateFatura(
        authUser._id.toString(),
        authUser.preferences
      );

      let faturas = await Transaction.find({
        userId: authUser._id,
        description: { $regex: /^Fatura - / },
      });
      expect(faturas.length).toBe(2);

      // Recompile — must still have exactly 2 (no duplicates)
      await creditCardService.recompileFatura(authUser._id.toString());

      faturas = await Transaction.find({
        userId: authUser._id,
        description: { $regex: /^Fatura - / },
      });
      expect(faturas.length).toBe(2);

      const values = faturas.map(f => f.value).sort((a, b) => a - b);
      expect(values).toEqual([2000, 4000]);
    });

    it('should reverse balance of paid faturas during recompile', async () => {
      await User.findByIdAndUpdate(authUser._id, { balance: 0 });

      await Transaction.create({
        userId: authUser._id,
        description: 'CC Expense',
        value: 5000,
        type: 'expense',
        paymentMode: 'credit',
        category: expenseCategory._id,
        isRecurrent: false,
        isPaid: false,
        timestamp: new Date(Date.UTC(2025, 3, 10)),
      });

      await creditCardService.generateFatura(
        authUser._id.toString(),
        authUser.preferences
      );

      // Simulate paying the fatura
      const fatura = await Transaction.findOne({
        userId: authUser._id,
        description: { $regex: /^Fatura - / },
      });
      fatura.isPaid = true;
      await fatura.save();
      await User.findByIdAndUpdate(authUser._id, { balance: -5000 });

      // Recompile — should reverse the paid fatura balance
      await creditCardService.recompileFatura(authUser._id.toString());

      const user = await User.findById(authUser._id);
      // -5000 + 5000 (reversal) = 0; new fatura is unpaid so no balance change
      expect(user.balance).toBe(0);
    });

    it('should be atomic — CC expenses stay consistent with faturas', async () => {
      await Transaction.create({
        userId: authUser._id,
        description: 'CC Expense',
        value: 5000,
        type: 'expense',
        paymentMode: 'credit',
        category: expenseCategory._id,
        isRecurrent: false,
        isPaid: false,
        timestamp: new Date(Date.UTC(2025, 3, 10)),
      });

      await creditCardService.recompileFatura(authUser._id.toString());

      // After recompile, all CC expenses should be paid (compiled into faturas)
      const ccExpenses = await Transaction.find({
        userId: authUser._id,
        paymentMode: 'credit',
        isRecurrent: false,
      });
      expect(ccExpenses.every(e => e.isPaid === true)).toBe(true);

      // And exactly one fatura should exist
      const faturas = await Transaction.find({
        userId: authUser._id,
        description: { $regex: /^Fatura - / },
      });
      expect(faturas.length).toBe(1);
      expect(faturas[0].value).toBe(5000);
    });
  });

  // ============================================
  // POST /records/credit-card/recompile (endpoint)
  // ============================================
  describe('POST /api/v1/records/credit-card/recompile', () => {
    it('should return success with null faturas when no CC expenses', async () => {
      const res = await request(app)
        .post('/api/v1/records/credit-card/recompile')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN);

      expect(res.status).toBe(200);
      expect(res.body.faturas).toBeNull();
      expect(res.body.deletedCount).toBe(0);
      expect(res.body.message).toContain('Nenhuma despesa');
    });

    it('should recompile and return faturas', async () => {
      await Transaction.create({
        userId: authUser._id,
        description: 'CC Expense',
        value: 5000,
        type: 'expense',
        paymentMode: 'credit',
        category: expenseCategory._id,
        isRecurrent: false,
        isPaid: false,
        timestamp: new Date(Date.UTC(2025, 3, 10)),
      });

      const res = await request(app)
        .post('/api/v1/records/credit-card/recompile')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN);

      expect(res.status).toBe(200);
      expect(res.body.faturas).toBeDefined();
      expect(Array.isArray(res.body.faturas)).toBe(true);
      expect(res.body.faturas.length).toBe(1);
      expect(res.body.message).toContain('gerada com sucesso');
    });

    it('should return recompile message when old faturas existed', async () => {
      await Transaction.create({
        userId: authUser._id,
        description: 'CC Expense',
        value: 5000,
        type: 'expense',
        paymentMode: 'credit',
        category: expenseCategory._id,
        isRecurrent: false,
        isPaid: false,
        timestamp: new Date(Date.UTC(2025, 3, 10)),
      });

      // Generate initial fatura
      await creditCardService.generateFatura(
        authUser._id.toString(),
        authUser.preferences
      );

      // Recompile via endpoint
      const res = await request(app)
        .post('/api/v1/records/credit-card/recompile')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN);

      expect(res.status).toBe(200);
      expect(res.body.deletedCount).toBe(1);
      expect(res.body.message).toContain('recompilada');
    });

    it('should reject unauthenticated request', async () => {
      const res = await request(app)
        .post('/api/v1/records/credit-card/recompile');

      expect(res.status).toBe(401);
    });

    it('should isolate faturas between users', async () => {
      const other = await createAuthenticatedUser({
        email: 'other-cc@example.com',
        preferences: { creditCardClosingDay: 15, creditCardDueDay: 5 },
      });
      const otherCats = await createDefaultCategories(other.user._id);
      const otherCat = otherCats.find(c => c.type === 'expense' && c.name !== 'Sem Categoria');

      // Create CC expense for the other user
      await Transaction.create({
        userId: other.user._id,
        description: 'Other user CC',
        value: 9000,
        type: 'expense',
        paymentMode: 'credit',
        category: otherCat._id,
        isRecurrent: false,
        isPaid: false,
        timestamp: new Date(Date.UTC(2025, 3, 10)),
      });

      // Recompile for the first user — should not touch other user's expenses
      const res = await request(app)
        .post('/api/v1/records/credit-card/recompile')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN);

      expect(res.status).toBe(200);
      expect(res.body.faturas).toBeNull(); // first user has no CC expenses

      // Other user's CC expense should remain unpaid and untouched
      const otherExpense = await Transaction.findOne({
        userId: other.user._id,
        description: 'Other user CC',
      });
      expect(otherExpense.isPaid).toBe(false);
    });
  });
});
