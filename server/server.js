import 'dotenv/config';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

import db from './config/db.js';
import agentHub from './services/agentHub.js';
import apiRouter from './routes/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;

// Security & Parsing Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 'Authorization', 'x-agent-token', 'Range', 
    'X-Chunk-SHA256', 'X-Idempotency-Key', 'X-Chunk-Index', 'X-Session-ID', 'X-Is-Last-Chunk'
  ]
}));
app.use(express.raw({ type: 'application/octet-stream', limit: '100mb' }));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(morgan('dev'));

// API Routes
app.use('/api', apiRouter);

// Root healthcheck
app.get('/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    platform: 'NKB Cloud',
    version: '1.0.0',
    databaseMode: db.mode,
    agentConnected: agentHub.hasConnectedAgent(),
    timestamp: new Date().toISOString()
  });
});

// Serve frontend static build if built
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
    return next();
  }
  const indexPath = path.join(clientDist, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(200).send(`
        <!DOCTYPE html>
        <html>
        <head><title>NKB Cloud Private Storage</title></head>
        <body style="font-family:sans-serif; background:#0F172A; color:#F8FAFC; padding:40px; text-align:center;">
          <h1 style="color:#D97706;">NKB CLOUD API SERVER RUNNING</h1>
          <p>Hostinger VPS &bull; Windows Storage Agent &bull; Expandable Multi-Storage Platform</p>
          <p>Client build not yet compiled or running in dev mode on port 5173.</p>
          <a href="/health" style="color:#F59E0B;">View Health Status</a>
        </body>
        </html>
      `);
    }
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[SERVER ERROR]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    code: err.code || 'INTERNAL_ERROR'
  });
});

// Boot Database and Start Server
async function start() {
  try {
    await db.initialize();
    agentHub.initialize(server);

    server.listen(PORT, () => {
      console.log(`====================================================`);
      console.log(`  NKB CLOUD ENTERPRISE STORAGE PLATFORM`);
      console.log(`  API Server listening on: http://localhost:${PORT}`);
      console.log(`  Storage Agent Hub (WSS): ws://localhost:${PORT}/ws/agent`);
      console.log(`  Database engine: ${db.mode.toUpperCase()}`);
      console.log(`====================================================`);
    });
  } catch (err) {
    console.error('Fatal initialization error:', err);
    process.exit(1);
  }
}

start();
