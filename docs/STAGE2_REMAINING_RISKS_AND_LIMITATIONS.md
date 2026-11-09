# NKB CLOUD v2.1.0 — STAGE 2 REMAINING RISKS, LIMITATIONS & PRODUCTION ROADMAP

**Document ID:** NKB-DOC-RISKS-LIMITATIONS-009  
**Scope:** Stage 2 Risk Assessment, Technical Boundaries, Production Operational Considerations  
**Target Environment:** Isolated Branch (`remediation/stage2-security-hardening`)  
**Certification Context:** Pre-Production Audit Findings  

---

## 1. OBJECTIVE & HONEST RISK DISCLOSURE

In accordance with strict security engineering standards, passing all 106 automated test assertions does not eliminate all operational risks. This document provides an objective, transparent assessment of the remaining technical limitations, residual risks, and architectural boundaries in Stage 2 prior to production deployment.

---

## 2. DETAILED RESIDUAL RISKS & LIMITATIONS MATRIX

```
┌────┬──────────────────────────────────────┬──────────┬─────────────────────────────┬──────────────────────────────────────────────────┐
│ #  │ Technical Focus Area                 │ Severity │ Current Stage 2 Status      │ Production Hardening Recommendation (Stage 3)   │
├────┼──────────────────────────────────────┼──────────┼─────────────────────────────┼──────────────────────────────────────────────────┤
│ 1  │ Windows Service Identity             │ Medium   │ Process runs under user CLI │ Wrap as Windows Service (`NT SERVICE\NKB...`)    │
│ 2  │ Hardware-Backed Key Storage (DPAPI)  │ Medium   │ File keystore + NTFS ACLs   │ Integrate Windows DPAPI / CNG machine keystore   │
│ 3  │ WAN Network Latency / Sliding Window │ Low      │ Sequential chunk assembly   │ Sliding window ACK (max 4 in-flight chunks)      │
│ 4  │ Local TOCTOU Reparse Point Races     │ Low      │ `lstat` path check on NTFS  │ Open handles with `FILE_FLAG_OPEN_REPARSE_POINT` │
│ 5  │ Command Journal Retention Growth     │ Low      │ Single JSON + `.bak` file   │ 90-day archive rotation (`.json.gz`)             │
│ 6  │ Production Migration 006 Rollout     │ Medium   │ Applied to staging PG16 only│ Apply to Hostinger VPS in scheduled downtime     │
└────┴──────────────────────────────────────┴──────────┴─────────────────────────────┴──────────────────────────────────────────────────┘
```

---

## 3. IN-DEPTH ANALYSIS OF RESIDUAL RISKS

### 3.1 Windows Service Identity vs Interactive Desktop Session
- **Current Architecture:** In development and staging, the Windows Storage Agent is launched via Node.js under the currently logged-in desktop user account (`nkbmanuf\earlj`).
- **Residual Risk:** Any process running in that interactive user session (or any malware executing with user privileges) has read access to the agent's private key file and local journal.
- **Stage 3 Recommendation:** In production, package the agent as a native Windows Service using `node-windows` or `NSSM`, executing under a dedicated Virtual Service Account (`NT SERVICE\NKBStorageAgent`). Deny standard interactive desktop users access to `storage-agent\.agent_keys`.

### 3.2 Windows DPAPI / CNG Machine Keystore Integration
- **Current Architecture:** The agent private key is stored as an encrypted-at-rest or ACL-restricted PEM file (`storage-agent/.agent_keys/agent_ed25519_priv.pem`) protected via NTFS ACLs (`icacls`).
- **Residual Risk:** If the storage drive is detached and mounted on an offline machine without BitLocker, NTFS permissions can be overridden by a local administrator on the foreign machine.
- **Stage 3 Recommendation:** Integrate Windows Data Protection API (DPAPI) via native C++ Node addons (`node-dpapi`), encrypting the private key with the Windows machine credential store (`CryptProtectData`), coupled with mandatory BitLocker volume encryption on all agent host PCs.

### 3.3 WAN Latency & Sliding Window Pipelining
- **Current Architecture:** Chunk uploads and downloads operate sequentially (chunk $N$ must complete and receive acknowledgment before chunk $N+1$ is transmitted).
- **Residual Risk:** On high-latency WAN connections (e.g., factory network to Hostinger VPS in Singapore/US with >150ms round-trip time), sequential transfers may experience lower effective throughput than local LAN speeds.
- **Stage 3 Recommendation:** Implement a sliding window of up to 4 concurrent in-flight chunks with bounded queueing, ensuring pipeline saturation while maintaining strict memory bounds.

### 3.4 TOCTOU Reparse Point Races on Local Filesystems
- **Current Architecture:** The agent validates paths through an iterative `fs.lstatSync()` loop walking from the target up to the storage root before opening a write stream.
- **Residual Risk:** A malicious actor with local administrative access could potentially replace a validated intermediate directory with an NTFS junction or symbolic link between the moment `resolveSafePath()` finishes and `fs.createWriteStream()` executes.
- **Stage 3 Recommendation:** Use Win32 native APIs (`CreateFileW`) with `FILE_FLAG_OPEN_REPARSE_POINT` and `FILE_FLAG_BACKUP_SEMANTICS` so the file handle itself is pinned directly by the OS kernel without relying on path resolution.

### 3.5 Command Journal Long-Term Retention
- **Current Architecture:** `command_journal.json` persists all completed and running commands. In testing, it holds dozens of entries.
- **Residual Risk:** Over years of continuous production operation with thousands of file operations per day, the journal file could grow to dozens of megabytes, slowing down agent startup.
- **Stage 3 Recommendation:** Implement an automated daily rotation job that truncates entries older than 90 days if their status is `COMPLETED` and their state is confirmed synchronized with the VPS database.

### 3.6 VPS Migration 006 Staging-to-Production Transition
- **Current Architecture:** Migration 006 has been fully applied and verified in the Docker staging environment (`nkb_pg16_staging`). The production PostgreSQL database on Hostinger VPS currently has migrations 001–005.
- **Residual Risk:** Attempting to connect a Stage 2 agent to the production VPS before migration 006 is applied will fail because `agent_credentials` will lack the `public_key` column.
- **Stage 3 Recommendation:** A formal maintenance window must be scheduled where the production VPS database is backed up via `pg_dump`, migration 006 is executed via a transaction (`psql -1 -f 006_stage2_security_hardening.sql`), and schema parity is verified before agent pairing.

---

## 4. STRICT FINAL EXECUTION BOUNDARY

In compliance with the project guidelines:
1. **Execution is completely halted.**
2. **Zero production files or configurations have been altered.**
3. **No physical drives have been connected, mounted, or partitioned.**
4. **No deployment commands have been executed against the Hostinger VPS.**
5. **Stage 3 development has not started.**

**The implementation is submitted for administrator review and formal sign-off.**
