using System;
using System.IO;
using System.Collections.Generic;
using System.Threading;
using NkbDrive.Client.Storage;

namespace NkbDrive.Client.Sync
{
    public class SyncEngine
    {
        private readonly SyncMetadataRepository _repo;
        private readonly string _cacheDirectory;
        private readonly Random _random = new Random();

        public const int BaseRetryDelaySeconds = 2;
        public const int MaxRetryDelaySeconds = 60;
        public const int MaxRetryCount = 5;

        public SyncEngine(SyncMetadataRepository repo, string cacheDirectory)
        {
            if (repo == null) throw new ArgumentNullException("repo");
            _repo = repo;
            _cacheDirectory = Path.GetFullPath(cacheDirectory);

            if (!Directory.Exists(_cacheDirectory))
                Directory.CreateDirectory(_cacheDirectory);
        }

        public SyncMetadataRepository Repository { get { return _repo; } }
        public string CacheDirectory { get { return _cacheDirectory; } }

        public int CalculateBackoffDelay(int retryCount)
        {
            if (retryCount <= 0) return BaseRetryDelaySeconds;
            int delay = (int)(BaseRetryDelaySeconds * Math.Pow(2, Math.Min(retryCount, 6)));
            delay = Math.Min(delay, MaxRetryDelaySeconds);
            int jitter = _random.Next(0, 3);
            return delay + jitter;
        }

        public long QueueUpload(string fileId, string localPath, string targetPath = null)
        {
            return _repo.Enqueue(fileId, "UPLOAD", localPath, targetPath);
        }

        public long QueueDownload(string fileId, string targetPath)
        {
            return _repo.Enqueue(fileId, "DOWNLOAD", targetPath, null);
        }

        public long QueueRename(string fileId, string oldPath, string newPath)
        {
            return _repo.Enqueue(fileId, "RENAME", oldPath, newPath);
        }

        public long QueueTrash(string fileId, string localPath)
        {
            return _repo.Enqueue(fileId, "TRASH", localPath, null);
        }

        public long QueueMove(string fileId, string newRelativePath, string targetFolderId)
        {
            return _repo.Enqueue(fileId, "MOVE", newRelativePath, targetFolderId);
        }

        public long QueueFolderCreate(string fileId, string relativePath, string parentFolderId)
        {
            return _repo.Enqueue(fileId, "FOLDER_CREATE", relativePath, parentFolderId);
        }

        public void TriggerSync()
        {
            // Awakens background queue workers
        }

        public int ProcessPendingQueueBatch(Func<SyncQueueItem, bool> operationHandler)
        {
            List<SyncQueueItem> items = _repo.GetPendingQueue(20);
            int processed = 0;

            foreach (var item in items)
            {
                if (!string.IsNullOrEmpty(item.NextRetryTime))
                {
                    DateTime nextRetry;
                    if (DateTime.TryParse(item.NextRetryTime, out nextRetry) && DateTime.UtcNow < nextRetry)
                    {
                        continue; // Backoff wait not yet expired
                    }
                }

                try
                {
                    bool success = operationHandler(item);
                    if (success)
                    {
                        _repo.CompleteQueueItem(item.Id);
                        processed++;
                    }
                    else
                    {
                        int delay = CalculateBackoffDelay(item.RetryCount + 1);
                        _repo.FailQueueItem(item.Id, "Operation handler returned failure", delay);
                    }
                }
                catch (Exception ex)
                {
                    int delay = CalculateBackoffDelay(item.RetryCount + 1);
                    _repo.FailQueueItem(item.Id, ex.Message, delay);
                }
            }

            return processed;
        }

        public string ResolveConflict(string originalFileId, string originalFileName, string baseSha, string serverSha, string localSha, string machineName)
        {
            string dateStr = DateTime.UtcNow.ToString("yyyy-MM-dd");
            string ext = Path.GetExtension(originalFileName);
            string baseName = Path.GetFileNameWithoutExtension(originalFileName);

            string conflictFileName = string.Format("{0} (Conflict - {1} {2}){3}", baseName, machineName, dateStr, ext);

            // Record conflict in SQLite
            _repo.RecordConflict(originalFileId, conflictFileName, baseSha, serverSha, localSha);

            return conflictFileName;
        }

        public bool EvictLocalCacheSafely(string fileId)
        {
            LocalFileRecord rec = _repo.GetFile(fileId);
            if (rec == null) return false;

            // If pinned, do not evict
            if (_repo.IsPinned(fileId))
            {
                return false;
            }

            // Clean local cache path
            string cachePath = Path.Combine(_cacheDirectory, fileId + ".cache");
            if (File.Exists(cachePath))
            {
                File.Delete(cachePath);
            }

            // CRITICAL DATA PRESERVATION RULE:
            // Cache eviction only resets local tracking to ONLINE_ONLY.
            // Never emits or issues an HTTP DELETE / trash request to cloud!
            _repo.EvictCache(fileId);
            return true;
        }
    }
}
