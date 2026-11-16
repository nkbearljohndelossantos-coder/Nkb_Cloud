import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import http from 'http';

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

// Global crash prevention for the daemon process
process.on('uncaughtException', (err) => {
  log(`[Daemon] UNCAUGHT EXCEPTION PREVENTED: ${err.message}`);
});

process.on('unhandledRejection', (reason) => {
  log(`[Daemon] UNHANDLED REJECTION PREVENTED: ${reason}`);
});

// Singleton Guard: Ensure only ONE watchdog daemon runs at a time
const singletonServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ daemon: 'active', pid: process.pid, timestamp: new Date().toISOString() }));
});

singletonServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    log('[Daemon] Redundant daemon detected (Port 51249 in use). Primary daemon already running. Exiting.');
    process.exit(0);
  }
});

singletonServer.listen(51249, '127.0.0.1');

log('[Daemon] NKB Storage Agent Watchdog starting up...');

let child = null;
let isShuttingDown = false;
let failedHealthChecks = 0;

function startChild() {
  if (isShuttingDown) return;
  if (child && child.pid) {
    try {
      process.kill(child.pid, 0);
      return; // Already running
    } catch (_) {}
  }

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
    failedHealthChecks = 0;
    if (!isShuttingDown) {
      log('[Daemon] Auto-restarting storage agent in 2 seconds...');
      setTimeout(startChild, 2000);
    }
  });

  child.on('error', (err) => {
    log(`[Daemon] Child process error: ${err.message}`);
  });
}

startChild();

// Active Watchdog Loop (Runs forever, keeping daemon alive and verifying child process)
setInterval(async () => {
  if (isShuttingDown) return;

  if (!child || !child.pid) {
    log('[Daemon Watchdog] Child process not present. Respawning...');
    startChild();
    return;
  }

  try {
    // Check if process still exists in Windows OS
    process.kill(child.pid, 0);
  } catch (_) {
    log('[Daemon Watchdog] Child PID is dead. Respawning...');
    child = null;
    startChild();
    return;
  }

  // Probe local agent HTTP endpoint to detect frozen event loops
  try {
    const res = await fetch('http://127.0.0.1:51248/status', { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      failedHealthChecks = 0;
    } else {
      failedHealthChecks++;
    }
  } catch (probeErr) {
    failedHealthChecks++;
  }

  // If local agent is unresponsive for 6 consecutive checks (30s), kill and restart
  if (failedHealthChecks >= 6) {
    log(`[Daemon Watchdog] Agent unresponsive for 30s. Restarting process PID ${child.pid}...`);
    try { process.kill(child.pid, 'SIGKILL'); } catch (_) {}
    failedHealthChecks = 0;
  }
}, 5000);

process.on('SIGINT', () => {
  isShuttingDown = true;
  log('[Daemon] SIGINT received, stopping...');
  if (child) {
    try { child.kill(); } catch (_) {}
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  isShuttingDown = true;
  log('[Daemon] SIGTERM received, stopping...');
  if (child) {
    try { child.kill(); } catch (_) {}
  }
  process.exit(0);
});
