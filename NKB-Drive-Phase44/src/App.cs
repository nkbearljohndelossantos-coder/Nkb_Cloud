using System;
using System.IO;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading;
using System.Windows;
using System.Windows.Forms;
using NkbDrive.Client.Security;
using NkbDrive.Client.Storage;
using NkbDrive.Client.Sync;
using Application = System.Windows.Application;
using MessageBox = System.Windows.MessageBox;

namespace NkbDrive.Client.UI
{
    public class App : Application
    {
        private static Mutex _singleInstanceMutex;
        private NotifyIcon _trayIcon;
        private MainWindow _mainWindow;

        [STAThread]
        public static void Main(string[] args)
        {
            if (args != null && args.Length >= 4 && args[0].Equals("--cli-login", StringComparison.OrdinalIgnoreCase))
            {
                string server = args[1];
                string email = args[2];
                string password = args[3];
                CliLogin(server, email, password);
                return;
            }

            bool isNewInstance;
            _singleInstanceMutex = new Mutex(true, "Global\\NKBDrive_Enterprise_Client_Mutex", out isNewInstance);
            if (!isNewInstance)
            {
                MessageBox.Show("NKB Drive is already running in the system tray.", "NKB Drive", MessageBoxButton.OK, MessageBoxImage.Information);
                return;
            }

            bool startMinimized = false;
            foreach (var arg in args)
            {
                if (arg.Equals("--startup", StringComparison.OrdinalIgnoreCase) ||
                    arg.Equals("--minimized", StringComparison.OrdinalIgnoreCase) ||
                    arg.Equals("-m", StringComparison.OrdinalIgnoreCase))
                {
                    startMinimized = true;
                }
            }

            App app = new App();
            app.RunApplication(startMinimized);
        }

        private static void CliLogin(string server, string email, string password)
        {
            try
            {
                string workDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "NKB Drive");
                if (!Directory.Exists(workDir)) Directory.CreateDirectory(workDir);

                string dbPath = Path.Combine(workDir, "metadata.db");
                string vaultPath = Path.Combine(workDir, "vault.dat");

                var repo = new SyncMetadataRepository(dbPath);
                var vault = new DpapiVault(vaultPath);

                var client = new StagingApiClient(server);
                Console.WriteLine("[CLI] Authenticating " + email + " at " + server + "...");
                var loginRes = client.Login(email, password);
                string token = client.Token;
                if (string.IsNullOrEmpty(token))
                {
                    Console.WriteLine("[CLI ERROR] Authentication failed.");
                    return;
                }

                string machine = Environment.MachineName;
                string fingerprint = "HW-" + Guid.NewGuid().ToString("N").Substring(0, 12).ToUpper();
                client.RegisterDevice(machine, fingerprint, "Windows 10/11 x64", "2.1.0");
                string deviceId = client.DeviceId;

                vault.SaveCredentials(new StoredCredentials
                {
                    ServerUrl = server,
                    AccessToken = token,
                    DeviceId = deviceId,
                    UserEmail = email,
                    MachineName = machine,
                    StoredAt = DateTime.UtcNow
                });

                repo.SaveDeviceState(deviceId, machine, fingerprint, "APPROVED");

                Console.WriteLine("[CLI] Fetching directory tree...");
                var tree = client.GetDriveTree();
                if (tree != null)
                {
                    int folderCount = 0;
                    int fileCount = 0;

                    if (tree.ContainsKey("rootFolders"))
                    {
                        var rootFolders = tree["rootFolders"] as System.Collections.ArrayList;
                        if (rootFolders != null)
                        {
                            foreach (Dictionary<string, object> item in rootFolders)
                            {
                                if (item != null)
                                {
                                    string name = item["name"].ToString();
                                    string id = item["id"].ToString();
                                    string path = item.ContainsKey("virtualPath") ? item["virtualPath"].ToString() : "\\" + name;
                                    repo.UpsertFile(new LocalFileRecord
                                    {
                                        FileId = id,
                                        RelativePath = path,
                                        Name = name,
                                        SizeBytes = 0,
                                        Sha256 = "DIRECTORY",
                                        SyncState = "SYNCED",
                                        ServerUpdatedAt = DateTime.UtcNow.ToString("o"),
                                        LocalUpdatedAt = DateTime.UtcNow.ToString("o")
                                    });
                                    folderCount++;
                                }
                            }
                        }
                    }

                    if (tree.ContainsKey("files"))
                    {
                        var files = tree["files"] as System.Collections.ArrayList;
                        if (files != null)
                        {
                            foreach (Dictionary<string, object> item in files)
                            {
                                if (item != null)
                                {
                                    string name = item["name"].ToString();
                                    string id = item["id"].ToString();
                                    string path = item.ContainsKey("virtualPath") ? item["virtualPath"].ToString() : "\\" + name;
                                    long size = 0;
                                    if (item.ContainsKey("sizeBytes")) long.TryParse(item["sizeBytes"].ToString(), out size);
                                    else if (item.ContainsKey("size_bytes")) long.TryParse(item["size_bytes"].ToString(), out size);
                                    string sha = item.ContainsKey("sha256") ? item["sha256"].ToString() : "";

                                    repo.UpsertFile(new LocalFileRecord
                                    {
                                        FileId = id,
                                        RelativePath = path,
                                        Name = name,
                                        SizeBytes = size,
                                        Sha256 = sha,
                                        SyncState = "ONLINE_ONLY",
                                        ServerUpdatedAt = DateTime.UtcNow.ToString("o"),
                                        LocalUpdatedAt = DateTime.UtcNow.ToString("o")
                                    });
                                    fileCount++;
                                }
                            }
                        }
                    }

                    Console.WriteLine("[CLI] Hydrated " + folderCount + " folders and " + fileCount + " files.");
                }

                Console.WriteLine("[CLI] Login and tree hydration completed successfully!");
            }
            catch (Exception ex)
            {
                Console.WriteLine("[CLI ERROR] " + ex.ToString());
            }
        }

        private void RunApplication(bool startMinimized)
        {
            _mainWindow = new MainWindow();

            // Initialize System Tray Icon
            InitializeTrayIcon();

            if (!startMinimized)
            {
                _mainWindow.Show();
            }

            Run(_mainWindow);
        }

        private void InitializeTrayIcon()
        {
            _trayIcon = new NotifyIcon();
            _trayIcon.Text = "NKB Drive (N:) — Enterprise Virtual Storage";
            
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string iconPath = System.IO.Path.Combine(baseDir, "nkb-drive.ico");
            if (!System.IO.File.Exists(iconPath))
            {
                string localProg = System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Programs\NKB Drive\nkb-drive.ico");
                if (System.IO.File.Exists(localProg)) iconPath = localProg;
            }

            if (System.IO.File.Exists(iconPath))
            {
                try
                {
                    _trayIcon.Icon = new System.Drawing.Icon(iconPath);
                    _mainWindow.Icon = System.Windows.Media.Imaging.BitmapFrame.Create(new Uri(iconPath));
                }
                catch
                {
                    _trayIcon.Icon = System.Drawing.SystemIcons.Application;
                }
            }
            else
            {
                _trayIcon.Icon = System.Drawing.SystemIcons.Application;
            }
            _trayIcon.Visible = true;

            ContextMenuStrip menu = new ContextMenuStrip();
            menu.Items.Add("Open NKB Drive", null, (s, e) => ShowMainWindow());
            menu.Items.Add("Open Virtual Drive (N:)", null, (s, e) =>
            {
                try
                {
                    if (System.IO.Directory.Exists("N:\\"))
                    {
                        Process.Start("explorer.exe", "N:\\");
                    }
                    else
                    {
                        MessageBox.Show("Virtual drive N: is not currently mounted.", "NKB Drive", MessageBoxButton.OK, MessageBoxImage.Warning);
                    }
                }
                catch {}
            });
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Exit NKB Drive", null, (s, e) => ExitApplication());

            _trayIcon.ContextMenuStrip = menu;
            _trayIcon.DoubleClick += (s, e) => ShowMainWindow();

            _mainWindow.StateChanged += (s, e) =>
            {
                if (_mainWindow.WindowState == WindowState.Minimized)
                {
                    _mainWindow.Hide();
                    _trayIcon.ShowBalloonTip(1500, "NKB Drive", "NKB Drive is running in the background. Access files via N:.", ToolTipIcon.Info);
                }
            };
        }

        private void ShowMainWindow()
        {
            _mainWindow.Show();
            _mainWindow.WindowState = WindowState.Normal;
            _mainWindow.Activate();
        }

        private void ExitApplication()
        {
            if (_trayIcon != null)
            {
                _trayIcon.Visible = false;
                _trayIcon.Dispose();
                _trayIcon = null;
            }

            if (_mainWindow != null)
            {
                _mainWindow.Close();
            }

            if (_singleInstanceMutex != null)
            {
                try { _singleInstanceMutex.ReleaseMutex(); } catch {}
                _singleInstanceMutex.Dispose();
            }

            Shutdown();
        }

        protected override void OnExit(ExitEventArgs e)
        {
            if (_trayIcon != null)
            {
                _trayIcon.Visible = false;
                _trayIcon.Dispose();
            }
            base.OnExit(e);
        }
    }
}
