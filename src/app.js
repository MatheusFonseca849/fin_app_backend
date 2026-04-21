require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const createError = require('./middlewares/createError');

const financialRecordsRouter = require('./routes/financialRecords.routes.js');
const userDataRouter = require('./routes/userData.routes.js');
const categoriesRouter = require('./routes/categories.routes.js');
const adminRouter = require('./routes/admin.routes.js');
const requestLogger = require('./middlewares/requestLogger');
const errorHandler = require('./middlewares/errorHandler');
const { authLimiter, apiLimiter, emailLimiter } = require('./middlewares/rateLimiter.middleware');
const { csrfProtection } = require('./middlewares/csrf.middleware');

const app = express();

// Disable X-Powered-By header (defense-in-depth, Helmet also does this)
app.disable('x-powered-by');

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      scriptSrc: ["'none'"],
      styleSrc: ["'none'"],
      imgSrc: ["'none'"],
      connectSrc: ["'self'"],
      fontSrc: ["'none'"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'self'"],
    },
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
}));

// Parse allowed origins from env (comma-separated for multi-origin support)
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:3001')
  .split(',')
  .map(o => o.trim().replace(/\/+$/, ''));

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, health checks)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600, // Cache preflight for 10 minutes
}));

// Request ID middleware — attach unique ID to every request for tracing
app.use((req, res, next) => {
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
});

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(requestLogger);
app.use(csrfProtection);

// Apply strict rate limiting to auth endpoints only
app.use('/api/v1/users/login', authLimiter);
app.use('/api/v1/users/register', authLimiter);
app.use('/api/v1/users/forgot-password', authLimiter);
app.use('/api/v1/users/reset-password', authLimiter);
app.use('/api/v1/users/verify-email-change', authLimiter);
app.use('/api/v1/users/refresh', authLimiter);

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

// 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).json(createError(404, 'Rota não encontrada'));
});

// Global error handler (must be after all routes)
app.use(errorHandler);

module.exports = app;