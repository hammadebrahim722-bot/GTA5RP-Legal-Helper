using System.IO;
using System.Text.Json;

namespace LegalHelper.Services;

public sealed class SettingsService
{
    public string Project { get; set; } = "GTA5RP";
    public string Server { get; set; } = "Downtown · #1";
    public string Mode { get; set; } = "rules";
    public double Opacity { get; set; } = 0.94;
    public double WindowWidth { get; set; } = 480;
    public double WindowHeight { get; set; } = 560;
    public double? WindowLeft { get; set; }
    public double? WindowTop { get; set; }
    public bool ClickThrough { get; set; }
    public bool AlwaysOnTop { get; set; } = true;

    public uint ToggleHotkeyVk { get; set; } = 0x78;
    public uint ToggleHotkeyMods { get; set; } = 0;
    public uint MicHotkeyVk { get; set; } = 0x79;
    public uint MicHotkeyMods { get; set; } = 0;

    public List<string> History { get; set; } = new();

    public static string Path =>
        System.IO.Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "GTA5RP Legal Helper",
            "settings.json");

    public static SettingsService Load()
    {
        try
        {
            return JsonSerializer.Deserialize<SettingsService>(File.ReadAllText(Path)) ?? new();
        }
        catch { return new(); }
    }

    public void Save()
    {
        Directory.CreateDirectory(System.IO.Path.GetDirectoryName(Path)!);
        if (History.Count > 30) History = History.Take(30).ToList();
        File.WriteAllText(Path, JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true }));
    }

    public string ToggleLabel => HotkeyService.Format(ToggleHotkeyVk, ToggleHotkeyMods);
    public string MicLabel => HotkeyService.Format(MicHotkeyVk, MicHotkeyMods);

    public void PushHistory(string q)
    {
        q = q.Trim();
        if (q.Length == 0) return;
        History.RemoveAll(x => string.Equals(x, q, StringComparison.OrdinalIgnoreCase));
        History.Insert(0, q);
        if (History.Count > 30) History = History.Take(30).ToList();
    }
}
