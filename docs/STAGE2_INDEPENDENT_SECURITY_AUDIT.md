# NKB CLOUD v2.1.0 — STAGE 2 INDEPENDENT SECURITY & FILE TRANSFER AUDIT
## Master Technical Audit & Risk Evaluation Report

**Organization:** NKB Manufacturing  
**Platform:** NKB Cloud Private Storage Platform  
**Target Engine:** Node.js 20 ESM / PostgreSQL 16.15 (Alpine Linux x86_64) / Windows Storage Agent  
**Audit Date:** November 9, 2026  
**Auditor Classification:** Independent Read-Only Security Audit  
**Overall Stage 2 Verdict:** **CONDITIONAL FAIL / REMEDIATION REQUIRED BEFORE PRODUCTION**

---

### EXECUTIVE SUMMARY

An exhaustive, read-only independent security and architectural audit of the Stage 2 implementation ("Storage Agent Security & File Transfer Engine") was conducted across the codebase, PostgreSQL database schema, WebSocket relay engine, and Windows Storage Agent file engine.

While Stage 2 successfully implements composite hardware fingerprinting, mutual challenge-response handshakes, strict path traversal blocking, non-destructive migration, and row-level serialization on hash chains, the independent audit discovered **three critical vulnerabilities and two high-severity architectural limitations** that prevent unconditional production certification:

1. **[CRITICAL - SEC-01] Optional Command Signature ("Signature Strip" Flaw):** In `storage-agent/src/agent-client.js`, envelope cryptographic verification is guarded by `if (signature) { ... }`. If an attacker or malicious relay strips or omits the `signature` field, the storage agent skips signature verification entirely and executes the command.
2. **[CRITICAL - SEC-02] Plaintext Secret Storage & Cryptographic Mismatch:** `storage_agents.agent_token` is stored as an unencrypted plaintext string in PostgreSQL. While `agent_credentials` contains `hmac_secret_hash`, `agentHub.js` uses `agent.agent_token` directly as the HMAC key. A database compromise immediately yields reusable plaintext HMAC keys. Storing a SHA-256 hash in `agent_credentials` does not protect authentication when the HMAC algorithm requires the underlying plaintext secret.
3. **[HIGH - SEC-03] Nonce Registration Exception Swallowing:** In `agentHub.js`, the SQL insert into `agent_nonce_registry` is wrapped in a `try/catch` that catches unique constraint violations (`23505`) and merely logs a notice with `console.warn`, allowing concurrent race-condition replay requests to receive `AUTH_GRANTED`.
4. **[HIGH - PERF-01] Pseudo-Streaming Buffer Overhead (Absence of True Backpressure):** `express.raw({ limit: '100mb' })` buffers the entire chunk in V8 heap memory before the controller is called. `agentHub.js` then converts the binary buffer to a Base64 string for JSON WebSocket transmission, incurring an immediate 33% byte inflation and a $3\times$ peak heap multiplier per chunk.
5. **[MEDIUM - SEC-04] Transient In-Memory Idempotency Map:** Idempotency caching on the Windows Storage Agent exists purely in an in-memory JavaScript `Map()`. Service restarts wipe all idempotency history, and unbounded execution caching presents an unmanaged memory leak risk.

---

### AUDIT FINDINGS SUMMARY MATRIX

| Finding ID | Audit Area | Description | Severity | Verdict |
|---|---|---|:---:|:---:|
| **SEC-01** | Command Security | Optional Command Envelope Signature (Signature Stripping Flaw) | **CRITICAL** | **FAIL** |
| **SEC-02** | Cryptography | Plaintext Storage of Agent Secrets in `storage_agents.agent_token` | **CRITICAL** | **FAIL** |
| **SEC-03** | Replay Protection | Nonce Unique Constraint Exception Swallowing on Concurrent Replays | **HIGH** | **FAIL** |
| **PERF-01** | File Transfer | `express.raw` In-Memory Buffering & Base64 JSON Inflation (No True Streaming) | **HIGH** | **FAIL** |
| **SEC-04** | Command Security | Transient In-Memory Agent Idempotency Cache (Zero Persistence) | **MEDIUM** | **FAIL** |
| **SEC-05** | Filesystem Sandbox | Absence of Explicit UNC Path Rejection (`\\server\share`) | **LOW** | **FAIL** |
| **SEC-06** | Concurrency | Audit Log Hash-Chain Concurrency via `system_settings` Row Locking | **LOW** | **PASS** |
| **SEC-07** | Privilege Guard | Role `nkb_app` Trigger Disabling and Table Mutation Prevention | **INFO** | **PASS** |
| **INT-01** | Data Integrity | Bit-for-Bit Backup Restoration & Checksum Parity Across 36 Tables | **INFO** | **PASS** |
| **MIG-01** | Safe Migration | Source Preservation & Checksum-Verified Atomic Target Renaming | **INFO** | **PASS** |

---

### DETAILED AUDIT REPORTS INDEX

For comprehensive technical proofs, disassemblies, benchmarks, and reproduction scripts, refer to the following sub-audit reports:

1. [`AGENT_CREDENTIAL_CRYPTOGRAPHY_AUDIT.md`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/docs/AGENT_CREDENTIAL_CRYPTOGRAPHY_AUDIT.md) — Cryptographic key derivation, plaintext database exposure, and HMAC key mismatch.
2. [`NONCE_AND_COMMAND_SECURITY_AUDIT.md`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/docs/NONCE_AND_COMMAND_SECURITY_AUDIT.md) — Nonce registry concurrency race condition, signature stripping vulnerability, and command lifecycle.
3. [`BINARY_STREAMING_PERFORMANCE_AUDIT.md`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/docs/BINARY_STREAMING_PERFORMANCE_AUDIT.md) — `express.raw` memory heap profiling, Base64 over WebSocket overhead, and streaming backpressure analysis.
4. [`FILESYSTEM_SANDBOX_SECURITY_AUDIT.md`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/docs/FILESYSTEM_SANDBOX_SECURITY_AUDIT.md) — 13-vector filesystem probe (traversal, ADS, device names, junctions, null bytes, UNC).
5. [`SAFE_MIGRATION_AND_INTEGRITY_AUDIT.md`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/docs/SAFE_MIGRATION_AND_INTEGRITY_AUDIT.md) — SHA-256 verification, source file immutability, and rollback on failure.
6. [`STAGE2_TEST_EVIDENCE_MATRIX.md`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/docs/STAGE2_TEST_EVIDENCE_MATRIX.md) — Categorized audit matrix distinguishing unit, integration, live PG16, and OS/filesystem tests.

---

### CONCLUSION & NEXT STEPS

In accordance with strict safety rules, **no application code, database schema, or production configurations were altered during this audit**. Stage 2 must not be certified for production deployment until Remediation Orders for SEC-01, SEC-02, SEC-03, and PERF-01 are authorized and executed.
