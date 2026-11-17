using System;
using System.IO;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

namespace NkbDrive.Client.Storage
{
    public class LocalFileRecord
    {
        public string FileId { get; set; }
        public string RelativePath { get; set; }
        public string Name { get; set; }
        public long SizeBytes { get; set; }
        public string Sha256 { get; set; }
        public string SyncState { get; set; } // 'ONLINE_ONLY', 'OFFLINE_PINNED', 'SYNC_PENDING', 'CONFLICT', 'SYNCED'
        public string ServerUpdatedAt { get; set; }
        public string LocalUpdatedAt { get; set; }
    }

    public class SyncQueueItem
    {
        public long Id { get; set; }
        public string FileId { get; set; }
        public string Operation { get; set; } // 'UPLOAD', 'DOWNLOAD', 'RENAME', 'MOVE', 'TRASH'
        public string LocalPath { get; set; }
        public string TargetPath { get; set; }
        public int RetryCount { get; set; }
        public string NextRetryTime { get; set; }
        public string Status { get; set; } // 'QUEUED', 'PROCESSING', 'FAILED', 'COMPLETED'
        public string ErrorMessage { get; set; }
        public string CreatedAt { get; set; }
    }

    public class SyncConflictRecord
    {
        public long Id { get; set; }
        public string OriginalFileId { get; set; }
        public string ConflictFileName { get; set; }
        public string BaseSha256 { get; set; }
        public string ServerSha256 { get; set; }
        public string LocalSha256 { get; set; }
        public string DetectedAt { get; set; }
        public string ResolutionStatus { get; set; }
    }

    public class OfflinePinRecord
    {
        public string ItemId { get; set; }
        public string ItemType { get; set; }
        public string PinnedAt { get; set; }
        public string PinnedByUser { get; set; }
    }

    public partial class SyncMetadataRepository : IDisposable
    {
        private IntPtr _db = IntPtr.Zero;
        private readonly string _dbPath;
        private readonly object _lock = new object();

        public SyncMetadataRepository(string dbPath)
        {
            _dbPath = Path.GetFullPath(dbPath);
            string dir = Path.GetDirectoryName(_dbPath);
            if (!Directory.Exists(dir))
                Directory.CreateDirectory(dir);

            OpenDatabase();
            InitializeSchema();
        }

        private void OpenDatabase()
        {
            int res = SqliteNative.sqlite3_open16(_dbPath, out _db);
            if (res != SqliteNative.SQLITE_OK)
            {
                throw new InvalidOperationException("Failed to open SQLite database: " + SqliteNative.GetErrorMessage(_db));
            }
        }

        public void ExecuteNonQuery(string sql)
        {
            lock (_lock)
            {
                IntPtr errMsg;
                int res = SqliteNative.sqlite3_exec(_db, sql, IntPtr.Zero, IntPtr.Zero, out errMsg);
                if (res != SqliteNative.SQLITE_OK)
                {
                    string msg = Marshal.PtrToStringAnsi(errMsg);
                    throw new InvalidOperationException("SQLite Exec Error: " + msg + " in query: " + sql);
                }
            }
        }

        public void BeginTransaction()
        {
            ExecuteNonQuery("BEGIN IMMEDIATE TRANSACTION;");
        }

        public void Commit()
        {
            ExecuteNonQuery("COMMIT;");
        }

        public void Rollback()
        {
            try { ExecuteNonQuery("ROLLBACK;"); } catch {}
        }

        private void InitializeSchema()
        {
            lock (_lock)
            {
                BeginTransaction();
                try
                {
                    // 1. Local Files Metadata Table
                    ExecuteNonQuery(@"
                        CREATE TABLE IF NOT EXISTS local_files (
                            file_id TEXT PRIMARY KEY,
                            relative_path TEXT NOT NULL,
                            name TEXT NOT NULL,
                            size_bytes INTEGER NOT NULL,
                            sha256 TEXT NOT NULL,
                            sync_state TEXT NOT NULL,
                            server_updated_at TEXT NOT NULL,
                            local_updated_at TEXT NOT NULL
                        );
                        CREATE INDEX IF NOT EXISTS idx_local_files_state ON local_files(sync_state);
                        CREATE INDEX IF NOT EXISTS idx_local_files_path ON local_files(relative_path);
                    ");

                    // 2. Persistent Sync Queue Table
                    ExecuteNonQuery(@"
                        CREATE TABLE IF NOT EXISTS sync_queue (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            file_id TEXT,
                            operation TEXT NOT NULL,
                            local_path TEXT NOT NULL,
                            target_path TEXT,
                            retry_count INTEGER DEFAULT 0,
                            next_retry_time TEXT,
                            status TEXT DEFAULT 'QUEUED',
                            error_message TEXT,
                            created_at TEXT DEFAULT CURRENT_TIMESTAMP
                        );
                        CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
                    ");

                    // 3. Monotonic Sync Cursor Table
                    ExecuteNonQuery(@"
                        CREATE TABLE IF NOT EXISTS sync_cursor (
                            id INTEGER PRIMARY KEY CHECK (id = 1),
                            last_cursor INTEGER NOT NULL DEFAULT 0,
                            last_sync_timestamp TEXT NOT NULL
                        );
                        INSERT OR IGNORE INTO sync_cursor (id, last_cursor, last_sync_timestamp) 
                        VALUES (1, 0, '1970-01-01T00:00:00.000Z');
                    ");

                    // 4. Offline Pins Table
                    ExecuteNonQuery(@"
                        CREATE TABLE IF NOT EXISTS offline_pins (
                            item_id TEXT PRIMARY KEY,
                            item_type TEXT NOT NULL,
                            pinned_at TEXT NOT NULL,
                            pinned_by_user TEXT NOT NULL
                        );
                    ");

                    // 5. Local Cache Tracking Table
                    ExecuteNonQuery(@"
                        CREATE TABLE IF NOT EXISTS local_cache (
                            file_id TEXT PRIMARY KEY,
                            cache_path TEXT NOT NULL,
                            cached_size_bytes INTEGER NOT NULL,
                            last_accessed_at TEXT NOT NULL,
                            is_dirty INTEGER DEFAULT 0
                        );
                        CREATE INDEX IF NOT EXISTS idx_local_cache_accessed ON local_cache(last_accessed_at);
                    ");

                    // 6. Sync Conflicts Table
                    ExecuteNonQuery(@"
                        CREATE TABLE IF NOT EXISTS sync_conflicts (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            original_file_id TEXT NOT NULL,
                            conflict_file_name TEXT NOT NULL,
                            base_sha256 TEXT NOT NULL,
                            server_sha256 TEXT NOT NULL,
                            local_sha256 TEXT NOT NULL,
                            detected_at TEXT NOT NULL,
                            resolution_status TEXT DEFAULT 'FORKED'
                        );
                    ");

                    // 7. Device State Table
                    ExecuteNonQuery(@"
                        CREATE TABLE IF NOT EXISTS device_state (
                            id INTEGER PRIMARY KEY CHECK (id = 1),
                            device_id TEXT,
                            machine_name TEXT,
                            hardware_fingerprint TEXT,
                            approval_status TEXT,
                            target_drive_letter TEXT DEFAULT 'N:',
                            last_sync_at TEXT
                        );
                        INSERT OR IGNORE INTO device_state (id, target_drive_letter, approval_status)
                        VALUES (1, 'N:', 'UNREGISTERED');
                    ");

                    Commit();
                }
                catch
                {
                    Rollback();
                    throw;
                }
            }
        }

        // --- File Metadata Operations ---
        public void UpsertFile(LocalFileRecord f)
        {
            lock (_lock)
            {
                string sql = string.Format(@"
                    INSERT OR REPLACE INTO local_files 
                        (file_id, relative_path, name, size_bytes, sha256, sync_state, server_updated_at, local_updated_at)
                    VALUES 
                        ('{0}', '{1}', '{2}', {3}, '{4}', '{5}', '{6}', '{7}');",
                    f.FileId.Replace("'", "''"),
                    f.RelativePath.Replace("'", "''"),
                    f.Name.Replace("'", "''"),
                    f.SizeBytes,
                    f.Sha256.Replace("'", "''"),
                    f.SyncState,
                    f.ServerUpdatedAt,
                    f.LocalUpdatedAt
                );
                ExecuteNonQuery(sql);
            }
        }

        public LocalFileRecord GetFile(string fileId)
        {
            if (string.IsNullOrEmpty(fileId)) return null;
            lock (_lock)
            {
                IntPtr stmt;
                string sql = "SELECT file_id, relative_path, name, size_bytes, sha256, sync_state, server_updated_at, local_updated_at FROM local_files WHERE file_id = '" + fileId.Replace("'", "''") + "';";
                if (SqliteNative.sqlite3_prepare16_v2(_db, sql, -1, out stmt, IntPtr.Zero) == SqliteNative.SQLITE_OK)
                {
                    try
                    {
                        if (SqliteNative.sqlite3_step(stmt) == SqliteNative.SQLITE_ROW)
                        {
                            return new LocalFileRecord
                            {
                                FileId = Marshal.PtrToStringUni(SqliteNative.sqlite3_column_text16(stmt, 0)),
                                RelativePath = Marshal.PtrToStringUni(SqliteNative.sqlite3_column_text16(stmt, 1)),
                                Name = Marshal.PtrToStringUni(SqliteNative.sqlite3_column_text16(stmt, 2)),
                                SizeBytes = SqliteNative.sqlite3_column_int64(stmt, 3),
                                Sha256 = Marshal.PtrToStringUni(SqliteNative.sqlite3_column_text16(stmt, 4)),
                                SyncState = Marshal.PtrToStringUni(SqliteNative.sqlite3_column_text16(stmt, 5)),
                                ServerUpdatedAt = Marshal.PtrToStringUni(SqliteNative.sqlite3_column_text16(stmt, 6)),
                                LocalUpdatedAt = Marshal.PtrToStringUni(SqliteNative.sqlite3_column_text16(stmt, 7))
                            };
                        }
                    }
                    finally
                    {
                        SqliteNative.sqlite3_finalize(stmt);
                    }
                }
                return null;
            }
        }

        public void UpdateSyncState(string fileId, string newState)
        {
            if (string.IsNullOrEmpty(fileId)) return;
            lock (_lock)
            {
                string sql = string.Format("UPDATE local_files SET sync_state = '{0}', local_updated_at = '{1}' WHERE file_id = '{2}';",
                    newState, DateTime.UtcNow.ToString("o"), fileId.Replace("'", "''"));
                ExecuteNonQuery(sql);
            }
        }

        // --- Queue Operations ---
        public long Enqueue(string fileId, string operation, string localPath, string targetPath = null)
        {
            lock (_lock)
            {
                string sql = string.Format(@"
                    INSERT INTO sync_queue (file_id, operation, local_path, target_path, status, created_at)
                    VALUES ('{0}', '{1}', '{2}', {3}, 'QUEUED', '{4}');",
                    fileId != null ? fileId.Replace("'", "''") : "",
                    operation,
                    localPath.Replace("'", "''"),
                    targetPath != null ? "'" + targetPath.Replace("'", "''") + "'" : "NULL",
                    DateTime.UtcNow.ToString("o")
                );
                ExecuteNonQuery(sql);

                IntPtr stmt;
                if (SqliteNative.sqlite3_prepare16_v2(_db, "SELECT last_insert_rowid();", -1, out stmt, IntPtr.Zero) == SqliteNative.SQLITE_OK)
                {
                    try
                    {
                        if (SqliteNative.sqlite3_step(stmt) == SqliteNative.SQLITE_ROW)
                            return SqliteNative.sqlite3_column_int64(stmt, 0);
                    }
                    finally
                    {
                        SqliteNative.sqlite3_finalize(stmt);
                    }
                }
                return 0;
            }
        }

        public List<SyncQueueItem> GetPendingQueue(int limit = 20)
        {
            lock (_lock)
            {
                List<SyncQueueItem> list = new List<SyncQueueItem>();
                IntPtr stmt;
                string sql = "SELECT id, file_id, operation, local_path, target_path, retry_count, next_retry_time, status, error_message, created_at FROM sync_queue WHERE status IN ('QUEUED', 'FAILED') ORDER BY id ASC LIMIT " + limit + ";";
                if (SqliteNative.sqlite3_prepare16_v2(_db, sql, -1, out stmt, IntPtr.Zero) == SqliteNative.SQLITE_OK)
                {
                    try
                    {
                        while (SqliteNative.sqlite3_step(stmt) == SqliteNative.SQLITE_ROW)
                        {
                            list.Add(new SyncQueueItem
                            {
                                Id = SqliteNative.sqlite3_column_int64(stmt, 0),
                                FileId = Marshal.PtrToStringUni(SqliteNative.sqlite3_column_text16(stmt, 1)),
                                Operation = Marshal.PtrToStringUni(SqliteNative.sqlite3_column_text16(stmt, 2)),
                                LocalPath = Marshal.PtrToStringUni(SqliteNative.sqlite3_column_text16(stmt, 3)),
                                TargetPath = Marshal.PtrToStringUni(SqliteNative.sqlite3_column_text16(stmt, 4)),
                                RetryCount = SqliteNative.sqlite3_column_int(stmt, 5),
                                NextRetryTime = Marshal.PtrToStringUni(SqliteNative.sqlite3_column_text16(stmt, 6)),
                                Status = Marshal.PtrToStringUni(SqliteNative.sqlite3_column_text16(stmt, 7)),
                                ErrorMessage = Marshal.PtrToStringUni(SqliteNative.sqlite3_column_text16(stmt, 8)),
                                CreatedAt = Marshal.PtrToStringUni(SqliteNative.sqlite3_column_text16(stmt, 9))
                            });
                        }
                    }
                    finally
                    {
                        SqliteNative.sqlite3_finalize(stmt);
                    }
                }
                return list;
            }
        }

        public void CompleteQueueItem(long id)
        {
            lock (_lock)
            {
                ExecuteNonQuery("UPDATE sync_queue SET status = 'COMPLETED' WHERE id = " + id + ";");
            }
        }

        public void FailQueueItem(long id, string errorMessage, int nextRetryDelaySeconds)
        {
            lock (_lock)
            {
                string nextRetry = DateTime.UtcNow.AddSeconds(nextRetryDelaySeconds).ToString("o");
                string sql = string.Format(@"
                    UPDATE sync_queue 
                    SET status = 'FAILED', 
                        retry_count = retry_count + 1, 
                        next_retry_time = '{0}', 
                        error_message = '{1}' 
                    WHERE id = {2};",
                    nextRetry, errorMessage.Replace("'", "''"), id
                );
                ExecuteNonQuery(sql);
            }
        }

        // --- Cursor Operations ---
        public long GetCursor()
        {
            lock (_lock)
            {
                IntPtr stmt;
                if (SqliteNative.sqlite3_prepare16_v2(_db, "SELECT last_cursor FROM sync_cursor WHERE id = 1;", -1, out stmt, IntPtr.Zero) == SqliteNative.SQLITE_OK)
                {
                    try
                    {
                        if (SqliteNative.sqlite3_step(stmt) == SqliteNative.SQLITE_ROW)
                            return SqliteNative.sqlite3_column_int64(stmt, 0);
                    }
                    finally
                    {
                        SqliteNative.sqlite3_finalize(stmt);
                    }
                }
                return 0;
            }
        }

        public void SetCursor(long cursor)
        {
            lock (_lock)
            {
                string sql = string.Format("UPDATE sync_cursor SET last_cursor = {0}, last_sync_timestamp = '{1}' WHERE id = 1;",
                    cursor, DateTime.UtcNow.ToString("o"));
                ExecuteNonQuery(sql);
            }
        }

        // --- Offline Pinning Operations ---
        public void PinItem(string itemId, string itemType, string userId)
        {
            lock (_lock)
            {
                string sql = string.Format("INSERT OR REPLACE INTO offline_pins (item_id, item_type, pinned_at, pinned_by_user) VALUES ('{0}', '{1}', '{2}', '{3}');",
                    itemId.Replace("'", "''"), itemType, DateTime.UtcNow.ToString("o"), userId.Replace("'", "''"));
                ExecuteNonQuery(sql);
            }
        }

        public void UnpinItem(string itemId)
        {
            lock (_lock)
            {
                ExecuteNonQuery("DELETE FROM offline_pins WHERE item_id = '" + itemId.Replace("'", "''") + "';");
            }
        }

        public bool IsPinned(string itemId)
        {
            lock (_lock)
            {
                IntPtr stmt;
                string sql = "SELECT 1 FROM offline_pins WHERE item_id = '" + itemId.Replace("'", "''") + "';";
                if (SqliteNative.sqlite3_prepare16_v2(_db, sql, -1, out stmt, IntPtr.Zero) == SqliteNative.SQLITE_OK)
                {
                    try
                    {
                        return SqliteNative.sqlite3_step(stmt) == SqliteNative.SQLITE_ROW;
                    }
                    finally
                    {
                        SqliteNative.sqlite3_finalize(stmt);
                    }
                }
                return false;
            }
        }

        // --- Cache Operations ---
        public void RegisterCache(string fileId, string cachePath, long sizeBytes)
        {
            lock (_lock)
            {
                string sql = string.Format(@"
                    INSERT OR REPLACE INTO local_cache (file_id, cache_path, cached_size_bytes, last_accessed_at, is_dirty)
                    VALUES ('{0}', '{1}', {2}, '{3}', 0);",
                    fileId.Replace("'", "''"), cachePath.Replace("'", "''"), sizeBytes, DateTime.UtcNow.ToString("o"));
                ExecuteNonQuery(sql);
            }
        }

        public void EvictCache(string fileId)
        {
            lock (_lock)
            {
                // Cache eviction ONLY cleans local tracking, never creates cloud delete
                ExecuteNonQuery("DELETE FROM local_cache WHERE file_id = '" + fileId.Replace("'", "''") + "';");
                UpdateSyncState(fileId, "ONLINE_ONLY");
            }
        }

        // --- Conflict Tracking ---
        public long RecordConflict(string originalFileId, string conflictFileName, string baseSha, string serverSha, string localSha)
        {
            lock (_lock)
            {
                string sql = string.Format(@"
                    INSERT INTO sync_conflicts (original_file_id, conflict_file_name, base_sha256, server_sha256, local_sha256, detected_at, resolution_status)
                    VALUES ('{0}', '{1}', '{2}', '{3}', '{4}', '{5}', 'FORKED');",
                    originalFileId.Replace("'", "''"),
                    conflictFileName.Replace("'", "''"),
                    baseSha.Replace("'", "''"),
                    serverSha.Replace("'", "''"),
                    localSha.Replace("'", "''"),
                    DateTime.UtcNow.ToString("o")
                );
                ExecuteNonQuery(sql);

                IntPtr stmt;
                if (SqliteNative.sqlite3_prepare16_v2(_db, "SELECT last_insert_rowid();", -1, out stmt, IntPtr.Zero) == SqliteNative.SQLITE_OK)
                {
                    try
                    {
                        if (SqliteNative.sqlite3_step(stmt) == SqliteNative.SQLITE_ROW)
                            return SqliteNative.sqlite3_column_int64(stmt, 0);
                    }
                    finally
                    {
                        SqliteNative.sqlite3_finalize(stmt);
                    }
                }
                return 0;
            }
        }

        public LocalFileRecord GetFileByPath(string relativePath)
        {
            if (string.IsNullOrEmpty(relativePath)) return null;
            lock (_lock)
            {
                IntPtr stmt;
                string sql = "SELECT file_id, relative_path, name, size_bytes, sha256, sync_state, server_updated_at, local_updated_at FROM local_files WHERE relative_path = '" + relativePath.Replace("'", "''") + "' COLLATE NOCASE;";
                if (SqliteNative.sqlite3_prepare16_v2(_db, sql, -1, out stmt, IntPtr.Zero) == SqliteNative.SQLITE_OK)
                {
                    try
                    {
                        if (SqliteNative.sqlite3_step(stmt) == SqliteNative.SQLITE_ROW)
                        {
                            return ReadFileRow(stmt);
                        }
                    }
                    finally
                    {
                        SqliteNative.sqlite3_finalize(stmt);
                    }
                }
                return null;
            }
        }

        public List<LocalFileRecord> ListDirectoryEntries(string parentVirtualPath)
        {
            lock (_lock)
            {
                List<LocalFileRecord> list = new List<LocalFileRecord>();
                string normalizedParent = (parentVirtualPath ?? "").TrimEnd('\\');
                if (string.IsNullOrEmpty(normalizedParent)) normalizedParent = "\\";

                IntPtr stmt;
                string sql = "SELECT file_id, relative_path, name, size_bytes, sha256, sync_state, server_updated_at, local_updated_at FROM local_files;";
                if (SqliteNative.sqlite3_prepare16_v2(_db, sql, -1, out stmt, IntPtr.Zero) == SqliteNative.SQLITE_OK)
                {
                    try
                    {
                        while (SqliteNative.sqlite3_step(stmt) == SqliteNative.SQLITE_ROW)
                        {
                            LocalFileRecord rec = ReadFileRow(stmt);
                            string itemParent = Path.GetDirectoryName(rec.RelativePath);
                            if (string.IsNullOrEmpty(itemParent)) itemParent = "\\";
                            if (!itemParent.StartsWith("\\")) itemParent = "\\" + itemParent;
                            if (string.Equals(itemParent, normalizedParent, StringComparison.OrdinalIgnoreCase))
                            {
                                list.Add(rec);
                            }
                        }
                    }
                    finally
                    {
                        SqliteNative.sqlite3_finalize(stmt);
                    }
                }
                return list;
            }
        }

        public string GetCachePath(string fileId)
        {
            lock (_lock)
            {
                IntPtr stmt;
                string sql = "SELECT cache_path FROM local_cache WHERE file_id = '" + fileId.Replace("'", "''") + "';";
                if (SqliteNative.sqlite3_prepare16_v2(_db, sql, -1, out stmt, IntPtr.Zero) == SqliteNative.SQLITE_OK)
                {
                    try
                    {
                        if (SqliteNative.sqlite3_step(stmt) == SqliteNative.SQLITE_ROW)
                        {
                            return Marshal.PtrToStringUni(SqliteNative.sqlite3_column_text16(stmt, 0));
                        }
                    }
                    finally
                    {
                        SqliteNative.sqlite3_finalize(stmt);
                    }
                }
                return null;
            }
        }

        public void PurgeAllMetadata()
        {
            lock (_lock)
            {
                ExecuteNonQuery("DELETE FROM local_files;");
                ExecuteNonQuery("DELETE FROM local_cache;");
                ExecuteNonQuery("DELETE FROM sync_queue;");
                ExecuteNonQuery("DELETE FROM offline_pins;");
            }
        }

        public void DeleteFileRecord(string fileId)
        {
            if (string.IsNullOrEmpty(fileId)) return;
            lock (_lock)
            {
                ExecuteNonQuery("DELETE FROM local_files WHERE file_id = '" + fileId.Replace("'", "''") + "';");
                ExecuteNonQuery("DELETE FROM local_cache WHERE file_id = '" + fileId.Replace("'", "''") + "';");
            }
        }

        public List<LocalFileRecord> ListFiles()
        {
            lock (_lock)
            {
                List<LocalFileRecord> list = new List<LocalFileRecord>();
                IntPtr stmt;
                string sql = "SELECT file_id, relative_path, name, size_bytes, sha256, sync_state, server_updated_at, local_updated_at FROM local_files;";
                if (SqliteNative.sqlite3_prepare16_v2(_db, sql, -1, out stmt, IntPtr.Zero) == SqliteNative.SQLITE_OK)
                {
                    try
                    {
                        while (SqliteNative.sqlite3_step(stmt) == SqliteNative.SQLITE_ROW)
                        {
                            list.Add(ReadFileRow(stmt));
                        }
                    }
                    finally
                    {
                        SqliteNative.sqlite3_finalize(stmt);
                    }
                }
                return list;
            }
        }

        public void UpdateRelativePath(string fileId, string relativePath, string name)
        {
            lock (_lock)
            {
                string sql = string.Format(
                    "UPDATE local_files SET relative_path = '{0}', name = '{1}', local_updated_at = '{2}' WHERE file_id = '{3}';",
                    relativePath.Replace("'", "''"),
                    name.Replace("'", "''"),
                    DateTime.UtcNow.ToString("o"),
                    fileId.Replace("'", "''"));
                ExecuteNonQuery(sql);
            }
        }

        public void UpdateHashAndSize(string fileId, string sha256, long sizeBytes, string syncState)
        {
            if (string.IsNullOrEmpty(fileId)) return;
            lock (_lock)
            {
                string sql = string.Format(
                    "UPDATE local_files SET sha256 = '{0}', size_bytes = {1}, sync_state = '{2}', local_updated_at = '{3}' WHERE file_id = '{4}';",
                    (sha256 ?? "").Replace("'", "''"),
                    sizeBytes,
                    syncState,
                    DateTime.UtcNow.ToString("o"),
                    fileId.Replace("'", "''"));
                ExecuteNonQuery(sql);
            }
        }

        public void ReplaceFileId(string oldId, string newId)
        {
            lock (_lock)
            {
                string oldEsc = oldId.Replace("'", "''");
                string newEsc = newId.Replace("'", "''");
                ExecuteNonQuery("UPDATE local_files SET file_id = '" + newEsc + "' WHERE file_id = '" + oldEsc + "';");
                ExecuteNonQuery("UPDATE local_cache SET file_id = '" + newEsc + "' WHERE file_id = '" + oldEsc + "';");
                ExecuteNonQuery("UPDATE sync_queue SET file_id = '" + newEsc + "' WHERE file_id = '" + oldEsc + "' AND status IN ('QUEUED', 'FAILED');");
                ExecuteNonQuery("UPDATE offline_pins SET item_id = '" + newEsc + "' WHERE item_id = '" + oldEsc + "';");
            }
        }

        public void SaveDeviceState(string deviceId, string machineName, string fingerprint, string approvalStatus)
        {
            lock (_lock)
            {
                string sql = string.Format(
                    "UPDATE device_state SET device_id = '{0}', machine_name = '{1}', hardware_fingerprint = '{2}', approval_status = '{3}', target_drive_letter = 'N:', last_sync_at = '{4}' WHERE id = 1;",
                    (deviceId ?? "").Replace("'", "''"),
                    (machineName ?? "").Replace("'", "''"),
                    (fingerprint ?? "").Replace("'", "''"),
                    (approvalStatus ?? "").Replace("'", "''"),
                    DateTime.UtcNow.ToString("o"));
                ExecuteNonQuery(sql);
            }
        }

        public string GetDeviceApprovalStatus()
        {
            lock (_lock)
            {
                IntPtr stmt;
                if (SqliteNative.sqlite3_prepare16_v2(_db, "SELECT approval_status FROM device_state WHERE id = 1;", -1, out stmt, IntPtr.Zero) == SqliteNative.SQLITE_OK)
                {
                    try
                    {
                        if (SqliteNative.sqlite3_step(stmt) == SqliteNative.SQLITE_ROW)
                            return Marshal.PtrToStringUni(SqliteNative.sqlite3_column_text16(stmt, 0));
                    }
                    finally
                    {
                        SqliteNative.sqlite3_finalize(stmt);
                    }
                }
                return null;
            }
        }

        public int CountFiles()
        {
            return ScalarInt("SELECT COUNT(*) FROM local_files;");
        }

        public List<LocalFileRecord> ListRecentFiles(int limit = 50)
        {
            lock (_lock)
            {
                var list = new List<LocalFileRecord>();
                IntPtr stmt;
                string sql = "SELECT file_id, relative_path, name, size_bytes, sha256, sync_state, server_updated_at, local_updated_at FROM local_files ORDER BY local_updated_at DESC LIMIT " + limit + ";";
                if (SqliteNative.sqlite3_prepare16_v2(_db, sql, -1, out stmt, IntPtr.Zero) == SqliteNative.SQLITE_OK)
                {
                    try
                    {
                        while (SqliteNative.sqlite3_step(stmt) == SqliteNative.SQLITE_ROW)
                        {
                            list.Add(ReadFileRow(stmt));
                        }
                    }
                    finally
                    {
                        SqliteNative.sqlite3_finalize(stmt);
                    }
                }
                return list;
            }
        }

        public List<SyncConflictRecord> ListConflicts()
        {
            lock (_lock)
            {
                var list = new List<SyncConflictRecord>();
                IntPtr stmt;
                string sql = "SELECT id, original_file_id, conflict_file_name, base_sha256, server_sha256, local_sha256, detected_at, resolution_status FROM sync_conflicts ORDER BY id DESC;";
                if (SqliteNative.sqlite3_prepare16_v2(_db, sql, -1, out stmt, IntPtr.Zero) == SqliteNative.SQLITE_OK)
                {
                    try
                    {
                        while (SqliteNative.sqlite3_step(stmt) == SqliteNative.SQLITE_ROW)
                        {
                            list.Add(new SyncConflictRecord
                            {
                                Id = SqliteNative.sqlite3_column_int64(stmt, 0),
                                OriginalFileId = Marshal.PtrToStringUni(SqliteNative.sqlite3_column_text16(stmt, 1)),
                                ConflictFileName = Marshal.PtrToStringUni(SqliteNative.sqlite3_column_text16(stmt, 2)),
                                BaseSha256 = Marshal.PtrToStringUni(SqliteNative.sqlite3_column_text16(stmt, 3)),
                                ServerSha256 = Marshal.PtrToStringUni(SqliteNative.sqlite3_column_text16(stmt, 4)),
                                LocalSha256 = Marshal.PtrToStringUni(SqliteNative.sqlite3_column_text16(stmt, 5)),
                                DetectedAt = Marshal.PtrToStringUni(SqliteNative.sqlite3_column_text16(stmt, 6)),
                                ResolutionStatus = Marshal.PtrToStringUni(SqliteNative.sqlite3_column_text16(stmt, 7))
                            });
                        }
                    }
                    finally
                    {
                        SqliteNative.sqlite3_finalize(stmt);
                    }
                }
                return list;
            }
        }

        public List<OfflinePinRecord> ListPinnedItems()
        {
            lock (_lock)
            {
                var list = new List<OfflinePinRecord>();
                IntPtr stmt;
                string sql = "SELECT item_id, item_type, pinned_at, pinned_by_user FROM offline_pins ORDER BY pinned_at DESC;";
                if (SqliteNative.sqlite3_prepare16_v2(_db, sql, -1, out stmt, IntPtr.Zero) == SqliteNative.SQLITE_OK)
                {
                    try
                    {
                        while (SqliteNative.sqlite3_step(stmt) == SqliteNative.SQLITE_ROW)
                        {
                            list.Add(new OfflinePinRecord
                            {
                                ItemId = Marshal.PtrToStringUni(SqliteNative.sqlite3_column_text16(stmt, 0)),
                                ItemType = Marshal.PtrToStringUni(SqliteNative.sqlite3_column_text16(stmt, 1)),
                                PinnedAt = Marshal.PtrToStringUni(SqliteNative.sqlite3_column_text16(stmt, 2)),
                                PinnedByUser = Marshal.PtrToStringUni(SqliteNative.sqlite3_column_text16(stmt, 3))
                            });
                        }
                    }
                    finally
                    {
                        SqliteNative.sqlite3_finalize(stmt);
                    }
                }
                return list;
            }
        }

        public int CountPendingQueue()
        {
            return ScalarInt("SELECT COUNT(*) FROM sync_queue WHERE status IN ('QUEUED', 'FAILED');");
        }

        public int CountConflicts()
        {
            return ScalarInt("SELECT COUNT(*) FROM sync_conflicts;");
        }

        public int CountTrashOperations(string fileId)
        {
            return ScalarInt("SELECT COUNT(*) FROM sync_queue WHERE operation = 'TRASH' AND file_id = '" + fileId.Replace("'", "''") + "';");
        }

        private int ScalarInt(string sql)
        {
            lock (_lock)
            {
                IntPtr stmt;
                if (SqliteNative.sqlite3_prepare16_v2(_db, sql, -1, out stmt, IntPtr.Zero) == SqliteNative.SQLITE_OK)
                {
                    try
                    {
                        if (SqliteNative.sqlite3_step(stmt) == SqliteNative.SQLITE_ROW)
                            return SqliteNative.sqlite3_column_int(stmt, 0);
                    }
                    finally
                    {
                        SqliteNative.sqlite3_finalize(stmt);
                    }
                }
                return 0;
            }
        }

        private static LocalFileRecord ReadFileRow(IntPtr stmt)
        {
            return new LocalFileRecord
            {
                FileId = Marshal.PtrToStringUni(SqliteNative.sqlite3_column_text16(stmt, 0)),
                RelativePath = Marshal.PtrToStringUni(SqliteNative.sqlite3_column_text16(stmt, 1)),
                Name = Marshal.PtrToStringUni(SqliteNative.sqlite3_column_text16(stmt, 2)),
                SizeBytes = SqliteNative.sqlite3_column_int64(stmt, 3),
                Sha256 = Marshal.PtrToStringUni(SqliteNative.sqlite3_column_text16(stmt, 4)),
                SyncState = Marshal.PtrToStringUni(SqliteNative.sqlite3_column_text16(stmt, 5)),
                ServerUpdatedAt = Marshal.PtrToStringUni(SqliteNative.sqlite3_column_text16(stmt, 6)),
                LocalUpdatedAt = Marshal.PtrToStringUni(SqliteNative.sqlite3_column_text16(stmt, 7))
            };
        }

        public void Dispose()
        {
            lock (_lock)
            {
                if (_db != IntPtr.Zero)
                {
                    SqliteNative.sqlite3_close(_db);
                    _db = IntPtr.Zero;
                }
            }
        }
    }
}
