const express = require('express');
const cors = require('cors');
const financialRecordsRouter = require('./routes/financialRecords.routes.js');
const userDataRouter = require('./routes/userData.routes.js');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/records', financialRecordsRouter);
app.use('/users', userDataRouter);

module.exports = app;