# NKB Cloud & Drive — Storage Infrastructure Guide
## External Hard Drive Architecture, Placement Policies & Controlled Removal

This guide provides technical specifications for managing company storage without requiring a dedicated NAS.

---

## 1. Physical Storage Architecture

**THERE IS CURRENTLY NO NAS INSTALLED OR AVAILABLE.**

The storage subsystem is designed specifically for externally connected hard drives and mounted server paths:
- **Supported Media**:
  - External USB 3.0 / 3.2 Hard Disk Drives (HDD).
  - External Solid State Drives (SSD / NVMe enclosure).
  - Internal secondary SATA / NVMe volumes.
  - Future Network Attached Storage (NAS / SMB / NFS) without redesigning the platform.
- **Dynamic Capacity Computation**:
  - Fictional 10 TB or hardcoded quotas are strictly prohibited.
  - All cluster capacities are computed dynamically via `fs.statfsSync(mountPath)` at runtime.
  - Deduplication prevents double counting when multiple paths share an underlying physical filesystem root.

---

## 2. Manual Storage Administration Workflow

To attach and activate new storage:
1. **Physical Connection**: Administrator physically connects the drive (e.g. USB 3.0 external drive) to the server host.
2. **Mount Path Configuration**: In Admin Dashboard -> **Storage Management -> Configured Locations**, enter the mount path (e.g. `D:\NKB_STORAGE\DRIVE_01` or `C:\NKB-Storage-External-01`).
3. **Automated Validation**: Click **Validate Path**:
   - System verifies path existence (or creates it safely).
   - Runs read/write verification test using temporary test files.
   - Inspects real hardware blocks via `fs.statfsSync`.
   - Inspects root filesystem to flag duplicate root double-counting warnings.
4. **Registration**: Enter an assigned display name (e.g., `External HDD Backup 01`), choose storage purpose, and click **Register Storage Location**. Status becomes `PENDING_ADMIN_REVIEW`.
5. **Activation**: Click **Activate** to bring volume `ONLINE`. The placement engine immediately routes new uploads to this volume.

---

## 3. Controlled Removal & Zero-Destruction Guarantee

When retiring, replacing, or disconnecting an external drive:
1. Navigate to **Storage Management -> Configured Locations**.
2. Click **Safe Removal** next to the target volume.
3. Review the **Pre-Flight Impact Report**:
   - Active cloud files count and total bytes.
   - In-flight upload sessions count.
   - Assigned department folders.
4. If files exist on the drive, initiate **Safe Drive Replacement** to migrate files to another active drive with SHA-256 verification before removal.
5. In the confirmation field, type the volume name exactly.
6. Click **Confirm Safe Removal**:
   - Volume status transitions to `RETIRED`.
   - Preferred volume mappings on department folders are safely cleared.
   - **ZERO DESTRUCTION**: NKB Cloud NEVER deletes physical files or formats the disk. The drive and filesystem remain 100% intact.

---

## 4. Storage Placement Engine

When an employee uploads or synchronizes a file:
- **Policy 1: DEFAULT_DRIVE**: Routes all uploads to the designated primary volume.
- **Policy 2: PRIORITY_POOL**: Dynamically selects the volume with the largest free capacity (`free_bytes`) among eligible online drives.
- **Policy 3: DEPARTMENT_ISOLATED**: Inspects folder preferred volume ID and routes files to that department's designated volume.
- **Error Handling**: If no online volume has sufficient free space, the placement engine rejects the upload with HTTP 507 and explicit error code: `NO_ACTIVE_STORAGE_VOLUME`.
