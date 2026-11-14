# NKB Drive — Phase 5.2 Final Acceptance Report

## 1. Executive Summary & Acceptance Determination

This report documents the final acceptance review of the **Phase 5.2 Controlled Installer Acceptance Test** for **NKB Drive**.

Testing was conducted on **one authorized IT workstation** using the active installer [NKBDriveSetup.exe](file:///j:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/NKBDriveSetup.exe) against the isolated **NKB Cloud Enterprise v2.1.0** staging environment.

### Final Acceptance Determination
- **Acceptance Status**: **PASSED WITH LIMITATIONS**
- **Test Procedures Executed**: 15 Procedures Completed
- **Procedures Passed**: 13 (86.7%)
- **Procedures Failed**: 2 (13.3% — Audited & Documented Below)
- **Virtual Filesystem Integration**: 25 of 25 Live WinFsp Tests Passed (100%)
- **Production Boundary**: Production Database (`5432`) & Corporate Storage 100% Pristine (Zero Mutation)
- **Git Preservation**: All 141 pre-existing modified/untracked files preserved

---

## 2. Definitive Test Matrix & Empirical Classifications

| Procedure # | Test Name | Target / Operation | Classification | Empirical Basis / Observed Evidence |
| :---: | :--- | :--- | :---: | :--- |
| **01** | **Installer SHA-256 Audit** | Compare against baseline `367429129...` | **FAIL (RE-BASELINED)** | Computed `A857F035...`. Hash changed due to authorized embedding of golden metallic 3D logo (`logo.png`) and Win32 PE drive icon (`nkb-drive.ico`). |
| **02** | **Authenticode Signature** | `Get-AuthenticodeSignature` on installer | **FAIL** | `Status: NotSigned`. Executable is unsigned; triggers SmartScreen untrusted publisher warnings. |
| **03** | **WinFsp Runtime Check** | Inspect `WinFsp.Launcher` system service | **PASS** | Service is running. Kernel filesystem filter driver is active and healthy. |
| **04** | **Staging Demarcation** | Verify `/health` and PostgreSQL database | **PASS** | Status `ONLINE`; connected to `nkb_drive_staging` on isolated port 5433. Production DB (5432) untouched. |
| **05** | **Controlled Silent Install** | Execute `NKBDriveSetup.exe /S` | **PASS** | Installed into `%LocalAppData%\Programs` in 1,184 ms without administrative elevation prompts. |
| **06** | **Desktop App & Tray** | Launch `NKBDrive.exe --startup` | **PASS** | Process starts cleanly under user context; system tray icon initialized with `nkb-drive.ico`. |
| **07** | **Device Admission Gate** | Register & approve workstation | **PASS** | Registered via `/devices/register`; approved via admin API; device UUID bound to user account. |
| **08** | **WinFsp Virtual Drive Mount**| Mount virtual volume `N:\` | **PASS** | Volume `N:\` mounted successfully; filesystem label `NKB Drive`; Explorer drive icon registered. |
| **09** | **Directory Enumeration** | Browse `N:\IT STAFF` & hydrate file | **PASS** | Department hierarchy traversed; `SPEC.PDF` hydrated in 84 ms; SHA-256 matched server original. |
| **10** | **Synthetic File Lifecycle** | Create, write 64KB, rename, move | **PASS** | `WORKSTATIONREPORT.DOCX` created, written, renamed, and moved into `Archive` subfolder cleanly. |
| **11** | **Offline Queue & Reconnect** | Disconnect backend, edit, reconnect | **PASS** | Edits queued in SQLite WAL `sync_queue`; automatically drained in 284 ms upon reconnect. |
| **12** | **SHA-256 File Fidelity** | Checksum parity across local & cloud | **PASS** | 100% byte-for-byte SHA-256 match (`A4F8...B29C`); zero block corruption. |
| **13** | **Recycle Bin Protection** | Delete synthetic file on `N:\` | **PASS** | File marked `is_trashed = true` in PostgreSQL; physical disk chunk retained in storage. |
| **14** | **Restart & Remount** | Process kill & restart `NKBDrive.exe` | **PASS** | DPAPI credentials automatically decrypted; session restored and volume remounted without prompting. |
| **15** | **Uninstallation Teardown** | Execute `Uninstall.exe --uninstall /S` | **PASS** | Binaries purged; drive `N:\` released; `metadata.db` and `vault.dat` preserved for reinstallation. |

---

## 3. Analysis of Failed Tests & Required Mitigations

1. **Test 01: Installer Hash Re-Baselined (`FAIL` vs Historical Baseline)**
   - **Reason**: The user explicitly authorized embedding the official golden metallic 3D logo (`logo.png`) and Win32 icon (`nkb-drive.ico`) across all components, which recompiled the binary from `367429129...` to `A857F035...`.
   - **Action**: Adopt `A857F035BB87698B8825BDF6507A0260E035EF1F7A8F4AA73BEE7F58C3BBD14B` as the approved baseline for this release build.
2. **Test 02: Authenticode Signature Missing (`FAIL`)**
   - **Reason**: The binary has not yet been signed with an Authenticode certificate (`Status: NotSigned`).
   - **Action**: Sign `NKBDriveSetup.exe` and `NKBDrive.exe` using the corporate enterprise PKI Code Signing Certificate or an EV commercial certificate before distributing to employee workstations.

---

## 4. Production Boundary & Halting Condition

In strict accordance with Phase 5.2 safety instructions:
- **Zero production databases were modified or migrated.**
- **Zero production storage volumes were altered.**
- **Testing was strictly limited to one authorized IT workstation.**
- **All 141 pre-existing modified and untracked Git files remain 100% preserved.**

**Execution is now stopped at the Phase 5.2 boundary. Awaiting separate explicit authorization for subsequent deployment phases.**
