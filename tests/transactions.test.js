const request = require('supertest');
const { setupTestDB } = require('./setup');
const { createAuthenticatedUser, createDefaultCategories, randomObjectId } = require('./helpers');

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
const Category = require('../src/models/schemas/category.schema');
const Transaction = require('../src/models/schemas/transaction.schema');
const User = require('../src/models/User.model');

setupTestDB();

const ORIGIN = process.env.CLIENT_URL;

describe('Transaction Endpoints', () => {
  let authUser, token, debitCategory, creditCategory;

  beforeEach(async () => {
    const result = await createAuthenticatedUser();
    authUser = result.user;
    token = result.accessToken;
    const cats = await createDefaultCategories(authUser._id);
    debitCategory = cats.find(c => c.type === 'expense' && c.name !== 'Sem Categoria');
    creditCategory = cats.find(c => c.type === 'income' && c.name !== 'Sem Categoria');
  });

  // ============================================
  // POST /records (create transaction)
  // ============================================
  describe('POST /api/v1/records', () => {
    it('should create a debit transaction', async () => {
      const res = await request(app)
        .post('/api/v1/records')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN)
        .send({
          description: 'Almoço',
          value: 25.50,
          type: 'expense',
          category: debitCategory._id.toString(),
          isPaid: true,
          date: new Date().toISOString(),
        });

      expect(res.status).toBe(201);
      expect(res.body.transaction).toBeDefined();
      expect(res.body.transaction.description).toBe('Almoço');
      // Value should be stored in cents (25.50 * 100 = 2550)
      expect(res.body.transaction.value).toBe(2550);
    });

    it('should adjust user balance when transaction is paid', async () => {
      await request(app)
        .post('/api/v1/records')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN)
        .send({
          description: 'Salary',
          value: 1000.00,
          type: 'income',
          category: creditCategory._id.toString(),
          isPaid: true,
          date: new Date().toISOString(),
        });

      const updated = await User.findById(authUser._id);
      // Credit of 1000.00 = +100000 cents
      expect(updated.balance).toBe(100000);
    });

    it('should NOT adjust balance when transaction is unpaid', async () => {
      await request(app)
        .post('/api/v1/records')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN)
        .send({
          description: 'Future bill',
          value: 50.00,
          type: 'expense',
          category: debitCategory._id.toString(),
          isPaid: false,
        });

      const updated = await User.findById(authUser._id);
      expect(updated.balance).toBe(0);
    });

    it('should reject transaction without description', async () => {
      const res = await request(app)
        .post('/api/v1/records')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN)
        .send({
          value: 10.00,
          type: 'expense',
          category: debitCategory._id.toString(),
        });

      expect(res.status).toBe(400);
    });

    it('should reject transaction with invalid type', async () => {
      const res = await request(app)
        .post('/api/v1/records')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN)
        .send({
          description: 'Invalid',
          value: 10.00,
          type: 'invalid',
          category: debitCategory._id.toString(),
        });

      expect(res.status).toBe(400);
    });

    it('should reject transaction with zero value', async () => {
      const res = await request(app)
        .post('/api/v1/records')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN)
        .send({
          description: 'Zero',
          value: 0,
          type: 'expense',
          category: debitCategory._id.toString(),
        });

      expect(res.status).toBe(400);
    });

    it('should force isPaid=true for credit transactions', async () => {
      const res = await request(app)
        .post('/api/v1/records')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN)
        .send({
          description: 'Freelance',
          value: 500.00,
          type: 'income',
          category: creditCategory._id.toString(),
          isPaid: false, // should be overridden to true
          date: new Date().toISOString(),
        });

      expect(res.status).toBe(201);
      expect(res.body.transaction.isPaid).toBe(true);
    });
  });

  // ============================================
  // GET /records
  // ============================================
  describe('GET /api/v1/records', () => {
    it('should return transactions for the authenticated user', async () => {
      // Create a transaction first
      await Transaction.create({
        userId: authUser._id,
        description: 'Test tx',
        value: 1000,
        type: 'expense',
        category: debitCategory._id,
        isPaid: true,
      });

      const res = await request(app)
        .get('/api/v1/records')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.length).toBe(1);
    });

    it('should not return transactions from other users', async () => {
      const other = await createAuthenticatedUser({ email: 'other-tx@example.com' });
      const otherCats = await createDefaultCategories(other.user._id);
      const otherCat = otherCats.find(c => c.type === 'expense');

      await Transaction.create({
        userId: other.user._id,
        description: 'Other user tx',
        value: 500,
        type: 'expense',
        category: otherCat._id,
        isPaid: true,
      });

      const res = await request(app)
        .get('/api/v1/records')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(0);
    });

    it('should reject unauthenticated request', async () => {
      const res = await request(app)
        .get('/api/v1/records');

      expect(res.status).toBe(401);
    });
  });

  // ============================================
  // PUT /records/:id (update)
  // ============================================
  describe('PUT /api/v1/records/:id', () => {
    it('should update a transaction description', async () => {
      const tx = await Transaction.create({
        userId: authUser._id,
        description: 'Original',
        value: 1000,
        type: 'expense',
        category: debitCategory._id,
        isPaid: false,
      });

      const res = await request(app)
        .put(`/api/v1/records/${tx._id}`)
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN)
        .send({ description: 'Updated' });

      expect(res.status).toBe(200);
      expect(res.body.transaction.description).toBe('Updated');
    });

    it('should adjust balance when marking as paid', async () => {
      const tx = await Transaction.create({
        userId: authUser._id,
        description: 'Bill',
        value: 5000,
        type: 'expense',
        category: debitCategory._id,
        isPaid: false,
      });

      const res = await request(app)
        .put(`/api/v1/records/${tx._id}`)
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN)
        .send({ isPaid: true });

      expect(res.status).toBe(200);

      const updated = await User.findById(authUser._id);
      // Debit of 5000 cents = -5000
      expect(updated.balance).toBe(-5000);
    });

    it('should return 404 for non-existent transaction', async () => {
      const fakeId = randomObjectId();
      const res = await request(app)
        .put(`/api/v1/records/${fakeId}`)
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN)
        .send({ description: 'Ghost' });

      expect(res.status).toBe(404);
    });
  });

  // ============================================
  // DELETE /records/:id
  // ============================================
  describe('DELETE /api/v1/records/:id', () => {
    it('should delete a transaction and adjust balance', async () => {
      // Start with balance = 5000
      await User.findByIdAndUpdate(authUser._id, { balance: 5000 });

      const tx = await Transaction.create({
        userId: authUser._id,
        description: 'To delete',
        value: 2000,
        type: 'expense',
        category: debitCategory._id,
        isPaid: true,
      });

      const res = await request(app)
        .delete(`/api/v1/records/${tx._id}`)
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN);

      expect(res.status).toBe(200);

      // Deleting a paid debit should add the value back
      const updated = await User.findById(authUser._id);
      expect(updated.balance).toBe(7000);
    });

    it('should not adjust balance when deleting unpaid transaction', async () => {
      await User.findByIdAndUpdate(authUser._id, { balance: 5000 });

      const tx = await Transaction.create({
        userId: authUser._id,
        description: 'Unpaid to delete',
        value: 2000,
        type: 'expense',
        category: debitCategory._id,
        isPaid: false,
      });

      const res = await request(app)
        .delete(`/api/v1/records/${tx._id}`)
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN);

      expect(res.status).toBe(200);

      const updated = await User.findById(authUser._id);
      expect(updated.balance).toBe(5000); // unchanged
    });

    it('should return 404 for non-existent transaction', async () => {
      const fakeId = randomObjectId();
      const res = await request(app)
        .delete(`/api/v1/records/${fakeId}`)
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN);

      expect(res.status).toBe(404);
    });
  });

  // ============================================
  // GET /records/dashboard
  // ============================================
  describe('GET /api/v1/records/dashboard', () => {
    it('should return dashboard data with monthly totals and upcoming expenses', async () => {
      const now = new Date();
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 15);

      // Create paid debit (current month)
      await Transaction.create({
        userId: authUser._id,
        description: 'Grocery',
        value: 5000,
        type: 'expense',
        category: debitCategory._id,
        isPaid: true,
        timestamp: thisMonth,
      });

      // Create paid credit (current month)
      await Transaction.create({
        userId: authUser._id,
        description: 'Salary',
        value: 100000,
        type: 'income',
        category: creditCategory._id,
        isPaid: true,
        timestamp: thisMonth,
      });

      // Create unpaid future debit (upcoming expense)
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      await Transaction.create({
        userId: authUser._id,
        description: 'Upcoming bill',
        value: 3000,
        type: 'expense',
        category: debitCategory._id,
        isPaid: false,
        timestamp: tomorrow,
      });

      const res = await request(app)
        .get('/api/v1/records/dashboard')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('monthlyDebitExpenses');
      expect(res.body).toHaveProperty('monthlyCreditCardTotal');
      expect(res.body).toHaveProperty('monthlyExpensesTotal');
      expect(res.body).toHaveProperty('monthlyIncome');
      expect(res.body).toHaveProperty('monthlyBalance');
      expect(res.body).toHaveProperty('expensesByCategory');
      expect(res.body).toHaveProperty('creditCardByCategory');
      expect(res.body).toHaveProperty('upcomingExpenses');
      expect(res.body.monthlyDebitExpenses).toBe(5000);
      expect(res.body.monthlyIncome).toBe(100000);
      expect(Array.isArray(res.body.expensesByCategory)).toBe(true);
      expect(Array.isArray(res.body.upcomingExpenses)).toBe(true);
      expect(res.body.upcomingExpenses.length).toBe(1);
      expect(res.body.upcomingExpenses[0].description).toBe('Upcoming bill');
    });

    it('should return empty data when no transactions exist', async () => {
      const res = await request(app)
        .get('/api/v1/records/dashboard')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.monthlyDebitExpenses).toBe(0);
      expect(res.body.monthlyCreditCardTotal).toBe(0);
      expect(res.body.monthlyIncome).toBe(0);
      expect(res.body.upcomingExpenses).toEqual([]);
    });

    it('should separate debit and credit card expenses', async () => {
      const now = new Date();
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 15);

      // Debit expense
      await Transaction.create({
        userId: authUser._id,
        description: 'Grocery',
        value: 5000,
        type: 'expense',
        paymentMode: 'debit',
        category: debitCategory._id,
        isPaid: true,
        timestamp: thisMonth,
      });

      // Credit card expense
      await Transaction.create({
        userId: authUser._id,
        description: 'Online purchase',
        value: 8000,
        type: 'expense',
        paymentMode: 'credit',
        category: debitCategory._id,
        isPaid: false,
        timestamp: thisMonth,
      });

      const res = await request(app)
        .get('/api/v1/records/dashboard')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.monthlyDebitExpenses).toBe(5000);
      expect(res.body.monthlyCreditCardTotal).toBe(8000);
      expect(res.body.monthlyExpensesTotal).toBe(13000);
    });

    it('should reject unauthenticated request', async () => {
      const res = await request(app)
        .get('/api/v1/records/dashboard');

      expect(res.status).toBe(401);
    });
  });

  // ============================================
  // Credit Card paymentMode tests
  // ============================================
  describe('Credit Card paymentMode', () => {
    it('should create a credit card expense without affecting balance', async () => {
      await User.findByIdAndUpdate(authUser._id, { balance: 10000 });

      const res = await request(app)
        .post('/api/v1/records')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN)
        .send({
          description: 'CC purchase',
          value: 50.00,
          type: 'expense',
          paymentMode: 'credit',
          category: debitCategory._id.toString(),
          date: new Date().toISOString(),
        });

      expect(res.status).toBe(201);
      expect(res.body.transaction.paymentMode).toBe('credit');
      expect(res.body.transaction.isPaid).toBe(false);

      // Balance should remain unchanged
      const updated = await User.findById(authUser._id);
      expect(updated.balance).toBe(10000);
    });

    it('should create a debit expense that does affect balance when paid', async () => {
      await User.findByIdAndUpdate(authUser._id, { balance: 10000 });

      const res = await request(app)
        .post('/api/v1/records')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN)
        .send({
          description: 'Debit purchase',
          value: 30.00,
          type: 'expense',
          paymentMode: 'debit',
          category: debitCategory._id.toString(),
          isPaid: true,
          date: new Date().toISOString(),
        });

      expect(res.status).toBe(201);
      expect(res.body.transaction.paymentMode).toBe('debit');

      const updated = await User.findById(authUser._id);
      expect(updated.balance).toBe(7000); // 10000 - 3000 cents
    });

    it('should default paymentMode to debit for expenses without paymentMode', async () => {
      const res = await request(app)
        .post('/api/v1/records')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN)
        .send({
          description: 'No mode specified',
          value: 10.00,
          type: 'expense',
          category: debitCategory._id.toString(),
          date: new Date().toISOString(),
        });

      expect(res.status).toBe(201);
      expect(res.body.transaction.paymentMode).toBe('debit');
    });

    it('should force paymentMode=null for income transactions', async () => {
      const res = await request(app)
        .post('/api/v1/records')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN)
        .send({
          description: 'Salary',
          value: 100.00,
          type: 'income',
          paymentMode: 'credit', // should be overridden to null
          category: creditCategory._id.toString(),
          date: new Date().toISOString(),
        });

      expect(res.status).toBe(201);
      expect(res.body.transaction.paymentMode).toBeNull();
    });

    it('should not adjust balance when deleting a credit card expense', async () => {
      await User.findByIdAndUpdate(authUser._id, { balance: 10000 });

      const tx = await Transaction.create({
        userId: authUser._id,
        description: 'CC to delete',
        value: 5000,
        type: 'expense',
        paymentMode: 'credit',
        category: debitCategory._id,
        isPaid: true,
      });

      const res = await request(app)
        .delete(`/api/v1/records/${tx._id}`)
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN);

      expect(res.status).toBe(200);

      const updated = await User.findById(authUser._id);
      expect(updated.balance).toBe(10000); // unchanged
    });

    it('should reject invalid paymentMode value', async () => {
      const res = await request(app)
        .post('/api/v1/records')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN)
        .send({
          description: 'Invalid mode',
          value: 10.00,
          type: 'expense',
          paymentMode: 'bitcoin',
          category: debitCategory._id.toString(),
          date: new Date().toISOString(),
        });

      expect(res.status).toBe(400);
    });
  });

  // ============================================
  // POST /records/bulk-delete
  // ============================================
  describe('POST /api/v1/records/bulk-delete', () => {
    it('should delete multiple transactions and adjust balance', async () => {
      await User.findByIdAndUpdate(authUser._id, { balance: 10000 });

      const tx1 = await Transaction.create({
        userId: authUser._id,
        description: 'Bulk del 1',
        value: 2000,
        type: 'expense',
        category: debitCategory._id,
        isPaid: true,
      });
      const tx2 = await Transaction.create({
        userId: authUser._id,
        description: 'Bulk del 2',
        value: 3000,
        type: 'expense',
        category: debitCategory._id,
        isPaid: true,
      });

      const res = await request(app)
        .post('/api/v1/records/bulk-delete')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN)
        .send({ ids: [tx1._id.toString(), tx2._id.toString()] });

      expect(res.status).toBe(200);
      expect(res.body.deletedCount).toBe(2);

      // Deleting paid debits should restore balance: 10000 + 2000 + 3000 = 15000
      const updated = await User.findById(authUser._id);
      expect(updated.balance).toBe(15000);
    });

    it('should reject empty ids array', async () => {
      const res = await request(app)
        .post('/api/v1/records/bulk-delete')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN)
        .send({ ids: [] });

      expect(res.status).toBe(400);
    });

    it('should reject invalid ObjectIds', async () => {
      const res = await request(app)
        .post('/api/v1/records/bulk-delete')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN)
        .send({ ids: ['not-a-valid-id'] });

      expect(res.status).toBe(400);
    });

    it('should not delete transactions from other users', async () => {
      const other = await createAuthenticatedUser({ email: 'other-bulk@example.com' });
      const otherCats = await createDefaultCategories(other.user._id);
      const otherCat = otherCats.find(c => c.type === 'expense');

      const otherTx = await Transaction.create({
        userId: other.user._id,
        description: 'Other user tx',
        value: 1000,
        type: 'expense',
        category: otherCat._id,
        isPaid: true,
      });

      const res = await request(app)
        .post('/api/v1/records/bulk-delete')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN)
        .send({ ids: [otherTx._id.toString()] });

      expect(res.status).toBe(200);
      expect(res.body.deletedCount).toBe(0);

      // Transaction should still exist
      const still = await Transaction.findById(otherTx._id);
      expect(still).not.toBeNull();
    });
  });

  // ============================================
  // POST /records/bulk-update
  // ============================================
  describe('POST /api/v1/records/bulk-update', () => {
    it('should update multiple transactions', async () => {
      const tx1 = await Transaction.create({
        userId: authUser._id,
        description: 'BU 1',
        value: 1000,
        type: 'expense',
        category: debitCategory._id,
        isPaid: false,
      });
      const tx2 = await Transaction.create({
        userId: authUser._id,
        description: 'BU 2',
        value: 2000,
        type: 'expense',
        category: debitCategory._id,
        isPaid: false,
      });

      const res = await request(app)
        .post('/api/v1/records/bulk-update')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN)
        .send({
          ids: [tx1._id.toString(), tx2._id.toString()],
          updates: { isPaid: true },
        });

      expect(res.status).toBe(200);
      expect(res.body.updatedCount).toBe(2);

      // Balance should decrease by 1000 + 2000 = 3000
      const updated = await User.findById(authUser._id);
      expect(updated.balance).toBe(-3000);
    });

    it('should reject empty ids array', async () => {
      const res = await request(app)
        .post('/api/v1/records/bulk-update')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN)
        .send({ ids: [], updates: { isPaid: true } });

      expect(res.status).toBe(400);
    });

    it('should reject empty updates object', async () => {
      const res = await request(app)
        .post('/api/v1/records/bulk-update')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN)
        .send({ ids: [randomObjectId()], updates: {} });

      expect(res.status).toBe(400);
    });

    it('should reject invalid ObjectIds in ids', async () => {
      const res = await request(app)
        .post('/api/v1/records/bulk-update')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN)
        .send({ ids: ['bad-id'], updates: { isPaid: true } });

      expect(res.status).toBe(400);
    });

    it('should force isPaid=true when changing type to income', async () => {
      const tx = await Transaction.create({
        userId: authUser._id,
        description: 'To credit',
        value: 5000,
        type: 'expense',
        category: debitCategory._id,
        isPaid: false,
      });

      const res = await request(app)
        .post('/api/v1/records/bulk-update')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN)
        .send({
          ids: [tx._id.toString()],
          updates: { type: 'income', category: creditCategory._id.toString() },
        });

      expect(res.status).toBe(200);

      const updated = await Transaction.findById(tx._id);
      expect(updated.type).toBe('income');
      expect(updated.isPaid).toBe(true);
    });
  });

  // ============================================
  // POST /records/import/confirm
  // ============================================
  describe('POST /api/v1/records/import/confirm', () => {
    it('should import valid transactions and adjust balance', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const res = await request(app)
        .post('/api/v1/records/import/confirm')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN)
        .send({
          transactions: [
            {
              description: 'Import 1',
              value: 50.00,
              type: 'expense',
              categoryId: debitCategory._id.toString(),
              date: tomorrow.toISOString(),
              isPaid: true,
            },
            {
              description: 'Import 2',
              value: 100.00,
              type: 'income',
              categoryId: creditCategory._id.toString(),
              date: tomorrow.toISOString(),
              isPaid: true,
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.createdCount).toBe(2);
      expect(res.body.balance).toBeDefined();

      // Net: +10000 (credit) - 5000 (debit) = +5000
      const updated = await User.findById(authUser._id);
      expect(updated.balance).toBe(5000);
    });

    it('should reject empty transactions array', async () => {
      const res = await request(app)
        .post('/api/v1/records/import/confirm')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN)
        .send({ transactions: [] });

      expect(res.status).toBe(400);
    });

    it('should reject transactions with missing required fields', async () => {
      const res = await request(app)
        .post('/api/v1/records/import/confirm')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN)
        .send({
          transactions: [
            { description: 'Missing fields' },
          ],
        });

      expect(res.status).toBe(400);
    });

    it('should reject transactions with invalid categoryId', async () => {
      const res = await request(app)
        .post('/api/v1/records/import/confirm')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN)
        .send({
          transactions: [
            {
              description: 'Bad cat',
              value: 10.00,
              type: 'expense',
              categoryId: 'not-a-mongo-id',
              date: new Date().toISOString(),
            },
          ],
        });

      expect(res.status).toBe(400);
    });

    it('should import credit card transactions without affecting balance', async () => {
      await User.findByIdAndUpdate(authUser._id, { balance: 10000 });
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const res = await request(app)
        .post('/api/v1/records/import/confirm')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN)
        .send({
          transactions: [
            {
              description: 'CC Import 1',
              value: 25.00,
              type: 'expense',
              paymentMode: 'credit',
              categoryId: debitCategory._id.toString(),
              date: tomorrow.toISOString(),
              isPaid: false,
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.createdCount).toBe(1);

      // Balance unchanged for credit card import
      const updated = await User.findById(authUser._id);
      expect(updated.balance).toBe(10000);
    });

    it('should skip duplicate transactions', async () => {
      const date = new Date();
      date.setDate(date.getDate() + 2);

      // Create one transaction first
      await Transaction.create({
        userId: authUser._id,
        description: 'Dup test',
        value: 5000,
        type: 'expense',
        category: debitCategory._id,
        isPaid: true,
        timestamp: date,
      });

      const res = await request(app)
        .post('/api/v1/records/import/confirm')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN)
        .send({
          transactions: [
            {
              description: 'Dup test',
              value: 50.00, // 50.00 * 100 = 5000 cents — matches existing
              type: 'expense',
              categoryId: debitCategory._id.toString(),
              date: date.toISOString(),
              isPaid: true,
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.skippedCount).toBeGreaterThanOrEqual(1);
    });
  });

  // ============================================
  // GET /records/calendar
  // ============================================
  describe('GET /api/v1/records/calendar', () => {
    it('should return calendar transactions for a valid date range', async () => {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
      const startDate = `${y}-${m}-01`;
      const endDate = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;

      await Transaction.create({
        userId: authUser._id,
        description: 'Calendar tx',
        value: 3000,
        type: 'expense',
        category: debitCategory._id,
        isPaid: true,
        timestamp: now,
      });

      const res = await request(app)
        .get(`/api/v1/records/calendar?startDate=${startDate}&endDate=${endDate}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].description).toBe('Calendar tx');
    });

    it('should reject request without startDate or endDate', async () => {
      const res = await request(app)
        .get('/api/v1/records/calendar?startDate=2025-01-01')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
    });

    it('should reject invalid date strings', async () => {
      const res = await request(app)
        .get('/api/v1/records/calendar?startDate=not-a-date&endDate=also-bad')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
    });

    it('should reject date range exceeding 93 days', async () => {
      const res = await request(app)
        .get('/api/v1/records/calendar?startDate=2025-01-01&endDate=2025-12-31')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
    });

    it('should reject reversed date range (end before start)', async () => {
      const res = await request(app)
        .get('/api/v1/records/calendar?startDate=2025-06-01&endDate=2025-01-01')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
    });

    it('should reject unauthenticated request', async () => {
      const res = await request(app)
        .get('/api/v1/records/calendar?startDate=2025-01-01&endDate=2025-01-31');

      expect(res.status).toBe(401);
    });
  });

  // ============================================
  // GET /records/monthly-summary
  // ============================================
  describe('GET /api/v1/records/monthly-summary', () => {
    it('should return monthly aggregation data', async () => {
      const thisMonth = new Date();

      await Transaction.create({
        userId: authUser._id,
        description: 'Monthly test',
        value: 5000,
        type: 'expense',
        category: debitCategory._id,
        isPaid: true,
        isRecurrent: false,
        timestamp: thisMonth,
      });

      const res = await request(app)
        .get('/api/v1/records/monthly-summary')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
      if (res.body.data.length > 0) {
        expect(res.body.data[0]).toHaveProperty('year');
        expect(res.body.data[0]).toHaveProperty('month');
        expect(res.body.data[0]).toHaveProperty('expenses');
        expect(res.body.data[0]).toHaveProperty('income');
        expect(res.body.data[0]).toHaveProperty('balance');
      }
    });

    it('should reject unauthenticated request', async () => {
      const res = await request(app)
        .get('/api/v1/records/monthly-summary');

      expect(res.status).toBe(401);
    });

    it('should accept months up to 120', async () => {
      const res = await request(app)
        .get('/api/v1/records/monthly-summary?months=120')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });

    it('should reject months exceeding 120', async () => {
      const res = await request(app)
        .get('/api/v1/records/monthly-summary?months=121')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
    });
  });

  // ============================================
  // Regression: Validation Fixes
  // ============================================
  describe('Validation Regression Tests', () => {
    it('should reject transaction without category (BUG-B2)', async () => {
      const res = await request(app)
        .post('/api/v1/records')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN)
        .send({
          description: 'No category',
          value: 10.00,
          type: 'expense',
          date: new Date().toISOString(),
        });

      expect(res.status).toBe(400);
      const fields = res.body.error?.details?.map(d => d.field) || [];
      expect(fields).toContain('category');
    });

    it('should reject isRecurrent=true without billingDay (LOGIC-3)', async () => {
      const res = await request(app)
        .post('/api/v1/records')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN)
        .send({
          description: 'Recurrent no billing',
          value: 50.00,
          type: 'expense',
          category: debitCategory._id.toString(),
          isRecurrent: true,
          date: new Date().toISOString(),
        });

      expect(res.status).toBe(400);
    });

    it('should accept isRecurrent=true with billingDay', async () => {
      const res = await request(app)
        .post('/api/v1/records')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN)
        .send({
          description: 'Recurrent with billing',
          value: 50.00,
          type: 'expense',
          category: debitCategory._id.toString(),
          isRecurrent: true,
          billingDay: 15,
          date: new Date().toISOString(),
        });

      expect(res.status).toBe(201);
      expect(res.body.transaction.isRecurrent).toBe(true);
      expect(res.body.transaction.billingDay).toBe(15);
    });

    it('should include same-day transactions when filtering by endDate (LOGIC-2)', async () => {
      const targetDate = new Date(Date.UTC(2025, 5, 15, 14, 30, 0));

      await Transaction.create({
        userId: authUser._id,
        description: 'Afternoon tx',
        value: 1000,
        type: 'expense',
        category: debitCategory._id,
        isPaid: true,
        timestamp: targetDate,
      });

      const res = await request(app)
        .get('/api/v1/records?endDate=2025-06-15')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].description).toBe('Afternoon tx');
    });

    it('should include same-day transactions in calendar endDate (LOGIC-2)', async () => {
      const targetDate = new Date(Date.UTC(2025, 5, 15, 18, 0, 0));

      await Transaction.create({
        userId: authUser._id,
        description: 'Evening calendar tx',
        value: 2000,
        type: 'expense',
        category: debitCategory._id,
        isPaid: true,
        timestamp: targetDate,
      });

      const res = await request(app)
        .get('/api/v1/records/calendar?startDate=2025-06-01&endDate=2025-06-15')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].description).toBe('Evening calendar tx');
    });
  });
});
