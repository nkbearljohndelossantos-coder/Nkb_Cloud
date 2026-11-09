import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class CommandJournal {
  constructor(options = {}) {
    this.journalDir = options.journalDir || path.join(__dirname, '..', 'data');
    this.journalFilePath = path.join(this.journalDir, 'command_journal.json');
    this.maxEntries = options.maxEntries || 10000;
    this.entries = new Map();
    this.initJournal();
  }

  initJournal() {
    if (!fs.existsSync(this.journalDir)) {
      fs.mkdirSync(this.journalDir, { recursive: true });
    }

    if (fs.existsSync(this.journalFilePath)) {
      try {
        const raw = fs.readFileSync(this.journalFilePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            this.entries.set(item.idempotencyKey || item.commandId, item);
          }
        }
      } catch (err) {
        console.warn('[CommandJournal] Journal file corrupted or empty, reinitializing.');
        this.entries.clear();
      }
    }

    // Startup Crash Recovery: Check for interrupted commands left in RUNNING state
    this.performStartupRecovery();
  }

  performStartupRecovery() {
    let recoveredCount = 0;
    for (const [key, entry] of this.entries.entries()) {
      if (entry.status === 'RUNNING' || entry.status === 'PENDING') {
        entry.status = 'RECOVERY_REQUIRED';
        entry.updatedAt = new Date().toISOString();
        entry.recoveryReason = 'Process termination or service restart during execution';
        recoveredCount++;
      }
    }

    if (recoveredCount > 0) {
      console.warn(`[CommandJournal] Startup crash recovery: Marked ${recoveredCount} interrupted command(s) as RECOVERY_REQUIRED.`);
      this.persist();
    }
  }

  persist() {
    try {
      const arr = Array.from(this.entries.values());
      // Bounded retention pruning
      if (arr.length > this.maxEntries) {
        arr.splice(0, arr.length - this.maxEntries);
        this.entries.clear();
        for (const item of arr) {
          this.entries.set(item.idempotencyKey || item.commandId, item);
        }
      }
      fs.writeFileSync(this.journalFilePath, JSON.stringify(arr, null, 2), 'utf8');
    } catch (err) {
      console.error('[CommandJournal] Failed to persist command journal:', err.message);
    }
  }

  getCommandRecord(lookupKey) {
    if (!lookupKey) return null;
    return this.entries.get(lookupKey) || null;
  }

  recordCommandStart(commandId, commandType, idempotencyKey, payloadDigest) {
    const key = idempotencyKey || commandId;
    const existing = this.entries.get(key);

    if (existing && existing.status === 'COMPLETED') {
      return { isDuplicate: true, record: existing };
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
    this.persist();
    return { isDuplicate: false, record };
  }

  recordCommandComplete(commandId, idempotencyKey, result) {
    const key = idempotencyKey || commandId;
    const record = this.entries.get(key);
    if (record) {
      record.status = 'COMPLETED';
      record.result = result;
      record.completedAt = new Date().toISOString();
      record.updatedAt = new Date().toISOString();
      this.persist();
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
      this.persist();
    }
  }
}

export const commandJournal = new CommandJournal();
export default commandJournal;
