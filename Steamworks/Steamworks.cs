using System;
using System.Runtime.InteropServices.JavaScript;

namespace Steamworks
{
    partial class SteamJS
    {
        [JSImport("GetAchievement", "SteamJS")]
        public static partial bool GetAchievement(string achievement);
        [JSImport("SetAchievement", "SteamJS")]
        public static partial void SetAchievement(string achievement);

        [JSImport("GetStat", "SteamJS")]
        public static partial int GetStat(string stat);
        [JSImport("SetStat", "SteamJS")]
        public static partial void SetStat(string stat, int value);
    }

    public class SteamAPI
    {
        public static void RunCallbacks()
        {
        }

        public static bool RestartAppIfNecessary(AppId_t app)
        {
            return false;
        }

        public static bool Init()
        {
            return true;
        }
    }

    public class SteamApps
    {
        public static string GetCurrentGameLanguage()
        {
            return "english";
        }
    }

    public class SteamUserStats
    {
        public static bool GetAchievement(string achievement, out bool achieved)
        {
            achieved = SteamJS.GetAchievement(achievement);
            return true;
        }
        public static bool SetAchievement(string achievement)
        {
            SteamJS.SetAchievement(achievement);
            return true;
        }

        public static bool GetStat(string stat, out int val)
        {
            val = SteamJS.GetStat(stat);
            return true;
        }
        public static bool SetStat(string stat, int val)
        {
            SteamJS.SetStat(stat, val);
            return true;
        }
        public static bool GetGlobalStat(string stat, out long val)
        {
            val = SteamJS.GetStat(stat);
            return true;
        }
        public static bool StoreStats()
        {
            return true;
        }

        public static bool RequestCurrentStats()
        {
            return true;
        }
        public static SteamAPICall_t RequestGlobalStats(int param)
        {
            return SteamAPICall_t.Invalid;
        }
    }

    [System.Serializable]
    public struct SteamAPICall_t : System.IEquatable<SteamAPICall_t>, System.IComparable<SteamAPICall_t>
    {
        public static readonly SteamAPICall_t Invalid = new SteamAPICall_t(0x0);
        public ulong m_SteamAPICall;

        public SteamAPICall_t(ulong value)
        {
            m_SteamAPICall = value;
        }

        public override string ToString()
        {
            return m_SteamAPICall.ToString();
        }

        public override bool Equals(object other)
        {
            return other is SteamAPICall_t && this == (SteamAPICall_t)other;
        }

        public override int GetHashCode()
        {
            return m_SteamAPICall.GetHashCode();
        }

        public static bool operator ==(SteamAPICall_t x, SteamAPICall_t y)
        {
            return x.m_SteamAPICall == y.m_SteamAPICall;
        }

        public static bool operator !=(SteamAPICall_t x, SteamAPICall_t y)
        {
            return !(x == y);
        }

        public static explicit operator SteamAPICall_t(ulong value)
        {
            return new SteamAPICall_t(value);
        }

        public static explicit operator ulong(SteamAPICall_t that)
        {
            return that.m_SteamAPICall;
        }

        public bool Equals(SteamAPICall_t other)
        {
            return m_SteamAPICall == other.m_SteamAPICall;
        }

        public int CompareTo(SteamAPICall_t other)
        {
            return m_SteamAPICall.CompareTo(other.m_SteamAPICall);
        }
    }

    [System.Serializable]
    public struct AppId_t : System.IEquatable<AppId_t>, System.IComparable<AppId_t>
    {
        public static readonly AppId_t Invalid = new AppId_t(0x0);
        public uint m_AppId;

        public AppId_t(uint value)
        {
            m_AppId = value;
        }

        public override string ToString()
        {
            return m_AppId.ToString();
        }

        public override bool Equals(object other)
        {
            return other is AppId_t && this == (AppId_t)other;
        }

        public override int GetHashCode()
        {
            return m_AppId.GetHashCode();
        }

        public static bool operator ==(AppId_t x, AppId_t y)
        {
            return x.m_AppId == y.m_AppId;
        }

        public static bool operator !=(AppId_t x, AppId_t y)
        {
            return !(x == y);
        }

        public static explicit operator AppId_t(uint value)
        {
            return new AppId_t(value);
        }

        public static explicit operator uint(AppId_t that)
        {
            return that.m_AppId;
        }

        public bool Equals(AppId_t other)
        {
            return m_AppId == other.m_AppId;
        }

        public int CompareTo(AppId_t other)
        {
            return m_AppId.CompareTo(other.m_AppId);
        }
    }
}
