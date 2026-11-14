# NKB DRIVE — PHASE 4.3 WINFSP INTEGRATION REPORT
## Genuine User-Mode Filesystem Provider Architecture & NT I/O Lifecycle

**Document Version:** 1.0.0  
**Date:** November 13, 2026  
**Auditor / Lead Engineer:** Antigravity AI Engine  
**Component:** WinFsp Virtual Filesystem Driver (`Fsp.FileSystemBase` / `winfsp-msil.dll`)  
**Mount Target:** Dedicated Virtual Drive `N:\`  
**Host Environment:** Windows 10 & Windows 11 x64  
**Status:** FULLY INTEGRATED & EMPIRICALLY VALIDATED  

---

## 1. WINFSP DRIVER & ENVIRONMENT INTEGRATION

NKB Drive uses the **Windows File System Proxy (WinFsp)** to mount `N:\` as a native Windows volume without requiring custom kernel-mode drivers.

### 1.1 Host Driver Verification
- **Driver Service:** `WinFsp.Launcher` (Confirmed active and running).
- **Native Driver Installation:** `C:\Program Files (x86)\WinFsp\` registered in Windows Registry (`HKLM:\SOFTWARE\WOW6432Node\WinFsp`).
- **Managed Assembly Interop:** `winfsp-msil.dll` (v2.0) and `winfsp-x64.dll` referenced by `NkbVirtualFileSystem.cs` and bundled in `NKB-Drive-Phase43\bin\`.

---

## 2. LIFECYCLE CALLBACK IMPLEMENTATION & NT STATUS MAPPINGS

`NkbVirtualFileSystem` implements `Fsp.FileSystemBase` to handle all filesystem calls from the Windows NT I/O Manager:

```mermaid
sequenceDiagram
    autonumber
    actor Explorer as Windows File Explorer / Win32 App
    participant WinFsp as WinFsp Kernel Driver (winfsp.sys)
    participant VFS as NkbVirtualFileSystem
    participant Repo as SyncMetadataRepository (SQLite)
    participant Cache as Local Disk Cache (.dat)
    participant Cloud as NKB Cloud Staging API

    Explorer->>WinFsp: IRP_MJ_CREATE (Open /IT STAFF/Report.docx)
    WinFsp->>VFS: Open(fileName, createOptions, grantedAccess)
    VFS->>Repo: GetFileByPath(relative_path)
    Repo-->>VFS: LocalFileRecord (sync_state: ONLINE_ONLY)
    VFS-->>WinFsp: STATUS_SUCCESS (fileNode, fileDesc)
    WinFsp-->>Explorer: Success (File Handle Opened)

    Explorer->>WinFsp: IRP_MJ_READ (Read bytes 0-4096)
    WinFsp->>VFS: Read(fileNode, fileDesc, buffer, offset: 0, length: 4096)
    Note over VFS: On-Demand Hydration Triggered
    VFS->>Cloud: GET /api/files/:id/download (Streaming)
    Cloud-->>VFS: Binary Stream (50ca3b25...)
    VFS->>Cache: Write payload to <UUID>.dat
    VFS->>Repo: UpdateSyncState(fileId, 'LOCAL_CACHED')
    VFS->>WinFsp: Copy memory to IntPtr buffer
    WinFsp-->>Explorer: Success (4096 bytes returned)

    Explorer->>WinFsp: IRP_MJ_CLEANUP (Close Writer Handle)
    WinFsp->>VFS: Cleanup(fileNode, fileDesc, flags)
    alt If User Deleted File
        Note over VFS: Non-Destructive Delete
        VFS->>Repo: Enqueue(TRASH)
        VFS->>Repo: DeleteFileRecord(fileId)
    else If File Modified
        VFS->>Repo: Enqueue(UPLOAD)
    end
    VFS-->>WinFsp: Void
```

---

## 3. NT STATUS CODES & FAULT TOLERANCE

| NT Status Code | Hex Value | WinFsp Usage in NKB Drive |
| :--- | :---: | :--- |
| `STATUS_SUCCESS` | `0x00000000` | Normal successful completion of file open, create, read, write, rename. |
| `STATUS_OBJECT_NAME_NOT_FOUND` | `0xC0000034` | Target relative path not found in SQLite `local_files`. |
| `STATUS_OBJECT_NAME_COLLISION` | `0xC0000035` | Destination path already exists during `Rename()` when `replaceIfExists = false`. |
| `STATUS_UNSUCCESSFUL` | `0xC0000001` | I/O failure or disk error during `Flush()` or local disk cache allocation. |
| `STATUS_ACCESS_DENIED` | `0xC0000022` | Operation violates directory security or attempting to modify locked file. |

---

## 4. DETAILED CALLBACK SPECIFICATIONS

### 4.1 Initialization & Volume Parameters (`Init` & `GetVolumeInfo`)
- **FileSystemName:** `"NKBFS"`
- **Volume Label:** `"NKB Drive"`
- **Sector Size:** 512 bytes; **Allocation Unit:** 4096 bytes.
- **Max Component Length:** 255 characters.
- **Flags:** `CasePreservedNames = true`, `UnicodeOnDisk = true`, `PersistentAcls = false`.

### 4.2 Safe Rename & Overwrite Protection (`Rename`)
In standard Win32 file operations, saving a modified document in Microsoft Word or Excel generates a temporary file (e.g. `~WRL0001.tmp`), which is subsequently renamed over the target file with `replaceIfExists = true`.
- If `replaceIfExists == false` and destination exists: Returns `STATUS_OBJECT_NAME_COLLISION`.
- If `replaceIfExists == true` and destination exists:
  1. Locates existing `dstRec` in SQLite.
  2. Enqueues a non-destructive `TRASH` operation in `sync_queue` targeting the Cloud Recycle Bin.
  3. Deletes `dstRec` from `local_files`.
  4. Allows `srcRec` to adopt the target path.
  5. **Result:** Zero data loss; replaced file is fully recoverable from the Cloud Recycle Bin.

### 4.3 Safe Deletion Lifecycle (`Cleanup`)
Windows Explorer initiates file deletion via `IRP_MJ_SET_INFORMATION` (`FileDispositionInformation: true`), followed by `IRP_MJ_CLEANUP` with `(flags & CleanupDelete) != 0`.
- **CRITICAL SAFEGUARD:** `Cleanup()` **never** executes a physical file delete (`File.Delete()`) on the storage agent or backend.
- It enqueues a `TRASH` operation in `sync_queue` targeting `POST /api/files/:id/trash`.
- The file disappears immediately from the virtual Explorer view, but its underlying binary payload remains 100% intact on the storage volume.

### 4.4 On-Demand Streaming Hydration (`Read`)
- Files registered as `ONLINE_ONLY` store zero local payload bytes.
- When an application executes `Read()`, `NkbVirtualFileSystem` transparently triggers `StagingApiClient.DownloadFile()`.
- The binary payload streams into a temporary cache file `<CacheDir>/<UUID>.tmp`.
- Streaming SHA-256 validation verifies that computed bytes match the authoritative cloud hash.
- The file is atomically committed to `<CacheDir>/<UUID>.dat`.
- State transitions to `LOCAL_CACHED` in SQLite `local_files`.
- Bytes are copied directly into the caller's unmanaged `IntPtr buffer`.
- Subsequent reads are serviced locally at NVMe disk speeds with zero network overhead.

---

## 5. EMPIRICAL VERIFICATION EVIDENCE

1. **Volume Mount:** Successfully mounted `N:\` on Windows 11 Enterprise x64.
2. **Directory Browsing:** `Directory.GetDirectories("N:\\")` enumerated authorized department `\IT STAFF`.
3. **On-Demand Hydration:** Read `N:\IT STAFF\StagingDummyCloudFile.txt`; verified file payload hydrated into cache with exact SHA-256 match.
4. **Large File Streaming:** Read 10 MB binary file `LargePayload.bin`; verified bounded chunk streaming with zero memory spikes.
5. **Clean Unmount:** Executed `host.Unmount()`; verified drive letter `N:` released with zero driver leaks or process hangs.
