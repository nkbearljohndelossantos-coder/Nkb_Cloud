# NKB CLOUD v2.1.0 — REAL PHYSICAL DRIVE DETECTION & HARDWARE ENUMERATION SPECIFICATION

**Project:** NKB Cloud Enterprise Storage Platform v2.1.0  
**Module:** Windows Storage Agent Hardware Enumerator  
**Operating Environment:** Windows 11 Physical Workstation  
**Execution Mode:** Strictly Read-Only Hardware Inventory  
**Target Storage Host:** Loopback Staging (`127.0.0.1`)  

---

## 1. ARCHITECTURAL OVERVIEW

The NKB Cloud v2.1.0 Real Physical Drive Detection system replaces all synthetic/simulated drive detectors with a native Windows CIM (Common Information Model), WMI, and Storage Cmdlet engine.

The enumeration executes in a **strict read-only, non-destructive mode**:
- Zero physical disk formatting, partitioning, or initialization
- Zero filesystem repair or CHKDSK invocations
- Zero automatic drive mounting or unmounting
- Zero write operations to detected drives
- Zero unauthorized file scanning or indexing

```
┌────────────────────────────────────────────────────────────────────────┐
│                   WINDOWS 11 STORAGE HOST WORKSTATION                 │
│                                                                        │
│   ┌───────────────┐   ┌────────────────┐   ┌───────────────────────┐  │
│   │ Disk 0 (SATA) │   │ Disk 1 (NVMe)  │   │ Disks 2 & 3 (USB Ext) │  │
│   │ Seagate 1TB   │   │ Kioxia 512GB   │   │ GeIL / ASMedia 500GB  │  │
│   └───────┬───────┘   └───────┬────────┘   └───────────┬───────────┘  │
│           │                   │                        │              │
│           └───────────────────┼────────────────────────┘              │
│                               ▼                                       │
│          Windows CIM & Storage Cmdlets (PowerShell Subsystem)          │
│         [Get-Disk, Get-PhysicalDisk, Get-Partition, Get-Volume]        │
│                               │ (JSON Stream)                         │
│                               ▼                                       │
│                WindowsDiskDetector (Node.js Agent)                    │
│                 - Extracts Raw Hardware Signatures                     │
│                 - Computes Immutable Composite Identities             │
│                 - Assembles Layer 1 (Devices) & Layer 2 (Volumes)      │
│                               │                                       │
│                               │ (WebSocket - Encrypted Envelope)      │
│                               ▼                                       │
│                  NKB Cloud Backend Relay Hub                          │
│                 - Reconciles Layer 1 (storage_devices)                │
│                 - Reconciles Layer 2 (storage_volumes)                │
│                 - Reconciles Layer 3 (storage_registrations)          │
│                 - Audits Identity Observations & Detects Conflicts    │
│                               │                                       │
│                               ▼                                       │
│                      PostgreSQL 16 Engine                             │
└───────────────────────────────┬────────────────────────────────────────┘
                                │
                                ▼
        NKB Cloud ERP Frontend UI (React + Tailwind + Vite)
         - Physical Disks & Hardware Inventory Dashboard
         - Live "Refresh Drives" Dispatch Control
         - Identity Confidence Badges & Partition Trees
```

---

## 2. HARDWARE ENUMERATION ENGINE

### 2.1 Native Windows Cmdlets Employed
The enumerator script [`storage-agent/src/detect-disks.ps1`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/storage-agent/src/detect-disks.ps1) queries the following native Windows subsystems:

1. **`Get-Disk`**: Queries physical disk attributes, including Windows Disk Index (`Number`), friendly name, raw hardware serial, partition style (GPT/MBR), total byte size, and operational status.
2. **`Get-PhysicalDisk`**: Retrieves media type classification (`SSD`, `HDD`, `SCM`), bus interface, and storage pool eligibility status.
3. **`Win32_DiskDrive` (CIM)**: Enforces physical bus differentiation (distinguishes external removable USB media from fixed internal SATA/NVMe buses).
4. **`Get-Partition`**: Inspects disk partition offsets, partition numbers, unique GUIDs, and partition types (Basic, EFI System, Reserved, Recovery).
5. **`Get-Volume`**: Retrieves filesystem metadata (`NTFS`, `ReFS`, `exFAT`, `FAT32`), volume labels, volume GUIDs (`\\?\Volume{...}`), assigned drive letters, volume byte capacity, free bytes, and health status.

### 2.2 Standard User Privileges & Security Isolation
All queries run under standard user context using `powershell.exe -NoProfile -ExecutionPolicy Bypass -File detect-disks.ps1`. **No elevated administrator or UAC privileges are required for read-only CIM hardware inspection.**

---

## 3. THREE-LAYER IDENTITY ARCHITECTURE

NKB Cloud strictly preserves its Stage 2 three-layer identity architecture. No drive letter is ever used as a permanent identity:

### Layer 1: Physical Device Identity (`storage_devices`)
- **Primary Key:** Permanent UUID (`id`).
- **Hardware Serial Evidence:** Raw hardware serial returned by the disk firmware (`hardware_serial_evidence`).
- **Disk Unique ID Evidence:** Device ID or SCSI/NVMe Unique ID (`disk_unique_id_evidence`).
- **Confidence Rating:** Evaluated as `VERIFIED`, `PARTIALLY_IDENTIFIED`, `MANUAL_VERIFICATION_REQUIRED`, or `IDENTITY_MISMATCH`.

### Layer 2: Logical Volume Identity (`storage_volumes`)
- **Primary Key:** Permanent UUID (`id`).
- **Composite Fingerprint:** SHA-256 hash computed over:
  $$\text{SHA256}(\text{HardwareSerial} \mathbin{\Vert} \text{VolumeGUID} \mathbin{\Vert} \text{PartitionOffset} \mathbin{\Vert} \text{DiskCapacity})$$
- **Drive Letter Attribute:** Stored only as volatile transient metadata (`current_drive_letter`). When Windows reassigns a drive letter (e.g. from `E:` to `G:`), the permanent volume UUID and file tree bindings remain 100% intact.

### Layer 3: Enterprise Storage Registration (`storage_registrations`)
- **Asset Tag:** Permanent enterprise asset identifier (`NKB-TAG-<FINGERPRINT_PREFIX>`).
- **Storage Purpose:** Storage role (`GENERAL`, `PRIMARY`, `DOCUMENTS`, `ARCHIVE`, `BACKUP`, `ADDITIONAL`).
- **Policy Priority:** Placement priority integer (1 to 100).

---

## 4. IDENTITY RECONCILIATION & CONFLICT PROTECTION

When the agent sends a `DRIVES_INVENTORY` report:
1. **Model & Serial Integrity Check:** If an existing device record with a known serial reports a conflicting model name (e.g. a SATA HDD suddenly reports as a USB flash drive), the engine marks the record as `IDENTITY_MISMATCH` and creates an investigation entry in `storage_identity_conflicts`.
2. **Generic USB Bridging:** Generic USB controllers with repeated serials (e.g., `00000000000000000000`) are marked `PARTIALLY_IDENTIFIED` and qualified with unique disk ID hashes to prevent primary key collision.
3. **Drive Letter Change Tracking:** When a drive letter changes, the engine registers an observation in `storage_identity_observations` recording the transition without disrupting file pointers.
4. **Live Disconnect Detection:** Unobserved physical drives and volumes are transitioned to `OFFLINE`. Files and metadata on offline volumes are preserved intact.

---

## 5. USER INTERFACE SPECIFICATION

The frontend at `http://127.0.0.1:5000` provides a dedicated **Physical Storage & Hardware Inventory** interface:
- **ERP Metric Bar:** Live count of physical disks, total physical storage capacity, online partitions, and host agent status.
- **Refresh Drives Button:** Dispatches a signed `SCAN_DRIVES` command envelope to the Windows Storage Agent and re-queries hardware in real time.
- **Physical Disk Spec Blocks:** Displays manufacturer, model, Windows disk number, bus type, media type (SSD/HDD), serial number, disk unique ID, connection type, and health status.
- **Mounted Volumes Sub-Table:** Displays drive letter badges (`C:`, `D:`, `G:`, `J:`, or `Unlettered`), volume labels, filesystems, total/used/free byte gauges, volume GUIDs, and per-volume SHA-256 hash verification triggers.
