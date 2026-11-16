using System;
using System.IO;
using System.Collections.Generic;
using System.Text;
using System.Security.Cryptography;
using System.Runtime.InteropServices;
using Fsp;
using Fsp.Interop;
using NkbDrive.Client.Storage;
using NkbDrive.Client.Sync;

namespace NkbDrive.Client
{
    public class VfsNodeDesc
    {
        public string RelativePath;
        public string FileId;
        public bool IsDirectory;
        public FileStream Stream;
        public bool IsDeleteOnClose;
        public bool IsDirty;
    }

    public class VfsDirContext
    {
        public List<LocalFileRecord> Entries;
        public int Index;
    }

    public class NkbVirtualFileSystem : FileSystemBase
    {
        private readonly SyncMetadataRepository _repo;
        private readonly StagingApiClient _apiClient;
        private readonly SyncEngine _syncEngine;
        private readonly string _cacheDir;
        private readonly string _volumeLabel;

        public NkbVirtualFileSystem(SyncMetadataRepository repo, StagingApiClient apiClient, SyncEngine syncEngine, string cacheDir, string volumeLabel = "NKB Drive")
        {
            if (repo == null) throw new ArgumentNullException("repo");
            _repo = repo;
            _apiClient = apiClient;
            _syncEngine = syncEngine;
            _cacheDir = Path.GetFullPath(cacheDir);
            _volumeLabel = volumeLabel;

            if (!Directory.Exists(_cacheDir))
                Directory.CreateDirectory(_cacheDir);
        }

        public string CacheDir { get { return _cacheDir; } }

        private string NormalizeRelativePath(string fileName)
        {
            if (string.IsNullOrEmpty(fileName) || fileName == "\\")
                return "\\";
            string rel = fileName.Replace('/', '\\');
            if (!rel.StartsWith("\\")) rel = "\\" + rel;
            return rel.TrimEnd('\\');
        }

        private void PopulateFileInfo(LocalFileRecord rec, out Fsp.Interop.FileInfo fileInfo)
        {
            fileInfo = default(Fsp.Interop.FileInfo);
            if (rec == null) return;

            bool isDir = rec.Sha256 == "DIRECTORY";
            if (isDir)
            {
                fileInfo.FileAttributes = (uint)FileAttributes.Directory;
                fileInfo.FileSize = 0;
                fileInfo.AllocationSize = 0;
            }
            else
            {
                fileInfo.FileAttributes = (uint)FileAttributes.Normal;
                fileInfo.FileSize = (ulong)rec.SizeBytes;
                fileInfo.AllocationSize = (fileInfo.FileSize + 4095) / 4096 * 4096;
            }

            ulong ft = (ulong)DateTime.UtcNow.ToFileTimeUtc();
            fileInfo.CreationTime = ft;
            fileInfo.LastAccessTime = ft;
            fileInfo.LastWriteTime = ft;
            fileInfo.ChangeTime = ft;
            fileInfo.HardLinks = 1;
        }

        public override int Init(object host)
        {
            FileSystemHost fsh = host as FileSystemHost;
            if (fsh != null)
            {
                fsh.SectorSize = 4096;
                fsh.SectorsPerAllocationUnit = 1;
                fsh.MaxComponentLength = 255;
                fsh.CaseSensitiveSearch = false;
                fsh.CasePreservedNames = true;
                fsh.UnicodeOnDisk = true;
                fsh.FileSystemName = "WinFsp.NKB";
            }
            return STATUS_SUCCESS;
        }

        public override int GetVolumeInfo(out VolumeInfo volumeInfo)
        {
            volumeInfo = default(VolumeInfo);
            volumeInfo.TotalSize = 10L * 1024 * 1024 * 1024 * 1024; // 10 TB virtual capacity
            volumeInfo.FreeSize = 8L * 1024 * 1024 * 1024 * 1024;   // 8 TB virtual free
            volumeInfo.SetVolumeLabel(_volumeLabel);
            return STATUS_SUCCESS;
        }

        public override int SetVolumeLabel(string volumeLabel, out VolumeInfo volumeInfo)
        {
            return GetVolumeInfo(out volumeInfo);
        }

        public override int GetSecurityByName(string fileName, out uint fileAttributes, ref byte[] securityDescriptor)
        {
            string rel = NormalizeRelativePath(fileName);
            if (rel == "\\")
            {
                fileAttributes = (uint)FileAttributes.Directory;
                return STATUS_SUCCESS;
            }

            LocalFileRecord rec = _repo.GetFileByPath(rel);
            if (rec != null)
            {
                if (rec.Sha256 == "DIRECTORY")
                    fileAttributes = (uint)FileAttributes.Directory;
                else
                    fileAttributes = (uint)FileAttributes.Normal;
                return STATUS_SUCCESS;
            }

            fileAttributes = 0;
            return STATUS_OBJECT_NAME_NOT_FOUND;
        }

        public override int Open(string fileName, uint createOptions, uint grantedAccess, out object fileNode, out object fileDesc, out Fsp.Interop.FileInfo fileInfo, out string normalizedName)
        {
            normalizedName = null;
            string rel = NormalizeRelativePath(fileName);

            if (rel == "\\")
            {
                VfsNodeDesc rootDesc = new VfsNodeDesc { RelativePath = "\\", IsDirectory = true };
                fileNode = rootDesc;
                fileDesc = rootDesc;
                PopulateFileInfo(new LocalFileRecord { RelativePath = "\\", Sha256 = "DIRECTORY" }, out fileInfo);
                return STATUS_SUCCESS;
            }

            LocalFileRecord rec = _repo.GetFileByPath(rel);
            if (rec == null)
            {
                fileNode = null; fileDesc = null; fileInfo = default(Fsp.Interop.FileInfo);
                return STATUS_OBJECT_NAME_NOT_FOUND;
            }

            if (rec.Sha256 == "DIRECTORY")
            {
                VfsNodeDesc dirDesc = new VfsNodeDesc { RelativePath = rel, FileId = rec.FileId, IsDirectory = true };
                fileNode = dirDesc;
                fileDesc = dirDesc;
                PopulateFileInfo(rec, out fileInfo);
                return STATUS_SUCCESS;
            }

            // File handling: On-demand hydration if ONLINE_ONLY
            string cachePath = Path.Combine(_cacheDir, rec.FileId + ".dat");
            if (rec.SyncState == "ONLINE_ONLY" || !File.Exists(cachePath))
            {
                if (_apiClient != null && !string.IsNullOrEmpty(_apiClient.Token))
                {
                    try
                    {
                        _apiClient.DownloadFile(rec.FileId, cachePath, rec.Sha256);
                        _repo.RegisterCache(rec.FileId, cachePath, rec.SizeBytes);
                        _repo.UpdateSyncState(rec.FileId, "LOCAL_CACHED");
                        rec.SyncState = "LOCAL_CACHED";
                    }
                    catch
                    {
                        // Fallback or offline check
                    }
                }
            }

            if (!File.Exists(cachePath))
            {
                // Create zero-length fallback if file is accessible
                using (File.Create(cachePath)) { }
            }

            try
            {
                FileStream fs = new FileStream(cachePath, FileMode.Open, FileAccess.ReadWrite, FileShare.ReadWrite | FileShare.Delete);
                VfsNodeDesc node = new VfsNodeDesc
                {
                    RelativePath = rel,
                    FileId = rec.FileId,
                    IsDirectory = false,
                    Stream = fs,
                    IsDirty = false
                };
                fileNode = node;
                fileDesc = node;
                PopulateFileInfo(rec, out fileInfo);
                return STATUS_SUCCESS;
            }
            catch (Exception)
            {
                try
                {
                    FileStream fs = new FileStream(cachePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
                    VfsNodeDesc node = new VfsNodeDesc
                    {
                        RelativePath = rel,
                        FileId = rec.FileId,
                        IsDirectory = false,
                        Stream = fs,
                        IsDirty = false
                    };
                    fileNode = node;
                    fileDesc = node;
                    PopulateFileInfo(rec, out fileInfo);
                    return STATUS_SUCCESS;
                }
                catch
                {
                    fileNode = null; fileDesc = null; fileInfo = default(Fsp.Interop.FileInfo);
                    return STATUS_ACCESS_DENIED;
                }
            }
        }

        public override int Create(string fileName, uint createOptions, uint grantedAccess, uint fileAttributes, byte[] securityDescriptor, ulong allocationSize, out object fileNode, out object fileDesc, out Fsp.Interop.FileInfo fileInfo, out string normalizedName)
        {
            normalizedName = null;
            string rel = NormalizeRelativePath(fileName);
            bool isDirectory = (createOptions & FILE_DIRECTORY_FILE) != 0;

            if (isDirectory)
            {
                string dirId = "folder_" + Guid.NewGuid().ToString("N");
                LocalFileRecord dirRec = new LocalFileRecord
                {
                    FileId = dirId,
                    RelativePath = rel,
                    Name = Path.GetFileName(rel),
                    SizeBytes = 0,
                    Sha256 = "DIRECTORY",
                    SyncState = "SYNC_PENDING",
                    ServerUpdatedAt = DateTime.UtcNow.ToString("o"),
                    LocalUpdatedAt = DateTime.UtcNow.ToString("o")
                };
                _repo.UpsertFile(dirRec);
                _repo.Enqueue(dirId, "CREATE_FOLDER", rel, null);

                VfsNodeDesc node = new VfsNodeDesc { RelativePath = rel, FileId = dirId, IsDirectory = true };
                fileNode = node;
                fileDesc = node;
                PopulateFileInfo(dirRec, out fileInfo);
                return STATUS_SUCCESS;
            }
            else
            {
                string fileId = "local_" + Guid.NewGuid().ToString("N");
                string cachePath = Path.Combine(_cacheDir, fileId + ".dat");

                FileStream fs = new FileStream(cachePath, FileMode.CreateNew, FileAccess.ReadWrite, FileShare.ReadWrite | FileShare.Delete);
                LocalFileRecord fileRec = new LocalFileRecord
                {
                    FileId = fileId,
                    RelativePath = rel,
                    Name = Path.GetFileName(rel),
                    SizeBytes = 0,
                    Sha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", // Empty SHA-256
                    SyncState = "SYNC_PENDING",
                    ServerUpdatedAt = DateTime.UtcNow.ToString("o"),
                    LocalUpdatedAt = DateTime.UtcNow.ToString("o")
                };
                _repo.UpsertFile(fileRec);
                _repo.RegisterCache(fileId, cachePath, 0);

                VfsNodeDesc node = new VfsNodeDesc
                {
                    RelativePath = rel,
                    FileId = fileId,
                    IsDirectory = false,
                    Stream = fs,
                    IsDirty = true
                };
                fileNode = node;
                fileDesc = node;
                PopulateFileInfo(fileRec, out fileInfo);
                return STATUS_SUCCESS;
            }
        }

        public override int Read(object fileNode, object fileDesc, IntPtr buffer, ulong offset, uint length, out uint bytesTransferred)
        {
            VfsNodeDesc desc = (VfsNodeDesc)fileDesc;
            bytesTransferred = 0;
            if (desc == null || desc.Stream == null)
                return STATUS_INVALID_DEVICE_REQUEST;

            try
            {
                lock (desc.Stream)
                {
                    desc.Stream.Seek((long)offset, SeekOrigin.Begin);
                    byte[] temp = new byte[length];
                    int read = desc.Stream.Read(temp, 0, (int)length);
                    if (read > 0)
                    {
                        Marshal.Copy(temp, 0, buffer, read);
                        bytesTransferred = (uint)read;
                    }
                    return STATUS_SUCCESS;
                }
            }
            catch
            {
                return STATUS_END_OF_FILE;
            }
        }

        public override int Write(object fileNode, object fileDesc, IntPtr buffer, ulong offset, uint length, bool writeToEndOfFile, bool constrainedIo, out uint bytesTransferred, out Fsp.Interop.FileInfo fileInfo)
        {
            VfsNodeDesc desc = (VfsNodeDesc)fileDesc;
            bytesTransferred = 0;
            fileInfo = default(Fsp.Interop.FileInfo);

            if (desc == null || desc.Stream == null)
                return STATUS_INVALID_DEVICE_REQUEST;

            try
            {
                lock (desc.Stream)
                {
                    if (writeToEndOfFile)
                        desc.Stream.Seek(0, SeekOrigin.End);
                    else
                        desc.Stream.Seek((long)offset, SeekOrigin.Begin);

                    byte[] temp = new byte[length];
                    Marshal.Copy(buffer, temp, 0, (int)length);
                    desc.Stream.Write(temp, 0, (int)length);
                    desc.Stream.Flush();
                    bytesTransferred = length;
                    desc.IsDirty = true;

                    LocalFileRecord rec = (!string.IsNullOrEmpty(desc.FileId)) ? _repo.GetFile(desc.FileId) : null;
                    if (rec != null)
                    {
                        rec.SizeBytes = desc.Stream.Length;
                        PopulateFileInfo(rec, out fileInfo);
                    }
                    else
                    {
                        PopulateFileInfo(new LocalFileRecord { SizeBytes = desc.Stream.Length }, out fileInfo);
                    }
                    return STATUS_SUCCESS;
                }
            }
            catch (UnauthorizedAccessException)
            {
                return STATUS_ACCESS_DENIED;
            }
            catch
            {
                return STATUS_DISK_FULL;
            }
        }

        public override int Flush(object fileNode, object fileDesc, out Fsp.Interop.FileInfo fileInfo)
        {
            VfsNodeDesc desc = (VfsNodeDesc)fileDesc;
            if (desc != null && desc.Stream != null)
            {
                try { desc.Stream.Flush(); } catch {}
            }
            LocalFileRecord rec = null;
            if (desc != null)
            {
                if (!string.IsNullOrEmpty(desc.FileId))
                    rec = _repo.GetFile(desc.FileId);
                else if (!string.IsNullOrEmpty(desc.RelativePath))
                    rec = _repo.GetFileByPath(desc.RelativePath);

                if (rec == null && (desc.RelativePath == "\\" || desc.IsDirectory))
                    rec = new LocalFileRecord { RelativePath = desc.RelativePath ?? "\\", Sha256 = "DIRECTORY" };
            }
            PopulateFileInfo(rec, out fileInfo);
            return STATUS_SUCCESS;
        }

        public override int GetFileInfo(object fileNode, object fileDesc, out Fsp.Interop.FileInfo fileInfo)
        {
            VfsNodeDesc desc = (VfsNodeDesc)fileDesc;
            LocalFileRecord rec = null;
            if (desc != null)
            {
                if (!string.IsNullOrEmpty(desc.FileId))
                    rec = _repo.GetFile(desc.FileId);
                else if (!string.IsNullOrEmpty(desc.RelativePath))
                    rec = _repo.GetFileByPath(desc.RelativePath);

                if (rec == null && (desc.RelativePath == "\\" || desc.IsDirectory))
                    rec = new LocalFileRecord { RelativePath = desc.RelativePath ?? "\\", Sha256 = "DIRECTORY" };
            }
            PopulateFileInfo(rec, out fileInfo);
            return STATUS_SUCCESS;
        }

        public override int SetFileSize(object fileNode, object fileDesc, ulong newSize, bool setAllocationSize, out Fsp.Interop.FileInfo fileInfo)
        {
            VfsNodeDesc desc = (VfsNodeDesc)fileDesc;
            if (desc != null && desc.Stream != null && !setAllocationSize)
            {
                try
                {
                    desc.Stream.SetLength((long)newSize);
                    desc.IsDirty = true;
                }
                catch {}
            }
            LocalFileRecord rec = null;
            if (desc != null)
            {
                if (!string.IsNullOrEmpty(desc.FileId))
                    rec = _repo.GetFile(desc.FileId);
                else if (!string.IsNullOrEmpty(desc.RelativePath))
                    rec = _repo.GetFileByPath(desc.RelativePath);

                if (rec != null) rec.SizeBytes = (long)newSize;
            }
            PopulateFileInfo(rec, out fileInfo);
            return STATUS_SUCCESS;
        }

        public override int CanDelete(object fileNode, object fileDesc, string fileName)
        {
            string rel = NormalizeRelativePath(fileName);
            LocalFileRecord rec = _repo.GetFileByPath(rel);
            if (rec != null && rec.Sha256 == "DIRECTORY")
            {
                var children = _repo.ListDirectoryEntries(rel);
                if (children.Count > 0)
                    return STATUS_DIRECTORY_NOT_EMPTY;
            }
            return STATUS_SUCCESS;
        }

        public override int SetDelete(object fileNode, object fileDesc, string fileName, bool deleteFile)
        {
            VfsNodeDesc desc = (VfsNodeDesc)fileDesc;
            if (desc != null)
            {
                desc.IsDeleteOnClose = deleteFile;
            }
            return STATUS_SUCCESS;
        }

        public override void Cleanup(object fileNode, object fileDesc, string fileName, uint flags)
        {
            VfsNodeDesc desc = (VfsNodeDesc)fileDesc;
            if (desc == null) return;

            string rel = NormalizeRelativePath(fileName);

            if ((flags & CleanupDelete) != 0 || desc.IsDeleteOnClose)
            {
                if (desc.Stream != null)
                {
                    try { desc.Stream.Dispose(); } catch {}
                    desc.Stream = null;
                }

                // Delete operation: Enqueue TRASH to recycle bin workflow (Non-destructive)
                if (!string.IsNullOrEmpty(desc.FileId))
                {
                    _repo.Enqueue(desc.FileId, "TRASH", rel, null);
                    _repo.DeleteFileRecord(desc.FileId);
                }
                return;
            }

            if (desc.IsDirty && desc.Stream != null)
            {
                try
                {
                    desc.Stream.Flush();
                    long len = desc.Stream.Length;
                    string cachePath = Path.Combine(_cacheDir, desc.FileId + ".dat");

                    string sha256 = FileHashUtility.ComputeSha256(cachePath);
                    _repo.UpdateHashAndSize(desc.FileId, sha256, len, "SYNC_PENDING");
                    _repo.RegisterCache(desc.FileId, cachePath, len);

                    // Queue upload operation
                    _repo.Enqueue(desc.FileId, "UPLOAD", cachePath, rel);
                    desc.IsDirty = false;

                    if (_syncEngine != null)
                    {
                        _syncEngine.TriggerSync();
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine("[VFS CLEANUP ERROR] " + ex.Message);
                }
            }
        }

        public override void Close(object fileNode, object fileDesc)
        {
            VfsNodeDesc desc = (VfsNodeDesc)fileDesc;
            if (desc != null && desc.Stream != null)
            {
                try { desc.Stream.Dispose(); } catch {}
                desc.Stream = null;
            }
        }

        public override int Rename(object fileNode, object fileDesc, string fileName, string newFileName, bool replaceIfExists)
        {
            Console.WriteLine("[VFS RENAME ENTERED] fileName='" + fileName + "', newFileName='" + newFileName + "', replaceIfExists=" + replaceIfExists);
            string srcRel = NormalizeRelativePath(fileName);
            string dstRel;
            if (newFileName.StartsWith("\\") || newFileName.StartsWith("/"))
            {
                // WinFsp might pass full path relative to volume root, or sibling path
                string norm = NormalizeRelativePath(newFileName);
                // If it doesn't contain parent directory but src does, it's relative to src parent
                string srcParent = Path.GetDirectoryName(srcRel) ?? "\\";
                if (srcParent != "\\" && !norm.StartsWith(srcParent, StringComparison.OrdinalIgnoreCase))
                {
                    dstRel = NormalizeRelativePath(Path.Combine(srcParent, norm.TrimStart('\\')));
                }
                else
                {
                    dstRel = norm;
                }
            }
            else
            {
                string srcParent = Path.GetDirectoryName(srcRel) ?? "\\";
                dstRel = NormalizeRelativePath(Path.Combine(srcParent, newFileName));
            }
            Console.WriteLine("[VFS RENAME RESOLVED] srcRel='" + srcRel + "' -> dstRel='" + dstRel + "'");

            LocalFileRecord srcRec = _repo.GetFileByPath(srcRel);
            if (srcRec == null)
            {
                Console.WriteLine("[VFS RENAME FAIL] srcRec NOT FOUND in repo for: " + srcRel);
                return STATUS_OBJECT_NAME_NOT_FOUND;
            }

            LocalFileRecord dstRec = _repo.GetFileByPath(dstRel);
            if (dstRec != null)
            {
                if (!replaceIfExists)
                    return STATUS_OBJECT_NAME_COLLISION;

                // Safe non-destructive replace: route replaced file to Recycle Bin workflow
                _repo.Enqueue(dstRec.FileId, "TRASH", dstRel, null);
                _repo.DeleteFileRecord(dstRec.FileId);
            }

            string newName = Path.GetFileName(dstRel);
            string srcDir = Path.GetDirectoryName(srcRel) ?? "\\";
            string dstDir = Path.GetDirectoryName(dstRel) ?? "\\";

            bool isMove = !string.Equals(srcDir, dstDir, StringComparison.OrdinalIgnoreCase);

            _repo.UpdateRelativePath(srcRec.FileId, dstRel, newName);

            if (isMove)
            {
                _repo.Enqueue(srcRec.FileId, "MOVE", srcRel, dstRel);
            }
            else
            {
                _repo.Enqueue(srcRec.FileId, "RENAME", srcRel, newName);
            }

            VfsNodeDesc desc = (VfsNodeDesc)fileDesc;
            if (desc != null)
            {
                desc.RelativePath = dstRel;
            }

            return STATUS_SUCCESS;
        }

        public override bool ReadDirectoryEntry(object fileNode, object fileDesc, string pattern, string marker, ref object context, out string fileName, out Fsp.Interop.FileInfo fileInfo)
        {
            VfsNodeDesc desc = (VfsNodeDesc)fileDesc;
            VfsDirContext ctx = context as VfsDirContext;

            if (ctx == null)
            {
                ctx = new VfsDirContext();
                ctx.Entries = new List<LocalFileRecord>();
                ctx.Index = 0;

                string currentDir = desc != null ? desc.RelativePath : "\\";

                // Standard '.' and '..' entries
                ctx.Entries.Add(new LocalFileRecord { Name = ".", Sha256 = "DIRECTORY" });
                ctx.Entries.Add(new LocalFileRecord { Name = "..", Sha256 = "DIRECTORY" });

                // Query child entries from SQLite repository
                var children = _repo.ListDirectoryEntries(currentDir);
                foreach (var child in children)
                {
                    if (string.IsNullOrEmpty(child.Name)) continue;
                    string nameLower = child.Name.ToLowerInvariant();
                    // Never expose desktop.ini, thumbs.db, .ds_store, or hidden dot-files in directory enumeration
                    if (nameLower == "desktop.ini" || nameLower == "thumbs.db" || nameLower == ".ds_store" ||
                        (child.Name.Length > 1 && child.Name.StartsWith(".") && child.Name != ".." && child.Name != "."))
                    {
                        continue;
                    }
                    ctx.Entries.Add(child);
                }

                if (!string.IsNullOrEmpty(marker))
                {
                    int markerIdx = ctx.Entries.FindIndex(e => string.Equals(e.Name, marker, StringComparison.OrdinalIgnoreCase));
                    if (markerIdx >= 0)
                        ctx.Index = markerIdx + 1;
                }

                context = ctx;
            }

            if (ctx.Index < ctx.Entries.Count)
            {
                LocalFileRecord entry = ctx.Entries[ctx.Index++];
                fileName = entry.Name;
                PopulateFileInfo(entry, out fileInfo);
                return true;
            }

            fileName = null;
            fileInfo = default(Fsp.Interop.FileInfo);
            return false;
        }
    }
}
