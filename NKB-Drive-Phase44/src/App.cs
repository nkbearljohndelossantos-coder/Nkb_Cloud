using System;
using System.Diagnostics;
using System.Threading;
using System.Windows;
using System.Windows.Forms;
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
