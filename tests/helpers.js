const { hashPassword } = require('../src/utils/password.utils');
const { generateAccessToken, generateRefreshToken } = require('../src/utils/jwt.utils');
const User = require('../src/models/User.model');
const Category = require('../src/models/schemas/category.schema');
const mongoose = require('mongoose');

/**
 * Create a verified user in the DB and return { user, accessToken, refreshToken }.
 */
async function createAuthenticatedUser(overrides = {}) {
  const password = overrides.password || 'Test@1234';
  const hashed = await hashPassword(password);

  const userData = {
    firstName: 'Test',
    lastName: 'User',
    email: `test-${Date.now()}@example.com`,
    password: hashed,
    isVerified: true,
    role: 'user',
    balance: 0,
    tokenVersion: 0,
    ...overrides,
    // Always hash password if overridden
    ...(overrides.password ? { password: await hashPassword(overrides.password) } : { password: hashed }),
  };

  const user = await User.create(userData);

  const tokenPayload = { id: user._id.toString(), tokenVersion: user.tokenVersion };
  const accessToken = generateAccessToken(tokenPayload);
  const refreshToken = generateRefreshToken(tokenPayload);

  return { user, accessToken, refreshToken, plainPassword: password };
}

/**
 * Create an admin user in the DB and return { user, accessToken, refreshToken }.
 */
async function createAdminUser(overrides = {}) {
  return createAuthenticatedUser({ role: 'admin', ...overrides });
}

/**
 * Create default categories for a user (mirrors what the app does on registration).
 */
async function createDefaultCategories(userId) {
  const defaults = [
    { name: 'Alimentação', type: 'debito', color: '#FF6B6B', userId },
    { name: 'Transporte', type: 'debito', color: '#4ECDC4', userId },
    { name: 'Salário', type: 'credito', color: '#82E0AA', userId },
    { name: 'Freelance', type: 'credito', color: '#AED6F1', userId },
    { name: 'Sem Categoria', type: 'debito', color: '#D5DBDB', userId },
  ];
  return Category.insertMany(defaults);
}

/**
 * Generate a valid MongoDB ObjectId string.
 */
function randomObjectId() {
  return new mongoose.Types.ObjectId().toString();
}

module.exports = {
  createAuthenticatedUser,
  createAdminUser,
  createDefaultCategories,
  randomObjectId,
};
