const { generateVerificationToken, hashToken, safeEqual } = require('../src/utils/verification.utils');

describe('Verification Utils', () => {
  // ============================================
  // safeEqual
  // ============================================
  describe('safeEqual', () => {
    it('should return true for identical strings', () => {
      const hash = hashToken('test-token');
      expect(safeEqual(hash, hash)).toBe(true);
    });

    it('should return true for matching hashed tokens', () => {
      const { rawToken, hashedToken } = generateVerificationToken();
      const rehashed = hashToken(rawToken);
      expect(safeEqual(hashedToken, rehashed)).toBe(true);
    });

    it('should return false for different strings', () => {
      const hash1 = hashToken('token-a');
      const hash2 = hashToken('token-b');
      expect(safeEqual(hash1, hash2)).toBe(false);
    });

    it('should return false for different length strings', () => {
      expect(safeEqual('short', 'a-much-longer-string')).toBe(false);
    });

    it('should return false when first argument is null/undefined', () => {
      expect(safeEqual(null, 'abc')).toBe(false);
      expect(safeEqual(undefined, 'abc')).toBe(false);
    });

    it('should return false when second argument is null/undefined', () => {
      expect(safeEqual('abc', null)).toBe(false);
      expect(safeEqual('abc', undefined)).toBe(false);
    });

    it('should return false when both arguments are null/undefined', () => {
      expect(safeEqual(null, null)).toBe(false);
      expect(safeEqual(undefined, undefined)).toBe(false);
    });

    it('should return false for empty string vs non-empty', () => {
      expect(safeEqual('', 'abc')).toBe(false);
    });
  });

  // ============================================
  // generateVerificationToken
  // ============================================
  describe('generateVerificationToken', () => {
    it('should return rawToken and hashedToken', () => {
      const { rawToken, hashedToken } = generateVerificationToken();
      expect(rawToken).toBeDefined();
      expect(hashedToken).toBeDefined();
      expect(typeof rawToken).toBe('string');
      expect(typeof hashedToken).toBe('string');
    });

    it('should produce different tokens on each call', () => {
      const a = generateVerificationToken();
      const b = generateVerificationToken();
      expect(a.rawToken).not.toBe(b.rawToken);
      expect(a.hashedToken).not.toBe(b.hashedToken);
    });
  });

  // ============================================
  // hashToken
  // ============================================
  describe('hashToken', () => {
    it('should produce consistent hashes', () => {
      const hash1 = hashToken('same-input');
      const hash2 = hashToken('same-input');
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = hashToken('input-a');
      const hash2 = hashToken('input-b');
      expect(hash1).not.toBe(hash2);
    });
  });
});
