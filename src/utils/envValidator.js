/**
 * Validates that all required environment variables are present at startup.
 * Call this before connecting to any services to fail fast.
 */
const REQUIRED_ENV_VARS = [
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'MONGODB_URI',
  'CLIENT_URL',
];

const RECOMMENDED_ENV_VARS = [
  'MAILGUN_API_KEY',
  'MAILGUN_DOMAIN',
  'REDIS_URL',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
];

function validateEnv() {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  const missingRecommended = RECOMMENDED_ENV_VARS.filter((key) => !process.env[key]);

  if (missingRecommended.length > 0) {
    console.warn(
      `⚠️  Missing recommended env vars: ${missingRecommended.join(', ')}. Some features may not work.`
    );
  }

  if (missing.length > 0) {
    console.error(
      `❌ Missing required environment variables: ${missing.join(', ')}`
    );
    console.error('Please check your .env file.');
    process.exit(1);
  }

  // Validate JWT secrets have minimum length (at least 32 chars for security)
  const shortSecrets = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'].filter(
    (key) => process.env[key] && process.env[key].length < 32
  );

  if (shortSecrets.length > 0 && process.env.NODE_ENV === 'production') {
    console.error(
      `❌ JWT secrets too short (min 32 chars in production): ${shortSecrets.join(', ')}`
    );
    process.exit(1);
  }
}

module.exports = { validateEnv };
