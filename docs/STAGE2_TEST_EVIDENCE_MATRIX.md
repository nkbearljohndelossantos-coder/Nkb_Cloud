# NKB CLOUD v2.1.0 — STAGE 2 TEST EVIDENCE MATRIX
## Master Verification Scrutiny, Test Level Classification & Gap Analysis

**Organization:** NKB Manufacturing  
**Platform:** NKB Cloud Private Storage Platform  
**Target Scope:** `server/test-stage2-verification.js` (34 assertions), `server/audit_evidence_summary.json` (Probes 1–5)  
**Audit Classification:** Independent Read-Only Security & Test Scrutiny Audit  
**Audit Date:** November 9, 2026  
**Auditor Verdict:** **CONDITIONAL REJECTION — 100% HARNESS PASS OBSCURED CRITICAL EDGE VULNERABILITIES**

---

### 1. PURPOSE & METHODOLOGY

This document reconciles the 34-test automated completion report claimed in `STAGE2_IMPLEMENTATION_REPORT.md` against empirical adversarial probes executed in this independent audit.

Every test assertion from `server/test-stage2-verification.js` was evaluated across five technical dimensions:
1. **Unit Test Level:** Isolated algorithmic logic within memory mocks.
2. **Integration Test Level:** Localhost WebSocket and HTTP communication between VPS and agent modules.
3. **Live PostgreSQL 16 Level:** Real schema persistence against the staging database container (`nkb_pg16_staging:5433`).
4. **Real OS / Windows Filesystem Level:** Actual disk I/O, NTFS streams, path parsing, and atomic operations.
5. **Adversarial / Stress Scrutiny:** Replay concurrency, signature tampering, memory limits, and boundary escapes.

---

### 2. MASTER 34-ASSERTION SCRUTINY MATRIX

| # | Test Assertion Description | Test Level | Happy Path | Adversarial Scrutiny | Audit Verdict | Related Finding |
|:---:|---|:---:|:---:|:---:|:---:|:---:|
| **1** | Storage agent registered in database | Live PG16 | ✅ PASSED | Cleartext secret stored in `storage_agents.agent_token` | **FAIL** | **SEC-02** |
| **2** | Initial agent status is OFFLINE before handshake | Live PG16 | ✅ PASSED | Valid default state preserved | **PASS** | — |
| **3** | Server grants auth on valid HMAC-SHA256 response | Integration | ✅ PASSED | Revocation in `agent_credentials` is ignored at runtime | **FAIL** | **SEC-02** |
| **4** | Server issues secure random session token | Unit / Int | ✅ PASSED | 32-byte cryptographically secure token issued | **PASS** | — |
| **5** | AgentHub marks agent active and authenticated | Integration | ✅ PASSED | Memory map records active socket | **PASS** | — |
| **6** | Client and server nonces persisted in registry | Live PG16 | ✅ PASSED | Inserted into `agent_nonce_registry` with 300s TTL | **PASS** | — |
| **7** | Replay attack detected by nonce registry | Live PG16 | ✅ PASSED | Concurrent race-condition replay succeeds (swallowed error) | **FAIL** | **SEC-03** |
| **8** | Unauthorized agent with invalid secret rejected | Integration | ✅ PASSED | Timing-safe check rejects invalid HMAC signatures | **PASS** | — |
| **9** | Command envelope received by storage agent | Integration | ✅ PASSED | JSON WebSocket frame dispatched and delivered | **PASS** | — |
| **10** | Envelope signed with HMAC-SHA256 signature | Integration | ✅ PASSED | Dispatched envelope contains signature string | **PASS** | — |
| **11** | Envelope contains unique idempotency key | Integration | ✅ PASSED | UUID generated and mapped in header | **PASS** | — |
| **12** | Envelope contains strict expiration timestamp | Integration | ✅ PASSED | ISO timestamp checked on arrival | **PASS** | — |
| **13** | Agent verifies envelope HMAC-SHA256 signature | OS / Node | ✅ PASSED | Signature verified IF PRESENT; bypassed if stripped! | **FAIL** | **SEC-01** |
| **14** | Agent flags EXPIRED for expired commands | OS / Node | ✅ PASSED | Deadlines correctly enforced | **PASS** | — |
| **15** | First command execution invokes engine | OS / Node | ✅ PASSED | Disk detector executed | **PASS** | — |
| **16** | Duplicate command returns cached result | OS / Node | ✅ PASSED | Cache works, but is ephemeral and unbounded | **CONDITIONAL** | **SEC-04** |
| **17** | Path traversal (`../../`) strictly blocked | OS / NTFS | ✅ PASSED | Regex & normalization catches `..` escape | **PASS** | — |
| **18** | Null byte injection (`\0`) strictly blocked | OS / NTFS | ✅ PASSED | String parser rejects `\0` | **PASS** | — |
| **19** | Alternate Data Stream (colon `:`) blocked | OS / NTFS | ✅ PASSED | NTFS stream injection prevented | **PASS** | — |
| **20** | Alternate Data Stream (`::$DATA`) blocked | OS / NTFS | ✅ PASSED | NTFS default data stream injection prevented | **PASS** | — |
| **21** | Reserved device `CON` strictly blocked | OS / NTFS | ✅ PASSED | DOS device name pattern catches `CON` | **PASS** | — |
| **22** | Reserved device `AUX.txt` strictly blocked | OS / NTFS | ✅ PASSED | DOS device extension check catches `AUX.txt` | **PASS** | — |
| **23** | Chunk 0 written to temporary parts folder | OS / Disk | ✅ PASSED | File written to `<file>.chunks/chunk_000000.part` | **PASS** | — |
| **24** | Chunk 0 byte count verified on disk | OS / Disk | ✅ PASSED | Binary size matches upload buffer | **PASS** | — |
| **25** | File successfully assembled upon final chunk | OS / Disk | ✅ PASSED | Parts concatenated into temporary assembly file | **PASS** | — |
| **26** | Assembled file size matches total chunk sum | OS / Disk | ✅ PASSED | Byte parity verified on disk | **PASS** | — |
| **27** | Assembled file SHA-256 matches bit-for-bit | OS / Crypto | ✅ PASSED | SHA-256 stream calculation matches expected hash | **PASS** | — |
| **28** | Range reader fetched exact requested slice | OS / Disk | ✅ PASSED | RFC 7233 byte-range offset respected | **PASS** | — |
| **29** | Range slice byte content matches origin file | OS / Disk | ✅ PASSED | Binary slice integrity verified | **PASS** | — |
| **30** | Storage engine verified valid SHA-256 match | OS / Crypto | ✅ PASSED | Valid file hash yields `{ isMatch: true }` | **PASS** | — |
| **31** | Storage engine rejected mismatched checksum | OS / Crypto | ✅ PASSED | Corrupted file yields `{ isMatch: false }` | **PASS** | — |
| **32** | Safe file migration succeeded | OS / Disk | ✅ PASSED | Destination file populated via streaming pipeline | **PASS** | **MIG-01** |
| **33** | File migration verified with target SHA-256 | OS / Crypto | ✅ PASSED | Destination hash verified before completion | **PASS** | **MIG-01** |
| **34** | Source file remains preserved (Zero delete) | OS / Disk | ✅ PASSED | Original source file 100% intact after migration | **PASS** | **MIG-01** |

---

### 3. GAP ANALYSIS: WHY THE 34-TEST HARNESS MISSED CRITICAL DEFECTS

The Stage 2 verification test suite (`server/test-stage2-verification.js`) achieved a **34/34 (100%) Pass Rate**, yet left critical vulnerabilities undetected. The independent audit identified three structural testing gaps:

#### Gap 1: Happy-Path Testing Only on Cryptographic Envelopes
- In Test 5 (Assertions 9–13), the test harness created a perfectly valid signed envelope and asserted that the agent verified it.
- **The Missing Adversarial Test:** The harness never attempted to send an envelope with the `signature` property **removed or stripped**. Had an assertion tested `handleSecureCommand({ ...envelope, signature: undefined })`, it would have immediately caught the `if (signature)` bypass (SEC-01).

#### Gap 2: Sequential-Only Replay Verification
- In Test 3 (Assertions 6–7), the test harness performed a sequential replay: connect with nonce $A$, disconnect, then reconnect with nonce $A$. The database query caught the duplicate.
- **The Missing Concurrency Test:** The harness never executed two simultaneous handshakes using nonce $A$ in parallel. Had it done so, it would have discovered that the second insert throws a `23505` error which `agentHub.js` swallows without aborting, granting authentication to both connections (SEC-03).

#### Gap 3: Micro-Payload Testing Concealed Memory Inefficiency
- In Test 9 (Assertions 23–27), the test harness used a tiny 1 KB test string (`Stage 2 Verified Payload ...`).
- **The Missing Large-Scale Stress Test:** At 1 KB, Base64 serialization overhead and `express.raw` heap allocations are negligible (<1 ms, <2 KB). Had the test harness uploaded a 50 MB chunk or requested a non-ranged 1 GB download, the V8 heap spike (+33% network inflation, $3.67\times$ RAM multiplier) or `ERR_STRING_TOO_LONG` crash would have immediately exposed PERF-01.

---

### 4. CATEGORIZED VERDICT RECONCILIATION

```
Total Test Assertions Audited: 34
------------------------------------------------------------
Strict Independent PASS:          29  (85.3%)
FAIL (Critical / High Defects):    4  (11.8%) -> SEC-01, SEC-02, SEC-03
CONDITIONAL (Architectural Risk):  1   (2.9%) -> SEC-04
------------------------------------------------------------
Effective Security Pass Rate:     85.3% (Certification Threshold: 100%)
```

---

### 5. MANDATORY CI/CD HARDENING RECOMMENDATIONS

Before certifying Stage 3 or issuing production releases:
1. **Adversarial Security Test Cases:** Add negative security tests asserting that unsigned commands (`signature: null`), altered payloads (`payload: { forged: true }`), and expired envelopes are rejected with `403/4003`.
2. **PostgreSQL Concurrency Tests:** Integrate automated 20-thread parallel handshake tests to verify nonce atomicity under database lock contention.
3. **Payload Scaling Tests:** Add automated transfers of 100 MB and 1 GB binary test files to monitor V8 heap deltas, streaming backpressure, and garbage collection behavior.

---

### 6. FINAL CONCLUSION

The Stage 2 codebase contains strong functional primitives and robust baseline path sanitization. However, because **SEC-01 (Signature Stripping), SEC-02 (Plaintext Key Storage), SEC-03 (Nonce Exception Swallowing), and PERF-01 (In-Memory Buffer Inflation)** present significant operational and security liabilities, **Stage 2 cannot be signed off for production deployment until these four defects are remediated**.
