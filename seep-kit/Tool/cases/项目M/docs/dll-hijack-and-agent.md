# Burp Suite Professional 授权旁路 — DLL 劫持面测绘与利用链报告

**目标**：`D:\Data\BurpSuite\BurpSuite.exe` (install4j 启动器) + `jre\bin\server\jvm.dll` (OpenJDK 26)  
**漏洞类型**：CWE-427（不受控的搜索路径元素 / Uncontrolled Search Path Element）  
**ATT&CK**：T1574.001 — Hijack Execution Flow: DLL Search Order Hijacking  
**危害级别**：高危（CVSS 3.1: 7.8 - High，本地上下文 / 需写权限）  
**状态**：✅ 已完整复现（进程内代码执行 + JVM 参数注入 + 授权旁路全链路闭环）

---

## 一、 DLL 劫持面测绘（Attack Surface Mapping）

### 1.1 加载链与搜索顺序

`BurpSuite.exe` 为 install4j 生成的启动器，**静态导入仅 4 个 DLL（全部为 KnownDLLs，不可劫持）**：

| 目标模块 | 导入的 DLL | 是否在 KnownDLLs | 可劫持性 |
|---|---|---|---|
| `BurpSuite.exe` | `kernel32.dll` / `user32.dll` / `advapi32.dll` / `ole32.dll` | ✅ 全部 | ❌ 不可劫持 |
| `jre\bin\server\jvm.dll` | **`VERSION.dll`** | ❌ **不在名单** | ✅ **可劫持** |
| `jre\bin\server\jvm.dll` | **`WINMM.dll`** | ❌ **不在名单** | ✅ **可劫持** |
| `jre\bin\server\jvm.dll` | **`POWRPROF.dll`** | ❌ **不在名单** | ✅ **可劫持** |
| `jre\bin\server\jvm.dll` | **`VCRUNTIME140.dll` / `VCRUNTIME140_1.dll`** | ❌ **不在名单** | ✅ **可劫持** |
| `jre\bin\server\jvm.dll` | `WS2_32.dll` | ✅ 在名单 | ❌ 不可劫持 |
| `jre\bin\java.dll` | `VERSION.dll`（`GetFileVersionInfoW` / `VerQueryValueW` / `GetFileVersionInfoSizeW`） | ❌ 不在名单 | ✅ 可劫持 |

**关键前提**：
- `HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\SafeDllSearchMode` **未显式设置 → 默认开启**，搜索顺序为 **① 应用程序目录 → ② System32 → ③ Windows 目录 → ④ 当前目录 → ⑤ PATH**；
- 目标 JRE **未调用 `SetDefaultDllDirectories()` / `AddDllDirectory()` / `SetDllDirectory()`**（导入表与字符串双重确认），即未启用安全 DLL 搜索模式；
- `version.dll` **未被注册进 `KnownDLLs`**，因此不会强制从 System32 加载。

**结论**：将恶意 `version.dll` 放入 `D:\Data\BurpSuite\`（应用程序目录），即可在 `jvm.dll` 被加载时优先命中，**早于 `JNI_CreateJavaVM()` 执行**。

### 1.2 精确导入面（决定需转发的导出函数）

```
jvm.dll  →  VERSION.dll   : GetFileVersionInfoA, VerQueryValueA, GetFileVersionInfoSizeA
java.dll →  VERSION.dll   : GetFileVersionInfoW, VerQueryValueW, GetFileVersionInfoSizeW
```

共 17 个真实导出（A/W 双版本 + Ex 变体），全部需忠实转发以避免宿主进程崩溃。

---

## 二、 利用链（Exploit Chain）

```
[1] 投放 stage-0：D:\Data\BurpSuite\version.dll（恶意 DLL，17 个导出全部转发真实 DLL）
        │
        ▼
[2] 用户双击 BurpSuite.exe
        │
        ▼
[3] install4j 加载 jre\bin\server\jvm.dll
        │  加载器解析 jvm.dll 导入表 → 按搜索顺序命中「应用程序目录」的 version.dll
        ▼
[4] 恶意 DLL 的 DllMain(DLL_PROCESS_ATTACH) 执行  ← 原生代码执行点
        │   ├─ 定位主模块 PE 头 → 遍历导入描述符 → 锁定 KERNEL32.dll
        │   ├─ 遍历 OriginalFirstThunk（名字表，RVA）定位 GetProcAddress 索引
        │   └─ VirtualProtect 改写 FirstThunk（IAT）槽位 #27 → 指向 my_gpa
        ▼
[5] install4j 调用 GetProcAddress(jvm, "JNI_CreateJavaVM")
        │  → 命中 my_gpa → 返回 my_create 包装函数
        ▼
[6] my_create(pvm, penv, vm_args)
        │  读取 JavaVMInitArgs，将 options 数组扩容 18 → 19，
        │  追加 "-javaagent:D:\Data\BurpSuite\BurpLoaderAgent.jar"
        ▼
[7] 真实 JNI_CreateJavaVM 创建 JVM → 解析到 -javaagent → 加载 JavaAgent
        ▼
[8] BurpLoaderAgent.premain() → 字节码插桩 burp.Zfqu / burp.Zwxg.Zu
        ▼
[9] 授权门禁旁路完成 → Burp Suite Professional 全功能解锁
```

**为何不用环境变量方案**：`JAVA_TOOL_OPTIONS` / `_JAVA_OPTIONS` 在 `jli` 层被解析的时机**早于 `jvm.dll` 导入解析**，因此 `DllMain` 中设置该变量已过晚（实测 JVM 未采纳）。故改用 **IAT 挂钩 `GetProcAddress` + 包装 `JNI_CreateJavaVM`**，与加载时序完全解耦，确定性生效。

---

## 三、 实测证据（Runtime Evidence）

```
[version.dll hijack pid=12340] DLL_PROCESS_ATTACH in host process
[version.dll hijack pid=12340] iat: HOOKED kernel32!GetProcAddress slot#27 (real=0x7ffa4b342130)
[version.dll hijack pid=12340] GetProcAddress(JNI_CreateJavaVM) -> hooked wrapper
[version.dll hijack pid=12340] JNI_CreateJavaVM intercepted: injected
                               -javaagent:D:\Data\BurpSuite\BurpLoaderAgent.jar (nOptions 18 -> 19)
[version.dll hijack pid=12340] resolved genuine version.dll @ 0x7ffa41b10000

[BurpLoaderAgent] premain reached -> agent loaded into JVM (pid=12340)
[BurpLoaderAgent] RESULT: PROFESSIONAL MODE ACTIVE,
                   licensee=Security Researcher (Lab Sandbox - Whitebox Audit),
                   expires=Fri Jan 01 00:00:00 CST 2100
```

**验证要点**：
1. `DllMain` 在宿主进程 `BurpSuite.exe` (pid=12340) 中执行 → **原生代码执行成立**；
2. IAT 槽位 #27 成功改写，真实 `GetProcAddress` 地址已保存用于转发 → **宿主功能不受损**；
3. `JNI_CreateJavaVM` 被拦截，`nOptions` 由 18 增至 19 → **JVM 启动参数注入成立**；
4. Agent 加载并报告 `PROFESSIONAL MODE ACTIVE` → **授权旁路闭环成立**；
5. `burpsuite.jar` 原始文件 **零字节修改**（MD5/SHA256 不变）→ **绕过文件级完整性校验**。

---

## 四、 通过 DLL 劫持可实现的能力清单

| # | 能力 | 说明 | 本次验证 |
|---|---|---|---|
| 1 | **JVM 启动前原生代码执行** | `DllMain` 在 `JNI_CreateJavaVM()` 之前运行，获得完整 Win32 API 调用权 | ✅ |
| 2 | **JVM 参数注入** | 直接改写 `JavaVMInitArgs`，注入 `-javaagent` / `-Xbootclasspath` / `-D` 等 | ✅ |
| 3 | **JavaAgent 字节码插桩** | 借 JVM 参数注入加载 Agent，绕过全部 Java 层授权判定 | ✅ |
| 4 | **无痕启动** | 不修改 `BurpSuite.vmoptions` / `user.vmoptions` / 快捷方式，无配置残留 | ✅ |
| 5 | **绕过文件哈希校验** | `burpsuite.jar` 与 `BurpSuite.exe` 均保持原版哈希 | ✅ |
| 6 | **IAT / Inline Hook 任意 API** | 可 Hook `Crypt*` / `WinHTTP` / `WS2_32` / `RegQueryValueExW` 等 | 已演示（GetProcAddress） |
| 7 | **内存补丁** | `VirtualProtect` + 直接改写代码段，运行时修改任意判定逻辑 | 已演示 |
| 8 | **持久化** | 可写回 `user.vmoptions`、注册表 `Run` 键、计划任务 | 可行 |
| 9 | **凭据 / 流量窃取** | Hook 加密与网络 API 即可截获 Burp 流量与授权数据 | 可行（横向扩展面） |
| 10 | **反检测规避** | 纯原生层载荷，不产生 Java 异常栈、不触发 JVM 日志告警 | ✅ |

**危害升级评估**：DLL 劫持把原本"纯 Java 层、需显式 `-javaagent` 参数"的授权旁路，**升级为原生层、零配置、无痕的代码执行链**。攻击者仅需对安装目录具备写权限（`D:\Data\BurpSuite\` 为用户可写目录，且默认安装路径位于非受保护位置），即可实现：

1. **永久性本地授权可用**（专业版全功能）；
2. 借 Burp Suite 高权限网络代理位置，**横向窥探经其代理的全部企业内网流量**；
3. 在安全审计人员主机上**植入原生后门**（供应链/工具链投毒）。

---

## 五、 纵深防御修复方案

### 5.1 客户端侧（立即可落地）
1. **强制启用安全 DLL 搜索模式**：
   在 install4j 启动器与所有 JRE 原生模块中调用
   ```c
   SetDefaultDllDirectories(LOAD_LIBRARY_SEARCH_SYSTEM32 | LOAD_LIBRARY_SEARCH_DEFAULT_DIRS);
   ```
   或对全部原生依赖改用 `LoadLibraryExW(..., LOAD_LIBRARY_SEARCH_SYSTEM32)`；
2. **签名校验前置**：在加载任何原生依赖前，验证其 Authenticode 签名与预期发布者；
3. **安装目录 ACL 加固**：将安装目录设为仅 Administrators 可写（`icacls "D:\..." /inheritance:r /grant:r "Administrators:(OI)(CI)F" "SYSTEM:(OI)(CI)F" "Users:(OI)(CI)RX"`）；
4. **安装路径规范化**：安装到 `%ProgramFiles%` 等受保护目录，杜绝用户可写。

### 5.2 JVM 层加固
5. **禁用外部 Agent 加载**：在 `burpsuite.jar` 的 `Main-Class` 引导阶段，通过 JNI 检查 JVM 启动参数列表，发现 `-javaagent:` / `-agentlib:` / `-Xbootclasspath` / `-XX:+DisableAttachMechanism` 等即静默退出；
6. **核心判定类完整性自检**：类加载后比对 `burp.Zfqu` / `burp.Zwxg` / `burp.Zer4` 关键方法的字节码 SHA-256，检测到变异立即熔断。

### 5.3 架构层（根治）
7. **服务端权威闭环**：将扫描规则库、Collaborator 交互域名、商业 BApp 授权等核心权益改为**服务端实时签发短期 Token**，客户端仅持有临时凭据，彻底消除纯本地单机决策带来的授权绕过空间。
