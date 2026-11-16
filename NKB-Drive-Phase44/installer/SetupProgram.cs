using System;
using System.IO;
using System.Reflection;
using System.Diagnostics;
using System.Drawing;
using System.Windows.Forms;
using System.Security.Principal;
using Microsoft.Win32;

namespace NkbDrive.Installer
{
    public class SetupProgram : Form
    {
        private const string APP_NAME = "NKB Drive";
        private const string APP_VERSION = "2.1.0";
        private const string PUBLISHER = "NKB Cloud Enterprise";
        private const string UNINSTALL_KEY = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\NKBDrive";
        private const string RUN_KEY = @"Software\Microsoft\Windows\CurrentVersion\Run";

        private Color PrimaryNavy = Color.FromArgb(15, 23, 42);      // #0F172A
        private Color SecondaryNavy = Color.FromArgb(30, 41, 59);    // #1E293B
        private Color AccentGold = Color.FromArgb(217, 119, 6);      // #D97706
        private Color BackgroundSlate = Color.FromArgb(248, 250, 252);// #F8FAFC
        private Color TextDark = Color.FromArgb(15, 23, 42);
        private Color TextMuted = Color.FromArgb(100, 116, 139);

        private Panel _pnlHeader;
        private Label _lblHeaderTitle;
        private Label _lblHeaderSubtitle;
        private Panel _pnlBody;
        private Panel _pnlFooter;
        private Button _btnNext;
        private Button _btnCancel;

        private int _stepIndex = 0;
        private string _targetDir;
        private CheckBox _chkStartup;
        private CheckBox _chkDesktopShortcut;
        private CheckBox _chkLaunchAfter;
        private ProgressBar _progressBar;
        private Label _lblProgressStatus;
        private bool _isWinFspDetected = false;

        public SetupProgram()
        {
            InitializeComponent();
            _targetDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "NKB Drive");
            CheckWinFsp();
            ShowStep(0);
        }

        private void InitializeComponent()
        {
            this.Text = APP_NAME + " Setup — v" + APP_VERSION;
            this.Size = new Size(580, 420);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = false;
            this.BackColor = BackgroundSlate;
            this.Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);

            // Header Panel
            _pnlHeader = new Panel
            {
                Dock = DockStyle.Top,
                Height = 80,
                BackColor = PrimaryNavy
            };

            _lblHeaderTitle = new Label
            {
                Text = APP_NAME + " Enterprise v" + APP_VERSION,
                Font = new Font("Segoe UI", 14f, FontStyle.Bold),
                ForeColor = Color.White,
                Location = new Point(24, 16),
                AutoSize = true
            };

            _lblHeaderSubtitle = new Label
            {
                Text = "Self-Hosted Enterprise Cloud Virtual Filesystem (N:)",
                Font = new Font("Segoe UI", 9.5f, FontStyle.Regular),
                ForeColor = AccentGold,
                Location = new Point(25, 45),
                AutoSize = true
            };

            _pnlHeader.Controls.Add(_lblHeaderTitle);
            _pnlHeader.Controls.Add(_lblHeaderSubtitle);

            // Footer Panel
            _pnlFooter = new Panel
            {
                Dock = DockStyle.Bottom,
                Height = 60,
                BackColor = Color.FromArgb(241, 245, 249)
            };

            _btnCancel = new Button
            {
                Text = "Cancel",
                Size = new Size(95, 34),
                Location = new Point(350, 13),
                BackColor = Color.White,
                FlatStyle = FlatStyle.System
            };
            _btnCancel.Click += (s, e) => { this.Close(); };

            _btnNext = new Button
            {
                Text = "Next >",
                Size = new Size(100, 34),
                Location = new Point(455, 13),
                BackColor = AccentGold,
                ForeColor = Color.White,
                FlatStyle = FlatStyle.System
            };
            _btnNext.Click += OnNextClicked;

            _pnlFooter.Controls.Add(_btnCancel);
            _pnlFooter.Controls.Add(_btnNext);

            // Body Panel
            _pnlBody = new Panel
            {
                Dock = DockStyle.Fill,
                Padding = new Padding(24),
                BackColor = BackgroundSlate
            };

            this.Controls.Add(_pnlBody);
            this.Controls.Add(_pnlFooter);
            this.Controls.Add(_pnlHeader);
        }

        private void CheckWinFsp()
        {
            _isWinFspDetected = false;
            // Check program files
            string pf86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
            string pf64 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);

            if (File.Exists(Path.Combine(pf86, "WinFsp", "bin", "winfsp-x64.dll")) ||
                File.Exists(Path.Combine(pf64, "WinFsp", "bin", "winfsp-x64.dll")))
            {
                _isWinFspDetected = true;
                return;
            }

            // Check Registry
            try
            {
                using (RegistryKey k = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\WinFsp"))
                {
                    if (k != null) _isWinFspDetected = true;
                }
            }
            catch {}

            try
            {
                using (RegistryKey k = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\WOW6432Node\WinFsp"))
                {
                    if (k != null) _isWinFspDetected = true;
                }
            }
            catch {}
        }

        private void ShowStep(int step)
        {
            _stepIndex = step;
            _pnlBody.Controls.Clear();

            switch (_stepIndex)
            {
                case 0: // Welcome & Prereq Check
                    _lblHeaderTitle.Text = "Welcome to " + APP_NAME + " Setup";
                    _lblHeaderSubtitle.Text = "Enterprise Secure Cloud Storage Virtual Drive";

                    Label lblIntro = new Label
                    {
                        Text = "This wizard will install " + APP_NAME + " on your computer.\n\n" +
                               "NKB Drive mounts your organization's private cloud files directly as Windows drive N:, enabling seamless online-only file streaming and intelligent local caching.",
                        Location = new Point(24, 20),
                        Size = new Size(510, 75),
                        Font = new Font("Segoe UI", 9.5f)
                    };

                    GroupBox grpPrereq = new GroupBox
                    {
                        Text = "System Compatibility & Prerequisites",
                        Location = new Point(24, 100),
                        Size = new Size(510, 110),
                        Font = new Font("Segoe UI", 9f, FontStyle.Bold)
                    };

                    bool is64 = Environment.Is64BitOperatingSystem;
                    Label lblOs = new Label
                    {
                        Text = "• Operating System: Windows 64-bit Architecture — " + (is64 ? "PASS [x64]" : "FAIL [Unsupported]"),
                        Location = new Point(16, 26),
                        Size = new Size(470, 22),
                        ForeColor = is64 ? Color.FromArgb(16, 120, 50) : Color.Red,
                        Font = new Font("Segoe UI", 9f, FontStyle.Regular)
                    };

                    Label lblWinFsp = new Label
                    {
                        Text = "• Windows File System Proxy (WinFsp Runtime) — " + (_isWinFspDetected ? "DETECTED [Ready]" : "NOT FOUND (Download required)"),
                        Location = new Point(16, 52),
                        Size = new Size(470, 22),
                        ForeColor = _isWinFspDetected ? Color.FromArgb(16, 120, 50) : Color.DarkOrange,
                        Font = new Font("Segoe UI", 9f, FontStyle.Regular)
                    };

                    Label lblDriverInfo = new Label
                    {
                        Text = _isWinFspDetected ? "Virtual filesystem provider ready to mount drive letter N:." : "Please install WinFsp 2.0+ from https://winfsp.dev before mounting virtual drive.",
                        Location = new Point(16, 78),
                        Size = new Size(470, 22),
                        ForeColor = TextMuted,
                        Font = new Font("Segoe UI", 8.5f, FontStyle.Regular)
                    };

                    grpPrereq.Controls.Add(lblOs);
                    grpPrereq.Controls.Add(lblWinFsp);
                    grpPrereq.Controls.Add(lblDriverInfo);

                    _pnlBody.Controls.Add(lblIntro);
                    _pnlBody.Controls.Add(grpPrereq);

                    _btnNext.Text = "Next >";
                    _btnNext.Enabled = is64;
                    break;

                case 1: // Options & Destination
                    _lblHeaderTitle.Text = "Installation Options";
                    _lblHeaderSubtitle.Text = "Select installation path and startup preferences";

                    Label lblPathPrompt = new Label
                    {
                        Text = "Destination Folder:",
                        Location = new Point(24, 20),
                        Size = new Size(510, 20),
                        Font = new Font("Segoe UI", 9f, FontStyle.Bold)
                    };

                    TextBox txtPath = new TextBox
                    {
                        Text = _targetDir,
                        Location = new Point(24, 45),
                        Size = new Size(400, 26),
                        ReadOnly = true
                    };

                    Button btnBrowse = new Button
                    {
                        Text = "Browse...",
                        Location = new Point(434, 43),
                        Size = new Size(95, 28)
                    };
                    btnBrowse.Click += (s, e) =>
                    {
                        using (FolderBrowserDialog fbd = new FolderBrowserDialog())
                        {
                            fbd.SelectedPath = _targetDir;
                            if (fbd.ShowDialog() == DialogResult.OK)
                            {
                                _targetDir = fbd.SelectedPath;
                                txtPath.Text = _targetDir;
                            }
                        }
                    };

                    GroupBox grpOptions = new GroupBox
                    {
                        Text = "Shortcut and Startup Preferences",
                        Location = new Point(24, 90),
                        Size = new Size(510, 120),
                        Font = new Font("Segoe UI", 9f, FontStyle.Bold)
                    };

                    _chkStartup = new CheckBox
                    {
                        Text = "Start NKB Drive automatically on Windows logon (Recommended)",
                        Checked = true,
                        Location = new Point(16, 28),
                        Size = new Size(470, 24),
                        Font = new Font("Segoe UI", 9f, FontStyle.Regular)
                    };

                    _chkDesktopShortcut = new CheckBox
                    {
                        Text = "Create desktop shortcut",
                        Checked = true,
                        Location = new Point(16, 56),
                        Size = new Size(470, 24),
                        Font = new Font("Segoe UI", 9f, FontStyle.Regular)
                    };

                    Label lblLetterInfo = new Label
                    {
                        Text = "Target Drive Letter: N: (NKB Drive Virtual Volume)",
                        Location = new Point(16, 86),
                        Size = new Size(470, 20),
                        ForeColor = TextMuted,
                        Font = new Font("Segoe UI", 8.5f, FontStyle.Regular)
                    };

                    grpOptions.Controls.Add(_chkStartup);
                    grpOptions.Controls.Add(_chkDesktopShortcut);
                    grpOptions.Controls.Add(lblLetterInfo);

                    _pnlBody.Controls.Add(lblPathPrompt);
                    _pnlBody.Controls.Add(txtPath);
                    _pnlBody.Controls.Add(btnBrowse);
                    _pnlBody.Controls.Add(grpOptions);

                    _btnNext.Text = "Install";
                    _btnNext.Enabled = true;
                    break;

                case 2: // Installing
                    _lblHeaderTitle.Text = "Installing " + APP_NAME;
                    _lblHeaderSubtitle.Text = "Extracting components and configuring Windows integrations...";

                    _lblProgressStatus = new Label
                    {
                        Text = "Preparing installation...",
                        Location = new Point(24, 40),
                        Size = new Size(510, 24)
                    };

                    _progressBar = new ProgressBar
                    {
                        Location = new Point(24, 75),
                        Size = new Size(510, 24),
                        Minimum = 0,
                        Maximum = 100,
                        Value = 10
                    };

                    _pnlBody.Controls.Add(_lblProgressStatus);
                    _pnlBody.Controls.Add(_progressBar);

                    _btnNext.Enabled = false;
                    _btnCancel.Enabled = false;

                    Timer t = new Timer { Interval = 100 };
                    t.Tick += (s, e) =>
                    {
                        t.Stop();
                        PerformInstallation();
                    };
                    t.Start();
                    break;

                case 3: // Finished
                    _lblHeaderTitle.Text = "Installation Completed";
                    _lblHeaderSubtitle.Text = APP_NAME + " has been successfully installed.";

                    Label lblDone = new Label
                    {
                        Text = "Setup has finished installing " + APP_NAME + " on your computer.\n\n" +
                               "The application is configured to mount virtual drive N: once authenticated.\n" +
                               "You can launch NKB Drive now or access it anytime from the Start Menu.",
                        Location = new Point(24, 30),
                        Size = new Size(510, 80)
                    };

                    _chkLaunchAfter = new CheckBox
                    {
                        Text = "Launch " + APP_NAME + " now",
                        Checked = true,
                        Location = new Point(28, 120),
                        Size = new Size(400, 24),
                        Font = new Font("Segoe UI", 9.5f, FontStyle.Bold)
                    };

                    _pnlBody.Controls.Add(lblDone);
                    _pnlBody.Controls.Add(_chkLaunchAfter);

                    _btnNext.Text = "Finish";
                    _btnNext.Enabled = true;
                    _btnCancel.Visible = false;
                    break;
            }
        }

        private void OnNextClicked(object sender, EventArgs e)
        {
            if (_stepIndex == 0)
            {
                ShowStep(1);
            }
            else if (_stepIndex == 1)
            {
                ShowStep(2);
            }
            else if (_stepIndex == 3)
            {
                if (_chkLaunchAfter != null && _chkLaunchAfter.Checked)
                {
                    string exePath = Path.Combine(_targetDir, "NKBDrive.exe");
                    if (File.Exists(exePath))
                    {
                        Process.Start(new ProcessStartInfo(exePath) { UseShellExecute = true });
                    }
                }
                this.Close();
            }
        }

        private void PerformInstallation()
        {
            try
            {
                UpdateProgress("Creating target directory...", 20);
                if (!Directory.Exists(_targetDir))
                    Directory.CreateDirectory(_targetDir);

                // Stop any running instance
                UpdateProgress("Closing any running NKB Drive processes...", 35);
                KillRunningProcess("NKBDrive");

                // Extract binaries
                UpdateProgress("Installing application binaries...", 50);
                ExtractResource("NKBDrive.exe", Path.Combine(_targetDir, "NKBDrive.exe"));
                ExtractResource("winfsp-msil.dll", Path.Combine(_targetDir, "winfsp-msil.dll"));
                ExtractResource("winfsp-x64.dll", Path.Combine(_targetDir, "winfsp-x64.dll"));
                ExtractResource("nkb-drive.ico", Path.Combine(_targetDir, "nkb-drive.ico"));
                ExtractResource("logo.png", Path.Combine(_targetDir, "logo.png"));

                // Copy installer as uninstaller
                string currentExe = Assembly.GetExecutingAssembly().Location;
                string uninstallerPath = Path.Combine(_targetDir, "Uninstall.exe");
                try
                {
                    File.Copy(currentExe, uninstallerPath, true);
                }
                catch {}

                // Create Shortcuts
                UpdateProgress("Configuring shortcuts...", 75);
                string exeTarget = Path.Combine(_targetDir, "NKBDrive.exe");
                string startMenuDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "NKB Drive");
                if (!Directory.Exists(startMenuDir))
                    Directory.CreateDirectory(startMenuDir);

                CreateShortcut(Path.Combine(startMenuDir, "NKB Drive.lnk"), exeTarget, "NKB Drive Enterprise Cloud Storage");
                CreateShortcut(Path.Combine(startMenuDir, "Uninstall NKB Drive.lnk"), uninstallerPath, "Uninstall NKB Drive", "--uninstall");

                if (_chkDesktopShortcut != null && _chkDesktopShortcut.Checked)
                {
                    string desktopDir = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                    CreateShortcut(Path.Combine(desktopDir, "NKB Drive.lnk"), exeTarget, "NKB Drive Enterprise Cloud Storage");
                }

                // Startup Registry & Startup Folder
                UpdateProgress("Registering Windows Startup...", 85);
                if (_chkStartup != null && _chkStartup.Checked)
                {
                    SetStartupRegistry(exeTarget, true);
                    string startupDir = Environment.GetFolderPath(Environment.SpecialFolder.Startup);
                    if (Directory.Exists(startupDir))
                    {
                        CreateShortcut(Path.Combine(startupDir, "NKB Drive.lnk"), exeTarget, "NKB Drive Enterprise Cloud Storage", "--startup");
                    }
                }

                // Windows Add/Remove Programs Registration
                UpdateProgress("Registering Windows Uninstaller & Drive Icon...", 95);
                RegisterUninstaller(_targetDir, uninstallerPath, exeTarget);
                RegisterDriveIcon(Path.Combine(_targetDir, "nkb-drive.ico"));

                UpdateProgress("Installation completed successfully.", 100);
                System.Threading.Thread.Sleep(400);

                ShowStep(3);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Installation failed:\n" + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                _btnCancel.Enabled = true;
            }
        }

        private void UpdateProgress(string msg, int pct)
        {
            if (_lblProgressStatus != null) _lblProgressStatus.Text = msg;
            if (_progressBar != null) _progressBar.Value = pct;
            Application.DoEvents();
        }

        public static void SilentInstall(string targetDir = null, bool startup = true, bool desktopShortcut = true)
        {
            if (string.IsNullOrEmpty(targetDir))
            {
                targetDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "NKB Drive");
            }

            Console.WriteLine("[INSTALL] Starting silent installation to: " + targetDir);
            if (!Directory.Exists(targetDir))
                Directory.CreateDirectory(targetDir);

            KillRunningProcess("NKBDrive");

            Console.WriteLine("[INSTALL] Extracting binaries and visual branding...");
            ExtractResource("NKBDrive.exe", Path.Combine(targetDir, "NKBDrive.exe"));
            ExtractResource("winfsp-msil.dll", Path.Combine(targetDir, "winfsp-msil.dll"));
            ExtractResource("winfsp-x64.dll", Path.Combine(targetDir, "winfsp-x64.dll"));
            ExtractResource("nkb-drive.ico", Path.Combine(targetDir, "nkb-drive.ico"));
            ExtractResource("logo.png", Path.Combine(targetDir, "logo.png"));

            string currentExe = Assembly.GetExecutingAssembly().Location;
            string uninstallerPath = Path.Combine(targetDir, "Uninstall.exe");
            try { File.Copy(currentExe, uninstallerPath, true); } catch {}

            string exeTarget = Path.Combine(targetDir, "NKBDrive.exe");
            string startMenuDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "NKB Drive");
            if (!Directory.Exists(startMenuDir))
                Directory.CreateDirectory(startMenuDir);

            Console.WriteLine("[INSTALL] Creating shortcuts...");
            CreateShortcut(Path.Combine(startMenuDir, "NKB Drive.lnk"), exeTarget, "NKB Drive Enterprise Cloud Storage");
            CreateShortcut(Path.Combine(startMenuDir, "Uninstall NKB Drive.lnk"), uninstallerPath, "Uninstall NKB Drive", "--uninstall");

            if (desktopShortcut)
            {
                string desktopDir = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                CreateShortcut(Path.Combine(desktopDir, "NKB Drive.lnk"), exeTarget, "NKB Drive Enterprise Cloud Storage");
            }

            if (startup)
            {
                Console.WriteLine("[INSTALL] Registering Run on startup...");
                SetStartupRegistry(exeTarget, true);
                string startupDir = Environment.GetFolderPath(Environment.SpecialFolder.Startup);
                if (Directory.Exists(startupDir))
                {
                    CreateShortcut(Path.Combine(startupDir, "NKB Drive.lnk"), exeTarget, "NKB Drive Enterprise Cloud Storage", "--startup");
                }
            }

            Console.WriteLine("[INSTALL] Registering in Windows Add/Remove Programs & Drive Icon...");
            RegisterUninstaller(targetDir, uninstallerPath, exeTarget);
            RegisterDriveIcon(Path.Combine(targetDir, "nkb-drive.ico"));

            Console.WriteLine("[INSTALL] Installation completed successfully.");
        }

        public static void PerformUninstall(bool isSilent)
        {
            if (!isSilent)
            {
                DialogResult dr = MessageBox.Show(
                    "Are you sure you want to uninstall " + APP_NAME + "?\n\nThis will cleanly unmount drive N: and remove installed application files.",
                    "Uninstall " + APP_NAME,
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question);

                if (dr != DialogResult.Yes) return;
            }

            Console.WriteLine("[UNINSTALL] Stopping processes...");
            KillRunningProcess("NKBDrive");

            // Clean unmount drive N:
            try
            {
                Process p = Process.Start(new ProcessStartInfo("subst", "N: /d") { CreateNoWindow = true, UseShellExecute = false });
                if (p != null) p.WaitForExit(1000);
            }
            catch {}

            UnregisterDriveIcon();

            Console.WriteLine("[UNINSTALL] Removing Startup entry...");
            SetStartupRegistry(null, false);

            Console.WriteLine("[UNINSTALL] Removing shortcuts...");
            string startMenuDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "NKB Drive");
            if (Directory.Exists(startMenuDir))
            {
                try { Directory.Delete(startMenuDir, true); } catch {}
            }

            string desktopShortcut = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "NKB Drive.lnk");
            if (File.Exists(desktopShortcut))
            {
                try { File.Delete(desktopShortcut); } catch {}
            }

            string startupShortcut = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Startup), "NKB Drive.lnk");
            if (File.Exists(startupShortcut))
            {
                try { File.Delete(startupShortcut); } catch {}
            }

            Console.WriteLine("[UNINSTALL] Removing Windows Add/Remove Programs entry...");
            try
            {
                using (RegistryKey rk = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall", true))
                {
                    if (rk != null) rk.DeleteSubKeyTree("NKBDrive", false);
                }
            }
            catch {}

            // Ask to preserve data
            bool purgeData = false;
            if (!isSilent)
            {
                DialogResult preserveDr = MessageBox.Show(
                    "Do you want to retain your local metadata and offline cache database?\n\n(Choose 'Yes' to preserve cached files and metadata, or 'No' to purge them).",
                    "Retain NKB Drive Data",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question);
                purgeData = (preserveDr == DialogResult.No);
            }

            if (purgeData)
            {
                string localData = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "NKB Drive");
                if (Directory.Exists(localData))
                {
                    try { Directory.Delete(localData, true); } catch {}
                }
            }

            // Remove binaries directory
            string targetDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "NKB Drive");
            try
            {
                string[] files = Directory.GetFiles(targetDir);
                foreach (string f in files)
                {
                    if (!Path.GetFileName(f).Equals("Uninstall.exe", StringComparison.OrdinalIgnoreCase))
                    {
                        try { File.Delete(f); } catch {}
                    }
                }
            }
            catch {}

            if (!isSilent)
            {
                MessageBox.Show(APP_NAME + " has been successfully uninstalled.", "Uninstall Complete", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            Console.WriteLine("[UNINSTALL] Completed successfully.");
        }

        private static void ExtractResource(string resourceName, string outputPath)
        {
            Assembly asm = Assembly.GetExecutingAssembly();
            using (Stream s = asm.GetManifestResourceStream(resourceName))
            {
                if (s == null)
                {
                    // Fallback to local directory if compiling without embedded resource in development
                    string devPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, resourceName);
                    if (File.Exists(devPath))
                    {
                        File.Copy(devPath, outputPath, true);
                        return;
                    }
                    throw new FileNotFoundException("Embedded resource not found: " + resourceName);
                }
                using (FileStream fs = new FileStream(outputPath, FileMode.Create, FileAccess.Write))
                {
                    s.CopyTo(fs);
                }
            }
        }

        private static void CreateShortcut(string shortcutPath, string targetPath, string description, string arguments = null)
        {
            try
            {
                Type shellType = Type.GetTypeFromProgID("WScript.Shell");
                if (shellType != null)
                {
                    dynamic shell = Activator.CreateInstance(shellType);
                    dynamic shortcut = shell.CreateShortcut(shortcutPath);
                    shortcut.TargetPath = targetPath;
                    shortcut.WorkingDirectory = Path.GetDirectoryName(targetPath);
                    shortcut.Description = description;
                    string iconFile = Path.Combine(Path.GetDirectoryName(targetPath), "nkb-drive.ico");
                    if (File.Exists(iconFile))
                    {
                        shortcut.IconLocation = iconFile + ",0";
                    }
                    if (!string.IsNullOrEmpty(arguments))
                    {
                        shortcut.Arguments = arguments;
                    }
                    shortcut.Save();
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("Warning: Failed to create shortcut " + shortcutPath + ": " + ex.Message);
            }
        }

        private static void SetStartupRegistry(string targetExe, bool enable)
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(RUN_KEY, true))
                {
                    if (key != null)
                    {
                        if (enable && !string.IsNullOrEmpty(targetExe))
                        {
                            key.SetValue("NKB Drive", "\"" + targetExe + "\" --startup");
                        }
                        else
                        {
                            key.DeleteValue("NKB Drive", false);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("Warning: Could not modify Run registry key: " + ex.Message);
            }
        }

        private static void RegisterUninstaller(string installDir, string uninstallerPath, string mainExePath)
        {
            try
            {
                using (RegistryKey rk = Registry.CurrentUser.CreateSubKey(UNINSTALL_KEY))
                {
                    if (rk != null)
                    {
                        rk.SetValue("DisplayName", APP_NAME);
                        rk.SetValue("DisplayVersion", APP_VERSION);
                        rk.SetValue("Publisher", PUBLISHER);
                        rk.SetValue("InstallLocation", installDir);
                        rk.SetValue("DisplayIcon", mainExePath + ",0");
                        rk.SetValue("UninstallString", "\"" + uninstallerPath + "\" --uninstall");
                        rk.SetValue("QuietUninstallString", "\"" + uninstallerPath + "\" --uninstall /S");
                        rk.SetValue("NoModify", 1, RegistryValueKind.DWord);
                        rk.SetValue("NoRepair", 1, RegistryValueKind.DWord);
                        rk.SetValue("EstimatedSize", 1850, RegistryValueKind.DWord);
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("Warning: Could not register uninstaller: " + ex.Message);
            }
        }

        private static void RegisterDriveIcon(string iconPath)
        {
            try
            {
                using (RegistryKey rk = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Explorer\DriveIcons\N\DefaultIcon"))
                {
                    if (rk != null) rk.SetValue("", iconPath);
                }
                using (RegistryKey rk = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Explorer\DriveIcons\N\DefaultLabel"))
                {
                    if (rk != null) rk.SetValue("", "NKB Drive");
                }
            }
            catch {}
        }

        private static void UnregisterDriveIcon()
        {
            try
            {
                Registry.CurrentUser.DeleteSubKeyTree(@"Software\Microsoft\Windows\CurrentVersion\Explorer\DriveIcons\N", false);
            }
            catch {}
        }

        private static void KillRunningProcess(string procName)
        {
            try
            {
                Process[] procs = Process.GetProcessesByName(procName);
                foreach (Process p in procs)
                {
                    try
                    {
                        p.Kill();
                        p.WaitForExit(3000);
                    }
                    catch {}
                }
            }
            catch {}
        }

        [STAThread]
        public static void Main(string[] args)
        {
            bool isSilent = false;
            bool isUninstall = false;

            for (int i = 0; i < args.Length; i++)
            {
                string arg = args[i].ToLowerInvariant();
                if (arg == "/s" || arg == "-s" || arg == "/silent" || arg == "--silent")
                    isSilent = true;
                if (arg == "/uninstall" || arg == "--uninstall" || arg == "-u")
                    isUninstall = true;
            }

            if (isUninstall)
            {
                PerformUninstall(isSilent);
                return;
            }

            if (isSilent)
            {
                SilentInstall();
                return;
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new SetupProgram());
        }
    }
}
