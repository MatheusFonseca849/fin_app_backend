const request = require('supertest');
const { setupTestDB } = require('./setup');
const { createAuthenticatedUser, randomObjectId } = require('./helpers');

// Mock Redis before loading app
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

setupTestDB();

const VALID_PASSWORD = 'Test@1234';
const ORIGIN = process.env.CLIENT_URL;

describe('Auth Endpoints', () => {
  // ============================================
  // REGISTER
  // ============================================
  describe('POST /api/v1/users/register', () => {
    it('should register a new user with valid data', async () => {
      const res = await request(app)
        .post('/api/v1/users/register')
        .set('Origin', ORIGIN)
        .send({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          password: VALID_PASSWORD,
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('message');
    });

    it('should reject registration with missing fields', async () => {
      const res = await request(app)
        .post('/api/v1/users/register')
        .set('Origin', ORIGIN)
        .send({ email: 'bad@example.com' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('should reject registration with weak password', async () => {
      const res = await request(app)
        .post('/api/v1/users/register')
        .set('Origin', ORIGIN)
        .send({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          password: '12345678', // no uppercase, special char, etc.
        });

      expect(res.status).toBe(400);
    });

    it('should reject duplicate email registration', async () => {
      await createAuthenticatedUser({ email: 'dup@example.com' });

      const res = await request(app)
        .post('/api/v1/users/register')
        .set('Origin', ORIGIN)
        .send({
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'dup@example.com',
          password: VALID_PASSWORD,
        });

      // 409 or 400 depending on error handler
      expect([400, 409]).toContain(res.status);
    });

    it('should reject registration with invalid email format', async () => {
      const res = await request(app)
        .post('/api/v1/users/register')
        .set('Origin', ORIGIN)
        .send({
          firstName: 'John',
          lastName: 'Doe',
          email: 'not-an-email',
          password: VALID_PASSWORD,
        });

      expect(res.status).toBe(400);
    });
  });

  // ============================================
  // LOGIN
  // ============================================
  describe('POST /api/v1/users/login', () => {
    it('should login a verified user with correct credentials', async () => {
      await createAuthenticatedUser({
        email: 'login@example.com',
        password: VALID_PASSWORD,
      });

      const res = await request(app)
        .post('/api/v1/users/login')
        .set('Origin', ORIGIN)
        .send({ email: 'login@example.com', password: VALID_PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('user');
      expect(res.body.user).not.toHaveProperty('password');
    });

    it('should reject login with wrong password', async () => {
      await createAuthenticatedUser({
        email: 'wrongpw@example.com',
        password: VALID_PASSWORD,
      });

      const res = await request(app)
        .post('/api/v1/users/login')
        .set('Origin', ORIGIN)
        .send({ email: 'wrongpw@example.com', password: 'WrongPass@1' });

      expect(res.status).toBe(401);
    });

    it('should reject login for non-existent user', async () => {
      const res = await request(app)
        .post('/api/v1/users/login')
        .set('Origin', ORIGIN)
        .send({ email: 'nobody@example.com', password: VALID_PASSWORD });

      expect(res.status).toBe(401);
    });

    it('should reject login for unverified user', async () => {
      await createAuthenticatedUser({
        email: 'unverified@example.com',
        password: VALID_PASSWORD,
        isVerified: false,
      });

      const res = await request(app)
        .post('/api/v1/users/login')
        .set('Origin', ORIGIN)
        .send({ email: 'unverified@example.com', password: VALID_PASSWORD });

      expect(res.status).toBe(403);
    });

    it('should not expose password in login response', async () => {
      await createAuthenticatedUser({
        email: 'nopw@example.com',
        password: VALID_PASSWORD,
      });

      const res = await request(app)
        .post('/api/v1/users/login')
        .set('Origin', ORIGIN)
        .send({ email: 'nopw@example.com', password: VALID_PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body.user.password).toBeUndefined();
    });
  });

  // ============================================
  // AUTHENTICATED ROUTES - TOKEN SECURITY
  // ============================================
  describe('Token Security', () => {
    it('should reject requests without authorization header', async () => {
      const res = await request(app)
        .get('/api/v1/users/me');

      expect(res.status).toBe(401);
    });

    it('should reject requests with invalid token', async () => {
      const res = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', 'Bearer invalid-token-here');

      expect(res.status).toBe(401);
    });

    it('should accept requests with valid token', async () => {
      const { accessToken } = await createAuthenticatedUser();

      const res = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('email');
    });

    it('should reject revoked tokens (mismatched tokenVersion)', async () => {
      const { user, accessToken } = await createAuthenticatedUser();

      // Simulate token revocation by incrementing tokenVersion in DB
      const User = require('../src/models/User.model');
      await User.findByIdAndUpdate(user._id, { $inc: { tokenVersion: 1 } });

      const res = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(401);
    });
  });

  // ============================================
  // LOGOUT
  // ============================================
  describe('POST /api/v1/users/logout', () => {
    it('should logout successfully', async () => {
      const { accessToken } = await createAuthenticatedUser();

      const res = await request(app)
        .post('/api/v1/users/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Origin', ORIGIN);

      expect(res.status).toBe(200);
    });

    it('should reject logout without auth', async () => {
      const res = await request(app)
        .post('/api/v1/users/logout')
        .set('Origin', ORIGIN);

      expect(res.status).toBe(401);
    });
  });

  // ============================================
  // GET /me
  // ============================================
  describe('GET /api/v1/users/me', () => {
    it('should return user profile without sensitive fields', async () => {
      const { accessToken } = await createAuthenticatedUser({
        email: 'me@example.com',
        firstName: 'Jane',
      });

      const res = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.firstName).toBe('Jane');
      expect(res.body.email).toBe('me@example.com');
      expect(res.body.password).toBeUndefined();
    });
  });
});
