using System.Globalization;
using System.Runtime.InteropServices;
using System.Speech.Recognition;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using LegalHelper.Models;
using LegalHelper.Services;

namespace LegalHelper;

public partial class MainWindow : Window
{
    private readonly SettingsService _settings;
    private readonly ApiClient _api = new();

    private HotkeyService? _hotkeys;
    private HwndSource? _hwndSource;

    private SpeechRecognitionEngine? _speech;
    private bool _isListening;

    private enum CaptureTarget
    {
        None,
        Toggle,
        Mic
    }

    private CaptureTarget _capture;

    private const double DefaultW = 940;
    private const double DefaultH = 700;

    private static readonly Dictionary<string, string[]> FallbackServers = new()
    {
        ["GTA5RP"] =
        [
            "Downtown · #1",
            "Vinewood · #2",
            "Richman · #3",
            "Eclipse · #4",
            "Rockford · #5",
            "Redwood · #6",
            "Sunrise · #7",
            "Insquad · #8",
            "Strawberry · #9",
            "Blackberry · #10",
            "La Puerta · #11",
            "Murrieta · #12",
            "Chiliad · #13",
            "Mirror · #14",
            "Milton · #15"
        ],

        ["Majestic RP"] =
        [
            "Detroit · #1",
            "Chicago · #2",
            "New York · #3",
            "Atlanta · #4",
            "San Diego · #5",
            "Miami · #6",
            "Las Vegas · #7",
            "Los Angeles · #8",
            "San Francisco · #9",
            "Washington · #10",
            "Dallas · #11",
            "Boston · #12",
            "Houston · #13",
            "Seattle · #14",
            "Denver · #15",
            "Memphis · #16"
        ],

        ["Russia Online"] =
        [
            "Арбатский · #1",
            "Тверской · #2",
            "Кутузовский · #3",
            "Невский · #4",
            "Ленинский · #5",
            "Советский · #6",
            "Центральный · #7"
        ]
    };

    private Dictionary<string, ProjectCatalog> _catalog = new();


    public MainWindow()
    {
        InitializeComponent();

        _settings = SettingsService.Load();

        /*
         * Миграция старых биндов.
         *
         * Было:
         * F9  = overlay
         * F10 = microphone
         *
         * Стало:
         * F5 = overlay
         * F6 = microphone
         */
        if (_settings.ToggleHotkeyVk == 0x78)
        {
            _settings.ToggleHotkeyVk = 0x74;
            _settings.ToggleHotkeyMods = 0;
        }

        if (_settings.MicHotkeyVk == 0x79)
        {
            _settings.MicHotkeyVk = 0x75;
            _settings.MicHotkeyMods = 0;
        }

        Opacity = _settings.Opacity;

        OpacitySlider.Value =
            _settings.Opacity;

        Width =
            Math.Max(
                MinWidth,
                _settings.WindowWidth > 0
                    ? _settings.WindowWidth
                    : DefaultW);

        Height =
            Math.Max(
                MinHeight,
                _settings.WindowHeight > 0
                    ? _settings.WindowHeight
                    : DefaultH);

        Topmost =
            _settings.AlwaysOnTop;


        if (_settings.WindowLeft is double l &&
            _settings.WindowTop is double t)
        {
            WindowStartupLocation =
                WindowStartupLocation.Manual;

            Left = l;
            Top = t;
        }


        SelectComboByContent(
            ProjectBox,
            _settings.Project);

        FillServers(
            _settings.Project);


        if (!string.IsNullOrWhiteSpace(
                _settings.Server))
        {
            ServerBox.Text =
                _settings.Server;
        }


        SelectComboByTag(
            ModeBox,
            _settings.Mode);


        RefreshBindLabels();
        UpdateHotkeyHint();


        VersionLabel.Text =
            $"{AppConfig.AppName} v4.0.0";


        HistoryList.ItemsSource =
            _settings.History;


        PreviewKeyDown +=
            OnPreviewKeyDown;


        LocationChanged +=
            (_, _) => PersistGeo();

        SizeChanged +=
            (_, _) => PersistGeo();


        Loaded += async (_, _) =>
        {
            InitHotkeys();

            if (_settings.ClickThrough)
                ApplyClickThrough(true);

            await LoadCatalogAsync();
            await CheckUpdateAsync();
        };


        Closed += (_, _) =>
        {
            StopSpeech();

            SaveCurrent();

            _hotkeys?.Dispose();
        };
    }


    // =========================================================
    // WINDOW / POSITION
    // =========================================================

    private void PersistGeo()
    {
        if (!IsLoaded)
            return;

        _settings.WindowWidth = Width;
        _settings.WindowHeight = Height;

        _settings.WindowLeft = Left;
        _settings.WindowTop = Top;
    }


    // =========================================================
    // HOTKEY LABELS
    // =========================================================

    private void RefreshBindLabels()
    {
        ToggleBindBtn.Content =
            _settings.ToggleLabel;

        MicBindBtn.Content =
            _settings.MicLabel;

        MicFooterText.Text =
            $"Микрофон";
    }


    private void UpdateHotkeyHint()
    {
        HotkeyHintText();
    }


    private void HotkeyHintText()
    {
        // Оставляем информацию в статусе,
        // основной интерфейс показывает F5/F6 в footer.
    }


    // =========================================================
    // COMBO HELPERS
    // =========================================================

    private static void SelectComboByContent(
        ComboBox box,
        string value)
    {
        foreach (ComboBoxItem item in box.Items)
        {
            if (string.Equals(
                    item.Content?.ToString(),
                    value,
                    StringComparison.OrdinalIgnoreCase))
            {
                box.SelectedItem = item;
                return;
            }
        }

        if (box.Items.Count > 0)
            box.SelectedIndex = 0;
    }


    private static void SelectComboByTag(
        ComboBox box,
        string tag)
    {
        foreach (ComboBoxItem item in box.Items)
        {
            if (string.Equals(
                    item.Tag?.ToString(),
                    tag,
                    StringComparison.OrdinalIgnoreCase))
            {
                box.SelectedItem = item;
                return;
            }
        }

        if (box.Items.Count > 0)
            box.SelectedIndex = 0;
    }


    // =========================================================
    // HOTKEYS
    // =========================================================

    private void InitHotkeys()
    {
        _hwndSource =
            HwndSource.FromVisual(this) as HwndSource;

        if (_hwndSource is null)
            return;


        _hotkeys =
            new HotkeyService(
                _hwndSource.Handle);


        _hotkeys.Pressed += id =>
            Dispatcher.Invoke(() =>
            {
                if (id == HotkeyService.IdToggle)
                {
                    ToggleOverlay();
                }
                else if (id == HotkeyService.IdMic)
                {
                    ToggleSpeech();
                }
            });


        _hwndSource.AddHook(WndProc);

        ApplyHotkeys();
    }


    private IntPtr WndProc(
        IntPtr h,
        int msg,
        IntPtr w,
        IntPtr l,
        ref bool handled)
    {
        if (msg == 0x0312)
        {
            _hotkeys?.Handle(
                w.ToInt32());

            handled = true;
        }

        return IntPtr.Zero;
    }


    private void ApplyHotkeys()
    {
        if (_hotkeys is null)
            return;


        var ok =
            _hotkeys.Register(
                _settings.ToggleHotkeyVk,
                _settings.ToggleHotkeyMods,
                _settings.MicHotkeyVk,
                _settings.MicHotkeyMods);


        StatusText.Text =
            ok
                ? $"Готов к работе · {_settings.ToggleLabel} Overlay · {_settings.MicLabel} Mic"
                : "Один из биндов занят — проверь настройки";


        UpdateHotkeyHint();
    }


    private void ToggleOverlay()
    {
        if (Visibility ==
            Visibility.Visible)
        {
            Hide();
        }
        else
        {
            Show();

            Activate();

            Question.Focus();
        }
    }


    // =========================================================
    // CATALOG
    // =========================================================

    private void FillServers(
        string project)
    {
        if (ServerBox is null)
            return;


        if (string.IsNullOrWhiteSpace(project))
            project = "GTA5RP";


        ServerBox.Items.Clear();


        var servers =
            _catalog.TryGetValue(
                project,
                out var cfg)
                ? cfg.Servers
                : FallbackServers.GetValueOrDefault(
                    project,
                    Array.Empty<string>());


        foreach (var server in servers)
            ServerBox.Items.Add(server);


        if (!string.IsNullOrWhiteSpace(
                _settings.Server) &&
            ServerBox.Items.Contains(
                _settings.Server))
        {
            ServerBox.SelectedItem =
                _settings.Server;
        }
        else if (ServerBox.Items.Count > 0)
        {
            ServerBox.SelectedIndex = 0;
        }
    }


    private async Task LoadCatalogAsync()
    {
        try
        {
            var catalog =
                await _api.GetCatalogAsync();


            if (catalog?.Projects is null ||
                catalog.Projects.Count == 0)
                return;


            _catalog =
                catalog.Projects;


            var currentProject =
                _settings.Project;


            ProjectBox.Items.Clear();


            foreach (var key in _catalog.Keys)
            {
                ProjectBox.Items.Add(
                    new ComboBoxItem
                    {
                        Content = key
                    });
            }


            SelectComboByContent(
                ProjectBox,
                currentProject);


            FillServers(
                CurrentProject());


            StatusText.Text =
                "Каталог серверов обновлён";
        }
        catch
        {
            StatusText.Text =
                "Работаю с сохранённым каталогом";
        }
    }


    private void ProjectBox_Changed(
        object sender,
        SelectionChangedEventArgs e)
    {
        if (!IsInitialized)
            return;


        if (ProjectBox is null ||
            ServerBox is null)
            return;


        if (ProjectBox.SelectedItem
            is ComboBoxItem item)
        {
            var project =
                item.Content?.ToString();


            if (string.IsNullOrWhiteSpace(project))
                return;


            FillServers(project);
        }
    }


    private string CurrentProject()
    {
        return
            (ProjectBox.SelectedItem
                as ComboBoxItem)
                ?.Content?.ToString()
            ?? "GTA5RP";
    }


    private string CurrentMode()
    {
        return
            (ModeBox.SelectedItem
                as ComboBoxItem)
                ?.Tag?.ToString()
            ?? "rules";
    }


    private string CurrentServer()
    {
        return
            ServerBox.SelectedItem?.ToString()
            ?? ServerBox.Text
            ?? "";
    }


    // =========================================================
    // SETTINGS
    // =========================================================

    private void SaveCurrent()
    {
        _settings.Project =
            CurrentProject();

        _settings.Server =
            CurrentServer();

        _settings.Mode =
            CurrentMode();

        _settings.Opacity =
            Opacity;

        _settings.AlwaysOnTop =
            Topmost;

        _settings.ClickThrough =
            ClickThroughBox.IsChecked == true;


        PersistGeo();

        _settings.Save();
    }


    private void SettingsBtn_Click(
        object sender,
        RoutedEventArgs e)
    {
        var open =
            SettingsPanel.Visibility !=
            Visibility.Visible;


        SettingsPanel.Visibility =
            open
                ? Visibility.Visible
                : Visibility.Collapsed;


        HomeScroll.Visibility =
            open
                ? Visibility.Collapsed
                : Visibility.Visible;


        AnswerView.Visibility =
            Visibility.Collapsed;


        if (open)
        {
            OpacitySlider.Value =
                Opacity;

            ClickThroughBox.IsChecked =
                _settings.ClickThrough;


            RefreshBindLabels();

            BindCaptureHint.Text = "";

            _capture =
                CaptureTarget.None;


            HistoryList.ItemsSource = null;

            HistoryList.ItemsSource =
                _settings.History;
        }
    }


    private void OpacitySlider_Changed(
        object sender,
        RoutedPropertyChangedEventArgs<double> e)
    {
        if (!IsLoaded)
            return;


        Opacity =
            OpacitySlider.Value;


        OpacityLabel.Text =
            $"{(int)(Opacity * 100)}%";
    }


    private void SizeDown_Click(
        object s,
        RoutedEventArgs e)
    {
        Width =
            Math.Max(
                MinWidth,
                Width - 40);

        Height =
            Math.Max(
                MinHeight,
                Height - 40);
    }


    private void SizeUp_Click(
        object s,
        RoutedEventArgs e)
    {
        Width =
            Math.Min(
                1400,
                Width + 40);

        Height =
            Math.Min(
                1000,
                Height + 40);
    }


    private void SizeReset_Click(
        object s,
        RoutedEventArgs e)
    {
        Width =
            DefaultW;

        Height =
            DefaultH;
    }


    // =========================================================
    // ASK / API
    // =========================================================

    private async void Ask()
    {
        var q =
            Question.Text.Trim();


        if (q.Length == 0)
            return;


        StopSpeech();


        ShowAnswerView();


        AnswerTitle.Text =
            "Ищу информацию…";

        AnswerSubtitle.Text =
            "Проверяю официальную базу GTA5RP";


        Answer.Text =
            "Секунду — ищу актуальный источник и готовлю короткий ответ…";


        SourceText.Text =
            "Официальная база GTA5RP";


        PenaltyCard.Visibility =
            Visibility.Collapsed;


        SendBtn.IsEnabled = false;

        StatusDot.Foreground =
            new SolidColorBrush(
                Color.FromRgb(
                    244,
                    185,
                    94));


        StatusText.Text =
            "Проверяю официальную базу…";


        try
        {
            var r =
                await _api.AskAsync(
                    new AskRequest(
                        CurrentProject(),
                        CurrentServer(),
                        CurrentMode(),
                        q));


            RenderAnswer(
                r,
                q);


            _settings.PushHistory(q);


            HistoryList.ItemsSource = null;

            HistoryList.ItemsSource =
                _settings.History;


            SaveCurrent();


            StatusDot.Foreground =
                new SolidColorBrush(
                    Color.FromRgb(
                        53,
                        212,
                        154));


            StatusText.Text =
                "Готово · источник найден";
        }
        catch (Exception ex)
        {
            AnswerTitle.Text =
                "Не удалось получить ответ";

            AnswerSubtitle.Text =
                "Проверь подключение к интернету";


            Answer.Text =
                ex.Message;


            SourceText.Text =
                "Ошибка соединения";


            StatusDot.Foreground =
                new SolidColorBrush(
                    Color.FromRgb(
                        255,
                        92,
                        112));


            StatusText.Text =
                "Ошибка запроса";
        }
        finally
        {
            SendBtn.IsEnabled = true;
        }
    }


    private void RenderAnswer(
        dynamic r,
        string question)
    {
        var raw =
            r?.Answer?.ToString()
            ?? "";


        if (string.IsNullOrWhiteSpace(raw))
            raw =
                "Источник найден, но ответ пуст.";


        var lines =
            raw
                .Replace("\r\n", "\n")
                .Split('\n');


        string title =
            "";

        string body =
            raw;


        /*
         * Пытаемся красиво разобрать
         * ответы backend.
         */

        foreach (var line in lines)
        {
            var clean =
                line
                    .Replace("**", "")
                    .Trim();


            if (clean.StartsWith(
                    "Статья ",
                    StringComparison.OrdinalIgnoreCase))
            {
                title =
                    clean;

                break;
            }
        }


        if (string.IsNullOrWhiteSpace(title))
        {
            title =
                "Ответ по официальной базе";
        }


        AnswerTitle.Text =
            title;


        AnswerSubtitle.Text =
            question;


        /*
         * Наказание.
         *
         * Берём только уже существующее
         * значение из ответа API.
         * Никаких собственных конвертаций.
         */

        var penalty =
            ExtractPenalty(raw);


        if (!string.IsNullOrWhiteSpace(penalty))
        {
            PenaltyText.Text =
                penalty;

            PenaltyCard.Visibility =
                Visibility.Visible;
        }
        else
        {
            PenaltyCard.Visibility =
                Visibility.Collapsed;
        }


        Answer.Text =
            CleanAnswerText(raw);


        var sourceLines =
            new List<string>();


        if (r?.Sources is IEnumerable<object> sources)
        {
            foreach (var source in sources)
            {
                if (source is null)
                    continue;

                var text =
                    source.ToString();

                if (!string.IsNullOrWhiteSpace(text))
                    sourceLines.Add(text);
            }
        }


        if (sourceLines.Count > 0)
        {
            SourceText.Text =
                string.Join(
                    "\n",
                    sourceLines);
        }
        else
        {
            SourceText.Text =
                "Официальный форум GTA5RP";
        }
    }


    private static string CleanAnswerText(
        string text)
    {
        var result =
            text
                .Replace("**", "")
                .Replace("__", "");


        var lines =
            result
                .Replace("\r\n", "\n")
                .Split('\n')
                .ToList();


        lines.RemoveAll(
            x =>
                string.IsNullOrWhiteSpace(
                    x.Trim()));


        /*
         * Не дублируем отдельную карточку
         * наказания внутри основного текста.
         */

        lines.RemoveAll(
            x =>
                x.Contains(
                    "Наказание:",
                    StringComparison.OrdinalIgnoreCase));


        lines.RemoveAll(
            x =>
                x.Contains(
                    "Игровой эквивалент:",
                    StringComparison.OrdinalIgnoreCase));


        lines.RemoveAll(
            x =>
                x.StartsWith(
                    "Основание:",
                    StringComparison.OrdinalIgnoreCase));


        return string.Join(
            "\n",
            lines);
    }


    private static string? ExtractPenalty(
        string text)
    {
        var lower =
            text.ToLowerInvariant();


        var marker =
            "наказание:";


        var index =
            lower.IndexOf(marker);


        if (index < 0)
            return null;


        var part =
            text[(index + marker.Length)..];


        var lines =
            part
                .Replace("\r\n", "\n")
                .Split('\n');


        foreach (var line in lines)
        {
            var clean =
                line
                    .Replace("**", "")
                    .Trim();


            if (string.IsNullOrWhiteSpace(clean))
                continue;


            if (clean.StartsWith(
                    "игровой эквивалент",
                    StringComparison.OrdinalIgnoreCase))
                break;


            if (clean.StartsWith(
                    "основание",
                    StringComparison.OrdinalIgnoreCase))
                break;


            if (clean.Length > 2)
                return clean;
        }


        return null;
    }


    // =========================================================
    // QUESTION INPUT
    // =========================================================

    private void Question_KeyDown(
        object sender,
        KeyEventArgs e)
    {
        if (e.Key == Key.Enter &&
            !Keyboard.Modifiers.HasFlag(
                ModifierKeys.Shift))
        {
            e.Handled = true;

            Ask();
        }
    }


    private void SendBtn_Click(
        object sender,
        RoutedEventArgs e)
    {
        Ask();
    }


    // =========================================================
    // QUICK ACTIONS
    // =========================================================

    private void ArticleQuick_Click(
        object sender,
        RoutedEventArgs e)
    {
        SelectMode("laws");

        Question.Text =
            "17.1 УК";

        Question.Focus();

        Question.CaretIndex =
            Question.Text.Length;
    }


    private void RulesQuick_Click(
        object sender,
        RoutedEventArgs e)
    {
        SelectMode("rules");

        Question.Text =
            "Правила сервера";

        Question.Focus();

        Question.CaretIndex =
            Question.Text.Length;
    }


    private void TermsQuick_Click(
        object sender,
        RoutedEventArgs e)
    {
        SelectMode("rules");

        Question.Text =
            "Что такое DB?";

        Question.Focus();

        Question.CaretIndex =
            Question.Text.Length;
    }


    private void HistoryQuick_Click(
        object sender,
        RoutedEventArgs e)
    {
        SettingsBtn_Click(
            sender,
            e);
    }


    private void Popular_Click(
        object sender,
        RoutedEventArgs e)
    {
        if (sender is not Button btn)
            return;


        var text =
            btn.Content?.ToString()
            ?? "";


        if (text.Equals(
                "17.1 УК",
                StringComparison.OrdinalIgnoreCase))
        {
            SelectMode("laws");
        }
        else
        {
            SelectMode("rules");
        }


        Question.Text =
            text;


        Question.Focus();

        Question.CaretIndex =
            Question.Text.Length;


        Ask();
    }


    private void SelectMode(
        string mode)
    {
        SelectComboByTag(
            ModeBox,
            mode);
    }


    // =========================================================
    // ANSWER VIEW
    // =========================================================

    private void ShowAnswerView()
    {
        HomeScroll.Visibility =
            Visibility.Collapsed;

        SettingsPanel.Visibility =
            Visibility.Collapsed;

        AnswerView.Visibility =
            Visibility.Visible;
    }


    private void BackHome_Click(
        object sender,
        RoutedEventArgs e)
    {
        AnswerView.Visibility =
            Visibility.Collapsed;

        HomeScroll.Visibility =
            Visibility.Visible;

        Question.Focus();
    }


    // =========================================================
    // WINDOW
    // =========================================================

    private void CloseBtn_Click(
        object sender,
        RoutedEventArgs e)
    {
        Hide();
    }


    private void Border_MouseLeftButtonDown(
        object sender,
        MouseButtonEventArgs e)
    {
        if (e.ChangedButton ==
                MouseButton.Left &&
            _capture ==
                CaptureTarget.None)
        {
            try
            {
                DragMove();
            }
            catch
            {
                // ignore
            }
        }
    }


    // =========================================================
    // COPY
    // =========================================================

    private void Copy_Click(
        object sender,
        RoutedEventArgs e)
    {
        try
        {
            Clipboard.SetText(
                Answer.Text ?? "");

            StatusText.Text =
                "Ответ скопирован";
        }
        catch
        {
            StatusText.Text =
                "Не удалось скопировать";
        }
    }


    // =========================================================
    // PIN
    // =========================================================

    private void Pin_Click(
        object sender,
        RoutedEventArgs e)
    {
        Topmost =
            !Topmost;


        _settings.AlwaysOnTop =
            Topmost;


        StatusText.Text =
            Topmost
                ? "Поверх всех окон"
                : "Обычный режим";
    }


    // =========================================================
    // BIND CAPTURE
    // =========================================================

    private void ToggleBindBtn_Click(
        object s,
        RoutedEventArgs e)
    {
        _capture =
            CaptureTarget.Toggle;


        ToggleBindBtn.Content =
            "…";


        BindCaptureHint.Text =
            "Нажми клавишу для оверлея · Esc — отмена";
    }


    private void MicBindBtn_Click(
        object s,
        RoutedEventArgs e)
    {
        _capture =
            CaptureTarget.Mic;


        MicBindBtn.Content =
            "…";


        BindCaptureHint.Text =
            "Нажми клавишу для микрофона · Esc — отмена";
    }


    private void OnPreviewKeyDown(
        object sender,
        KeyEventArgs e)
    {
        if (_capture ==
            CaptureTarget.None)
            return;


        if (e.Key ==
            Key.Escape)
        {
            _capture =
                CaptureTarget.None;


            RefreshBindLabels();


            BindCaptureHint.Text =
                "Отменено";


            e.Handled = true;

            return;
        }


        if (e.Key is
            Key.LeftCtrl or
            Key.RightCtrl or
            Key.LeftAlt or
            Key.RightAlt or
            Key.LeftShift or
            Key.RightShift or
            Key.LWin or
            Key.RWin or
            Key.System)
        {
            return;
        }


        var key =
            e.Key == Key.System
                ? e.SystemKey
                : e.Key;


        var vk =
            HotkeyService.FromWpfKey(
                key);


        var mods =
            HotkeyService.ModsFromWpf(
                Keyboard.Modifiers);


        if (_capture ==
            CaptureTarget.Toggle)
        {
            _settings.ToggleHotkeyVk =
                vk;

            _settings.ToggleHotkeyMods =
                mods;
        }
        else
        {
            _settings.MicHotkeyVk =
                vk;

            _settings.MicHotkeyMods =
                mods;
        }


        _capture =
            CaptureTarget.None;


        RefreshBindLabels();


        BindCaptureHint.Text =
            "Выбрано · нажми «Сохранить»";


        e.Handled = true;
    }


    private void SaveSettings_Click(
        object sender,
        RoutedEventArgs e)
    {
        _settings.Opacity =
            OpacitySlider.Value;


        Opacity =
            _settings.Opacity;


        _settings.ClickThrough =
            ClickThroughBox.IsChecked == true;


        ApplyClickThrough(
            _settings.ClickThrough);


        SaveCurrent();

        ApplyHotkeys();


        BindCaptureHint.Text =
            "Настройки сохранены";
    }


    private void ResetBinds_Click(
        object sender,
        RoutedEventArgs e)
    {
        /*
         * F5 = 0x74
         * F6 = 0x75
         */

        _settings.ToggleHotkeyVk =
            0x74;

        _settings.ToggleHotkeyMods =
            0;


        _settings.MicHotkeyVk =
            0x75;

        _settings.MicHotkeyMods =
            0;


        RefreshBindLabels();


        ApplyHotkeys();


        BindCaptureHint.Text =
            "F5 — Overlay · F6 — микрофон";
    }


    // =========================================================
    // HISTORY
    // =========================================================

    private void HistoryList_DoubleClick(
        object sender,
        MouseButtonEventArgs e)
    {
        if (HistoryList.SelectedItem
            is string q)
        {
            Question.Text =
                q;


            SettingsPanel.Visibility =
                Visibility.Collapsed;

            HomeScroll.Visibility =
                Visibility.Visible;

            AnswerView.Visibility =
                Visibility.Collapsed;


            Question.Focus();
        }
    }


    // =========================================================
    // UPDATE
    // =========================================================

    private async Task CheckUpdateAsync()
    {
        try
        {
            var v =
                await _api.GetVersionAsync();


            if (v?.Version is null)
                return;


            if (Version.TryParse(
                    v.Version,
                    out var remote) &&
                Version.TryParse(
                    AppConfig.AppVersion,
                    out var local) &&
                remote > local)
            {
                UpdateLabel.Text =
                    $"Доступно обновление {v.Version}.";


                if (!string.IsNullOrEmpty(
                        v.DownloadUrl))
                {
                    UpdateLabel.Text +=
                        $"\n{v.DownloadUrl}";
                }
            }
        }
        catch
        {
            // Обновление не должно ломать запуск.
        }
    }


    // =========================================================
    // MICROPHONE
    // =========================================================

    private void MicBtn_Click(
        object sender,
        RoutedEventArgs e)
    {
        ToggleSpeech();
    }


    private void ToggleSpeech()
    {
        if (_isListening)
        {
            StopSpeech();
            return;
        }


        StartSpeech();
    }


    private void StartSpeech()
    {
        try
        {
            if (_speech is null)
            {
                InitializeSpeech();
            }


            if (_speech is null)
            {
                StatusText.Text =
                    "Не удалось подключить распознавание речи";

                return;
            }


            _isListening = true;


            MicBtn.Content =
                "🔴";


            StatusDot.Foreground =
                new SolidColorBrush(
                    Color.FromRgb(
                        255,
                        92,
                        112));


            StatusText.Text =
                "Слушаю… говори";


            _speech.RecognizeAsync(
                RecognizeMode.Multiple);
        }
        catch (Exception ex)
        {
            _isListening = false;

            MicBtn.Content =
                "🎙";


            StatusText.Text =
                $"Микрофон: {ex.Message}";
        }
    }


    private void InitializeSpeech()
    {
        /*
         * Сначала пытаемся найти русский
         * распознаватель Windows.
         */

        var installed =
            SpeechRecognitionEngine
                .InstalledRecognizers();


        var russian =
            installed.FirstOrDefault(
                x =>
                    x.Culture.Name.Equals(
                        "ru-RU",
                        StringComparison.OrdinalIgnoreCase));


        var info =
            russian
            ?? installed.FirstOrDefault();


        if (info is null)
        {
            MessageBox.Show(
                "В Windows не найден установленный голосовой распознаватель.\n\n" +
                "Добавь русский язык и пакет распознавания речи в параметрах Windows.",
                AppConfig.AppName,
                MessageBoxButton.OK,
                MessageBoxImage.Information);

            return;
        }


        _speech =
            new SpeechRecognitionEngine(
                info);


        _speech.LoadGrammar(
            new DictationGrammar());


        _speech.SpeechRecognized +=
            Speech_SpeechRecognized;


        _speech.RecognizeCompleted +=
            Speech_RecognizeCompleted;


        _speech.SetInputToDefaultAudioDevice();
    }


    private void Speech_SpeechRecognized(
        object? sender,
        SpeechRecognizedEventArgs e)
    {
        if (e.Result is null)
            return;


        /*
         * Отбрасываем совсем неуверенное
         * распознавание.
         */

        if (e.Result.Confidence < 0.45)
            return;


        Dispatcher.Invoke(() =>
        {
            var recognized =
                e.Result.Text.Trim();


            if (recognized.Length == 0)
                return;


            if (Question.Text.Length > 0 &&
                !Question.Text.EndsWith(" "))
            {
                Question.Text += " ";
            }


            Question.Text +=
                recognized;


            Question.CaretIndex =
                Question.Text.Length;
        });
    }


    private void Speech_RecognizeCompleted(
        object? sender,
        RecognizeCompletedEventArgs e)
    {
        Dispatcher.Invoke(() =>
        {
            if (!_isListening)
                return;


            /*
             * Не перезапускаем после ошибки.
             * Пользователь может снова нажать F6.
             */

            if (e.Error is not null)
            {
                _isListening = false;

                MicBtn.Content =
                    "🎙";


                StatusDot.Foreground =
                    new SolidColorBrush(
                        Color.FromRgb(
                            53,
                            212,
                            154));


                StatusText.Text =
                    "Микрофон остановлен";
            }
        });
    }


    private void StopSpeech()
    {
        try
        {
            _isListening = false;


            if (_speech is not null)
            {
                try
                {
                    _speech.RecognizeAsyncStop();
                }
                catch
                {
                    // ignore
                }
            }


            MicBtn.Content =
                "🎙";


            StatusDot.Foreground =
                new SolidColorBrush(
                    Color.FromRgb(
                        53,
                        212,
                        154));


            if (StatusText.Text
                .StartsWith(
                    "Слушаю",
                    StringComparison.OrdinalIgnoreCase))
            {
                StatusText.Text =
                    "Готов к работе";
            }
        }
        catch
        {
            // ignore
        }
    }


    // =========================================================
    // CLICK THROUGH
    // =========================================================

    private const int GwlExStyle = -20;
    private const int WsExTransparent = 0x20;
    private const int WsExLayered = 0x80000;


    [DllImport("user32.dll")]
    private static extern int GetWindowLong(
        IntPtr h,
        int n);


    [DllImport("user32.dll")]
    private static extern int SetWindowLong(
        IntPtr h,
        int n,
        int v);


    private void ApplyClickThrough(
        bool enable)
    {
        var hwnd =
            new WindowInteropHelper(
                this).Handle;


        if (hwnd == IntPtr.Zero)
            return;


        var ex =
            GetWindowLong(
                hwnd,
                GwlExStyle);


        if (enable)
        {
            SetWindowLong(
                hwnd,
                GwlExStyle,
                ex |
                WsExTransparent |
                WsExLayered);
        }
        else
        {
            SetWindowLong(
                hwnd,
                GwlExStyle,
                (ex | WsExLayered) &
                ~WsExTransparent);
        }


        StatusText.Text =
            enable
                ? "Клик насквозь включён"
                : "Клик насквозь выключен";
    }
}
