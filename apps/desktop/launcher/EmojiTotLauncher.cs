using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Windows.Forms;

[assembly: AssemblyTitle("EmojiTot")]
[assembly: AssemblyDescription("EmojiTot launcher")]
[assembly: AssemblyCompany("OneStar1107")]
[assembly: AssemblyProduct("EmojiTot")]
[assembly: AssemblyFileVersion("__BUILD_VERSION__")]
[assembly: AssemblyVersion("__BUILD_VERSION__")]

internal static class EmojiTotLauncher
{
    private const string LauncherName = "EmojiTot.exe";
    private const string RuntimeName = "EmojiTotRuntime.exe";
    private static string cacheAttempts = string.Empty;

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern uint GetShortPathName(string longPath, StringBuilder shortPath, uint bufferLength);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool SetEnvironmentVariable(string name, string value);

    [STAThread]
    private static int Main(string[] args)
    {
        string launcher = Assembly.GetExecutingAssembly().Location;
        string installDir = Path.GetDirectoryName(launcher);
        string runtime = Path.Combine(installDir, RuntimeName);
        if (!File.Exists(runtime))
        {
            Fail("EmojiTotRuntime.exe is missing. Reinstall EmojiTot.");
            return 1;
        }

        try
        {
            SetEnvironmentVariable("EMOJITOT_LAUNCHER", launcher);
            if (IsAscii(runtime))
                return Launch(runtime, installDir, args, launcher);

            string cached = StageRuntime(installDir, runtime);
            return Launch(cached, Path.GetDirectoryName(cached), args, launcher);
        }
        catch (Exception error)
        {
            Log("error=" + error);
            Fail("EmojiTot cannot use this install path.\r\n\r\n" + error.Message +
                 "\r\n\r\nMove the install to an ASCII-only folder or contact the developer.");
            return 1;
        }
    }

    private static int Launch(string executable, string workingDirectory, string[] args, string launcher)
    {
        var command = new StringBuilder(Quote(executable));
        foreach (string argument in args)
            command.Append(' ').Append(Quote(argument));

        SetEnvironmentVariable("EMOJITOT_LAUNCHER", launcher);
        var start = new ProcessStartInfo
        {
            FileName = executable,
            Arguments = command.ToString()
                .Substring(Quote(executable).Length)
                .TrimStart(),
            WorkingDirectory = workingDirectory,
            UseShellExecute = false,
            CreateNoWindow = false
        };
        using (Process child = Process.Start(start))
        {
            if (child == null) throw new InvalidOperationException("The EmojiTot runtime did not start.");
            child.WaitForExit();
            return child.ExitCode;
        }
    }

    private static string StageRuntime(string installDir, string runtime)
    {
        string baseDir = CacheBase();
        if (string.IsNullOrEmpty(baseDir))
            throw new InvalidOperationException(
                "No ASCII cache directory is available.\r\n" + cacheAttempts);

        string cache = Path.Combine(baseDir, "runtime-" + BuildKey(runtime));
        string cachedRuntime = Path.Combine(cache, RuntimeName);
        string marker = Path.Combine(cache, "runtime.complete");
        if (File.Exists(marker) && File.Exists(cachedRuntime))
        {
            PruneCaches(baseDir, cache);
            return cachedRuntime;
        }

        string staging = Path.Combine(
            baseDir,
            Path.GetFileName(cache) + ".staging-" + Process.GetCurrentProcess().Id);
        TryDeleteDirectory(staging);
        Directory.CreateDirectory(staging);
        try
        {
            CopyRuntimeTree(installDir, staging);
            File.WriteAllText(Path.Combine(staging, "runtime.complete"), "ok\r\n");
            TryDeleteDirectory(cache);
            Directory.Move(staging, cache);
        }
        catch
        {
            TryDeleteDirectory(staging);
            throw;
        }
        PruneCaches(baseDir, cache);
        return Path.Combine(cache, RuntimeName);
    }

    private static void CopyRuntimeTree(string source, string destination)
    {
        string prefix = source.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        foreach (string directory in Directory.GetDirectories(source, "*", SearchOption.AllDirectories))
        {
            string relative = directory.Substring(prefix.Length);
            Directory.CreateDirectory(Path.Combine(destination, relative));
        }
        foreach (string file in Directory.GetFiles(source, "*", SearchOption.AllDirectories))
        {
            string relative = file.Substring(prefix.Length);
            if (string.Equals(relative, LauncherName, StringComparison.OrdinalIgnoreCase)) continue;
            string target = Path.Combine(destination, relative);
            Directory.CreateDirectory(Path.GetDirectoryName(target));
            File.Copy(file, target, true);
        }
    }

    private static string CacheBase()
    {
        var attempts = new StringBuilder();
        string cacheOverride = Environment.GetEnvironmentVariable("EMOJITOT_CACHE_DIR");
        if (!string.IsNullOrWhiteSpace(cacheOverride))
        {
            try
            {
                string fullPath = Path.GetFullPath(cacheOverride.Trim());
                attempts.Append("[").Append(cacheOverride).Append("] -> [").Append(fullPath).Append("] ");
                if (IsAscii(fullPath))
                {
                    Directory.CreateDirectory(fullPath);
                    return fullPath;
                }
                attempts.Append("not ascii ");
            }
            catch (Exception error)
            {
                attempts.Append(error.GetType().Name).Append(": ").Append(error.Message).Append(" ");
            }
            cacheAttempts = attempts.ToString();
            return string.Empty;
        }

        string[] roots =
        {
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            Path.GetTempPath(),
            Path.Combine(Path.GetTempPath(), "Low"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "")
        };
        foreach (string root in roots)
        {
            string ascii = AsciiPath(root);
            attempts.Append("[").Append(root).Append("] -> [").Append(ascii).Append("] ");
            if (string.IsNullOrEmpty(ascii)) continue;
            string candidate = Path.Combine(ascii, "EmojiTot", "app-runtime");
            try
            {
                Directory.CreateDirectory(candidate);
                if (IsAscii(candidate)) return candidate;
                attempts.Append("not ascii ");
            }
            catch (Exception error)
            {
                attempts.Append(error.GetType().Name).Append(": ").Append(error.Message).Append(" ");
            }
        }
        Log("cache attempts " + attempts);
        cacheAttempts = attempts.ToString();
        return string.Empty;
    }

    private static string BuildKey(string runtime)
    {
        var file = new FileInfo(runtime);
        string material =
            Assembly.GetExecutingAssembly().GetName().Version +
            "|" + IntPtr.Size +
            "|" + file.Name +
            "|" + file.Length;
        using (var sha = SHA256.Create())
        {
            byte[] bytes = sha.ComputeHash(Encoding.Unicode.GetBytes(material));
            var text = new StringBuilder(16);
            for (int index = 0; index < 8; index++) text.Append(bytes[index].ToString("x2"));
            return text.ToString();
        }
    }

    private static string AsciiPath(string path)
    {
        if (string.IsNullOrEmpty(path)) return string.Empty;
        if (IsAscii(path)) return path;
        var buffer = new StringBuilder(32768);
        uint length = GetShortPathName(path, buffer, (uint)buffer.Capacity);
        if (length == 0 || length >= buffer.Capacity) return string.Empty;
        string shortPath = buffer.ToString();
        return IsAscii(shortPath) ? shortPath : string.Empty;
    }

    private static bool IsAscii(string value)
    {
        foreach (char ch in value)
            if (ch > 0x7f) return false;
        return true;
    }

    private static string Quote(string argument)
    {
        if (string.IsNullOrEmpty(argument)) return "\"\"";
        if (argument.IndexOfAny(new[] { ' ', '\t', '"' }) < 0) return argument;

        var result = new StringBuilder("\"");
        int backslashes = 0;
        foreach (char ch in argument)
        {
            if (ch == '\\')
            {
                backslashes++;
                continue;
            }
            if (ch == '"')
            {
                result.Append('\\', backslashes * 2 + 1).Append('"');
                backslashes = 0;
                continue;
            }
            result.Append('\\', backslashes).Append(ch);
            backslashes = 0;
        }
        result.Append('\\', backslashes * 2).Append('"');
        return result.ToString();
    }

    private static void PruneCaches(string baseDir, string keep)
    {
        foreach (string trash in Directory.GetDirectories(baseDir, ".trash-*"))
            TryDeleteDirectory(trash);

        foreach (string directory in Directory.GetDirectories(baseDir, "runtime-*"))
        {
            if (string.Equals(
                Path.GetFullPath(directory).TrimEnd(Path.DirectorySeparatorChar),
                Path.GetFullPath(keep).TrimEnd(Path.DirectorySeparatorChar),
                StringComparison.OrdinalIgnoreCase))
                continue;

            string trash = Path.Combine(
                baseDir,
                ".trash-" + Path.GetFileName(directory) + "-" +
                Process.GetCurrentProcess().Id + "-" + DateTime.UtcNow.Ticks);
            try
            {
                Directory.Move(directory, trash);
                TryDeleteDirectory(trash);
            }
            catch
            {
                // A previous build may still be running. Keep it intact and
                // retry on the next launch.
            }
        }
    }

    private static void TryDeleteDirectory(string path)
    {
        try
        {
            if (Directory.Exists(path)) Directory.Delete(path, true);
        }
        catch
        {
            // A stale cache is safe to leave; the next launch uses a new key.
        }
    }

    private static void Fail(string message)
    {
        MessageBox.Show(message, "EmojiTot could not start", MessageBoxButtons.OK, MessageBoxIcon.Error);
    }

    private static void Log(string message)
    {
        try
        {
            File.AppendAllText(
                Path.Combine(Path.GetTempPath(), "EmojiTot-launcher.log"),
                DateTime.Now.ToString("s") + " " + message + "\r\n");
        }
        catch
        {
            // Diagnostics must never stop the app from starting.
        }
    }
}
