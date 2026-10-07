using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using LegalHelper.Models;
using LegalHelper.Services;

namespace LegalHelper;

public partial class MainWindow : Window
{
    private readonly SettingsService _settings;
    private readonly ApiClient _api = new();
    private HotkeyService? _hotkeys;
    private HwndSource? _hwndSource;

    private enum CaptureTarget { None, Toggle, Mic }
    private CaptureTarget _capture;

    private const double DefaultW = 480, DefaultH = 560;

    // Локальный fallback. После запуска приложение пытается получить актуальный каталог с Worker.
    private static readonly Dictionary<string, string[]> FallbackServers = new()
    {
        ["GTA5RP"] = [
            "Downtown · #1", "Vinewood · #2", "Richman · #3", "Eclipse · #4", "Rockford · #5",
            "Redwood · #6", "Sunrise · #7", "Insquad · #8", "Strawberry · #9", "Blackberry · #10",
            "La Puerta · #11", "Murrieta · #12", "Chiliad · #13", "Mirror · #14", "Milton · #15"
        ],
        ["Majestic RP"] = [
            "Detroit · #1", "Chicago · #2", "New York · #3", "Atlanta · #4", "San Diego · #5",
            "Miami · #6", "Las Vegas · #7", "Los Angeles · #8", "San Francisco · #9",
            "Washington · #10", "Dallas · #11", "Boston · #12", "Houston · #13",
            "Seattle · #14", "Denver · #15", "Memphis · #16"
        ],
        ["Russia Online"] = [
            "Арбатский · #1", "Тверской · #2", "Кутузовский · #3", "Невский · #4",
            "Ленинский · #5", "Советский · #6", "Центральный · #7"
        ]
    };

    private Dictionary<string, ProjectCatalog> _catalog = new();

    public MainWindow()
    {
        InitializeComponent();
        _settings = SettingsService.Load();

        Opacity = _settings.Opacity;
        OpacitySlider.Value = _settings.Opacity;
        Width = Math.Max(MinWidth, _settings.WindowWidth);
        Height = Math.Max(MinHeight, _settings.WindowHeight);
        Topmost = _settings.AlwaysOnTop;
        if (_settings.WindowLeft is double l && _settings.WindowTop is double t)
        {
            WindowStartupLocation = WindowStartupLocation.Manual;
            Left = l; Top = t;
        }

        SelectComboByContent(ProjectBox, _settings.Project);
        FillServers(_settings.Project);
        if (!string.IsNullOrWhiteSpace(_settings.Server)) ServerBox.Text = _settings.Server;
        SelectComboByTag(ModeBox, _settings.Mode);

        RefreshBindLabels();
        UpdateHotkeyHint();
        VersionLabel.Text = $"{AppConfig.AppName} v{AppConfig.AppVersion}";
        HistoryList.ItemsSource = _settings.History;

        PreviewKeyDown += OnPreviewKeyDown;
        LocationChanged += (_, _) => PersistGeo();
        SizeChanged += (_, _) => PersistGeo();
        Loaded += async (_, _) =>
        {
            InitHotkeys();
            if (_settings.ClickThrough) ApplyClickThrough(true);
            await LoadCatalogAsync();
            await CheckUpdateAsync();
        };
        Closed += (_, _) =>
        {
            SaveCurrent();
            _hotkeys?.Dispose();
        };
    }

    private void PersistGeo()
    {
        if (!IsLoaded) return;
        _settings.WindowWidth = Width;
        _settings.WindowHeight = Height;
        _settings.WindowLeft = Left;
        _settings.WindowTop = Top;
    }

    private void RefreshBindLabels()
    {
        ToggleBindBtn.Content = _settings.ToggleLabel;
        MicBindBtn.Content = _settings.MicLabel;
    }

    private void UpdateHotkeyHint() =>
        HotkeyHint.Text = $"{_settings.ToggleLabel} — оверлей";

    private static void SelectComboByContent(ComboBox box, string value)
    {
        foreach (ComboBoxItem item in box.Items)
            if (string.Equals(item.Content?.ToString(), value, StringComparison.OrdinalIgnoreCase))
            { box.SelectedItem = item; return; }
        if (box.Items.Count > 0) box.SelectedIndex = 0;
    }

    private static void SelectComboByTag(ComboBox box, string tag)
    {
        foreach (ComboBoxItem item in box.Items)
            if (string.Equals(item.Tag?.ToString(), tag, StringComparison.OrdinalIgnoreCase))
            { box.SelectedItem = item; return; }
        if (box.Items.Count > 0) box.SelectedIndex = 0;
    }

    private void InitHotkeys()
    {
        _hwndSource = HwndSource.FromVisual(this) as HwndSource;
        if (_hwndSource is null) return;
        _hotkeys = new HotkeyService(_hwndSource.Handle);
        _hotkeys.Pressed += id => Dispatcher.Invoke(() =>
        {
            if (id == HotkeyService.IdToggle)
                Visibility = Visibility == Visibility.Visible ? Visibility.Hidden : Visibility.Visible;
            else if (id == HotkeyService.IdMic)
                MessageBox.Show("Голос пока не подключён — используй текст.", AppConfig.AppName);
        });
        _hwndSource.AddHook(WndProc);
        ApplyHotkeys();
    }

    private IntPtr WndProc(IntPtr h, int msg, IntPtr w, IntPtr l, ref bool handled)
    {
        if (msg == 0x0312) { _hotkeys?.Handle(w.ToInt32()); handled = true; }
        return IntPtr.Zero;
    }

    private void ApplyHotkeys()
    {
        if (_hotkeys is null) return;
        var ok = _hotkeys.Register(_settings.ToggleHotkeyVk, _settings.ToggleHotkeyMods,
            _settings.MicHotkeyVk, _settings.MicHotkeyMods);
        StatusText.Text = ok ? $"Бинды: {_settings.ToggleLabel}" : "Бинд занят — смени в ⚙";
        UpdateHotkeyHint();
    }

    private void FillServers(string project)
    {
        ServerBox.Items.Clear();
        var servers = _catalog.TryGetValue(project, out var cfg)
            ? cfg.Servers
            : FallbackServers.GetValueOrDefault(project, Array.Empty<string>());
        foreach (var s in servers) ServerBox.Items.Add(s);
        if (!string.IsNullOrWhiteSpace(_settings.Server) && ServerBox.Items.Contains(_settings.Server))
            ServerBox.SelectedItem = _settings.Server;
        else if (ServerBox.Items.Count > 0)
            ServerBox.SelectedIndex = 0;
    }

    private async Task LoadCatalogAsync()
    {
        var catalog = await _api.GetCatalogAsync();
        if (catalog?.Projects is null || catalog.Projects.Count == 0) return;

        _catalog = catalog.Projects;
        var currentProject = _settings.Project;
        ProjectBox.Items.Clear();
        foreach (var key in _catalog.Keys)
            ProjectBox.Items.Add(new ComboBoxItem { Content = key });

        SelectComboByContent(ProjectBox, currentProject);
        FillServers(CurrentProject());
        StatusText.Text = "Каталог серверов обновлён онлайн";
    }

    private void ProjectBox_Changed(object sender, SelectionChangedEventArgs e)
    {
        if (ProjectBox.SelectedItem is ComboBoxItem item)
            FillServers(item.Content?.ToString() ?? "GTA5RP");
    }

    private string CurrentProject() => (ProjectBox.SelectedItem as ComboBoxItem)?.Content?.ToString() ?? "GTA5RP";
    private string CurrentMode() => (ModeBox.SelectedItem as ComboBoxItem)?.Tag?.ToString() ?? "rules";
    private string CurrentServer() => ServerBox.SelectedItem?.ToString() ?? ServerBox.Text ?? "";

    private void SaveCurrent()
    {
        _settings.Project = CurrentProject();
        _settings.Server = CurrentServer();
        _settings.Mode = CurrentMode();
        _settings.Opacity = Opacity;
        _settings.AlwaysOnTop = Topmost;
        _settings.ClickThrough = ClickThroughBox.IsChecked == true;
        PersistGeo();
        _settings.Save();
    }

    private async void Ask()
    {
        var q = Question.Text.Trim();
        if (q.Length == 0) return;
        Answer.Text = "Читаю форум и готовлю ответ…";
        SendBtn.IsEnabled = false;
        StatusText.Text = "Запрос…";
        try
        {
            var r = await _api.AskAsync(new AskRequest(CurrentProject(), CurrentServer(), CurrentMode(), q));
            var src = r.Sources is { Length: > 0 } ? "\n\nИсточники:\n• " + string.Join("\n• ", r.Sources) : "";
            Answer.Text = r.Answer + src;
            _settings.PushHistory(q);
            HistoryList.ItemsSource = null;
            HistoryList.ItemsSource = _settings.History;
            SaveCurrent();
            StatusText.Text = "Готово";
        }
        catch (Exception ex)
        {
            Answer.Text = "Ошибка сети или сервера.\n\n" + ex.Message;
            StatusText.Text = "Ошибка";
        }
        finally { SendBtn.IsEnabled = true; }
    }

    private void Question_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter && !Keyboard.Modifiers.HasFlag(ModifierKeys.Shift))
        { e.Handled = true; Ask(); }
    }

    private void SendBtn_Click(object sender, RoutedEventArgs e) => Ask();
    private void CloseBtn_Click(object sender, RoutedEventArgs e) => Hide();

    private void Border_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ChangedButton == MouseButton.Left && _capture == CaptureTarget.None)
            try { DragMove(); } catch { /* ignore */ }
    }

    private void Copy_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            Clipboard.SetText(Answer.Text ?? "");
            StatusText.Text = "Ответ скопирован";
        }
        catch { StatusText.Text = "Не удалось скопировать"; }
    }

    private void Pin_Click(object sender, RoutedEventArgs e)
    {
        Topmost = !Topmost;
        _settings.AlwaysOnTop = Topmost;
        StatusText.Text = Topmost ? "Поверх всех окон" : "Обычный режим";
    }

    private void SettingsBtn_Click(object sender, RoutedEventArgs e)
    {
        var open = SettingsPanel.Visibility != Visibility.Visible;
        SettingsPanel.Visibility = open ? Visibility.Visible : Visibility.Collapsed;
        AnswerScroll.Visibility = open ? Visibility.Collapsed : Visibility.Visible;
        if (open)
        {
            OpacitySlider.Value = Opacity;
            ClickThroughBox.IsChecked = _settings.ClickThrough;
            RefreshBindLabels();
            BindCaptureHint.Text = "";
            _capture = CaptureTarget.None;
            HistoryList.ItemsSource = null;
            HistoryList.ItemsSource = _settings.History;
        }
    }

    private void OpacitySlider_Changed(object sender, RoutedPropertyChangedEventArgs<double> e)
    {
        if (!IsLoaded) return;
        Opacity = OpacitySlider.Value;
        OpacityLabel.Text = $"{(int)(Opacity * 100)}%";
    }

    private void SizeDown_Click(object s, RoutedEventArgs e)
    { Width = Math.Max(MinWidth, Width - 40); Height = Math.Max(MinHeight, Height - 40); }
    private void SizeUp_Click(object s, RoutedEventArgs e)
    { Width = Math.Min(1000, Width + 40); Height = Math.Min(900, Height + 40); }
    private void SizeReset_Click(object s, RoutedEventArgs e)
    { Width = DefaultW; Height = DefaultH; }

    private void ToggleBindBtn_Click(object s, RoutedEventArgs e)
    {
        _capture = CaptureTarget.Toggle;
        ToggleBindBtn.Content = "…";
        BindCaptureHint.Text = "Нажми клавишу для оверлея (Esc — отмена)";
    }

    private void MicBindBtn_Click(object s, RoutedEventArgs e)
    {
        _capture = CaptureTarget.Mic;
        MicBindBtn.Content = "…";
        BindCaptureHint.Text = "Нажми клавишу для микрофона (Esc — отмена)";
    }

    private void OnPreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (_capture == CaptureTarget.None) return;
        if (e.Key == Key.Escape)
        {
            _capture = CaptureTarget.None;
            RefreshBindLabels();
            BindCaptureHint.Text = "Отменено";
            e.Handled = true;
            return;
        }
        if (e.Key is Key.LeftCtrl or Key.RightCtrl or Key.LeftAlt or Key.RightAlt
            or Key.LeftShift or Key.RightShift or Key.LWin or Key.RWin or Key.System)
            return;

        var key = e.Key == Key.System ? e.SystemKey : e.Key;
        var vk = HotkeyService.FromWpfKey(key);
        var mods = HotkeyService.ModsFromWpf(Keyboard.Modifiers);
        if (_capture == CaptureTarget.Toggle)
        { _settings.ToggleHotkeyVk = vk; _settings.ToggleHotkeyMods = mods; }
        else
        { _settings.MicHotkeyVk = vk; _settings.MicHotkeyMods = mods; }
        _capture = CaptureTarget.None;
        RefreshBindLabels();
        BindCaptureHint.Text = "Выбрано. Нажми «Сохранить».";
        e.Handled = true;
    }

    private void SaveSettings_Click(object sender, RoutedEventArgs e)
    {
        _settings.Opacity = OpacitySlider.Value;
        Opacity = _settings.Opacity;
        _settings.ClickThrough = ClickThroughBox.IsChecked == true;
        ApplyClickThrough(_settings.ClickThrough);
        SaveCurrent();
        ApplyHotkeys();
        BindCaptureHint.Text = "Сохранено";
    }

    private void ResetBinds_Click(object sender, RoutedEventArgs e)
    {
        _settings.ToggleHotkeyVk = 0x78; _settings.ToggleHotkeyMods = 0;
        _settings.MicHotkeyVk = 0x79; _settings.MicHotkeyMods = 0;
        RefreshBindLabels();
        BindCaptureHint.Text = "F9 / F10. Сохрани.";
    }

    private void HistoryList_DoubleClick(object sender, MouseButtonEventArgs e)
    {
        if (HistoryList.SelectedItem is string q)
        {
            Question.Text = q;
            SettingsPanel.Visibility = Visibility.Collapsed;
            AnswerScroll.Visibility = Visibility.Visible;
        }
    }

    private async Task CheckUpdateAsync()
    {
        var v = await _api.GetVersionAsync();
        if (v?.Version is null) return;
        if (Version.TryParse(v.Version, out var remote) && Version.TryParse(AppConfig.AppVersion, out var local) && remote > local)
        {
            UpdateLabel.Text = $"Доступно обновление {v.Version}. Скачай с сайта.";
            if (!string.IsNullOrEmpty(v.DownloadUrl))
                UpdateLabel.Text += $"\n{v.DownloadUrl}";
        }
    }

    // Click-through via WS_EX_TRANSPARENT
    private const int GwlExStyle = -20;
    private const int WsExTransparent = 0x20;
    private const int WsExLayered = 0x80000;

    [DllImport("user32.dll")] private static extern int GetWindowLong(IntPtr h, int n);
    [DllImport("user32.dll")] private static extern int SetWindowLong(IntPtr h, int n, int v);

    private void ApplyClickThrough(bool enable)
    {
        var hwnd = new WindowInteropHelper(this).Handle;
        if (hwnd == IntPtr.Zero) return;
        var ex = GetWindowLong(hwnd, GwlExStyle);
        if (enable)
            SetWindowLong(hwnd, GwlExStyle, ex | WsExTransparent | WsExLayered);
        else
            SetWindowLong(hwnd, GwlExStyle, (ex | WsExLayered) & ~WsExTransparent);
        StatusText.Text = enable ? "Клик насквозь ВКЛ (выключи в ⚙)" : "Клик насквозь выкл";
    }
}
