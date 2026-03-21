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
    debitCategory = cats.find(c => c.type === 'debito' && c.name !== 'Sem Categoria');
    creditCategory = cats.find(c => c.type === 'credito' && c.name !== 'Sem Categoria');
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
          type: 'debito',
          category: debitCategory._id.toString(),
          isPaid: true,
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
          type: 'credito',
          category: creditCategory._id.toString(),
          isPaid: true,
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
          type: 'debito',
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
          type: 'debito',
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
          type: 'debito',
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
          type: 'credito',
          category: creditCategory._id.toString(),
          isPaid: false, // should be overridden to true
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
        type: 'debito',
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
      const otherCat = otherCats.find(c => c.type === 'debito');

      await Transaction.create({
        userId: other.user._id,
        description: 'Other user tx',
        value: 500,
        type: 'debito',
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
        type: 'debito',
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
        type: 'debito',
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

    it('should return error for non-existent transaction', async () => {
      const fakeId = randomObjectId();
      const res = await request(app)
        .put(`/api/v1/records/${fakeId}`)
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN)
        .send({ description: 'Ghost' });

      // Service throws, controller returns 500 with error message
      expect([404, 500]).toContain(res.status);
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
        type: 'debito',
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
        type: 'debito',
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

    it('should return error for non-existent transaction', async () => {
      const fakeId = randomObjectId();
      const res = await request(app)
        .delete(`/api/v1/records/${fakeId}`)
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN);

      // Service throws, controller returns 500 with error message
      expect([404, 500]).toContain(res.status);
    });
  });
});
