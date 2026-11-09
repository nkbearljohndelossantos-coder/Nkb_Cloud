import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class CommandJournal {
  constructor(options = {}) {
    this.journalDir = options.journalDir || path.join(__dirname, '..', 'data');
    this.journalFilePath = path.join(this.journalDir, 'command_journal.json');
    this.journalBackupPath = path.join(this.journalDir, 'command_journal.json.bak');
    this.maxEntries = options.maxEntries || 10000;
    this.entries = new Map();
    this.initJournal();
  }

  initJournal() {
    if (!fs.existsSync(this.journalDir)) {
      fs.mkdirSync(this.journalDir, { recursive: true });
    }

    let loaded = false;

    // 1. Attempt to load from primary journal
    if (fs.existsSync(this.journalFilePath)) {
      try {
        const raw = fs.readFileSync(this.journalFilePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            this.entries.set(item.idempotencyKey || item.commandId, item);
          }
          loaded = true;
        }
      } catch (err) {
        console.warn('[CommandJournal] Primary journal corrupted. Attempting recovery from backup...');
      }
    }

    // 2. If primary failed or corrupted, recover from .bak backup
    if (!loaded && fs.existsSync(this.journalBackupPath)) {
      try {
        const rawBak = fs.readFileSync(this.journalBackupPath, 'utf8');
        const parsedBak = JSON.parse(rawBak);
        if (Array.isArray(parsedBak)) {
          for (const item of parsedBak) {
            this.entries.set(item.idempotencyKey || item.commandId, item);
          }
          console.log('[CommandJournal] Successfully recovered journal from backup file.');
          loaded = true;
        }
      } catch (bakErr) {
        console.error('[CommandJournal] Backup journal also corrupted.');
      }
    }

    // 3. Startup Crash Recovery: Check for interrupted commands left in RUNNING or PENDING
    this.performStartupRecovery();
  }

  performStartupRecovery() {
    let recoveredCount = 0;
    for (const [key, entry] of this.entries.entries()) {
      if (entry.status === 'RUNNING' || entry.status === 'PENDING') {
        entry.status = 'RECOVERY_REQUIRED';
        entry.updatedAt = new Date().toISOString();
        entry.recoveryReason = 'Process termination, service restart, or power loss during execution';
        recoveredCount++;
      }
    }

    if (recoveredCount > 0) {
      console.warn(`[CommandJournal] Startup Crash Recovery: Marked ${recoveredCount} interrupted command(s) as RECOVERY_REQUIRED.`);
      this.persistAtomic();
    }
  }

  /**
   * Atomic file update using write-to-temp + fsync + atomic rename
   * Prevents journal corruption from sudden power loss or process kill mid-write
   */
  persistAtomic() {
    try {
      const arr = Array.from(this.entries.values());
      // FIFO Bounded retention pruning
      if (arr.length > this.maxEntries) {
        arr.splice(0, arr.length - this.maxEntries);
        this.entries.clear();
        for (const item of arr) {
          this.entries.set(item.idempotencyKey || item.commandId, item);
        }
      }

      const serialized = JSON.stringify(arr, null, 2);
      const tempPath = path.join(this.journalDir, `journal_tmp_${process.pid}_${Date.now()}.tmp`);

      // Write to temp file and flush buffers to physical disk
      const fd = fs.openSync(tempPath, 'w');
      fs.writeFileSync(fd, serialized, 'utf8');
      fs.fsyncSync(fd);
      fs.closeSync(fd);

      // Create backup copy before overwriting primary
      if (fs.existsSync(this.journalFilePath)) {
        try {
          fs.copyFileSync(this.journalFilePath, this.journalBackupPath);
        } catch (_) {}
      }

      // Atomic rename
      fs.renameSync(tempPath, this.journalFilePath);
    } catch (err) {
      console.error('[CommandJournal] Atomic persist error:', err.message);
    }
  }

  getCommandRecord(lookupKey) {
    if (!lookupKey) return null;
    return this.entries.get(lookupKey) || null;
  }

  recordCommandStart(commandId, commandType, idempotencyKey, payloadDigest) {
    const key = idempotencyKey || commandId;
    const existing = this.entries.get(key);

    if (existing) {
      if (existing.status === 'COMPLETED') {
        return { isDuplicate: true, status: 'COMPLETED', record: existing };
      }
      if (existing.status === 'RECOVERY_REQUIRED') {
        return { isDuplicate: true, status: 'RECOVERY_REQUIRED', record: existing };
      }
      if (existing.status === 'RUNNING') {
        return { isDuplicate: true, status: 'RUNNING', record: existing };
      }
    }

    const record = {
      commandId,
      commandType,
      idempotencyKey: key,
      payloadDigest,
      status: 'RUNNING',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      result: null,
      error: null
    };

    this.entries.set(key, record);
    this.persistAtomic();
    return { isDuplicate: false, status: 'RUNNING', record };
  }

  recordCommandComplete(commandId, idempotencyKey, result) {
    const key = idempotencyKey || commandId;
    const record = this.entries.get(key);
    if (record) {
      record.status = 'COMPLETED';
      record.result = result;
      record.completedAt = new Date().toISOString();
      record.updatedAt = new Date().toISOString();
      this.persistAtomic();
    }
  }

  recordCommandFailure(commandId, idempotencyKey, errorMsg) {
    const key = idempotencyKey || commandId;
    const record = this.entries.get(key);
    if (record) {
      record.status = 'FAILED';
      record.error = errorMsg;
      record.failedAt = new Date().toISOString();
      record.updatedAt = new Date().toISOString();
      this.persistAtomic();
    }
  }
}

export const commandJournal = new CommandJournal();
export default commandJournal;
