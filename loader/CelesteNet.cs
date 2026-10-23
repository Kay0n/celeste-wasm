using System;
using System.Collections;
using System.Reflection;
using System.Runtime.InteropServices.JavaScript;
using System.Threading.Tasks;

// CelesteNet never connects on its own when the game starts, so the site's
// "Connect to CelesteNet" setting is applied (and read back) from here.
public static partial class CelesteLoader
{
    const string CelesteNetModule = "Celeste.Mod.CelesteNet.Client.CelesteNetClientModule";

    // CelesteNet's settings object, or null if the mod isn't loaded (yet) or
    // the game is still on its loading screen.
    static object GetCelesteNetSettings()
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
        {
            var type = module.GetType();
            if (type.FullName != CelesteNetModule) continue;
            return type.GetProperty("Settings", BindingFlags.Public | BindingFlags.Static)?.GetValue(null);
        }
        return null;
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
            var schedule = celeste.GetType("Celeste.Mod.MainThreadHelper")
                ?.GetMethod("Do", BindingFlags.Public | BindingFlags.Static, [typeof(Action)]);
            if (schedule != null) schedule.Invoke(null, [apply]);
            else apply();

            return Task.FromResult(true);
        }
        catch (Exception e)
        {
            Console.Error.WriteLine("Failed to toggle CelesteNet:");
            Console.Error.WriteLine(e);
            return Task.FromResult(false);
        }
    }
}
