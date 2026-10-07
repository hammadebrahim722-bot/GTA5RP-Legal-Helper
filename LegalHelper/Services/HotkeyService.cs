using System.Runtime.InteropServices;
using System.Text;

namespace LegalHelper.Services;

public sealed class HotkeyService : IDisposable
{
    [DllImport("user32.dll")]
    private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

    [DllImport("user32.dll")]
    private static extern bool UnregisterHotKey(IntPtr hWnd, int id);

    public const int IdToggle = 1001;
    public const int IdMic = 1002;

    // MOD_* flags
    public const uint ModNone = 0;
    public const uint ModAlt = 0x0001;
    public const uint ModControl = 0x0002;
    public const uint ModShift = 0x0004;
    public const uint ModWin = 0x0008;
    public const uint ModNoRepeat = 0x4000;

    private readonly IntPtr _hwnd;
    private bool _registered;
    public event Action<int>? Pressed;

    public HotkeyService(IntPtr hwnd) => _hwnd = hwnd;

    public bool Register(uint toggleVk, uint toggleMods, uint micVk, uint micMods)
    {
        Unregister();
        var ok1 = RegisterHotKey(_hwnd, IdToggle, toggleMods | ModNoRepeat, toggleVk);
        var ok2 = RegisterHotKey(_hwnd, IdMic, micMods | ModNoRepeat, micVk);
        _registered = ok1 || ok2;
        return ok1 && ok2;
    }

    public void Handle(int id) => Pressed?.Invoke(id);

    public void Unregister()
    {
        if (!_registered) return;
        UnregisterHotKey(_hwnd, IdToggle);
        UnregisterHotKey(_hwnd, IdMic);
        _registered = false;
    }

    public void Dispose() => Unregister();

    /// <summary>Human-readable label, e.g. "Ctrl+Shift+F9".</summary>
    public static string Format(uint vk, uint mods)
    {
        var sb = new StringBuilder();
        if ((mods & ModControl) != 0) sb.Append("Ctrl+");
        if ((mods & ModAlt) != 0) sb.Append("Alt+");
        if ((mods & ModShift) != 0) sb.Append("Shift+");
        if ((mods & ModWin) != 0) sb.Append("Win+");
        sb.Append(VkName(vk));
        return sb.ToString();
    }

    public static string VkName(uint vk) => vk switch
    {
        0x70 => "F1", 0x71 => "F2", 0x72 => "F3", 0x73 => "F4",
        0x74 => "F5", 0x75 => "F6", 0x76 => "F7", 0x77 => "F8",
        0x78 => "F9", 0x79 => "F10", 0x7A => "F11", 0x7B => "F12",
        0x20 => "Space", 0x0D => "Enter", 0x09 => "Tab",
        0x2E => "Delete", 0x2D => "Insert", 0x24 => "Home", 0x23 => "End",
        0x21 => "PageUp", 0x22 => "PageDown",
        >= 0x30 and <= 0x39 => ((char)vk).ToString(),
        >= 0x41 and <= 0x5A => ((char)vk).ToString(),
        _ => $"VK_{vk:X2}",
    };

    /// <summary>Map WPF Key to Win32 VK.</summary>
    public static uint FromWpfKey(System.Windows.Input.Key key)
    {
        return (uint)System.Windows.Input.KeyInterop.VirtualKeyFromKey(key);
    }

    public static uint ModsFromWpf(System.Windows.Input.ModifierKeys m)
    {
        uint r = 0;
        if (m.HasFlag(System.Windows.Input.ModifierKeys.Control)) r |= ModControl;
        if (m.HasFlag(System.Windows.Input.ModifierKeys.Alt)) r |= ModAlt;
        if (m.HasFlag(System.Windows.Input.ModifierKeys.Shift)) r |= ModShift;
        if (m.HasFlag(System.Windows.Input.ModifierKeys.Windows)) r |= ModWin;
        return r;
    }
}
