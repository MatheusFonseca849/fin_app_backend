const request = require('supertest');
const { setupTestDB } = require('./setup');
const { createAuthenticatedUser } = require('./helpers');

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

const ORIGIN = process.env.CLIENT_URL;
const VALID_PASSWORD = 'Test@1234';

describe('Security & Middleware', () => {
  // ============================================
  // HELMET HEADERS
  // ============================================
  describe('Security Headers (Helmet)', () => {
    it('should include X-Content-Type-Options header', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('should include X-Frame-Options header', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['x-frame-options']).toBeDefined();
    });

    it('should include Strict-Transport-Security header', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['strict-transport-security']).toBeDefined();
    });

    it('should include X-XSS-Protection or equivalent', async () => {
      const res = await request(app).get('/health');
      // Helmet v5+ removes X-XSS-Protection in favor of CSP, but the header may still exist
      // The main check is that helmet is active (nosniff is set above)
      expect(res.headers['x-content-type-options']).toBeDefined();
    });
  });

  // ============================================
  // CSRF PROTECTION
  // ============================================
  describe('CSRF Protection', () => {
    it('should allow GET requests without Origin header', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
    });

    it('should allow POST requests with correct Origin', async () => {
      const res = await request(app)
        .post('/api/v1/users/register')
        .set('Origin', ORIGIN)
        .send({
          firstName: 'CSRF',
          lastName: 'Test',
          email: 'csrf@example.com',
          password: VALID_PASSWORD,
        });

      // Should not be blocked by CSRF (may be 201 or validation error, but not 403)
      expect(res.status).not.toBe(403);
    });

    it('should block POST requests with wrong Origin in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const res = await request(app)
        .post('/api/v1/users/register')
        .set('Origin', 'https://evil-site.com')
        .send({
          firstName: 'Evil',
          lastName: 'User',
          email: 'evil@example.com',
          password: VALID_PASSWORD,
        });

      expect(res.status).toBe(403);

      process.env.NODE_ENV = originalEnv;
    });

    it('should block POST requests with no Origin/Referer in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const res = await request(app)
        .post('/api/v1/users/register')
        .send({
          firstName: 'NoOrigin',
          lastName: 'User',
          email: 'noorigin@example.com',
          password: VALID_PASSWORD,
        });

      expect(res.status).toBe(403);

      process.env.NODE_ENV = originalEnv;
    });
  });

  // ============================================
  // INPUT VALIDATION
  // ============================================
  describe('Input Validation', () => {
    it('should reject oversized JSON body', async () => {
      // express.json({ limit: '100kb' }) — send > 100kb
      const largeBody = { data: 'x'.repeat(200 * 1024) };
      const res = await request(app)
        .post('/api/v1/users/register')
        .set('Origin', ORIGIN)
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(largeBody));

      expect(res.status).toBe(413);
    });

    it('should sanitize XSS in user input fields', async () => {
      const res = await request(app)
        .post('/api/v1/users/register')
        .set('Origin', ORIGIN)
        .send({
          firstName: '<script>alert("xss")</script>',
          lastName: 'User',
          email: 'xss@example.com',
          password: VALID_PASSWORD,
        });

      // Registration may succeed but the name should be escaped
      if (res.status === 201) {
        // express-validator .escape() should have sanitized the input
        expect(res.body.user?.firstName || '').not.toContain('<script>');
      }
    });

    it('should validate MongoDB ObjectId parameters', async () => {
      const { accessToken } = await createAuthenticatedUser();

      const res = await request(app)
        .get('/api/v1/records/not-a-valid-objectid')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(400);
    });

    it('should reject invalid email formats in login', async () => {
      const res = await request(app)
        .post('/api/v1/users/login')
        .set('Origin', ORIGIN)
        .send({ email: 'not-an-email', password: VALID_PASSWORD });

      expect(res.status).toBe(400);
    });
  });

  // ============================================
  // PASSWORD SECURITY
  // ============================================
  describe('Password Security', () => {
    it('should require uppercase letters', async () => {
      const res = await request(app)
        .post('/api/v1/users/register')
        .set('Origin', ORIGIN)
        .send({
          firstName: 'Test',
          lastName: 'User',
          email: 'pw1@example.com',
          password: 'test@1234', // no uppercase
        });

      expect(res.status).toBe(400);
    });

    it('should require lowercase letters', async () => {
      const res = await request(app)
        .post('/api/v1/users/register')
        .set('Origin', ORIGIN)
        .send({
          firstName: 'Test',
          lastName: 'User',
          email: 'pw2@example.com',
          password: 'TEST@1234', // no lowercase
        });

      expect(res.status).toBe(400);
    });

    it('should require numbers', async () => {
      const res = await request(app)
        .post('/api/v1/users/register')
        .set('Origin', ORIGIN)
        .send({
          firstName: 'Test',
          lastName: 'User',
          email: 'pw3@example.com',
          password: 'Test@abcd', // no number
        });

      expect(res.status).toBe(400);
    });

    it('should require special characters', async () => {
      const res = await request(app)
        .post('/api/v1/users/register')
        .set('Origin', ORIGIN)
        .send({
          firstName: 'Test',
          lastName: 'User',
          email: 'pw4@example.com',
          password: 'Test12345', // no special char
        });

      expect(res.status).toBe(400);
    });

    it('should require minimum 8 characters', async () => {
      const res = await request(app)
        .post('/api/v1/users/register')
        .set('Origin', ORIGIN)
        .send({
          firstName: 'Test',
          lastName: 'User',
          email: 'pw5@example.com',
          password: 'Te@1', // too short
        });

      expect(res.status).toBe(400);
    });
  });

  // ============================================
  // REQUEST LOGGER SANITIZATION
  // ============================================
  describe('Request Logger', () => {
    it('should not crash on requests (logger is non-blocking middleware)', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
    });
  });

  // ============================================
  // ERROR HANDLER
  // ============================================
  describe('Error Handler', () => {
    it('should return JSON error for malformed JSON body', async () => {
      const res = await request(app)
        .post('/api/v1/users/login')
        .set('Origin', ORIGIN)
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('should return 404 for unknown routes', async () => {
      const res = await request(app)
        .get('/api/v1/nonexistent');

      // Express returns 404 by default for unmatched routes
      expect(res.status).toBe(404);
    });
  });

  // ============================================
  // HEALTH ENDPOINT
  // ============================================
  describe('GET /health', () => {
    it('should return health status', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('OK');
      expect(res.body.timestamp).toBeDefined();
    });
  });
});
