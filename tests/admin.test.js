const request = require('supertest');
const { setupTestDB } = require('./setup');
const { createAuthenticatedUser, createAdminUser, randomObjectId } = require('./helpers');

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

// Mock upload utils to avoid Cloudinary calls
jest.mock('../src/utils/upload.utils', () => ({
  uploadAvatar: jest.fn().mockResolvedValue('https://example.com/avatar.jpg'),
  deleteAvatar: jest.fn().mockResolvedValue(true),
}));

const app = require('../src/app');

setupTestDB();

const ORIGIN = process.env.CLIENT_URL;

describe('Admin Endpoints', () => {
  let admin, adminToken;

  beforeEach(async () => {
    const result = await createAdminUser({ email: 'admin@example.com' });
    admin = result.user;
    adminToken = result.accessToken;
  });

  // ============================================
  // AUTHORIZATION
  // ============================================
  describe('Authorization', () => {
    it('should reject non-admin users', async () => {
      const { accessToken } = await createAuthenticatedUser({ email: 'regular@example.com' });

      const res = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(403);
    });

    it('should reject unauthenticated requests', async () => {
      const res = await request(app)
        .get('/api/v1/admin/users');

      expect(res.status).toBe(401);
    });

    it('should allow admin users', async () => {
      const res = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });
  });

  // ============================================
  // GET /admin/users
  // ============================================
  describe('GET /api/v1/admin/users', () => {
    it('should list all users', async () => {
      await createAuthenticatedUser({ email: 'user1@example.com' });
      await createAuthenticatedUser({ email: 'user2@example.com' });

      const res = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      // admin + 2 users = 3
      expect(res.body.pagination.total).toBe(3);
    });

    it('should not expose passwords', async () => {
      const res = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      res.body.data.forEach(user => {
        expect(user.password).toBeUndefined();
      });
    });
  });

  // ============================================
  // GET /admin/users/:id
  // ============================================
  describe('GET /api/v1/admin/users/:id', () => {
    it('should return user summary with stats', async () => {
      const { user } = await createAuthenticatedUser({ email: 'summary@example.com' });

      const res = await request(app)
        .get(`/api/v1/admin/users/${user._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.stats).toBeDefined();
      expect(res.body.stats).toHaveProperty('transactionCount');
      expect(res.body.stats).toHaveProperty('categoryCount');
    });

    it('should return 404 for non-existent user', async () => {
      const fakeId = randomObjectId();
      const res = await request(app)
        .get(`/api/v1/admin/users/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });

    it('should reject invalid ObjectId', async () => {
      const res = await request(app)
        .get('/api/v1/admin/users/not-valid')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
    });
  });

  // ============================================
  // PUT /admin/users/:id
  // ============================================
  describe('PUT /api/v1/admin/users/:id', () => {
    it('should update user info', async () => {
      const { user } = await createAuthenticatedUser({ email: 'toupdate@example.com' });

      const res = await request(app)
        .put(`/api/v1/admin/users/${user._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Origin', ORIGIN)
        .send({ firstName: 'Updated' });

      expect(res.status).toBe(200);
      expect(res.body.firstName).toBe('Updated');
    });
  });

  // ============================================
  // DELETE /admin/users/:id
  // ============================================
  describe('DELETE /api/v1/admin/users/:id', () => {
    it('should delete a regular user', async () => {
      const { user } = await createAuthenticatedUser({ email: 'todelete@example.com' });

      const res = await request(app)
        .delete(`/api/v1/admin/users/${user._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Origin', ORIGIN);

      expect(res.status).toBe(200);
    });

    it('should prevent admin from deleting themselves', async () => {
      const res = await request(app)
        .delete(`/api/v1/admin/users/${admin._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Origin', ORIGIN);

      expect(res.status).toBe(400);
    });

    it('should return 404 for non-existent user', async () => {
      const fakeId = randomObjectId();
      const res = await request(app)
        .delete(`/api/v1/admin/users/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Origin', ORIGIN);

      expect(res.status).toBe(404);
    });
  });

  // ============================================
  // PATCH /admin/users/:id/role
  // ============================================
  describe('PATCH /api/v1/admin/users/:id/role', () => {
    it('should promote a user to admin', async () => {
      const { user } = await createAuthenticatedUser({ email: 'promote@example.com' });

      const res = await request(app)
        .patch(`/api/v1/admin/users/${user._id}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Origin', ORIGIN)
        .send({ role: 'admin' });

      expect(res.status).toBe(200);
      expect(res.body.role).toBe('admin');
    });

    it('should prevent admin from demoting themselves', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/users/${admin._id}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Origin', ORIGIN)
        .send({ role: 'user' });

      expect(res.status).toBe(400);
    });

    it('should reject invalid role value', async () => {
      const { user } = await createAuthenticatedUser({ email: 'badrole@example.com' });

      const res = await request(app)
        .patch(`/api/v1/admin/users/${user._id}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Origin', ORIGIN)
        .send({ role: 'superadmin' });

      expect(res.status).toBe(400);
    });
  });

  // ============================================
  // GET /admin/stats
  // ============================================
  describe('GET /api/v1/admin/stats', () => {
    it('should return system statistics', async () => {
      await createAuthenticatedUser({ email: 'stat1@example.com' });
      await createAuthenticatedUser({ email: 'stat2@example.com' });

      const res = await request(app)
        .get('/api/v1/admin/stats')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.users).toBeDefined();
      expect(res.body.users.total).toBe(3); // admin + 2
      expect(res.body.users.admins).toBe(1);
      expect(res.body.transactions).toBeDefined();
    });
  });
});
