require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');


const financialRecordsRouter = require('./routes/financialRecords.routes.js');
const userDataRouter = require('./routes/userData.routes.js');
const categoriesRouter = require('./routes/categories.routes.js');
const requestLogger = require('./middlewares/requestLogger');

const app = express();

app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3001',
    credentials: true, // IMPORTANT: Allows cookies to be sent
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));


app.use(express.json());
app.use(cookieParser());
app.use(requestLogger); // Move logger before routes
app.use('/records', financialRecordsRouter);
app.use('/users', userDataRouter);
app.use('/categories', categoriesRouter);

app.get('/test-env', (req, res) => {
    res.json({
        hasAccessSecret: !!process.env.JWT_ACCESS_SECRET,
        hasRefreshSecret: !!process.env.JWT_REFRESH_SECRET,
        nodeEnv: process.env.NODE_ENV,
        frontendUrl: process.env.FRONTEND_URL
    });
});

module.exports = app;