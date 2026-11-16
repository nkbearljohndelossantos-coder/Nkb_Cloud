using System;
using System.IO;
using System.Threading;
using System.Collections.Generic;
using Fsp;
using NkbDrive.Client.Storage;
using NkbDrive.Client.Sync;

namespace NkbDrive.Client
{
    public class NkbDriveHost : IDisposable
    {
        private readonly string _mountPoint;
        private readonly NkbVirtualFileSystem _vfs;
        private readonly SyncMetadataRepository _repo;
        private readonly StagingApiClient _apiClient;
        private readonly SyncEngine _syncEngine;
        private FileSystemHost _host;
        private Thread _syncWorkerThread;
        private volatile bool _isRunning;

        public NkbDriveHost(string mountPoint, SyncMetadataRepository repo, StagingApiClient apiClient, SyncEngine syncEngine, string cacheDir)
        {
            _mountPoint = mountPoint.TrimEnd('\\');
            if (!_mountPoint.EndsWith(":")) _mountPoint += ":";

            _repo = repo;
            _apiClient = apiClient;
            _syncEngine = syncEngine;
            _vfs = new NkbVirtualFileSystem(repo, apiClient, syncEngine, cacheDir);
        }

        public string MountPoint { get { return _mountPoint; } }
        public NkbVirtualFileSystem FileSystem { get { return _vfs; } }
        public bool IsMounted { get { return _host != null; } }

        public bool CheckDriveCollision()
        {
            DriveInfo[] drives = DriveInfo.GetDrives();
            foreach (var d in drives)
            {
                if (d.Name.StartsWith(_mountPoint, StringComparison.OrdinalIgnoreCase))
                    return true;
            }
            return false;
        }

        public void Mount()
        {
            for (int i = 0; i < 15; i++)
            {
                if (!CheckDriveCollision()) break;
                Thread.Sleep(200);
            }

            if (CheckDriveCollision())
            {
                throw new InvalidOperationException("Drive letter collision detected: " + _mountPoint + " is already in use.");
            }

            _host = new FileSystemHost(_vfs);
            int res = _host.Mount(_mountPoint, null, false, 0);
            if (res != 0)
            {
                Thread.Sleep(500);
                res = _host.Mount(_mountPoint, null, false, 0);
            }
            if (res != 0)
            {
                _host.Dispose();
                _host = null;
                throw new InvalidOperationException("Failed to mount virtual drive " + _mountPoint + ". Error code: 0x" + res.ToString("X"));
            }

            _isRunning = true;
            _syncWorkerThread = new Thread(SyncWorkerLoop);
            _syncWorkerThread.IsBackground = true;
            _syncWorkerThread.Start();

            RegisterDriveIcon(_mountPoint);
        }

        public void Unmount()
        {
            _isRunning = false;
            if (_host != null)
            {
                try
                {
                    _host.Unmount();
                }
                catch {}
                try
                {
                    _host.Dispose();
                }
                catch {}
                _host = null;
            }

            if (_syncWorkerThread != null)
            {
                try
                {
                    _syncWorkerThread.Join(1000);
                }
                catch {}
                _syncWorkerThread = null;
            }
        }

        public void HydrateInitialTree()
        {
            if (_apiClient == null || string.IsNullOrEmpty(_apiClient.Token))
                return;

            try
            {
                Dictionary<string, object> treeRes = _apiClient.GetDriveTree();
                if (treeRes != null && treeRes.ContainsKey("tree"))
                {
                    Dictionary<string, object> tree = treeRes["tree"] as Dictionary<string, object>;
                    if (tree != null)
                    {
                        // Add Root Folders
                        if (tree.ContainsKey("rootFolders"))
                        {
                            var roots = tree["rootFolders"] as System.Collections.IEnumerable;
                            if (roots != null)
                            {
                                foreach (var r in roots)
                                {
                                    Dictionary<string, object> dir = r as Dictionary<string, object>;
                                    if (dir != null)
                                    {
                                        string name = dir["name"].ToString();
                                        string path = dir.ContainsKey("virtualPath") ? dir["virtualPath"].ToString() : "\\" + name;
                                        _repo.UpsertFile(new LocalFileRecord
                                        {
                                            FileId = dir["id"].ToString(),
                                            RelativePath = path,
                                            Name = name,
                                            SizeBytes = 0,
                                            Sha256 = "DIRECTORY",
                                            SyncState = "SYNCED",
                                            ServerUpdatedAt = DateTime.UtcNow.ToString("o"),
                                            LocalUpdatedAt = DateTime.UtcNow.ToString("o")
                                        });
                                    }
                                }
                            }
                        }

                        // Add Files
                        if (tree.ContainsKey("files"))
                        {
                            var files = tree["files"] as System.Collections.IEnumerable;
                            if (files != null)
                            {
                                foreach (var f in files)
                                {
                                    Dictionary<string, object> file = f as Dictionary<string, object>;
                                    if (file != null)
                                    {
                                        string name = file["name"].ToString();
                                        string path = file.ContainsKey("virtualPath") ? file["virtualPath"].ToString() : "\\" + name;
                                        long size = 0;
                                        if (file.ContainsKey("size_bytes") && file["size_bytes"] != null) long.TryParse(file["size_bytes"].ToString(), out size);
                                        else if (file.ContainsKey("sizeBytes") && file["sizeBytes"] != null) long.TryParse(file["sizeBytes"].ToString(), out size);
                                        string sha = file.ContainsKey("sha256") ? file["sha256"].ToString() : "";
                                        _repo.UpsertFile(new LocalFileRecord
                                        {
                                            FileId = file["id"].ToString(),
                                            RelativePath = path,
                                            Name = name,
                                            SizeBytes = size,
                                            Sha256 = sha,
                                            SyncState = "ONLINE_ONLY",
                                            ServerUpdatedAt = DateTime.UtcNow.ToString("o"),
                                            LocalUpdatedAt = DateTime.UtcNow.ToString("o")
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("[TREE HYDRATE ERROR] " + ex.Message);
            }
        }

        private void SyncWorkerLoop()
        {
            while (_isRunning)
            {
                try
                {
                    ProcessPendingQueue();
                    PollServerChanges();
                }
                catch {}

                Thread.Sleep(2000);
            }
        }

        public void ProcessPendingQueue()
        {
            if (_apiClient == null || string.IsNullOrEmpty(_apiClient.Token))
                return;

            List<SyncQueueItem> items = _repo.GetPendingQueue(10);
            foreach (var item in items)
            {
                try
                {
                    if (item.Operation == "UPLOAD")
                    {
                        string cachePath = item.LocalPath;
                        if (!File.Exists(cachePath))
                        {
                            string cDir = Path.GetDirectoryName(cachePath);
                            string altCache = Path.Combine(cDir, item.FileId + ".dat");
                            if (File.Exists(altCache)) cachePath = altCache;
                        }

                        if (File.Exists(cachePath))
                        {
                            string fileName = Path.GetFileName(item.TargetPath);
                            Dictionary<string, object> upRes = _apiClient.UploadDirect(cachePath, null, fileName);
                            if (upRes != null && upRes.ContainsKey("file"))
                            {
                                Dictionary<string, object> uploadedFile = upRes["file"] as Dictionary<string, object>;
                                if (uploadedFile != null && uploadedFile.ContainsKey("id"))
                                {
                                    string newCloudId = uploadedFile["id"].ToString();
                                    _repo.ReplaceFileId(item.FileId, newCloudId);
                                    _repo.UpdateSyncState(newCloudId, "SYNCED");
                                    string cDir = Path.GetDirectoryName(cachePath);
                                    string oldCacheFile = Path.Combine(cDir, item.FileId + ".dat");
                                    string newCacheFile = Path.Combine(cDir, newCloudId + ".dat");
                                    if (File.Exists(oldCacheFile) && !File.Exists(newCacheFile))
                                    {
                                        try { File.Move(oldCacheFile, newCacheFile); } catch {}
                                    }
                                }
                            }
                        }
                        _repo.CompleteQueueItem(item.Id);
                    }
                    else if (item.Operation == "CREATE_FOLDER")
                    {
                        string folderName = Path.GetFileName(item.LocalPath);
                        Dictionary<string, object> fRes = _apiClient.CreateFolder(folderName);
                        if (fRes != null && fRes.ContainsKey("folder"))
                        {
                            Dictionary<string, object> folder = fRes["folder"] as Dictionary<string, object>;
                            if (folder != null && folder.ContainsKey("id"))
                            {
                                _repo.ReplaceFileId(item.FileId, folder["id"].ToString());
                            }
                        }
                        _repo.CompleteQueueItem(item.Id);
                    }
                    else if (item.Operation == "RENAME")
                    {
                        if (!item.FileId.StartsWith("local_"))
                        {
                            try { _apiClient.RenameItem(item.FileId, item.TargetPath); } catch {}
                        }
                        _repo.CompleteQueueItem(item.Id);
                    }
                    else if (item.Operation == "MOVE")
                    {
                        // In staging, target folder or parent
                        _repo.CompleteQueueItem(item.Id);
                    }
                    else if (item.Operation == "TRASH")
                    {
                        if (!item.FileId.StartsWith("local_"))
                        {
                            try { _apiClient.TrashItem(item.FileId); } catch {}
                        }
                        _repo.CompleteQueueItem(item.Id);
                    }
                }
                catch (Exception ex)
                {
                    _repo.FailQueueItem(item.Id, ex.Message, 5);
                }
            }
        }

        public void PollServerChanges()
        {
            if (_apiClient == null || string.IsNullOrEmpty(_apiClient.Token))
                return;

            try
            {
                long cursor = _repo.GetCursor();
                Dictionary<string, object> chRes = _apiClient.GetChanges(cursor);
                if (chRes != null && chRes.ContainsKey("changes"))
                {
                    object[] changes = chRes["changes"] as object[];
                    if (changes != null && changes.Length > 0)
                    {
                        foreach (var c in changes)
                        {
                            Dictionary<string, object> change = c as Dictionary<string, object>;
                            if (change != null)
                            {
                                string eventType = change["event_type"].ToString();
                                string entityType = change["entity_type"].ToString();
                                string entityId = change["entity_id"].ToString();
                                string name = change["name"].ToString();
                                long size = change.ContainsKey("size_bytes") && change["size_bytes"] != null ? Convert.ToInt64(change["size_bytes"]) : 0;
                                string sha = change.ContainsKey("sha256") && change["sha256"] != null ? change["sha256"].ToString() : "";

                                if (eventType == "FILE_CREATE" || eventType == "FILE_UPLOAD")
                                {
                                    string path = "\\" + name;
                                    _repo.UpsertFile(new LocalFileRecord
                                    {
                                        FileId = entityId,
                                        RelativePath = path,
                                        Name = name,
                                        SizeBytes = size,
                                        Sha256 = sha,
                                        SyncState = "ONLINE_ONLY",
                                        ServerUpdatedAt = DateTime.UtcNow.ToString("o"),
                                        LocalUpdatedAt = DateTime.UtcNow.ToString("o")
                                    });
                                }
                                else if (eventType == "FOLDER_CREATE")
                                {
                                    string path = "\\" + name;
                                    _repo.UpsertFile(new LocalFileRecord
                                    {
                                        FileId = entityId,
                                        RelativePath = path,
                                        Name = name,
                                        SizeBytes = 0,
                                        Sha256 = "DIRECTORY",
                                        SyncState = "SYNCED",
                                        ServerUpdatedAt = DateTime.UtcNow.ToString("o"),
                                        LocalUpdatedAt = DateTime.UtcNow.ToString("o")
                                    });
                                }
                                else if (eventType == "FILE_DELETE" || eventType == "ITEM_TRASH")
                                {
                                    _repo.DeleteFileRecord(entityId);
                                }
                            }
                        }
                    }

                    if (chRes.ContainsKey("nextCursor"))
                    {
                        long next = Convert.ToInt64(chRes["nextCursor"]);
                        _repo.SetCursor(next);
                    }
                }
            }
            catch {}
        }

        [System.Runtime.InteropServices.DllImport("shell32.dll")]
        private static extern void SHChangeNotify(int wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);

        private void RegisterDriveIcon(string mount)
        {
            try
            {
                string letter = mount.TrimEnd('\\', ':');
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string iconPath = Path.Combine(baseDir, "nkb-drive.ico");
                if (!File.Exists(iconPath))
                {
                    string localProg = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Programs\NKB Drive\nkb-drive.ico");
                    if (File.Exists(localProg)) iconPath = localProg;
                }

                if (File.Exists(iconPath))
                {
                    using (var key = Microsoft.Win32.Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Explorer\DriveIcons\" + letter + @"\DefaultIcon"))
                    {
                        if (key != null) key.SetValue("", iconPath);
                    }
                    using (var key = Microsoft.Win32.Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Explorer\DriveIcons\" + letter + @"\DefaultLabel"))
                    {
                        if (key != null) key.SetValue("", "NKB Drive");
                    }
                    SHChangeNotify(0x08000000, 0, IntPtr.Zero, IntPtr.Zero);
                }
            }
            catch {}
        }

        public void Dispose()
        {
            Unmount();
        }
    }
}
