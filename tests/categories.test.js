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

setupTestDB();

const ORIGIN = process.env.CLIENT_URL;

describe('Category Endpoints', () => {
  let authUser, token;

  beforeEach(async () => {
    const result = await createAuthenticatedUser();
    authUser = result.user;
    token = result.accessToken;
    await createDefaultCategories(authUser._id);
  });

  // ============================================
  // GET /categories
  // ============================================
  describe('GET /api/v1/categories', () => {
    it('should return all categories for the authenticated user', async () => {
      const res = await request(app)
        .get('/api/v1/categories')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(5);
    });

    it('should not return categories from other users', async () => {
      const other = await createAuthenticatedUser({ email: 'other@example.com' });
      await Category.create({
        name: 'Other Category',
        type: 'debito',
        color: '#FF0000',
        userId: other.user._id,
      });

      const res = await request(app)
        .get('/api/v1/categories')
        .set('Authorization', `Bearer ${token}`);

      const names = res.body.map(c => c.name);
      expect(names).not.toContain('Other Category');
    });

    it('should reject unauthenticated request', async () => {
      const res = await request(app)
        .get('/api/v1/categories');

      expect(res.status).toBe(401);
    });
  });

  // ============================================
  // POST /categories
  // ============================================
  describe('POST /api/v1/categories', () => {
    it('should create a new category', async () => {
      const res = await request(app)
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN)
        .send({
          name: 'Educacao',
          type: 'debito',
          color: '#2196F3',
        });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Educacao');
      expect(res.body.type).toBe('debito');
    });

    it('should reject category without required fields', async () => {
      const res = await request(app)
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN)
        .send({ name: '' });

      expect(res.status).toBe(400);
    });

    it('should reject duplicate category name for same user and type', async () => {
      await request(app)
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN)
        .send({ name: 'UniqueTest', type: 'debito', color: '#000000' });

      const res = await request(app)
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN)
        .send({ name: 'UniqueTest', type: 'debito', color: '#111111' });

      expect(res.status).toBe(409);
    });

    it('should reject invalid color format', async () => {
      const res = await request(app)
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN)
        .send({
          name: 'BadColor',
          type: 'debito',
          color: 'red', // not hex
        });

      expect(res.status).toBe(400);
    });

    it('should accept keywords array', async () => {
      const res = await request(app)
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN)
        .send({
          name: 'Mercado',
          type: 'debito',
          color: '#4CAF50',
          keywords: ['supermercado', 'mercado', 'feira'],
        });

      expect(res.status).toBe(201);
      expect(res.body.keywords).toEqual(expect.arrayContaining(['supermercado', 'mercado', 'feira']));
    });
  });

  // ============================================
  // PUT /categories/:id
  // ============================================
  describe('PUT /api/v1/categories/:id', () => {
    it('should update an existing category', async () => {
      const cats = await Category.find({ userId: authUser._id, name: 'Alimentação' });
      const cat = cats[0];

      const res = await request(app)
        .put(`/api/v1/categories/${cat._id}`)
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN)
        .send({ name: 'Comida', color: '#E91E63' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Comida');
    });

    it('should reject update with invalid ObjectId', async () => {
      const res = await request(app)
        .put('/api/v1/categories/not-a-valid-id')
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN)
        .send({ name: 'Test' });

      expect(res.status).toBe(400);
    });

    it('should return 404 for non-existent category', async () => {
      const fakeId = randomObjectId();
      const res = await request(app)
        .put(`/api/v1/categories/${fakeId}`)
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN)
        .send({ name: 'Ghost' });

      expect(res.status).toBe(404);
    });
  });

  // ============================================
  // DELETE /categories/:id
  // ============================================
  describe('DELETE /api/v1/categories/:id', () => {
    it('should delete a category', async () => {
      const cat = await Category.findOne({ userId: authUser._id, name: 'Alimentação' });

      const res = await request(app)
        .delete(`/api/v1/categories/${cat._id}`)
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN);

      expect(res.status).toBe(200);

      const deleted = await Category.findById(cat._id);
      expect(deleted).toBeNull();
    });

    it('should prevent deletion of "Sem Categoria"', async () => {
      const semCat = await Category.findOne({ userId: authUser._id, name: 'Sem Categoria' });

      const res = await request(app)
        .delete(`/api/v1/categories/${semCat._id}`)
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN);

      expect(res.status).toBe(400);
    });

    it('should return 404 for non-existent category', async () => {
      const fakeId = randomObjectId();
      const res = await request(app)
        .delete(`/api/v1/categories/${fakeId}`)
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', ORIGIN);

      expect(res.status).toBe(404);
    });
  });
});
