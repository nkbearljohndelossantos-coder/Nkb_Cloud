import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logFile = path.join(__dirname, 'data', 'agent-daemon.log');

// Ensure data directory exists
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    fs.appendFileSync(logFile, line);
  } catch (_) {}
  console.log(msg);
}

log('[Daemon] NKB Storage Agent Watchdog starting up...');

let child = null;
let isShuttingDown = false;

function startChild() {
  if (isShuttingDown) return;

  log('[Daemon] Spawning storage agent process...');
  child = spawn(process.execPath, [path.join(__dirname, 'index.js')], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });

  child.stdout.on('data', (d) => {
    try { fs.appendFileSync(logFile, d); } catch (_) {}
  });

  child.stderr.on('data', (d) => {
    try { fs.appendFileSync(logFile, d); } catch (_) {}
  });

  child.on('exit', (code, signal) => {
    log(`[Daemon] Storage agent exited with code ${code}, signal ${signal}.`);
    child = null;
    if (!isShuttingDown) {
      log('[Daemon] Auto-restarting storage agent in 3 seconds...');
      setTimeout(startChild, 3000);
    }
  });

  child.on('error', (err) => {
    log(`[Daemon] Child process error: ${err.message}`);
  });
}

startChild();

process.on('SIGINT', () => {
  isShuttingDown = true;
  log('[Daemon] SIGINT received, stopping...');
  if (child) child.kill();
  process.exit(0);
});

process.on('SIGTERM', () => {
  isShuttingDown = true;
  log('[Daemon] SIGTERM received, stopping...');
  if (child) child.kill();
  process.exit(0);
});
