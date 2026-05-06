require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const keywordsRouter = require('./routes/keywords');
const reportRouter = require('./routes/report');
const structureRouter = require('./routes/structure');
const healthRouter = require('./routes/health');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Security
app.use(helmet());

// ── CORS — allow campaign.sellersside.com + localhost dev
const allowedOrigins = [
  'https://campaign.sellersside.com',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];
app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (e.g. curl, Postman)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Rate limiting — global
app.use(rateLimit({
  windowMs: 60 * 1000,   // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, slow down.' },
}));

// ── AI endpoints get a tighter limit (Claude API costs money)
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'AI rate limit reached. Wait a moment.' },
});
app.use('/api/keywords', aiLimiter);
app.use('/api/report', aiLimiter);
app.use('/api/structure', aiLimiter);

// ── Routes
app.use('/health', healthRouter);
app.use('/api/keywords', keywordsRouter);
app.use('/api/report', reportRouter);
app.use('/api/structure', structureRouter);

// ── 404
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  if (err.message?.startsWith('CORS')) {
    return res.status(403).json({ error: err.message });
  }
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`SP Backend running on port ${PORT}`);
});
