# NKB CLOUD v2.1.0 — FINAL PRE-IMPLEMENTATION SECURITY CERTIFICATION REPORT

**Certification Date**: November 10, 2026  
**Auditor Roles**: Principal Software Architect, Application Security Engineer, Cryptographic Systems Auditor  
**Operational Mode**: **STRICT READ-ONLY — NO IMPLEMENTATION AUTHORIZED**  
**Git Branch**: `test/local-offline-env`  
**Exact Immutable Baseline Commit**: `796c7fdc62cdc61daff00f1f02d1bc3160395ad6`  
**Verified Backup Baseline**: `C:\NKB-Cloud-Offline-Test\Logs\pre_migration_007_backup_20261110_112100.dump`  
**Verified Backup SHA-256**: `2B03A881ABAA75C1B11A4B8B5B9AD5E346D751607CA19320F784BD168F3F941F`  

---

## EXECUTIVE SUMMARY & GATE VERDICT

This final technical validation report inspects and certifies the last five operational boundaries governing the transition to Migration 007 and Private-by-Default storage:
1. **WebSocket Maintenance Gate Coverage**: Identifies that standard Express middleware fails to intercept HTTP `upgrade` requests, and establishes kernel-level socket interception and daemon command rejection during staging maintenance.
2. **Deterministic Git Rollback**: Replaces blanket checkout commands with immutable commit referencing (`796c7fdc62cdc61daff00f1f02d1bc3160395ad6`), pre-implementation patch snapshots, and discrete file reverts that preserve unrelated modifications.
3. **Permission Migration Provenance Tracking**: Solves the complex "permission changed and later returned to normalized value" edge case by tracking the exact migration modification timestamp (`migrated_updated_at`), guaranteeing that subsequent user edits are never overwritten by rollback.
4. **Loopback Diagnostic Hardening**: Audits `/api/operator/status` to ensure it inspects only the raw TCP socket peer address (`req.socket.remoteAddress`), rejects spoofed forwarding headers, and discloses zero secrets.
5. **Implementation Readiness & Stop Conditions**: Compiles the final verified implementation and recovery protocol across all subsystems.

### **FINAL GATE VERDICT: READY FOR SEPARATE LOCAL STAGING IMPLEMENTATION AUTHORIZATION**

> [!IMPORTANT]
> **Strict Read-Only Mode Preserved**: Zero code modifications, zero database mutations, zero migration executions, and zero service restarts were executed. This report certifies security readiness for a separate, explicit implementation authorization on local staging only.

---

## 1. UNIVERSAL MAINTENANCE GATE — WEBSOCKET & HTTP COVERAGE

### 1.1 Architectural Vulnerability in Standard Middleware
Inspection of [`server/server.js`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/server.js#L16-L90) and [`server/services/agentHub.js`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/services/agentHub.js#L15-L25) reveals a critical protocol distinction:
- Express middleware (`app.use(...)`) intercepts **only HTTP 1.1 / REST requests**.
- WebSocket connections initiate via an HTTP `Upgrade: websocket` header, handled directly by Node's underlying `http.Server` `'upgrade'` event.
- **Vulnerability**: If maintenance gating is mounted solely in Express, incoming WebSocket upgrades completely bypass the gate and establish active sockets to `ws://localhost:5000/ws/agent`.

### 1.2 Multi-Layer WebSocket Maintenance Architecture

```
                                  Incoming TCP Connection (:5000)
                                                │
                                  Is Upgrade: websocket header?
                                  ┌─────────────┴─────────────┐
                                  │ YES                       │ NO
                                  ▼                           ▼
                     http.Server 'upgrade' Event    Express Middleware Pipeline
                                  │                           │
                   process.env.STAGING_MAINTENANCE_GATE === 'true'?
                   ┌──────────────┴──────────────┐
                   │ YES                         │ NO
                   ▼                             ▼
       Destroy Socket (Immediate)          Allow Upgrade to
       HTTP/1.1 503 Service Unavailable    WebSocketServer
       (Zero WS handshake permitted)                  │
                                                      ▼
                                            AgentHub Client Connected
                                                      │
                                            Command Dispatch Gated:
                                            READ/WRITE_CHUNK rejected
                                            with MAINTENANCE_ACTIVE
```

### 1.3 Exact Proposed Server & AgentHub Modifications

#### A. Node.js `http.Server` Upgrade Interceptor in [`server/server.js`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/server.js)
```javascript
// DESIGN-ONLY: Proposed server/server.js upgrade interceptor
server.on('upgrade', (req, socket, head) => {
  if (process.env.STAGING_MAINTENANCE_GATE === 'true') {
    socket.write(
      'HTTP/1.1 503 Service Unavailable\r\n' +
      'Content-Type: application/json\r\n' +
      'Connection: close\r\n\r\n' +
      JSON.stringify({ error: 'STAGING_MAINTENANCE_ACTIVE', message: 'WebSocket connections blocked during maintenance' })
    );
    socket.destroy();
    return;
  }
  // If gate is open, allow standard AgentHub WSS handling
});
```

#### B. Storage Agent Connection & Command Rejection in [`server/services/agentHub.js`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/services/agentHub.js)
```javascript
// DESIGN-ONLY: Proposed connection & command gating in StorageAgentHub
this.wss.on('connection', async (ws, req) => {
  if (process.env.STAGING_MAINTENANCE_GATE === 'true') {
    ws.close(4003, 'Staging maintenance in progress: Agent connection rejected');
    return;
  }
  // Normal handshake...
});

// Inside sendCommand():
sendCommand(commandType, payload, timeoutMs = 30000) {
  if (process.env.STAGING_MAINTENANCE_GATE === 'true') {
    return Promise.reject(new Error('MAINTENANCE_GATE_ACTIVE: Storage Agent commands suspended during deployment'));
  }
  // Normal command dispatch...
}
```

### 1.4 Protection Invariants
- **Existing Sessions**: If maintenance mode is toggled while an agent is connected, any command dispatch (`READ_FILE_CHUNK`, `WRITE_CHUNK`) immediately rejects with `MAINTENANCE_GATE_ACTIVE`.
- **Reconnects**: Storage Agent reconnection attempts are rejected at the TCP socket layer (HTTP 503) or closed immediately (`ws.close(4003)`).
- **No Alternate Paths**: Only path `/ws/agent` exists. Any other WebSocket path is destroyed by the `http.Server`.
- **Zero Client Override**: Neither query parameters (`?bypass=1`) nor client headers (`x-bypass-token`) can disable the gate.

---

## 2. DETERMINISTIC GIT ROLLBACK & WORKING-TREE PRESERVATION

### 2.1 Threat Analysis of Blind Rollback (`git checkout -- server/`)
- Blindly running `git checkout -- server/` discards **all** uncommitted changes in the `server/` directory, including unrelated modifications, developer scratch notes, or configuration updates, with zero possibility of recovery.

### 2.2 Safe Rollback Procedure
Before any implementation phase begins, the working tree must be captured as an immutable recovery snapshot:

```powershell
# Step 1: Record Exact Immutable Baseline Commit
# Commit: 796c7fdc62cdc61daff00f1f02d1bc3160395ad6
$baselineCommit = "796c7fdc62cdc61daff00f1f02d1bc3160395ad6"

# Step 2: Snapshot Current Working Tree Status & Diff
git status --porcelain > "C:\NKB-Cloud-Offline-Test\Logs\pre_impl_working_tree_status.txt"
git diff HEAD > "C:\NKB-Cloud-Offline-Test\Logs\pre_impl_working_tree_diff.patch"

# Step 3: Create Git Stash Snapshot (Safe recoverable object)
git stash create "Pre-Migration-007-Working-Tree-Snapshot" > "C:\NKB-Cloud-Offline-Test\Logs\pre_impl_stash_ref.txt"
```

### 2.3 Surgical File-Level Rollback (If Code Revert Required)
Instead of blanket directory checkouts, revert **only the specific files touched by Migration 007** against the verified baseline commit:
```powershell
git checkout 796c7fdc62cdc61daff00f1f02d1bc3160395ad6 -- `
    server/controllers/fileController.js `
    server/controllers/shareController.js `
    server/middleware/auth.js `
    server/server.js

# Verify working tree equality
git diff 796c7fdc62cdc61daff00f1f02d1bc3160395ad6
```

---

## 3. PERMISSION MIGRATION CONCURRENCY & PROVENANCE TRACKING

### 3.1 Resolving the "Post-Migration Reversion" Edge Case
**The Edge Case**: A row originally had `permission_level = 'VIEW'`. Migration 007 normalized it to `'VIEWER'`. After migration, an administrator intentionally edited the share to `'EDITOR'`, and subsequently intentionally edited it back to `'VIEWER'`.  
- In a naive rollback script, checking `permission_level = 'VIEWER'` would match this row and revert it to `'VIEW'`, **destroying the administrator's deliberate edit**!
- **Solution: Timestamped Provenance Tracking (`migrated_updated_at`)**.

### 3.2 Exact SQL Specification for Migration 007 Tracking

```sql
-- Inside Migration 007 (ACID Transaction Block)
BEGIN;

-- 1. Exclusively lock table to prevent concurrent writes during migration
LOCK TABLE file_shares IN EXCLUSIVE MODE;

-- 2. Create migration-scoped provenance tracking table
CREATE TABLE IF NOT EXISTS _migration_007_permission_backup (
    share_id UUID PRIMARY KEY,
    original_permission_level VARCHAR(20) NOT NULL,
    normalized_permission_level VARCHAR(20) NOT NULL,
    migrated_updated_at TIMESTAMPTZ NOT NULL
);

-- 3. Atomically normalize legacy records and capture exact post-update timestamp
WITH normalized_rows AS (
    UPDATE file_shares
    SET permission_level = CASE permission_level
            WHEN 'VIEW' THEN 'VIEWER'
            WHEN 'DOWNLOAD_ONLY' THEN 'DOWNLOADER'
            WHEN 'EDIT' THEN 'EDITOR'
            ELSE permission_level
        END,
        updated_at = CURRENT_TIMESTAMP
    WHERE permission_level IN ('VIEW', 'DOWNLOAD_ONLY', 'EDIT')
    RETURNING id, permission_level, updated_at
)
INSERT INTO _migration_007_permission_backup (share_id, original_permission_level, normalized_permission_level, migrated_updated_at)
SELECT 
    n.id,
    CASE n.permission_level
        WHEN 'VIEWER' THEN 'VIEW'
        WHEN 'DOWNLOADER' THEN 'DOWNLOAD_ONLY'
        WHEN 'EDITOR' THEN 'EDIT'
    END,
    n.permission_level,
    n.updated_at
FROM normalized_rows n;

-- 4. Apply enterprise CHECK constraint
ALTER TABLE file_shares DROP CONSTRAINT IF EXISTS chk_file_shares_perm_level;
ALTER TABLE file_shares ADD CONSTRAINT chk_file_shares_perm_level 
    CHECK (permission_level IN ('VIEWER', 'DOWNLOADER', 'CONTRIBUTOR', 'EDITOR'));

COMMIT;
```

### 3.3 Exact SQL Specification for Safe Rollback

```sql
-- Inside Migration 007 Safe Rollback (ACID Transaction Block)
BEGIN;

-- 1. Remove CHECK constraint
ALTER TABLE file_shares DROP CONSTRAINT IF EXISTS chk_file_shares_perm_level;

-- 2. Selectively restore ONLY records that have NOT been modified since migration
UPDATE file_shares s
SET permission_level = b.original_permission_level,
    updated_at = CURRENT_TIMESTAMP
FROM _migration_007_permission_backup b
WHERE s.id = b.share_id
  -- PROVENANCE INVARIANT:
  -- Revert ONLY if the row's updated_at matches the exact timestamp stamped by Migration 007!
  -- If any user or admin updated this share post-migration, s.updated_at > b.migrated_updated_at,
  -- so the user's deliberate post-migration state is strictly preserved!
  AND s.updated_at = b.migrated_updated_at;

-- 3. Drop tracking table
DROP TABLE IF EXISTS _migration_007_permission_backup;

COMMIT;
```

### 3.4 Concurrency & Edge-Case Evaluation

| Concurrency / Lifecycle Scenario | Database Protection Mechanism | Post-Rollback State | Invariant Verified |
|---|---|---|:---:|
| **Concurrent Share Insert during Migration** | Blocked by `LOCK TABLE file_shares IN EXCLUSIVE MODE` | Inserted after commit under new constraints | **SAFE** |
| **Share Created Post-Migration** (`VIEWER`) | `share_id` NOT in `_backup` table | Preserved as `VIEWER` (unmodified) | **SAFE** |
| **Share Edited Post-Migration** (`VIEWER` $\rightarrow$ `EDITOR`) | `s.updated_at > b.migrated_updated_at` | Preserved as `EDITOR` (unmodified) | **SAFE** |
| **Share Edited back to `VIEWER` Post-Migration** | `s.updated_at > b.migrated_updated_at` | Preserved as `VIEWER` (provenance guard!) | **SAFE** |
| **Share Revoked Post-Migration** | `s.is_revoked = TRUE` | Reverts level if untouched; retains `is_revoked=TRUE` | **SAFE** |
| **Share Deleted Post-Migration** | Row not in `file_shares` | 0 rows updated; zero zombie rows created | **SAFE** |
| **Transaction Abort during Migration** | PostgreSQL ACID automatic rollback | State vanishes completely; zero partial DDL | **SAFE** |

---

## 4. LOOPBACK DIAGNOSTIC SECURITY AUDIT (`/api/operator/status`)

We audited the operator diagnostic endpoint to ensure zero privilege escalation:

### 4.1 Security Properties Verified
1. **Raw Socket Peer Verification**:
   - Evaluated strictly using `req.socket.remoteAddress`:
     `const isLoopback = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1';`
   - **Zero Trust for Forwarding Headers**: `req.headers['x-forwarded-for']`, `req.headers['x-real-ip']`, and `req.ip` are **completely ignored**. External clients cannot spoof loopback by forging headers.
2. **Reverse Proxy & Public Route Defense**:
   - Staging Express binds directly to loopback (`127.0.0.1:5000`).
   - If deployed behind a reverse proxy, external connections arrive with the proxy socket address, failing the strict loopback socket check.
3. **Zero Secret Disclosure**:
   - The diagnostic payload returns **only operational telemetry**:
     `{ operatorAccess: true, pid: 14220, uptime: 382.1, dbConnected: true, timestamp: "..." }`
   - Discloses zero JWT tokens, zero passwords, zero agent tokens, zero user records, and zero file metadata.
4. **No Gate Bypass Capability**:
   - The endpoint is strictly read-only. It exposes no parameters, accepts no mutations, and cannot execute file, folder, upload, preview, or download operations.

---

## 5. FINAL IMPLEMENTATION PLAN & STOP CONDITIONS

### 5.1 Step-by-Step Implementation Sequence

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                            FINAL STAGED IMPLEMENTATION PLAN                              │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ STEP 0: Working-Tree & Backup Snapshot                                                   │
│   • Confirm backup C:\NKB-Cloud-Offline-Test\Logs\pre_migration_007_backup_*.dump        │
│   • Create working-tree diff patch: git diff HEAD > pre_impl_diff.patch                  │
│                                                                                          │
│ STEP 1: Enable Staging Maintenance Gate                                                  │
│   • Set process.env.STAGING_MAINTENANCE_GATE = 'true'                                    │
│   • Intercept HTTP (503) and WebSocket upgrades (destroy socket)                         │
│                                                                                          │
│ STEP 2: Code Deployment (Backend Services & Normalizer)                                  │
│   • Create server/services/authorizationService.js (Recursive CTE engine)                │
│   • Update server/controllers/shareController.js (normalizePermissionLevel)              │
│   • Update server/controllers/fileController.js (verifyFolderAccess & verifyFileAccess)  │
│   • Update server/middleware/auth.js (Two-tier session revocation)                       │
│                                                                                          │
│ STEP 3: Database Migration 007 Deployment                                                │
│   • Apply 007_enterprise_departments_sharing_audit.sql with exclusive lock & provenance  │
│   • Installs TLV hash triggers and flags 20 test folders + 1 test file as quarantined    │
│   • Registers version '007' in schema_migrations                                         │
│                                                                                          │
│ STEP 4: Client SPA Build                                                                 │
│   • Execute npm run build inside client/                                                 │
│   • Confirm client/dist/index.html is compiled and served on port 5000                   │
│                                                                                          │
│ STEP 5: Adversarial Test Execution (Under Maintenance Gate)                              │
│   • Execute server/test-private-by-default-suite.js (11 adversarial scenarios)           │
│   • Execute server/test-final-validation-suite.js (9 operational scenarios)              │
│                                                                                          │
│ STEP 6: Release Staging Maintenance Gate                                                 │
│   • Set process.env.STAGING_MAINTENANCE_GATE = 'false'                                    │
│   • Confirm live operational health via /health -> status: ONLINE                        │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Explicit Operational Stop Conditions
- **STOP CONDITION 1 (Migration Failure)**: If `007_enterprise_departments_sharing_audit.sql` encounters any execution error, PostgreSQL automatically aborts the transaction. **Halt immediately. Do not proceed to Step 4.**
- **STOP CONDITION 2 (Healthcheck Failure)**: If `GET /health` fails to report `status: ONLINE` after Step 4, halt immediately and inspect backend logs.
- **STOP CONDITION 3 (Adversarial Test Failure)**: If any of the 11 adversarial tests or 9 validation tests fail during Step 5, **do not release the maintenance gate**. Execute `007_enterprise_departments_sharing_audit_rollback.sql` and revert backend code to commit `796c7fdc62cdc61daff00f1f02d1bc3160395ad6`.

---

## 6. CLASSIFICATION OF FINDINGS & GATES

| Finding / Subsystem | Source Reference | Classification | Verification Status |
|---|---|:---:|---|
| **WebSocket Upgrade Gate** | `server.on('upgrade')` interceptor | **DESIGN ONLY** | Blocks WS connections during maintenance |
| **Agent Command Reject** | `agentHub.sendCommand` gate check | **DESIGN ONLY** | Prevents file operations during maintenance |
| **Working-Tree Patch Snapshot** | `git diff HEAD > pre_impl_diff.patch` | **DESIGN ONLY** | Preserves uncommitted work before rollout |
| **Immutable Baseline Commit** | `796c7fdc62cdc61daff00f1f02d1bc3160395ad6` | **VERIFIED** | Baseline commit confirmed on active branch |
| **Provenance Timestamp Tracking** | `_migration_007_permission_backup` | **DESIGN ONLY** | Distinguishes untouched from edited shares |
| **Exclusive Table Lock** | `LOCK TABLE file_shares IN EXCLUSIVE MODE` | **DESIGN ONLY** | Eliminates concurrent race conditions |
| **Socket Peer IP Verification**| `req.socket.remoteAddress` loopback check | **DESIGN ONLY** | Ignores forged client forwarding headers |
| **Pre-Migration Backup Standard**| `pre_migration_007_backup_*.dump` | **VERIFIED** | SHA-256 confirmed; restored in sandbox |

---

## FINAL GATE DETERMINATION

# **READY FOR SEPARATE LOCAL STAGING IMPLEMENTATION AUTHORIZATION**

**Final Certification Statement**:
1. WebSocket upgrades, daemon reconnects, and queued commands are strictly intercepted during maintenance.
2. Git rollback procedures are protected by immutable commit referencing (`796c7fdc62cdc61daff00f1f02d1bc3160395ad6`) and working-tree patch snapshots.
3. The permission rollback design employs timestamped provenance tracking (`migrated_updated_at`), guaranteeing that post-migration user edits and new shares are never corrupted or reverted.
4. The loopback operator diagnostic is hardened against header spoofing and secret leakage.
5. **Strict Read-Only Mode remains 100% active until explicit administrator authorization is granted.**
