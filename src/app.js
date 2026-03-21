require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');


const financialRecordsRouter = require('./routes/financialRecords.routes.js');
const userDataRouter = require('./routes/userData.routes.js');
const categoriesRouter = require('./routes/categories.routes.js');
const adminRouter = require('./routes/admin.routes.js');
const requestLogger = require('./middlewares/requestLogger');
const errorHandler = require('./middlewares/errorHandler');
const { authLimiter, apiLimiter, emailLimiter } = require('./middlewares/rateLimiter.middleware');
const { csrfProtection } = require('./middlewares/csrf.middleware');

const app = express();

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow cross-origin requests for API
  contentSecurityPolicy: false, // Disable CSP for API (frontend handles this)
}));

app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3001',
    credentials: true, // IMPORTANT: Allows cookies to be sent
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(requestLogger);
app.use(csrfProtection);

// Apply strict rate limiting to auth endpoints only
app.use('/api/v1/users/login', authLimiter);
app.use('/api/v1/users/register', authLimiter);
app.use('/api/v1/users/forgot-password', authLimiter);
app.use('/api/v1/users/reset-password', authLimiter);

// Apply strict rate limiting to email-sending endpoints
app.use('/api/v1/users/forgot-password', emailLimiter);
app.use('/api/v1/users/resend-verification', emailLimiter);
app.use('/api/v1/users/resend-email-change', emailLimiter);

// API v1 routes
app.use('/api/v1/records', apiLimiter, financialRecordsRouter);
app.use('/api/v1/users', apiLimiter, userDataRouter);
app.use('/api/v1/categories', apiLimiter, categoriesRouter);
app.use('/api/v1/admin', apiLimiter, adminRouter);

if (process.env.NODE_ENV === 'development') {
  app.get('/test-env', (req, res) => {
    res.json({
        hasAccessSecret: !!process.env.JWT_ACCESS_SECRET,
        hasRefreshSecret: !!process.env.JWT_REFRESH_SECRET,
        nodeEnv: process.env.NODE_ENV,
        clientUrl: process.env.CLIENT_URL
    });
  });
}

app.get('/health', (req, res) => {
  const dbStatus = require('./config/database').getStatus();
  const redisStatus = require('./config/redis');
  res.json({
    status: 'OK',
    database: {
      connected: dbStatus.isConnected,
      name: dbStatus.name
    },
    redis: {
      connected: redisStatus.isConnected
    },
    timestamp: new Date().toISOString()
  });
});

// Global error handler (must be after all routes)
app.use(errorHandler);

module.exports = app;