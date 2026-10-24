using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Management;
using System.Net;
using System.Net.Security;
using System.Security.Cryptography.X509Certificates;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using Microsoft.Win32;

/// <summary>
/// 项目K 客户端鉴权旁路 + 云控剥离 PoC (AppDomainManager 注入)
///
/// 1) 本地许可伪造：由机器码派生 AES-128-CBC 密钥，写入永久授权载荷
/// 2) 云控剥离：精准拦截 www.<vendor-domain>，阻断在线复核回写
/// 3) 内存锁：看门狗线程持续锁定 App.Days = 63282（永久授权阈值 >= 29200）
/// </summary>
public class Manager : AppDomainManager
{
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, IntPtr wParam, string lParam,
                                            uint fuFlags, uint uTimeout, out IntPtr lpdwResult);
    const uint WM_SETTINGCHANGE = 0x001A;
    const uint SMTO_ABORTIFHUNG = 0x0002;
    static readonly IntPtr HWND_BROADCAST = (IntPtr)0xFFFF;

    const string LOGPATH = @"C:\Program Files\项目K\ProjectKUnlock.log";
    const string SALT = "<REDACTED_SALT>";
    const string EXPIRE = "2199-12-31";
    const string EMAIL = "unlock@local";
    const int PERMANENT_DAYS = 63282;      // >= 29200 => 永久授权版
    const string CLOUD_HOST = "<vendor-domain>";
    const string DEAD_PROXY = "http://127.0.0.1:9";
    const string SELF_ASM  = "ProjectKUnlock, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null";
    const string SELF_TYPE = "Manager";
    // 目标进程白名单：本 DLL 只允许在下列进程中动作，绝不干扰其它 .NET 程序
    // 目标进程白名单：本 DLL 只允许在下列进程中动作，绝不干扰其它 .NET 程序
    // 占位符需替换为真实主程序名（如 MyApp.exe）
    const string TARGET_EXE = "<App>.exe";
    // 目标主程序集名（脱敏占位，替换为真实值即可运行）
    const string TARGET_ASM = "<TargetAssembly>";

    static string _jqm;
    static string _b64;
    static string _regSub;
    static string _filePath;
    static readonly RemoteCertificateValidationCallback _certCb = CloudCertCheck;
    // 云控域名 + 其解析出的 IP 黑名单（应用会自行解析后直连 IP，必须按 IP 一并拦截）
    static readonly System.Collections.Generic.HashSet<string> _cloudIps =
        new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase);
    static Assembly _target;
    static FieldInfo _daysField;
    static volatile bool _ready;

    static void Log(string s)
    {
        try
        {
            lock (typeof(Manager))
                File.AppendAllText(LOGPATH, DateTime.Now.ToString("HH:mm:ss.fff") + "  " + s + "\r\n");
        }
        catch { }
    }

    public override void InitializeNewDomain(AppDomainSetup appDomainInfo)
    {
        // ============================================================
        // 安全门（必须最先执行）：
        // 本程序集可能因环境变量被任意 .NET 进程加载，若不加限制会拖垮
        // 其它程序（PowerShell / 资源管理器 / 各类 .NET 应用）。
        // 因此：只有确认当前进程是目标程序时，才执行任何动作。
        // ============================================================
        if (!IsTargetProcess())
        {
            base.InitializeNewDomain(appDomainInfo);
            return;
        }

        Log("================ ProjectKUnlock loaded (target process) ================");
        try { CloudControlKill(); } catch (Exception e) { Log("cloud err " + e.Message); }
        try { ForgeLicense(); } catch (Exception e) { Log("forge err " + e.Message); }
        Thread t = new Thread(Watchdog);
        t.IsBackground = true;
        t.Start();
        base.InitializeNewDomain(appDomainInfo);
    }

    // ==================================================================
    // 进程守卫：仅当宿主进程是目标程序时才返回 true
    // ==================================================================
    static bool IsTargetProcess()
    {
        try
        {
            Process cur = Process.GetCurrentProcess();
            string exe = cur.MainModule != null ? cur.MainModule.FileName : "";
            if (string.IsNullOrEmpty(exe))
                exe = cur.ProcessName + ".exe";
            bool ok = exe.EndsWith(TARGET_EXE, StringComparison.OrdinalIgnoreCase);
            if (!ok) Log("skip: 非目标进程，本 DLL 不执行任何动作 -> " + exe);
            return ok;
        }
        catch
        {
            // 取不到进程信息时，保守起见一律不动作
            return false;
        }
    }

    /// <summary>清理历史遗留的引导变量（仅清理，不再写入）</summary>
    public static string Unpersist()
    {
        try
        {
            using (RegistryKey k = Registry.CurrentUser.OpenSubKey(@"Environment", true))
            {
                if (k == null) return @"FAIL: HKCU\Environment 不可写";
                k.DeleteValue("APPDOMAIN_MANAGER_ASM",  false);
                k.DeleteValue("APPDOMAIN_MANAGER_TYPE", false);
            }
            return "OK: 引导变量已移除";
        }
        catch (Exception e) { return "FAIL: " + e.Message; }
    }

    // ==================================================================
    // 独立入口：无需注入，直接用 PowerShell / 任意宿主加载本 DLL 后调用
    //   [Reflection.Assembly]::LoadFrom("ProjectKUnlock.dll")
    //   [Manager]::Activate()
    // 效果：写入永久许可 + 配置云控拦截（不启动看门狗）
    // ==================================================================
    public static string Activate()
    {
        try { CloudControlKill(); } catch { }
        try { ForgeLicense(); } catch (Exception e) { return "FAIL: " + e.Message; }
        if (!_ready) return "FAIL: 机器码获取失败";
        string[] kv = DeriveKeyIv(_jqm);
        return "OK\r\n" +
               "  机器码   = " + _jqm + "\r\n" +
               "  AES Key  = " + kv[0] + "\r\n" +
               "  AES IV   = " + kv[1] + "\r\n" +
               "  到期日期 = " + EXPIRE + " (永久授权)\r\n" +
               "  注册表   = HKCU\\" + _regSub + "  -> Configuration\r\n" +
               "  隐藏文件 = " + _filePath + "\r\n" +
               "  云控拦截 = " + CLOUD_HOST + " -> " + DEAD_PROXY;
    }

    /// <summary>还原为原始 30 天试用（与 revert.py 等效，便于纯 DLL 方案自洽）</summary>
    public static string Revert(string originalBase64)
    {
        try
        {
            if (string.IsNullOrEmpty(_jqm)) _jqm = GetMachineCode();
            if (string.IsNullOrEmpty(_jqm)) return "FAIL: 机器码获取失败";
            _regSub = "SOFTWARE\\Microsoft\\" + RegSubName(_jqm);
            _filePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                                     @"Microsoft\Crypto\Keys", _jqm.Replace("-", "").ToLowerInvariant());
            WriteLicense(originalBase64);
            return "OK: 已还原\r\n" + originalBase64;
        }
        catch (Exception e) { return "FAIL: " + e.Message; }
    }

    // ------------------------------------------------------------------
    // 1) 云控剥离：只拦截 <vendor-domain>，其余流量直连
    // ------------------------------------------------------------------
    sealed class CloudBlockProxy : IWebProxy
    {
        public ICredentials Credentials { get; set; }
        public bool IsBypassed(Uri host)
        {
            if (host == null) return true;
            string h = host.Host.ToLowerInvariant();
            if (h.Contains(CLOUD_HOST)) return false;   // 走死代理 -> 连接失败
            return true;                                 // 其余直连
        }
        public Uri GetProxy(Uri dest)
        {
            return new Uri(DEAD_PROXY);
        }
    }

    static void CloudControlKill()
    {
        // 第 1 层：默认代理拦截（覆盖走 DefaultWebProxy 的请求）
        try
        {
            WebRequest.DefaultWebProxy = new CloudBlockProxy();
            WebRequest.DefaultWebProxy.Credentials = CredentialCache.DefaultCredentials;
        }
        catch (Exception e) { Log("proxy block err " + e.Message); }

        // 第 2 层：TLS 证书校验回调 —— 与代理无关，在 TLS 握手阶段直接判失败。
        // 应用即使显式使用系统代理（GetSystemWebProxy）也绕不过这一层。
        try
        {
            ServicePointManager.ServerCertificateValidationCallback = _certCb;
            RefreshCloudIps();
            Log("cloud control blocked -> TLS handshake vetoed for " + CLOUD_HOST);
        }
        catch (Exception e) { Log("tls block err " + e.Message); }

        Log("cloud control blocked -> " + CLOUD_HOST + " routed to " + DEAD_PROXY);
    }

    /// <summary>判断主机名或 IP 是否属于云控目标</summary>
    static bool IsCloudTarget(string host)
    {
        if (string.IsNullOrEmpty(host)) return false;
        host = host.Trim().ToLowerInvariant();
        if (host.Contains(CLOUD_HOST)) return true;                 // 域名（含 www. / 子域）
        lock (_cloudIps) { if (_cloudIps.Contains(host)) return true; }  // 已解析的 IP
        return false;
    }

    /// <summary>解析云控域名，缓存其全部 IPv4/IPv6 地址</summary>
    static void RefreshCloudIps()
    {
        string[] hosts = new string[] { CLOUD_HOST, "www." + CLOUD_HOST };
        int added = 0;
        foreach (string h in hosts)
        {
            try
            {
                foreach (System.Net.IPAddress ip in Dns.GetHostAddresses(h))
                {
                    lock (_cloudIps) { if (_cloudIps.Add(ip.ToString())) added++; }
                }
            }
            catch { }
        }
        if (added > 0)
        {
            string list;
            lock (_cloudIps) { list = string.Join(", ", new List<string>(_cloudIps).ToArray()); }
            Log("cloud IP blacklist updated (+" + added + ") -> " + list);
        }
    }

    /// <summary>TLS 证书校验：目标域名/IP 一律判失败；其余保持系统默认行为</summary>

    static bool CloudCertCheck(object sender, X509Certificate certificate,
                               X509Chain chain, SslPolicyErrors sslPolicyErrors)
    {
        try
        {
            HttpWebRequest req = sender as HttpWebRequest;
            if (req != null)
            {
                string h = null, a = null;
                try { h = req.Host; } catch { }
                try { a = (req.Address != null) ? req.Address.Host : null; } catch { }
                if (IsCloudTarget(h) || IsCloudTarget(a))
                {
                    Log("cloud TLS veto: host=" + h + " addr=" + a + " (handshake aborted)");
                    return false;
                }
            }
        }
        catch { }
        return sslPolicyErrors == SslPolicyErrors.None;
    }

    // ------------------------------------------------------------------
    // 2) 机器码 / 密钥派生 / 许可伪造
    // ------------------------------------------------------------------
    static string Wmi(string wql, string prop)
    {
        try
        {
            using (ManagementObjectSearcher s = new ManagementObjectSearcher(wql))
            using (ManagementObjectCollection c = s.Get())
                foreach (ManagementObject o in c)
                {
                    object v = o[prop];
                    if (v != null) return v.ToString();
                }
        }
        catch (Exception e) { Log("wmi err " + e.Message); }
        return "";
    }

    static string Md5Jqm(string raw)
    {
        byte[] h;
        using (MD5 md5 = MD5.Create())
            h = md5.ComputeHash(Encoding.ASCII.GetBytes(raw));
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < h.Length; i++)
        {
            int hi = (h[i] >> 4) & 0xF, lo = h[i] & 0xF;
            sb.Append((char)(hi <= 9 ? '0' + hi : 'A' + hi - 10));
            sb.Append((char)(lo <= 9 ? '0' + lo : 'A' + lo - 10));
            if ((i + 1) != h.Length && (i + 1) % 2 == 0) sb.Append('-');
        }
        return sb.ToString();
    }

    static string GetMachineCode()
    {
        // 首选：与目标程序完全一致的 WMI 组合
        string board = Wmi("SELECT SerialNumber FROM Win32_BaseBoard", "SerialNumber");
        string cpu = Wmi("SELECT ProcessorID FROM Win32_Processor", "ProcessorID");
        if (!string.IsNullOrEmpty(board) && !string.IsNullOrEmpty(cpu))
        {
            string jqm = Md5Jqm(board + SALT + cpu);
            Log("machine code (wmi) = " + jqm);
            return jqm;
        }
        // 兜底：从既有许可文件名反推
        try
        {
            string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                                      @"Microsoft\Crypto\Keys");
            if (Directory.Exists(dir))
                foreach (string f in Directory.GetFiles(dir))
                {
                    string n = Path.GetFileNameWithoutExtension(f);
                    if (n.Length == 32 && IsHex(n))
                    {
                        string up = n.ToUpperInvariant();
                        StringBuilder sb = new StringBuilder();
                        for (int i = 0; i < up.Length; i++)
                        {
                            if (i > 0 && i % 4 == 0) sb.Append('-');
                            sb.Append(up[i]);
                        }
                        Log("machine code (file) = " + sb);
                        return sb.ToString();
                    }
                }
        }
        catch (Exception e) { Log("jqm fallback err " + e.Message); }
        return null;
    }

    static bool IsHex(string s)
    {
        foreach (char c in s)
            if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'))) return false;
        return true;
    }

    static string[] DeriveKeyIv(string jqm)
    {
        string t = jqm.Replace("-", "");
        string a = t.Substring(0, 1);
        string b = t.Substring(1, 6);
        string c = t.Substring(7, 7);
        string d = t.Substring(14, 2);
        string e = t.Substring(16, 4);
        string f = t.Substring(20, 3);
        string g = t.Substring(23, 4);
        string h = t.Substring(27, 5);
        return new string[] { f + g + h + e, a + c + d + b };  // Key, IV
    }

    static string AesEncrypt(string plain, string key, string iv)
    {
        using (RijndaelManaged rm = new RijndaelManaged())
        {
            rm.Key = Encoding.UTF8.GetBytes(key);
            rm.IV = Encoding.UTF8.GetBytes(iv);
            rm.Mode = CipherMode.CBC;
            rm.Padding = PaddingMode.PKCS7;
            byte[] data = Encoding.UTF8.GetBytes(plain);
            using (ICryptoTransform enc = rm.CreateEncryptor())
                return Convert.ToBase64String(enc.TransformFinalBlock(data, 0, data.Length));
        }
    }

    static string AesDecrypt(string b64, string key, string iv)
    {
        try
        {
            using (RijndaelManaged rm = new RijndaelManaged())
            {
                rm.Key = Encoding.UTF8.GetBytes(key);
                rm.IV = Encoding.UTF8.GetBytes(iv);
                rm.Mode = CipherMode.CBC;
                rm.Padding = PaddingMode.PKCS7;
                byte[] data = Convert.FromBase64String(b64);
                using (ICryptoTransform dec = rm.CreateDecryptor())
                    return Encoding.UTF8.GetString(dec.TransformFinalBlock(data, 0, data.Length));
            }
        }
        catch { return null; }
    }

    static string RegSubName(string jqm)
    {
        StringBuilder sb = new StringBuilder();
        foreach (char c in jqm.Replace("-", ""))
            if (!char.IsDigit(c)) sb.Append(c);
        string s = sb.ToString();
        if (s.Length >= 3) return s.Substring(0, 3);
        return jqm.EndsWith("-EN") ? "LEN" : "LLA";
    }

    static void ForgeLicense()
    {
        _jqm = GetMachineCode();
        if (_jqm == null) { Log("machine code unavailable -> abort forge"); return; }

        string[] kv = DeriveKeyIv(_jqm);
        string payload = _jqm + "\t" + EXPIRE + "\t" + EMAIL;
        _b64 = AesEncrypt(payload, kv[0], kv[1]);

        _regSub = "SOFTWARE\\Microsoft\\" + RegSubName(_jqm);
        _filePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                                 @"Microsoft\Crypto\Keys", _jqm.Replace("-", "").ToLowerInvariant());

        WriteLicense(_b64);
        Log("license forged: " + payload.Replace("\t", " | "));
        Log("  Key=" + kv[0] + "  IV=" + kv[1]);
        Log("  reg=" + _regSub + "  file=" + _filePath);
        _ready = true;
    }

    static void WriteLicense(string b64)
    {
        try
        {
            using (RegistryKey k = Registry.CurrentUser.CreateSubKey(_regSub))
                k.SetValue("Configuration", b64, RegistryValueKind.String);
        }
        catch (Exception e) { Log("reg write err " + e.Message); }

        try
        {
            string dir = Path.GetDirectoryName(_filePath);
            if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
            if (File.Exists(_filePath)) { File.SetAttributes(_filePath, FileAttributes.Normal); File.Delete(_filePath); }
            File.WriteAllText(_filePath, b64);
            File.SetAttributes(_filePath, FileAttributes.Hidden);
            // 伪造时间戳，与 %APPDATA% 目录创建时间对齐（规避原厂的时间线一致性检查）
            DateTime t = Directory.GetCreationTime(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData));
            File.SetCreationTime(_filePath, t);
            File.SetLastWriteTime(_filePath, t);
            File.SetLastAccessTime(_filePath, t);
        }
        catch (Exception e) { Log("file write err " + e.Message); }
    }

    // ------------------------------------------------------------------
    // 3) 看门狗：锁定 App.Days + 复查许可，云控无法翻盘
    // ------------------------------------------------------------------
    static void Watchdog()
    {
        int ticks = 0;
        for (int i = 0; i < 100000; i++)
        {
            try
            {
                if (_target == null)
                {
                    foreach (Assembly a in AppDomain.CurrentDomain.GetAssemblies())
                        if (a.GetName().Name == "<TargetAssembly>") { _target = a; break; }
                    if (_target != null)
                    {
                        _daysField = _target.GetType(TARGET_ASM + ".App")
                                            .GetField("Days", BindingFlags.Public | BindingFlags.Static);
                        Log("hooked App.Days field = " + (_daysField != null ? "OK" : "MISSING"));
                    }
                }

                if (_target != null && _daysField != null)
                {
                    object cur = _daysField.GetValue(null);
                    int ci = (cur is int) ? (int)cur : int.MinValue;
                    if (ci != PERMANENT_DAYS)
                    {
                        _daysField.SetValue(null, PERMANENT_DAYS);
                        Log("App.Days " + ci + " -> " + PERMANENT_DAYS + " (re-asserted)");
                    }
                }

                // 每秒重申云控拦截（防止被应用自身的网络初始化覆盖）
                try
                {
                    if (!object.ReferenceEquals(ServicePointManager.ServerCertificateValidationCallback, _certCb))
                    {
                        ServicePointManager.ServerCertificateValidationCallback = _certCb;
                        Log("cloud TLS callback re-armed (被应用覆盖，已夺回)");
                    }
                }
                catch { }

                // 每 30 秒刷新云控 IP 黑名单（应对 CDN 轮换）
                if ((ticks % 30) == 0) { try { RefreshCloudIps(); } catch { } }

                // 每 5 秒校验一次磁盘许可，被云控改写则立即复原
                ticks++;
                if (_ready && (ticks % 5) == 0)
                {
                    string[] kv = DeriveKeyIv(_jqm);
                    string onDisk = null;
                    try
                    {
                        using (RegistryKey k = Registry.CurrentUser.OpenSubKey(_regSub))
                            if (k != null) onDisk = k.GetValue("Configuration") as string;
                    }
                    catch { }
                    string plain = onDisk != null ? AesDecrypt(onDisk, kv[0], kv[1]) : null;
                    if (plain == null || plain.IndexOf(EXPIRE) < 0)
                    {
                        Log("license tampered (cloud rollback) -> restoring");
                        WriteLicense(_b64);
                    }
                }
            }
            catch { }
            Thread.Sleep(1000);
        }
    }
}
