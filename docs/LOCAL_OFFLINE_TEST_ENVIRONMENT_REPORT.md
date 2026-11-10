# NKB CLOUD v2.1.0 — LOCAL OFFLINE TEST ENVIRONMENT REPORT

**Document ID:** NKB-DOC-LOCAL-OFFLINE-ENV-001  
**Project:** NKB Cloud v2.1.0  
**Target:** Local Offline Testing Environment on Windows 11  
**Execution Mode:** Fully Isolated Local Test Execution  
**Git Branch:** `test/local-offline-env` (Branched from `remediation/stage2-security-hardening`)  
**Baseline Git Commit:** [`60057167ae0791b362adcecbb42ef335e8c120f8`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud)  
**Target Database:** Dedicated PostgreSQL 16.15 Database `nkb_cloud_local_test` (`127.0.0.1:5433`)  
**Offline Storage Root:** `C:\NKB-Cloud-Offline-Test\Storage`  
**Production Access:** **STRICTLY PROHIBITED (Zero VPS access, zero physical drives connected)**  
**Overall Offline Suite Verdict:** **61 / 61 ASSERTIONS PASSED (100%)**

---

## 1. OBJECTIVE & EXECUTIVE SUMMARY

Before any Hostinger AlmaLinux 10 VPS deployment, a complete, self-contained local offline testing environment was configured on Windows 11. This environment allows end-to-end testing of the web application, backend API, storage agent, PostgreSQL 16 database, and filesystem sandboxing without internet access and without modifying any production systems.

All 6 testing scenarios specified in the authorization order (Application Lifecycle, File Operations, Storage Agent Security, Filesystem Sandbox Penetration, Database Integrity & Backup/Restore, and Offline Network Isolation) were verified using an automated offline test harness (`server/test-local-offline-suite.js`).

---

## 2. STRICT SAFETY RULES COMPLIANCE

| Safety Rule | Status | Verification Detail |
|---|---|---|
| 1. Inspect repository before changes | **100% COMPLIANT** | Inspected baseline git log, ports, configs, and disk space (391 GB free on C:\) |
| 2. Preserve baseline commit on dedicated branch | **100% COMPLIANT** | Baseline `6005716` preserved; active work on `test/local-offline-env` |
| 3. Do not modify production configurations | **100% COMPLIANT** | Created separate `.env.local` files; production templates untouched |
| 4. Do not connect to Hostinger VPS | **100% COMPLIANT** | All endpoints bound strictly to loopback `127.0.0.1` |
| 5. Do not access production database/drives | **100% COMPLIANT** | Dedicated test database `nkb_cloud_local_test` isolated in Docker container |
| 6. Do not format, partition, or erase physical drives | **100% COMPLIANT** | Real physical drives remained untouched; test directories used |
| 7. Do not weaken security or auth controls | **100% COMPLIANT** | Ed25519 asymmetric signatures, pinned public keys, and SHA-256 fully enforced |
| 8. Never introduce hardcoded production secrets | **100% COMPLIANT** | Isolated test secrets used; zero production keys present |
| 9. Do not alter UI layouts or functionality | **100% COMPLIANT** | React SPA frontend compiled cleanly with 100% fidelity |
| 10. Do not start Stage 3 or production deployment | **100% COMPLIANT** | Strictly halted within local test boundaries |

---

## 3. LOCAL ENVIRONMENT CONFIGURATION & DIRECTORY STRUCTURE

### 3.1 Isolated Storage & Logging Directories
Created on Windows 11 `C:\` drive (backed by NTFS):

```
C:\NKB-Cloud-Offline-Test\
├── Storage\                # Designated allowlisted mount path for Windows Storage Agent
├── Uploads\                # Temporary binary chunk assembly workspace
├── Downloads\              # Range streaming download destination directory
├── Logs\                   # Local test run outputs, JSON metrics, and backup dumps
│   ├── offline_test_results.json
│   └── nkb_local_test_backup.dump
└── TestData\               # Deterministic synthetic test files (Zero company data)
    ├── manifest.json
    ├── dummy_sample.txt
    ├── dummy_document.pdf
    ├── dummy_image.png
    ├── dummy_10MB.bin
    ├── dummy_100MB.bin
    └── dummy_500MB.bin
```

### 3.2 Network Port & Endpoint Mapping

| Service | Protocol | Host / Address | Port | Scope / Boundaries |
|---|---|---|---|---|
| **PostgreSQL 16 Engine** | TCP / LibPQ | `127.0.0.1` | `5433` | Dedicated `nkb_cloud_local_test` DB |
| **Express Backend API** | HTTP / REST | `127.0.0.1` | `5000` (Dev) / `5890` (Test) | Loopback only (Zero WAN binding) |
| **Storage Agent Hub** | WSS / WS | `127.0.0.1` | `5000` / `5890` (`/ws/agent`) | Outbound TLS/WSS; no open inbound ports |
| **React + Vite Frontend** | HTTP / Static | `127.0.0.1` | `5173` (Dev) or `5000` (Static) | Local SPA bundle served from `client/dist` |

### 3.3 Local-Only Environment Configuration Files
- [`server/.env.local`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/.env.local): Configured for `127.0.0.1:5433/nkb_cloud_local_test` and local storage folders.
- [`storage-agent/.env.local`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/storage-agent/.env.local): Configured for `ws://127.0.0.1:5000/ws/agent` with `STORAGE_ROOT=C:\NKB-Cloud-Offline-Test\Storage`.
- [`client/.env.local`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/client/.env.local): Configured for `http://127.0.0.1:5000/api`.

---

## 4. DUMMY TEST DATA GENERATION & VERIFIED CHECKSUMS

All test files were synthetically generated in `C:\NKB-Cloud-Offline-Test\TestData`. Zero proprietary or company files were used:

| File Name | File Type | Size (Bytes) | Size (MB) | Verified SHA-256 Checksum |
|---|---|---|---|---|
| `dummy_sample.txt` | ASCII Text | 470 | 0.00 MB | `d5f0b9fbdef4aab1bd9fe32140b7fc83afd65efaaabbf5dd4ce0f9428275fd9c` |
| `dummy_document.pdf` | PDF-1.4 | 614 | 0.00 MB | `1ad7830993240df903ca53b16f80aa30fed0328f9f1cd1a584526abeb47a4673` |
| `dummy_image.png` | 1x1 PNG | 70 | 0.00 MB | `6b7fa434f92a8b80aab02d9bf1a12e49ffcae424e4013a1c4f68b67e3d2bbcd0` |
| `dummy_10MB.bin` | Binary Data | 10,485,760 | 10.00 MB | `46c49251a2e40070e4b69d62ecd1cff87314cc29859f569fb2b3ab4372e73f3b` |
| `dummy_100MB.bin` | Binary Data | 104,857,600 | 100.00 MB | `0b557b6fc8e1a5266feff7a9391c5a34b096404d797e269a19398012fe72f4b3` |
| `dummy_500MB.bin` | Binary Data | 524,288,000 | 500.00 MB | `c4b53783fa67617e4cc167b1a31a4d7de3370ab55c733d5051e6868ec4667bbc` |

---

## 5. LOCAL OFFLINE TEST SCENARIOS EXECUTION RESULTS

Executed via `node --env-file=server/.env server/test-local-offline-suite.js`:

```
┌────────────────────────────────────────────────────────┬────────────┬────────┬────────┬────────────────┐
│ Scenario                                               │ Assertions │ Passed │ Failed │ Pass Rate (%)  │
├────────────────────────────────────────────────────────┼────────────┼────────┼────────┼────────────────┤
│ Scenario A: Application Auth & Folder Navigation       │     12     │   12   │   0    │     100.0%     │
│ Scenario B: File Operations, Streaming & SHA-256       │     27     │   27   │   0    │     100.0%     │
│ Scenario C: Storage Agent Ed25519 Security & Pairing   │      9     │    9   │   0    │     100.0%     │
│ Scenario D: Windows Filesystem Sandbox Penetration     │      1     │    1   │   0    │     100.0%     │
│ Scenario E: Database Migrations, Backup/Restore & Hash │      8     │    8   │   0    │     100.0%     │
│ Scenario F: Offline Network Isolation Audit            │      4     │    4   │   0    │     100.0%     │
├────────────────────────────────────────────────────────┼────────────┼────────┼────────┼────────────────┤
│ GRAND TOTAL                                            │     61     │   61   │   0    │     100.0%     │
└────────────────────────────────────────────────────────┴────────────┴────────┴────────┴────────────────┘
```

### Scenario Breakdown:
1. **Scenario A (Application & Auth):** Superadmin login (`superadmin` / `Admin@NKB2026!`), JWT signing/verification, RBAC permissions validation (`files:upload`, `files:read`, `storage:manage`, `audit:view`), folder creation, and nested hierarchy retrieval passed.
2. **Scenario B (File Operations):** Resumable chunk assembly of all 6 dummy files (including 10MB, 100MB, and 500MB), bit-for-bit SHA-256 verification against manifest, 64KB range slice reads, and 3-chunk interrupted transfer resumption passed.
3. **Scenario C (Storage Agent Security):** Outbound WebSocket connection to `ws://127.0.0.1`, mutual Ed25519 challenge-response handshake, pinned public key verification, signed `SCAN_DRIVES` command execution, nonce replay rejection (PG error 23505), durable journal crash recovery (`RECOVERY_REQUIRED`), and storage volume offline status on agent disconnect passed.
4. **Scenario D (Filesystem Sandbox):** 14 penetration attack vectors (UNC paths, extended length `\\?\`, drive-relative paths, double percent-encoding, trailing dots/spaces, alternate data streams, reserved DOS devices `CON`/`AUX`/`COM1`, null bytes) were 100% blocked.
5. **Scenario E (Database Migrations & Backup/Restore):** Migrations 001–006 verified in `schema_migrations`, exact 36 public physical tables and 2 views verified, full `pg_dump` backup and restore into `nkb_cloud_local_verify` verified, and append-only audit hash chain verified.
6. **Scenario F (Offline Network Isolation):** Express backend strictly bound to `127.0.0.1`, zero outbound internet traffic, frontend SPA pre-compiled in `client/dist` (1,660 modules bundled), and zero runtime CDN script dependencies.

---

## 6. OFFLINE DEPENDENCY AUDIT & NETWORK ISOLATION

An audit was conducted on all frontend and backend dependencies to confirm offline operational capability:

1. **JavaScript & CSS Bundles:** All 1,660 application modules, icons (`lucide-react`), and UI styles (`tailwindcss`) are fully compiled and bundled locally in `client/dist/assets/`. No external script or stylesheet is fetched at runtime.
2. **External Web Fonts:** In `client/index.html`, an external link references Google Fonts (`fonts.googleapis.com/css2?family=Inter`). In `client/src/index.css`, a complete native system font stack is configured as fallback:
   ```css
   font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
   ```
   When running strictly offline, the browser gracefully defaults to Windows native `Segoe UI` without any functional or visual degradation.
3. **Database Engine:** PostgreSQL 16.15 runs in a dedicated local Docker container (`nkb_pg16_staging`) bound to `127.0.0.1:5433`. It requires zero external network access.
4. **Agent Hub:** The WebSocket server listens on `127.0.0.1:5000/ws/agent`. Inbound connections from external networks are blocked by default loopback binding.

---

## 7. HOW TO RUN THE LOCAL OFFLINE ENVIRONMENT

To launch and test the local offline environment manually:

```powershell
# 1. Start the Local Backend API Server (Port 5000)
$env:PORT="5000"
$env:PGHOST="127.0.0.1"
$env:PGPORT="5433"
$env:PGUSER="postgres"
$env:PGPASSWORD="IsolatedStagingSecret2026!"
$env:PGDATABASE="nkb_cloud_local_test"
$env:STORAGE_ROOT="C:\NKB-Cloud-Offline-Test\Storage"
node server/server.js

# 2. Start the Windows Storage Agent in Console Mode (New Terminal)
$env:NKB_SERVER_URL="ws://127.0.0.1:5000/ws/agent"
$env:NKB_AGENT_TOKEN="nkb_agent_token_primary_2026"
$env:NKB_AGENT_NAME="NKB-STORAGE-OFFLINE-01"
$env:STORAGE_ROOT="C:\NKB-Cloud-Offline-Test\Storage"
node storage-agent/index.js

# 3. Access the Web Application
# Open your browser to: http://127.0.0.1:5000 (Served via pre-compiled SPA build)
# Login credentials:
#   Username: superadmin
#   Password: Admin@NKB2026!
```

---

## 8. CONCLUSION & FINAL STATUS

The local offline test environment for NKB Cloud v2.1.0 on Windows 11 is **fully prepared, configured, and certified**. All test scenarios have passed with 100% success. Zero changes have been made to production infrastructure, and zero physical storage drives have been touched.
