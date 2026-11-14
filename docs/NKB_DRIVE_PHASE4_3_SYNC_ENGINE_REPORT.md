# NKB DRIVE — PHASE 4.3 SYNC ENGINE REPORT
## Transactional Local Synchronization, Exponential Backoff, and Offline Resilience

**Document Version:** 1.0.0  
**Date:** November 13, 2026  
**Auditor / Lead Engineer:** Antigravity AI Engine  
**Component:** Local Storage & Background Sync Subsystem (`SyncMetadataRepository` & `SyncEngine`)  
**Storage Architecture:** Native Windows SQLite (`metadata.db` via `C:\Windows\System32\winsqlite3.dll`)  
**Status:** FULLY IMPLEMENTED & LIVE VALIDATED  

---

## 1. ARCHITECTURAL OVERVIEW

The NKB Drive synchronization subsystem operates as an asynchronous, non-blocking bridge between local filesystem operations on `N:\` and the NKB Cloud backend.

### 1.1 Core Principles
1. **Zero External Dependencies:** Uses Windows' native `winsqlite3.dll` via P/Invoke. Zero NuGet or C++ runtime package bloat.
2. **ACID Queue Durability:** Every filesystem operation is recorded in SQLite using `BEGIN IMMEDIATE TRANSACTION`. Uncommitted operations survive application crashes, power loss, and system reboots.
3. **Decoupled Eviction:** Purging local disk cache never triggers cloud file deletion.

---

## 2. SQLITE REPOSITORY SCHEMA (`metadata.db`)

Managed in `SyncMetadataRepository.cs`:

```sql
-- 1. Virtual File State Catalog
CREATE TABLE IF NOT EXISTS local_files (
    file_id TEXT PRIMARY KEY,
    relative_path TEXT NOT NULL,
    name TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    sync_state TEXT NOT NULL, -- 'ONLINE_ONLY', 'LOCAL_CACHED', 'OFFLINE_PINNED', 'SYNC_PENDING', 'CONFLICT'
    server_updated_at TEXT NOT NULL,
    local_updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_local_files_state ON local_files(sync_state);
CREATE INDEX IF NOT EXISTS idx_local_files_path ON local_files(relative_path);

-- 2. Persistent Sync Queue
CREATE TABLE IF NOT EXISTS sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id TEXT,
    operation TEXT NOT NULL, -- 'UPLOAD', 'DOWNLOAD', 'RENAME', 'MOVE', 'TRASH', 'FOLDER_CREATE'
    local_path TEXT NOT NULL,
    target_path TEXT,
    retry_count INTEGER DEFAULT 0,
    next_retry_time TEXT,
    status TEXT DEFAULT 'QUEUED', -- 'QUEUED', 'PROCESSING', 'FAILED', 'COMPLETED'
    error_message TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);

-- 3. Monotonic Server Sync Cursor
CREATE TABLE IF NOT EXISTS sync_cursor (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    last_cursor INTEGER NOT NULL DEFAULT 0,
    last_sync_timestamp TEXT NOT NULL
);

-- 4. User Offline Pinned Items
CREATE TABLE IF NOT EXISTS offline_pins (
    item_id TEXT PRIMARY KEY,
    item_type TEXT NOT NULL, -- 'FILE', 'FOLDER'
    pinned_at TEXT NOT NULL,
    pinned_by_user TEXT NOT NULL
);

-- 5. Local Cache Tracking Table
CREATE TABLE IF NOT EXISTS local_cache (
    file_id TEXT PRIMARY KEY,
    cache_path TEXT NOT NULL,
    cached_size_bytes INTEGER NOT NULL,
    last_accessed_at TEXT NOT NULL,
    is_dirty INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_local_cache_accessed ON local_cache(last_accessed_at);

-- 6. Concurrency Conflicts
CREATE TABLE IF NOT EXISTS sync_conflicts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_file_id TEXT NOT NULL,
    conflict_file_name TEXT NOT NULL,
    base_sha256 TEXT NOT NULL,
    server_sha256 TEXT NOT NULL,
    local_sha256 TEXT NOT NULL,
    detected_at TEXT NOT NULL,
    resolution_status TEXT DEFAULT 'FORKED'
);

-- 7. Device Enrollment State
CREATE TABLE IF NOT EXISTS device_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    device_id TEXT,
    machine_name TEXT,
    hardware_fingerprint TEXT,
    approval_status TEXT,
    target_drive_letter TEXT DEFAULT 'N:',
    last_sync_at TEXT
);
```

---

## 3. QUEUE PROCESSING & BACKOFF ALGORITHM

Managed in `SyncEngine.cs`:

### 3.1 Exponential Backoff with Randomized Jitter
To prevent thundering herd spikes when a workstation reconnects after a network outage, failed operations calculate delay according to:
$$\text{Delay} = \min\left(\text{Base} \times 2^{\min(\text{retryCount}, 6)}, \text{Max}\right) + \text{Jitter}$$
Where:
- $\text{Base} = 2\text{ seconds}$
- $\text{Max} = 60\text{ seconds}$
- $\text{Jitter} = \text{random}(0, 3)\text{ seconds}$

```csharp
public int CalculateBackoffDelay(int retryCount)
{
    if (retryCount <= 0) return BaseRetryDelaySeconds;
    int delay = (int)(BaseRetryDelaySeconds * Math.Pow(2, Math.Min(retryCount, 6)));
    delay = Math.Min(delay, MaxRetryDelaySeconds);
    int jitter = _random.Next(0, 3);
    return delay + jitter;
}
```

### 3.2 Transactional Queue Worker Execution
The worker processes batches of up to 20 pending items:
1. Skips items where `next_retry_time > DateTime.UtcNow`.
2. Marks item as `PROCESSING`.
3. Dispatches operation:
   - **`UPLOAD`:** Uploads staged file payload to `/api/files/upload/direct`. Upon success, executes `_repo.ReplaceFileId(tempId, cloudId)`, updates state to `SYNCED`, and atomically swaps local `.dat` filenames.
   - **`RENAME`:** Issues `PUT /api/files/:id/rename`.
   - **`MOVE`:** Issues `PUT /api/files/:id/move`.
   - **`TRASH`:** Issues `POST /api/files/:id/trash`.
   - **`FOLDER_CREATE`:** Issues `POST /api/files/folder`.
4. On success: Marks item `COMPLETED` and purges it from queue.
5. On network error: Increments `retry_count`, calculates backoff timestamp, and updates `status = 'FAILED'`.

---

## 4. OFFLINE RESILIENCE & DATA SAFETY

### 4.1 Offline Modification Handling
When network connectivity is severed:
1. Applications continue reading and writing to `N:\` without disruption.
2. File edits write directly to the local cache backing file (`<UUID>.dat`).
3. `local_files` marks the record `SYNC_PENDING`.
4. `sync_queue` persists the upload operation in SQLite.
5. Applications receive immediate write confirmation (`STATUS_SUCCESS`).

### 4.2 Automatic Reconnection Recovery
1. When connectivity returns, the background worker thread awakens.
2. `ProcessPendingQueue()` drains all pending queue items sequentially.
3. Upstream servers confirm receipt with HTTP 200/201.
4. Local queue count drains to zero (`pendingQueue = 0`).

### 4.3 Safe Cache Eviction (Zero Cloud Deletion)
When local disk thresholds require cache cleanup:
- `SyncEngine.EvictCache(fileId)` checks `offline_pins` and `sync_queue`.
- If the file is pinned or has pending local edits, eviction is aborted.
- For clean, unpinned cached files:
  - Deletes `<UUID>.dat` from disk cache.
  - Updates SQLite record: `sync_state = 'ONLINE_ONLY'`.
  - **ZERO HTTP CALLS ARE SENT TO THE SERVER.**
  - Master cloud copies remain 100% intact.

---

## 5. EMPIRICAL VERIFICATION EVIDENCE

1. **Queue Persistence (Test 10):** Intercepted local file creation and edit; verified 2 items queued in `sync_queue`.
2. **Queue Drainage (Test 11):** Processed queue; verified file uploaded to staging, temporary UUID replaced with cloud UUID, and queue count reduced to 0.
3. **Offline Disconnect Simulation (Test 17):** Cleared auth token to simulate network drop; created file on `N:\`; verified local write succeeded and operation queued in SQLite.
4. **Reconnection Recovery (Test 18):** Restored auth token; triggered sync; verified queue drained and file uploaded to server.
5. **Safe Eviction (Test 16):** Evicted cached file; verified local `.dat` removed, state reset to `ONLINE_ONLY`, and cloud file remained verified on server.
6. **Crash Resilience (Test 23):** Forcibly shut down host and disposed repository; re-instantiated fresh repository against existing `metadata.db`; verified all metadata, cursors, and records recovered intact.
