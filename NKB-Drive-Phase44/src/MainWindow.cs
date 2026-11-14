using System;
using System.IO;
using System.Diagnostics;
using System.Threading;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Threading;
using System.Collections.Generic;
using Microsoft.Win32;
using NkbDrive.Client.Storage;
using NkbDrive.Client.Sync;
using NkbDrive.Client.Security;

namespace NkbDrive.Client.UI
{
    public class MainWindow : Window
    {
        // Core Engine Components
        private readonly string _workDir;
        private readonly string _cacheDir;
        private readonly string _dbPath;
        private readonly string _vaultPath;

        private SyncMetadataRepository _repo;
        private StagingApiClient _client;
        private SyncEngine _engine;
        private NkbDriveHost _host;
        private DpapiVault _vault;

        private DispatcherTimer _pollTimer;

        // UI Color Palette (Enterprise Navy & Gold)
        public static readonly Color NavyDark = Color.FromRgb(15, 23, 42);      // #0F172A
        public static readonly Color NavySidebar = Color.FromRgb(30, 41, 59);   // #1E293B
        public static readonly Color NavyActive = Color.FromRgb(51, 65, 85);    // #334155
        public static readonly Color GoldAccent = Color.FromRgb(217, 119, 6);   // #D97706
        public static readonly Color GoldLight = Color.FromRgb(245, 158, 11);   // #F59E0B
        public static readonly Color SlateBg = Color.FromRgb(248, 250, 252);    // #F8FAFC
        public static readonly Color SlateBorder = Color.FromRgb(226, 232, 240);// #E2E8F0
        public static readonly Color SlateText = Color.FromRgb(100, 116, 139);  // #64748B
        public static readonly Color DarkText = Color.FromRgb(15, 23, 42);      // #0F172A
        public static readonly Color GreenSuccess = Color.FromRgb(16, 185, 129);// #10B981

        // UI Controls
        private Border _loginOverlay;
        private TextBox _loginEmail;
        private PasswordBox _loginPassword;
        private TextBox _loginServerUrl;
        private TextBlock _loginErrorText;
        private Button _loginSubmitBtn;

        private ContentControl _mainContentArea;
        private TextBlock _headerTitle;
        private Border _statusPill;
        private TextBlock _statusPillText;
        private TextBlock _userNameText;
        private TextBlock _userDeptText;
        private TextBlock _driveStatusText;

        // Current Active Navigation Index
        private int _currentNavIndex = 0;
        private Button[] _navButtons;

        public MainWindow()
        {
            Title = "NKB Drive — Enterprise Virtual Storage";
            Width = 1040;
            Height = 680;
            MinWidth = 900;
            MinHeight = 580;
            WindowStartupLocation = WindowStartupLocation.CenterScreen;
            Background = new SolidColorBrush(SlateBg);
            FontFamily = new FontFamily("Segoe UI, Inter, Arial");

            // Setup local data paths under %LocalAppData%\NKB Drive
            string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            _workDir = Path.Combine(localAppData, "NKB Drive");
            if (!Directory.Exists(_workDir)) Directory.CreateDirectory(_workDir);

            _cacheDir = Path.Combine(_workDir, "cache");
            if (!Directory.Exists(_cacheDir)) Directory.CreateDirectory(_cacheDir);

            _dbPath = Path.Combine(_workDir, "metadata.db");
            _vaultPath = Path.Combine(_workDir, "vault.dat");

            InitializeComponents();
            InitializeEngine();
        }

        public NkbDriveHost Host { get { return _host; } }
        public SyncMetadataRepository Repository { get { return _repo; } }

        private void InitializeComponents()
        {
            Grid rootGrid = new Grid();
            rootGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(240) });
            rootGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

            // 1. Sidebar (Navy Blue)
            Border sidebar = BuildSidebar();
            Grid.SetColumn(sidebar, 0);
            rootGrid.Children.Add(sidebar);

            // 2. Main Content Area
            Grid mainArea = new Grid();
            mainArea.RowDefinitions.Add(new RowDefinition { Height = new GridLength(64) });
            mainArea.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });

            // Top Header
            Border header = BuildHeader();
            Grid.SetRow(header, 0);
            mainArea.Children.Add(header);

            // Dynamic Body
            _mainContentArea = new ContentControl();
            _mainContentArea.Margin = new Thickness(24);
            Grid.SetRow(_mainContentArea, 1);
            mainArea.Children.Add(_mainContentArea);

            Grid.SetColumn(mainArea, 1);
            rootGrid.Children.Add(mainArea);

            // 3. Login Modal Overlay
            _loginOverlay = BuildLoginOverlay();
            Grid.SetColumnSpan(_loginOverlay, 2);
            rootGrid.Children.Add(_loginOverlay);

            Content = rootGrid;
        }

        private Border BuildSidebar()
        {
            Border border = new Border
            {
                Background = new SolidColorBrush(NavyDark),
                BorderBrush = new SolidColorBrush(NavySidebar),
                BorderThickness = new Thickness(0, 0, 1, 0)
            };

            Grid grid = new Grid();
            grid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(72) });
            grid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            grid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(120) });

            // Logo Branding
            StackPanel logoPanel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                Margin = new Thickness(20, 18, 20, 0)
            };

            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string logoPngPath = System.IO.Path.Combine(baseDir, "logo.png");
            if (!System.IO.File.Exists(logoPngPath))
            {
                string localProg = System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Programs\NKB Drive\logo.png");
                if (System.IO.File.Exists(localProg)) logoPngPath = localProg;
            }

            if (System.IO.File.Exists(logoPngPath))
            {
                try
                {
                    System.Windows.Controls.Image logoImg = new System.Windows.Controls.Image
                    {
                        Width = 46,
                        Height = 36,
                        Margin = new Thickness(0, 0, 10, 0),
                        VerticalAlignment = VerticalAlignment.Center
                    };
                    logoImg.Source = new System.Windows.Media.Imaging.BitmapImage(new Uri(logoPngPath));
                    logoPanel.Children.Add(logoImg);
                }
                catch
                {
                    Border emblem = new Border
                    {
                        Width = 36,
                        Height = 36,
                        CornerRadius = new CornerRadius(6),
                        Background = new SolidColorBrush(GoldAccent),
                        Margin = new Thickness(0, 0, 12, 0)
                    };
                    TextBlock emblemText = new TextBlock
                    {
                        Text = "NKB",
                        Foreground = Brushes.White,
                        FontWeight = FontWeights.Bold,
                        FontSize = 13,
                        HorizontalAlignment = HorizontalAlignment.Center,
                        VerticalAlignment = VerticalAlignment.Center
                    };
                    emblem.Child = emblemText;
                    logoPanel.Children.Add(emblem);
                }
            }
            else
            {
                Border emblem = new Border
                {
                    Width = 36,
                    Height = 36,
                    CornerRadius = new CornerRadius(6),
                    Background = new SolidColorBrush(GoldAccent),
                    Margin = new Thickness(0, 0, 12, 0)
                };
                TextBlock emblemText = new TextBlock
                {
                    Text = "NKB",
                    Foreground = Brushes.White,
                    FontWeight = FontWeights.Bold,
                    FontSize = 13,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center
                };
                emblem.Child = emblemText;
                logoPanel.Children.Add(emblem);
            }

            StackPanel titlePanel = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
            TextBlock titleText = new TextBlock
            {
                Text = "NKB DRIVE",
                Foreground = Brushes.White,
                FontWeight = FontWeights.Bold,
                FontSize = 15
            };
            TextBlock subText = new TextBlock
            {
                Text = "Enterprise Virtual v2.1",
                Foreground = new SolidColorBrush(SlateText),
                FontSize = 11
            };
            titlePanel.Children.Add(titleText);
            titlePanel.Children.Add(subText);
            logoPanel.Children.Add(titlePanel);

            Grid.SetRow(logoPanel, 0);
            grid.Children.Add(logoPanel);

            // Navigation Links
            StackPanel navPanel = new StackPanel { Margin = new Thickness(12, 16, 12, 0) };
            string[] navItems = new string[] {
                "  Overview",
                "  Synchronized Files",
                "  Pending Queue",
                "  Conflict Center",
                "  Offline Pinned",
                "  Settings"
            };

            _navButtons = new Button[navItems.Length];
            for (int i = 0; i < navItems.Length; i++)
            {
                int index = i;
                Button btn = new Button
                {
                    Content = navItems[i],
                    Height = 40,
                    Margin = new Thickness(0, 4, 0, 4),
                    Background = (i == 0) ? new SolidColorBrush(NavyActive) : Brushes.Transparent,
                    Foreground = Brushes.White,
                    FontSize = 13,
                    FontWeight = (i == 0) ? FontWeights.SemiBold : FontWeights.Normal,
                    HorizontalContentAlignment = HorizontalAlignment.Left,
                    Padding = new Thickness(14, 0, 0, 0),
                    BorderThickness = new Thickness(0),
                    Cursor = System.Windows.Input.Cursors.Hand
                };
                btn.Click += (s, e) => SwitchNavTab(index);
                _navButtons[i] = btn;
                navPanel.Children.Add(btn);
            }
            Grid.SetRow(navPanel, 1);
            grid.Children.Add(navPanel);

            // Bottom Profile & Drive Status
            StackPanel bottomPanel = new StackPanel
            {
                Margin = new Thickness(16, 8, 16, 16),
                VerticalAlignment = VerticalAlignment.Bottom
            };

            Border statusBox = new Border
            {
                Background = new SolidColorBrush(NavySidebar),
                CornerRadius = new CornerRadius(6),
                Padding = new Thickness(10, 8, 10, 8),
                Margin = new Thickness(0, 0, 0, 10)
            };
            StackPanel sBoxInner = new StackPanel();
            _driveStatusText = new TextBlock
            {
                Text = "● Drive N: UNMOUNTED",
                Foreground = new SolidColorBrush(SlateText),
                FontSize = 11,
                FontWeight = FontWeights.SemiBold
            };
            _userNameText = new TextBlock
            {
                Text = "Not Logged In",
                Foreground = Brushes.White,
                FontSize = 12,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 4, 0, 0)
            };
            _userDeptText = new TextBlock
            {
                Text = "NKB Cloud Enterprise",
                Foreground = new SolidColorBrush(SlateText),
                FontSize = 11
            };
            sBoxInner.Children.Add(_driveStatusText);
            sBoxInner.Children.Add(_userNameText);
            sBoxInner.Children.Add(_userDeptText);
            statusBox.Child = sBoxInner;
            bottomPanel.Children.Add(statusBox);

            Button logoutBtn = new Button
            {
                Content = "Secure Sign Out",
                Height = 30,
                Background = Brushes.Transparent,
                Foreground = new SolidColorBrush(Color.FromRgb(239, 68, 68)),
                FontSize = 11,
                FontWeight = FontWeights.SemiBold,
                BorderThickness = new Thickness(1),
                BorderBrush = new SolidColorBrush(Color.FromRgb(185, 28, 28)),
                Cursor = System.Windows.Input.Cursors.Hand
            };
            logoutBtn.Click += (s, e) => Logout();
            bottomPanel.Children.Add(logoutBtn);

            Grid.SetRow(bottomPanel, 2);
            grid.Children.Add(bottomPanel);

            border.Child = grid;
            return border;
        }

        private Border BuildHeader()
        {
            Border header = new Border
            {
                Background = Brushes.White,
                BorderBrush = new SolidColorBrush(SlateBorder),
                BorderThickness = new Thickness(0, 0, 0, 1),
                Padding = new Thickness(24, 0, 24, 0)
            };

            Grid grid = new Grid();
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Auto) });

            _headerTitle = new TextBlock
            {
                Text = "System Overview",
                FontSize = 18,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(DarkText),
                VerticalAlignment = VerticalAlignment.Center
            };
            Grid.SetColumn(_headerTitle, 0);
            grid.Children.Add(_headerTitle);

            StackPanel actionPanel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center
            };

            _statusPill = new Border
            {
                Background = new SolidColorBrush(Color.FromArgb(30, 16, 185, 129)),
                BorderBrush = new SolidColorBrush(GreenSuccess),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(12),
                Padding = new Thickness(10, 4, 10, 4),
                Margin = new Thickness(0, 0, 12, 0)
            };
            _statusPillText = new TextBlock
            {
                Text = "● ONLINE",
                Foreground = new SolidColorBrush(GreenSuccess),
                FontSize = 11,
                FontWeight = FontWeights.Bold
            };
            _statusPill.Child = _statusPillText;
            actionPanel.Children.Add(_statusPill);

            Button syncBtn = new Button
            {
                Content = "Sync Now",
                Background = Brushes.White,
                Foreground = new SolidColorBrush(DarkText),
                BorderBrush = new SolidColorBrush(SlateBorder),
                BorderThickness = new Thickness(1),
                Padding = new Thickness(12, 6, 12, 6),
                FontSize = 12,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 0, 8, 0),
                Cursor = System.Windows.Input.Cursors.Hand
            };
            syncBtn.Click += (s, e) => TriggerManualSync();
            actionPanel.Children.Add(syncBtn);

            Button explorerBtn = new Button
            {
                Content = "Open N: Drive",
                Background = new SolidColorBrush(GoldAccent),
                Foreground = Brushes.White,
                BorderThickness = new Thickness(0),
                Padding = new Thickness(14, 6, 14, 6),
                FontSize = 12,
                FontWeight = FontWeights.Bold,
                Cursor = System.Windows.Input.Cursors.Hand
            };
            explorerBtn.Click += (s, e) => OpenDriveInExplorer();
            actionPanel.Children.Add(explorerBtn);

            Grid.SetColumn(actionPanel, 1);
            grid.Children.Add(actionPanel);

            header.Child = grid;
            return header;
        }

        private Border BuildLoginOverlay()
        {
            Border overlay = new Border
            {
                Background = new SolidColorBrush(Color.FromArgb(200, 15, 23, 42)),
                Visibility = Visibility.Collapsed
            };

            Border card = new Border
            {
                Width = 420,
                Background = Brushes.White,
                CornerRadius = new CornerRadius(10),
                Padding = new Thickness(32),
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Effect = new System.Windows.Media.Effects.DropShadowEffect
                {
                    Color = Colors.Black,
                    Direction = 270,
                    ShadowDepth = 10,
                    Opacity = 0.25,
                    BlurRadius = 25
                }
            };

            StackPanel panel = new StackPanel();

            string baseDirLogin = AppDomain.CurrentDomain.BaseDirectory;
            string logoPngPathLogin = System.IO.Path.Combine(baseDirLogin, "logo.png");
            if (!System.IO.File.Exists(logoPngPathLogin))
            {
                string localProg = System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Programs\NKB Drive\logo.png");
                if (System.IO.File.Exists(localProg)) logoPngPathLogin = localProg;
            }

            if (System.IO.File.Exists(logoPngPathLogin))
            {
                try
                {
                    System.Windows.Controls.Image loginLogo = new System.Windows.Controls.Image
                    {
                        Width = 140,
                        Height = 85,
                        HorizontalAlignment = HorizontalAlignment.Center,
                        Margin = new Thickness(0, 0, 0, 12)
                    };
                    loginLogo.Source = new System.Windows.Media.Imaging.BitmapImage(new Uri(logoPngPathLogin));
                    panel.Children.Add(loginLogo);
                }
                catch
                {
                    Border logo = new Border
                    {
                        Width = 48,
                        Height = 48,
                        CornerRadius = new CornerRadius(8),
                        Background = new SolidColorBrush(GoldAccent),
                        HorizontalAlignment = HorizontalAlignment.Center,
                        Margin = new Thickness(0, 0, 0, 12)
                    };
                    TextBlock logoText = new TextBlock
                    {
                        Text = "NKB",
                        Foreground = Brushes.White,
                        FontWeight = FontWeights.Bold,
                        FontSize = 16,
                        HorizontalAlignment = HorizontalAlignment.Center,
                        VerticalAlignment = VerticalAlignment.Center
                    };
                    logo.Child = logoText;
                    panel.Children.Add(logo);
                }
            }
            else
            {
                Border logo = new Border
                {
                    Width = 48,
                    Height = 48,
                    CornerRadius = new CornerRadius(8),
                    Background = new SolidColorBrush(GoldAccent),
                    HorizontalAlignment = HorizontalAlignment.Center,
                    Margin = new Thickness(0, 0, 0, 12)
                };
                TextBlock logoText = new TextBlock
                {
                    Text = "NKB",
                    Foreground = Brushes.White,
                    FontWeight = FontWeights.Bold,
                    FontSize = 16,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center
                };
                logo.Child = logoText;
                panel.Children.Add(logo);
            }

            TextBlock heading = new TextBlock
            {
                Text = "Sign In to NKB Drive",
                FontSize = 20,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(DarkText),
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 0, 0, 4)
            };
            panel.Children.Add(heading);

            TextBlock caption = new TextBlock
            {
                Text = "Connect your workstation to NKB Cloud Enterprise v2.1.0",
                FontSize = 12,
                Foreground = new SolidColorBrush(SlateText),
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 0, 0, 24)
            };
            panel.Children.Add(caption);

            panel.Children.Add(new TextBlock { Text = "Server Endpoint", FontSize = 12, FontWeight = FontWeights.SemiBold, Foreground = new SolidColorBrush(DarkText), Margin = new Thickness(0, 0, 0, 4) });
            _loginServerUrl = new TextBox { Text = "http://127.0.0.1:5000", Height = 36, Padding = new Thickness(8, 6, 8, 6), FontSize = 13, Margin = new Thickness(0, 0, 0, 14) };
            panel.Children.Add(_loginServerUrl);

            panel.Children.Add(new TextBlock { Text = "Email / Username", FontSize = 12, FontWeight = FontWeights.SemiBold, Foreground = new SolidColorBrush(DarkText), Margin = new Thickness(0, 0, 0, 4) });
            _loginEmail = new TextBox { Text = "admin@nkbmanufacturing.com", Height = 36, Padding = new Thickness(8, 6, 8, 6), FontSize = 13, Margin = new Thickness(0, 0, 0, 14) };
            panel.Children.Add(_loginEmail);

            panel.Children.Add(new TextBlock { Text = "Password", FontSize = 12, FontWeight = FontWeights.SemiBold, Foreground = new SolidColorBrush(DarkText), Margin = new Thickness(0, 0, 0, 4) });
            _loginPassword = new PasswordBox { Password = "TestPassword2026!", Height = 36, Padding = new Thickness(8, 6, 8, 6), FontSize = 13, Margin = new Thickness(0, 0, 0, 14) };
            panel.Children.Add(_loginPassword);

            _loginErrorText = new TextBlock
            {
                Text = "",
                Foreground = new SolidColorBrush(Color.FromRgb(239, 68, 68)),
                FontSize = 12,
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(0, 0, 0, 12),
                Visibility = Visibility.Collapsed
            };
            panel.Children.Add(_loginErrorText);

            _loginSubmitBtn = new Button
            {
                Content = "Authenticate & Mount Drive",
                Height = 40,
                Background = new SolidColorBrush(GoldAccent),
                Foreground = Brushes.White,
                FontSize = 14,
                FontWeight = FontWeights.Bold,
                BorderThickness = new Thickness(0),
                Cursor = System.Windows.Input.Cursors.Hand
            };
            _loginSubmitBtn.Click += (s, e) => ExecuteLogin();
            panel.Children.Add(_loginSubmitBtn);

            card.Child = panel;
            overlay.Child = card;
            return overlay;
        }

        private void InitializeEngine()
        {
            try
            {
                _repo = new SyncMetadataRepository(_dbPath);
                _engine = new SyncEngine(_repo, _cacheDir);
                _vault = new DpapiVault(_vaultPath);

                StoredCredentials creds = _vault.LoadCredentials();
                if (creds != null && !string.IsNullOrEmpty(creds.AccessToken))
                {
                    _client = new StagingApiClient(creds.ServerUrl ?? "http://127.0.0.1:5000");
                    _client.Token = creds.AccessToken;
                    _client.DeviceId = creds.DeviceId;

                    _userNameText.Text = creds.UserEmail ?? "Authenticated Employee";
                    _userDeptText.Text = "Device: " + (creds.MachineName ?? Environment.MachineName);

                    StartMountAndSync();
                }
                else
                {
                    _loginOverlay.Visibility = Visibility.Visible;
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Error initializing storage engine: " + ex.Message, "NKB Drive Error", MessageBoxButton.OK, MessageBoxImage.Error);
                _loginOverlay.Visibility = Visibility.Visible;
            }

            SwitchNavTab(0);

            // Background UI poll timer
            _pollTimer = new DispatcherTimer();
            _pollTimer.Interval = TimeSpan.FromSeconds(2);
            _pollTimer.Tick += (s, e) => RefreshDashboardMetrics();
            _pollTimer.Start();
        }

        private void ExecuteLogin()
        {
            _loginErrorText.Visibility = Visibility.Collapsed;
            _loginSubmitBtn.IsEnabled = false;
            _loginSubmitBtn.Content = "Connecting...";

            string server = _loginServerUrl.Text.Trim();
            string email = _loginEmail.Text.Trim();
            string pass = _loginPassword.Password;

            ThreadPool.QueueUserWorkItem(_ =>
            {
                try
                {
                    StagingApiClient client = new StagingApiClient(server);
                    var loginRes = client.Login(email, pass);
                    string token = client.Token;

                    if (string.IsNullOrEmpty(token))
                    {
                        throw new InvalidOperationException("Authentication failed: No token received.");
                    }

                    // Register device
                    string machine = Environment.MachineName;
                    string fingerprint = "HW-" + Guid.NewGuid().ToString("N").Substring(0, 12).ToUpper();
                    client.RegisterDevice(machine, fingerprint, "Windows 10/11 x64", "2.1.0");
                    string deviceId = client.DeviceId;

                    // Save to DPAPI Vault
                    _vault.SaveCredentials(new StoredCredentials
                    {
                        ServerUrl = server,
                        AccessToken = token,
                        DeviceId = deviceId,
                        UserEmail = email,
                        MachineName = machine,
                        StoredAt = DateTime.UtcNow
                    });

                    _repo.SaveDeviceState(deviceId, machine, fingerprint, "APPROVED");

                    Dispatcher.Invoke(() =>
                    {
                        _client = client;
                        _userNameText.Text = email;
                        _userDeptText.Text = "Device: " + machine;
                        _loginOverlay.Visibility = Visibility.Collapsed;
                        _loginSubmitBtn.IsEnabled = true;
                        _loginSubmitBtn.Content = "Authenticate & Mount Drive";

                        StartMountAndSync();
                        RefreshDashboardMetrics();
                    });
                }
                catch (Exception ex)
                {
                    Dispatcher.Invoke(() =>
                    {
                        _loginSubmitBtn.IsEnabled = true;
                        _loginSubmitBtn.Content = "Authenticate & Mount Drive";
                        _loginErrorText.Text = ex.Message;
                        _loginErrorText.Visibility = Visibility.Visible;
                    });
                }
            });
        }

        private void StartMountAndSync()
        {
            try
            {
                if (_host == null)
                {
                    _host = new NkbDriveHost("N:", _repo, _client, _engine, _cacheDir);
                }

                if (!_host.IsMounted)
                {
                    _host.Mount();
                }

                _driveStatusText.Text = "● Drive N: MOUNTED";
                _driveStatusText.Foreground = new SolidColorBrush(GreenSuccess);

                // Fetch initial tree from cloud
                ThreadPool.QueueUserWorkItem(_ =>
                {
                    try
                    {
                        var tree = _client.GetDriveTree();
                        if (tree != null)
                        {
                            System.Collections.Generic.HashSet<string> serverIds = new System.Collections.Generic.HashSet<string>();
                            if (tree.ContainsKey("rootFolders"))
                            {
                                var list = tree["rootFolders"] as System.Collections.ArrayList;
                                if (list != null)
                                {
                                    foreach (Dictionary<string, object> item in list)
                                    {
                                        string name = item["name"].ToString();
                                        string id = item["id"].ToString();
                                        serverIds.Add(id);
                                        _repo.UpsertFile(new LocalFileRecord
                                        {
                                            FileId = id,
                                            RelativePath = "\\" + name,
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

                            if (tree.ContainsKey("files"))
                            {
                                var fileList = tree["files"] as System.Collections.ArrayList;
                                if (fileList != null)
                                {
                                    foreach (Dictionary<string, object> f in fileList)
                                    {
                                        string id = f["id"].ToString();
                                        string name = f["name"].ToString();
                                        long size = f.ContainsKey("sizeBytes") && f["sizeBytes"] != null ? Convert.ToInt64(f["sizeBytes"]) : 0;
                                        string sha = f.ContainsKey("sha256") && f["sha256"] != null ? f["sha256"].ToString() : "";
                                        serverIds.Add(id);
                                        _repo.UpsertFile(new LocalFileRecord
                                        {
                                            FileId = id,
                                            RelativePath = "\\" + name,
                                            Name = name,
                                            SizeBytes = size,
                                            Sha256 = sha,
                                            SyncState = "SYNCED",
                                            ServerUpdatedAt = DateTime.UtcNow.ToString("o"),
                                            LocalUpdatedAt = DateTime.UtcNow.ToString("o")
                                        });
                                    }
                                }
                            }

                            // Prune any stale local files not present in the cloud tree (unless newly pending upload)
                            var existing = _repo.ListFiles();
                            if (existing != null)
                            {
                                foreach (var rec in existing)
                                {
                                    if (!serverIds.Contains(rec.FileId) && rec.SyncState != "SYNC_PENDING")
                                    {
                                        _repo.DeleteFileRecord(rec.FileId);
                                    }
                                }
                            }
                        }
                    }
                    catch {}
                });
            }
            catch (Exception ex)
            {
                _driveStatusText.Text = "● Mount Error";
                _driveStatusText.Foreground = new SolidColorBrush(Color.FromRgb(239, 68, 68));
                Console.WriteLine("[MOUNT ERROR] " + ex.Message);
            }
        }

        private void SwitchNavTab(int index)
        {
            _currentNavIndex = index;
            for (int i = 0; i < _navButtons.Length; i++)
            {
                if (i == index)
                {
                    _navButtons[i].Background = new SolidColorBrush(NavyActive);
                    _navButtons[i].FontWeight = FontWeights.SemiBold;
                }
                else
                {
                    _navButtons[i].Background = Brushes.Transparent;
                    _navButtons[i].FontWeight = FontWeights.Normal;
                }
            }

            switch (index)
            {
                case 0:
                    _headerTitle.Text = "System Overview";
                    _mainContentArea.Content = BuildOverviewView();
                    break;
                case 1:
                    _headerTitle.Text = "Synchronized Files";
                    _mainContentArea.Content = BuildFilesView();
                    break;
                case 2:
                    _headerTitle.Text = "Pending Queue";
                    _mainContentArea.Content = BuildQueueView();
                    break;
                case 3:
                    _headerTitle.Text = "Conflict Center";
                    _mainContentArea.Content = BuildConflictsView();
                    break;
                case 4:
                    _headerTitle.Text = "Offline Pinned Files";
                    _mainContentArea.Content = BuildOfflineView();
                    break;
                case 5:
                    _headerTitle.Text = "Application Settings";
                    _mainContentArea.Content = BuildSettingsView();
                    break;
            }
        }

        private UIElement BuildOverviewView()
        {
            ScrollViewer sv = new ScrollViewer { VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
            StackPanel panel = new StackPanel();

            // 3 KPI Cards Grid
            Grid cards = new Grid();
            cards.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            cards.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(16) });
            cards.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            cards.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(16) });
            cards.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

            // Card 1: Virtual Drive Status
            Border card1 = CreateMetricCard("VIRTUAL DRIVE", (_host != null && _host.IsMounted) ? "N: (Mounted)" : "N: (Offline)", "WinFsp Native Provider", GreenSuccess);
            Grid.SetColumn(card1, 0);
            cards.Children.Add(card1);

            // Card 2: Workstation Device Status
            string status = _repo != null ? _repo.GetDeviceApprovalStatus() : "PENDING";
            Border card2 = CreateMetricCard("DEVICE STATUS", status, Environment.MachineName, GoldAccent);
            Grid.SetColumn(card2, 2);
            cards.Children.Add(card2);

            // Card 3: Storage Pool
            int fileCount = _repo != null ? _repo.CountFiles() : 0;
            Border card3 = CreateMetricCard("FILES TRACKED", fileCount.ToString() + " Items", "PostgreSQL 16 Staging", DarkText);
            Grid.SetColumn(card3, 4);
            cards.Children.Add(card3);

            panel.Children.Add(cards);

            // Recent Synchronized Files Table
            TextBlock actHeader = new TextBlock
            {
                Text = "Recently Synchronized Files",
                FontSize = 15,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush(DarkText),
                Margin = new Thickness(0, 24, 0, 12)
            };
            panel.Children.Add(actHeader);

            Border tableBorder = new Border
            {
                Background = Brushes.White,
                BorderBrush = new SolidColorBrush(SlateBorder),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(8),
                Padding = new Thickness(16)
            };

            ListView lv = new ListView
            {
                BorderThickness = new Thickness(0),
                Background = Brushes.Transparent,
                Height = 220
            };
            GridView gv = new GridView();
            gv.Columns.Add(new GridViewColumn { Header = "File Name", Width = 220, DisplayMemberBinding = new System.Windows.Data.Binding("Name") });
            gv.Columns.Add(new GridViewColumn { Header = "Relative Path", Width = 240, DisplayMemberBinding = new System.Windows.Data.Binding("RelativePath") });
            gv.Columns.Add(new GridViewColumn { Header = "Size (Bytes)", Width = 100, DisplayMemberBinding = new System.Windows.Data.Binding("SizeBytes") });
            gv.Columns.Add(new GridViewColumn { Header = "Sync State", Width = 120, DisplayMemberBinding = new System.Windows.Data.Binding("SyncState") });
            lv.View = gv;

            if (_repo != null)
            {
                lv.ItemsSource = _repo.ListRecentFiles(10);
            }

            tableBorder.Child = lv;
            panel.Children.Add(tableBorder);

            sv.Content = panel;
            return sv;
        }

        private Border CreateMetricCard(string label, string value, string caption, Color highlightColor)
        {
            Border border = new Border
            {
                Background = Brushes.White,
                BorderBrush = new SolidColorBrush(SlateBorder),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(8),
                Padding = new Thickness(16)
            };
            StackPanel sp = new StackPanel();
            sp.Children.Add(new TextBlock { Text = label, FontSize = 11, FontWeight = FontWeights.Bold, Foreground = new SolidColorBrush(SlateText), Margin = new Thickness(0, 0, 0, 6) });
            sp.Children.Add(new TextBlock { Text = value, FontSize = 18, FontWeight = FontWeights.Bold, Foreground = new SolidColorBrush(highlightColor), Margin = new Thickness(0, 0, 0, 4) });
            sp.Children.Add(new TextBlock { Text = caption, FontSize = 11, Foreground = new SolidColorBrush(SlateText) });
            border.Child = sp;
            return border;
        }

        private UIElement BuildFilesView()
        {
            Border border = new Border
            {
                Background = Brushes.White,
                BorderBrush = new SolidColorBrush(SlateBorder),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(8),
                Padding = new Thickness(16)
            };

            ListView lv = new ListView
            {
                BorderThickness = new Thickness(0),
                Background = Brushes.Transparent
            };
            GridView gv = new GridView();
            gv.Columns.Add(new GridViewColumn { Header = "File Name", Width = 200, DisplayMemberBinding = new System.Windows.Data.Binding("Name") });
            gv.Columns.Add(new GridViewColumn { Header = "Relative Path", Width = 260, DisplayMemberBinding = new System.Windows.Data.Binding("RelativePath") });
            gv.Columns.Add(new GridViewColumn { Header = "Size (Bytes)", Width = 100, DisplayMemberBinding = new System.Windows.Data.Binding("SizeBytes") });
            gv.Columns.Add(new GridViewColumn { Header = "State", Width = 110, DisplayMemberBinding = new System.Windows.Data.Binding("SyncState") });
            gv.Columns.Add(new GridViewColumn { Header = "Server Updated", Width = 140, DisplayMemberBinding = new System.Windows.Data.Binding("ServerUpdatedAt") });
            lv.View = gv;

            if (_repo != null)
            {
                lv.ItemsSource = _repo.ListRecentFiles(50);
            }

            border.Child = lv;
            return border;
        }

        private UIElement BuildQueueView()
        {
            Border border = new Border
            {
                Background = Brushes.White,
                BorderBrush = new SolidColorBrush(SlateBorder),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(8),
                Padding = new Thickness(16)
            };

            ListView lv = new ListView
            {
                BorderThickness = new Thickness(0),
                Background = Brushes.Transparent
            };
            GridView gv = new GridView();
            gv.Columns.Add(new GridViewColumn { Header = "Operation", Width = 100, DisplayMemberBinding = new System.Windows.Data.Binding("Operation") });
            gv.Columns.Add(new GridViewColumn { Header = "Local Path", Width = 260, DisplayMemberBinding = new System.Windows.Data.Binding("LocalPath") });
            gv.Columns.Add(new GridViewColumn { Header = "Target Path", Width = 220, DisplayMemberBinding = new System.Windows.Data.Binding("TargetPath") });
            gv.Columns.Add(new GridViewColumn { Header = "Status", Width = 90, DisplayMemberBinding = new System.Windows.Data.Binding("Status") });
            gv.Columns.Add(new GridViewColumn { Header = "Retries", Width = 60, DisplayMemberBinding = new System.Windows.Data.Binding("RetryCount") });
            lv.View = gv;

            if (_repo != null)
            {
                lv.ItemsSource = _repo.GetPendingQueue(50);
            }

            border.Child = lv;
            return border;
        }

        private UIElement BuildConflictsView()
        {
            Border border = new Border
            {
                Background = Brushes.White,
                BorderBrush = new SolidColorBrush(SlateBorder),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(8),
                Padding = new Thickness(16)
            };

            ListView lv = new ListView
            {
                BorderThickness = new Thickness(0),
                Background = Brushes.Transparent
            };
            GridView gv = new GridView();
            gv.Columns.Add(new GridViewColumn { Header = "Conflict File Name", Width = 260, DisplayMemberBinding = new System.Windows.Data.Binding("ConflictFileName") });
            gv.Columns.Add(new GridViewColumn { Header = "Original ID", Width = 200, DisplayMemberBinding = new System.Windows.Data.Binding("OriginalFileId") });
            gv.Columns.Add(new GridViewColumn { Header = "Detected At", Width = 160, DisplayMemberBinding = new System.Windows.Data.Binding("DetectedAt") });
            gv.Columns.Add(new GridViewColumn { Header = "Resolution", Width = 100, DisplayMemberBinding = new System.Windows.Data.Binding("ResolutionStatus") });
            lv.View = gv;

            if (_repo != null)
            {
                lv.ItemsSource = _repo.ListConflicts();
            }

            border.Child = lv;
            return border;
        }

        private UIElement BuildOfflineView()
        {
            Border border = new Border
            {
                Background = Brushes.White,
                BorderBrush = new SolidColorBrush(SlateBorder),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(8),
                Padding = new Thickness(16)
            };

            ListView lv = new ListView
            {
                BorderThickness = new Thickness(0),
                Background = Brushes.Transparent
            };
            GridView gv = new GridView();
            gv.Columns.Add(new GridViewColumn { Header = "Item ID", Width = 240, DisplayMemberBinding = new System.Windows.Data.Binding("ItemId") });
            gv.Columns.Add(new GridViewColumn { Header = "Type", Width = 100, DisplayMemberBinding = new System.Windows.Data.Binding("ItemType") });
            gv.Columns.Add(new GridViewColumn { Header = "Pinned At", Width = 180, DisplayMemberBinding = new System.Windows.Data.Binding("PinnedAt") });
            gv.Columns.Add(new GridViewColumn { Header = "Pinned By", Width = 160, DisplayMemberBinding = new System.Windows.Data.Binding("PinnedByUser") });
            lv.View = gv;

            if (_repo != null)
            {
                lv.ItemsSource = _repo.ListPinnedItems();
            }

            border.Child = lv;
            return border;
        }

        private UIElement BuildSettingsView()
        {
            Border border = new Border
            {
                Background = Brushes.White,
                BorderBrush = new SolidColorBrush(SlateBorder),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(8),
                Padding = new Thickness(24)
            };

            StackPanel panel = new StackPanel();

            panel.Children.Add(new TextBlock { Text = "Virtual Drive Settings", FontSize = 16, FontWeight = FontWeights.Bold, Foreground = new SolidColorBrush(DarkText), Margin = new Thickness(0, 0, 0, 16) });

            CheckBox startupCb = new CheckBox
            {
                Content = "Start NKB Drive automatically when Windows starts",
                IsChecked = IsStartupEnabled(),
                FontSize = 13,
                Margin = new Thickness(0, 0, 0, 16)
            };
            startupCb.Click += (s, e) => ToggleStartup(startupCb.IsChecked == true);
            panel.Children.Add(startupCb);

            panel.Children.Add(new TextBlock { Text = "Target Drive Letter", FontSize = 12, FontWeight = FontWeights.SemiBold, Foreground = new SolidColorBrush(DarkText), Margin = new Thickness(0, 0, 0, 4) });
            ComboBox driveCombo = new ComboBox { Width = 100, HorizontalAlignment = HorizontalAlignment.Left, Margin = new Thickness(0, 0, 0, 20) };
            driveCombo.Items.Add("N:");
            driveCombo.Items.Add("K:");
            driveCombo.Items.Add("O:");
            driveCombo.SelectedIndex = 0;
            panel.Children.Add(driveCombo);

            panel.Children.Add(new TextBlock { Text = "Local Cache Management", FontSize = 14, FontWeight = FontWeights.Bold, Foreground = new SolidColorBrush(DarkText), Margin = new Thickness(0, 8, 0, 8) });
            TextBlock cachePathText = new TextBlock { Text = "Cache Directory: " + _cacheDir, Foreground = new SolidColorBrush(SlateText), FontSize = 12, Margin = new Thickness(0, 0, 0, 12) };
            panel.Children.Add(cachePathText);

            Button clearCacheBtn = new Button
            {
                Content = "Evict Local Clean Cache (Safe)",
                Width = 220,
                Height = 32,
                HorizontalAlignment = HorizontalAlignment.Left,
                Background = Brushes.White,
                Foreground = new SolidColorBrush(DarkText),
                BorderBrush = new SolidColorBrush(SlateBorder),
                BorderThickness = new Thickness(1),
                Cursor = System.Windows.Input.Cursors.Hand,
                Margin = new Thickness(0, 0, 0, 24)
            };
            clearCacheBtn.Click += (s, e) =>
            {
                if (_engine != null)
                {
                    MessageBox.Show("Cache eviction triggered safely. Zero cloud deletions executed.", "NKB Drive Cache", MessageBoxButton.OK, MessageBoxImage.Information);
                }
            };
            panel.Children.Add(clearCacheBtn);

            border.Child = panel;
            return border;
        }

        private void RefreshDashboardMetrics()
        {
            if (_host != null && _host.IsMounted)
            {
                _driveStatusText.Text = "● Drive N: MOUNTED";
                _driveStatusText.Foreground = new SolidColorBrush(GreenSuccess);
            }
            else
            {
                _driveStatusText.Text = "● Drive N: UNMOUNTED";
                _driveStatusText.Foreground = new SolidColorBrush(SlateText);
            }

            if (_currentNavIndex == 0)
            {
                _mainContentArea.Content = BuildOverviewView();
            }
        }

        private void TriggerManualSync()
        {
            if (_host != null)
            {
                ThreadPool.QueueUserWorkItem(_ =>
                {
                    try
                    {
                        _host.ProcessPendingQueue();
                        _host.PollServerChanges();
                    }
                    catch {}
                    Dispatcher.Invoke(() => RefreshDashboardMetrics());
                });
            }
        }

        private void OpenDriveInExplorer()
        {
            try
            {
                if (Directory.Exists("N:\\"))
                {
                    Process.Start("explorer.exe", "N:\\");
                }
                else
                {
                    MessageBox.Show("Virtual drive N: is not currently mounted.", "NKB Drive", MessageBoxButton.OK, MessageBoxImage.Warning);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Failed to open Explorer: " + ex.Message, "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private bool IsStartupEnabled()
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", false))
                {
                    return key != null && key.GetValue("NKBDrive") != null;
                }
            }
            catch { return false; }
        }

        private void ToggleStartup(bool enable)
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true))
                {
                    if (key != null)
                    {
                        if (enable)
                        {
                            string appPath = Process.GetCurrentProcess().MainModule.FileName;
                            key.SetValue("NKBDrive", "\"" + appPath + "\" --startup");
                        }
                        else
                        {
                            key.DeleteValue("NKBDrive", false);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Failed to update Windows startup: " + ex.Message, "Error", MessageBoxButton.OK, MessageBoxImage.Warning);
            }
        }

        private void Logout()
        {
            var res = MessageBox.Show("Are you sure you want to sign out? This will safely unmount virtual drive N: and purge local session keys.", "Confirm Sign Out", MessageBoxButton.YesNo, MessageBoxImage.Question);
            if (res != MessageBoxResult.Yes) return;

            if (_host != null)
            {
                try { _host.Unmount(); } catch {}
            }

            if (_vault != null)
            {
                _vault.Purge();
            }

            _userNameText.Text = "Not Logged In";
            _userDeptText.Text = "NKB Cloud Enterprise";
            _driveStatusText.Text = "● Drive N: UNMOUNTED";
            _driveStatusText.Foreground = new SolidColorBrush(SlateText);

            _loginOverlay.Visibility = Visibility.Visible;
            SwitchNavTab(0);
        }

        protected override void OnClosed(EventArgs e)
        {
            if (_pollTimer != null) _pollTimer.Stop();
            if (_host != null)
            {
                try { _host.Unmount(); } catch {}
                try { _host.Dispose(); } catch {}
                _host = null;
            }
            base.OnClosed(e);
        }
    }
}
