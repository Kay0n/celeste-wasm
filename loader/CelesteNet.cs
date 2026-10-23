using System;
using System.Collections;
using System.Reflection;
using System.Runtime.InteropServices.JavaScript;
using System.Threading.Tasks;

// CelesteNet never connects on its own when the game starts, so the site's
// "Connect to CelesteNet" and "Username" settings are applied (and read back)
// from here.
public static partial class CelesteLoader
{
    const string CelesteNetModule = "Celeste.Mod.CelesteNet.Client.CelesteNetClientModule";

    // CelesteNet's module, or null if the mod isn't loaded (yet) or the game
    // is still on its loading screen.
    static object GetCelesteNetModule()
    {
        if (celeste == null) return null;

        var scene = celeste.GetType("Monocle.Engine")
            ?.GetProperty("Scene", BindingFlags.Public | BindingFlags.Static)
            ?.GetValue(null);
        if (scene == null || scene.GetType().FullName == "Celeste.GameLoader") return null;

        var modules = celeste.GetType("Celeste.Mod.Everest")
            ?.GetProperty("Modules", BindingFlags.Public | BindingFlags.Static)
            ?.GetValue(null) as IEnumerable;
        if (modules == null) return null;

        foreach (var module in modules)
            if (module.GetType().FullName == CelesteNetModule) return module;
        return null;
    }

    static object GetCelesteNetSettings()
    {
        return GetCelesteNetModule()?.GetType()
            .GetProperty("Settings", BindingFlags.Public | BindingFlags.Static)
            ?.GetValue(null);
    }

    // runs on the game's main thread, between frames
    static void OnCelesteMainThread(Action action)
    {
        var schedule = celeste.GetType("Celeste.Mod.MainThreadHelper")
            ?.GetMethod("Do", BindingFlags.Public | BindingFlags.Static, [typeof(Action)]);
        if (schedule != null) schedule.Invoke(null, [action]);
        else action();
    }

    // 1 if CelesteNet wants to be connected, 0 if not, -1 if it isn't ready.
    [JSExport]
    internal static Task<int> GetCelesteNet()
    {
        try
        {
            var settings = GetCelesteNetSettings();
            if (settings == null) return Task.FromResult(-1);
            var wants = (bool)settings.GetType().GetProperty("WantsToBeConnected").GetValue(settings);
            return Task.FromResult(wants ? 1 : 0);
        }
        catch
        {
            // Everest's module list can change under us while mods load
            return Task.FromResult(-1);
        }
    }

    // Returns false if CelesteNet isn't ready, so the caller can try again later.
    [JSExport]
    internal static Task<bool> SetCelesteNet(bool connect)
    {
        try
        {
            var settings = GetCelesteNetSettings();
            if (settings == null) return Task.FromResult(false);
            var connected = settings.GetType().GetProperty("Connected");

            // the setter starts/stops the client and updates the mod menu
            Action apply = () =>
            {
                try
                {
                    connected.SetValue(settings, connect);
                }
                catch (Exception e)
                {
                    Console.Error.WriteLine("Failed to toggle CelesteNet:");
                    Console.Error.WriteLine(e);
                }
            };
            OnCelesteMainThread(apply);
            return Task.FromResult(true);
        }
        catch (Exception e)
        {
            Console.Error.WriteLine("Failed to toggle CelesteNet:");
            Console.Error.WriteLine(e);
            return Task.FromResult(false);
        }
    }

    // The name CelesteNet logs in with as a guest, or null if it isn't ready.
    [JSExport]
    internal static Task<string> GetCelesteNetName()
    {
        try
        {
            var settings = GetCelesteNetSettings();
            return Task.FromResult(settings?.GetType().GetProperty("Name").GetValue(settings) as string);
        }
        catch
        {
            return Task.FromResult<string>(null);
        }
    }

    // Like the name option in the mod menu, this only takes effect on the next
    // connection. Returns false if CelesteNet isn't ready.
    [JSExport]
    internal static Task<bool> SetCelesteNetName(string name)
    {
        try
        {
            var module = GetCelesteNetModule();
            var settings = GetCelesteNetSettings();
            if (module == null || settings == null) return Task.FromResult(false);

            OnCelesteMainThread(() =>
            {
                try
                {
                    var type = settings.GetType();
                    if ((string)type.GetProperty("Name").GetValue(settings) == name) return;
                    type.GetProperty("Name").SetValue(settings, name);

                    // relabel the option if the mod menu is open
                    if (type.GetProperty("NameEntry")?.GetValue(settings) is { } entry)
                    {
                        var label = celeste.GetType("Celeste.Dialog")
                            ?.GetMethod("Clean", BindingFlags.Public | BindingFlags.Static, [typeof(string), celeste.GetType("Celeste.Language")])
                            ?.Invoke(null, ["modoptions_celestenetclient_name", null]) as string;
                        if (label != null)
                            entry.GetType().GetField("Label")?.SetValue(entry, label.Replace("((name))", name));
                    }

                    // otherwise it's only written when the game exits normally
                    module.GetType().GetMethod("SaveSettings", Type.EmptyTypes)?.Invoke(module, null);
                }
                catch (Exception e)
                {
                    Console.Error.WriteLine("Failed to set CelesteNet name:");
                    Console.Error.WriteLine(e);
                }
            });
            return Task.FromResult(true);
        }
        catch (Exception e)
        {
            Console.Error.WriteLine("Failed to set CelesteNet name:");
            Console.Error.WriteLine(e);
            return Task.FromResult(false);
        }
    }
}
