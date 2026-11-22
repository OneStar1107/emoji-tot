using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;

[assembly: AssemblyTitle("EmojiTot Portable")]
[assembly: AssemblyDescription("EmojiTot portable launcher")]
[assembly: AssemblyCompany("OneStar1107")]
[assembly: AssemblyProduct("EmojiTot")]
[assembly: AssemblyFileVersion("__BUILD_VERSION__")]
[assembly: AssemblyVersion("__BUILD_VERSION__")]

internal static class EmojiTotPortableLauncher
{
    private const string Magic = "EMOJITOT_PORTABLE_PAYLOAD_V1";
    private const int LengthDigits = 20;

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern uint GetShortPathName(string longPath, StringBuilder shortPath, uint bufferLength);

    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            string self = Assembly.GetExecutingAssembly().Location;
            PayloadInfo payload = ReadPayload(self);
            string baseDir = CacheBase();
            string cache = Path.Combine(
                baseDir,
                "portable-" + Assembly.GetExecutingAssembly().GetName().Version);
            string executable = Path.Combine(cache, "EmojiTot.portable.payload.exe");
            ExtractPayload(self, payload, cache, executable);
            PruneCaches(baseDir, cache);
            return Launch(executable, cache, args);
        }
        catch (Exception error)
        {
            Log("error=" + error);
            Fail("EmojiTot portable could not start.\r\n\r\n" + error.Message);
            return 1;
        }
    }

    private static PayloadInfo ReadPayload(string self)
    {
        byte[] magic = Encoding.ASCII.GetBytes(Magic + "\n");
        int trailerLength = magic.Length + LengthDigits + 1;
        using (var stream = new FileStream(self, FileMode.Open, FileAccess.Read, FileShare.Read))
        {
            if (stream.Length <= trailerLength)
                throw new InvalidDataException("The portable payload is missing.");
            stream.Seek(-trailerLength, SeekOrigin.End);
            byte[] header = new byte[trailerLength];
            if (stream.Read(header, 0, header.Length) != header.Length)
                throw new InvalidDataException("The portable payload header is truncated.");
            for (int index = 0; index < magic.Length; index++)
            {
                if (header[index] != magic[index])
                    throw new InvalidDataException("The portable payload header is invalid.");
            }
            string lengthText = Encoding.ASCII.GetString(header, magic.Length, LengthDigits);
            long length;
            if (!long.TryParse(lengthText, out length) || length <= 0)
                throw new InvalidDataException("The portable payload length is invalid.");
            long offset = stream.Length - trailerLength - length;
            if (offset < 0)
                throw new InvalidDataException("The portable payload is truncated.");
            return new PayloadInfo(offset, length);
        }
    }

    private static void ExtractPayload(
        string self,
        PayloadInfo payload,
        string cache,
        string executable)
    {
        if (File.Exists(executable) && new FileInfo(executable).Length == payload.Length)
            return;

        Directory.CreateDirectory(cache);
        string staging = executable + ".staging-" + Process.GetCurrentProcess().Id;
        TryDeleteFile(staging);
        try
        {
            using (var input = new FileStream(self, FileMode.Open, FileAccess.Read, FileShare.Read))
            using (var output = new FileStream(staging, FileMode.Create, FileAccess.Write, FileShare.None))
            {
                input.Seek(payload.Offset, SeekOrigin.Begin);
                var buffer = new byte[1024 * 1024];
                long remaining = payload.Length;
                while (remaining > 0)
                {
                    int read = input.Read(buffer, 0, (int)Math.Min(buffer.Length, remaining));
                    if (read <= 0) throw new EndOfStreamException("The portable payload ended early.");
                    output.Write(buffer, 0, read);
                    remaining -= read;
                }
            }
            TryDeleteFile(executable);
            File.Move(staging, executable);
        }
        catch
        {
            TryDeleteFile(staging);
            throw;
        }
    }

    private static int Launch(string executable, string workingDirectory, string[] args)
    {
        var command = new StringBuilder();
        foreach (string argument in args)
        {
            if (command.Length > 0) command.Append(' ');
            command.Append(Quote(argument));
        }
        var start = new ProcessStartInfo
        {
            FileName = executable,
            Arguments = command.ToString(),
            WorkingDirectory = workingDirectory,
            UseShellExecute = false,
            CreateNoWindow = false
        };
        using (Process child = Process.Start(start))
        {
            if (child == null) throw new InvalidOperationException("The portable runtime did not start.");
            child.WaitForExit();
            return child.ExitCode;
        }
    }

    private static string CacheBase()
    {
        string overridePath = Environment.GetEnvironmentVariable("EMOJITOT_PORTABLE_CACHE_DIR");
        if (!string.IsNullOrWhiteSpace(overridePath))
        {
            string fullPath = Path.GetFullPath(overridePath.Trim());
            if (!IsAscii(fullPath))
                throw new InvalidOperationException("EMOJITOT_PORTABLE_CACHE_DIR must be ASCII-only.");
            Directory.CreateDirectory(fullPath);
            return fullPath;
        }

        string[] roots =
        {
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            Path.GetTempPath(),
            Path.Combine(Path.GetTempPath(), "Low"),
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData)
        };
        foreach (string root in roots)
        {
            string ascii = AsciiPath(root);
            if (string.IsNullOrEmpty(ascii)) continue;
            string candidate = Path.Combine(ascii, "EmojiTot", "portable");
            try
            {
                Directory.CreateDirectory(candidate);
                if (IsAscii(candidate)) return candidate;
            }
            catch
            {
                // Try the next known system location.
            }
        }
        throw new InvalidOperationException("No ASCII cache directory is available.");
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

        foreach (string directory in Directory.GetDirectories(baseDir, "portable-*"))
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
                // A previous portable build may still be running.
            }
        }
    }

    private static void TryDeleteFile(string path)
    {
        try
        {
            if (File.Exists(path)) File.Delete(path);
        }
        catch
        {
            // A retry on the next launch is safe.
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
            // A retry on the next launch is safe.
        }
    }

    private static void Fail(string message)
    {
        MessageBox.Show(
            message,
            "EmojiTot could not start",
            MessageBoxButtons.OK,
            MessageBoxIcon.Error);
    }

    private static void Log(string message)
    {
        try
        {
            File.AppendAllText(
                Path.Combine(Path.GetTempPath(), "EmojiTot-portable-launcher.log"),
                DateTime.Now.ToString("s") + " " + message + "\r\n");
        }
        catch
        {
            // Diagnostics must never stop the app from starting.
        }
    }

    private sealed class PayloadInfo
    {
        internal PayloadInfo(long offset, long length)
        {
            Offset = offset;
            Length = length;
        }

        internal long Offset { get; private set; }
        internal long Length { get; private set; }
    }
}
