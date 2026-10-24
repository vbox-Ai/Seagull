# 项目L Hook DLL 代理范式 —— 客户端鉴权旁路 + 大模型翻译网关 + 云控剥离（CWE-602）

> 目标：`项目L.exe` + `项目L_Auth.dll`（Windows 桌面截图贴图工具 / Qt5 C++ / x64）
> 版本：`3.5.5.1`
> 官方 `项目L_Auth.dll` SHA256：`c6a3d8716efebdd2e3e21045996cae51414d031c8cd74a6fc1d1d5207c9d45d2`（3,766,072 字节）
> 官方 `项目L.exe` SHA256：`6dca2e4f183c02d02cb42c0756643cf525fd4c18ad1ff93727e815558da9416d`（23,662,904 字节）
> 交付产物：单个 **`项目L_Auth.dll`** 代理库（260,096 字节）
> 结论：**存在可 100% 复现的客户端鉴权旁路 + 翻译服务端算力本地化 + 云控更新剥离**

---

## 一、架构总览（范式 B：DLL 代理跳板）

`项目L.exe` 通过 IAT 从 `项目L_Auth.dll` 导入 **282 个 C++ 符号**。本方案不改动任何一个官方字节，而是**在磁盘上把官方库改名为 `项目L_AuthReal.dll`，再用同名的自建代理库顶替**：

```
┌──────────────────────────────────────────────────────────────────┐
│  项目L.exe  (23.6 MB)                                             │
│  107 处功能门控调用点 / 全部 API 请求经 {API_ENDPOINT} 变量解析    │
└───────────────┬──────────────────────────────────┬───────────────┘
                │ IAT 导入 282 个符号               │ HTTPS 请求
┌───────────────▼──────────────────┐               │
│  项目L_Auth.dll  (260 KB, 自建代理) │               │
│  ├─ 282 条 PE Forwarder           │               │
│  │     └─▶ 转发至官方原版          │               │
│  ├─ 进程内内存补丁引擎             │               │
│  └─ 内嵌 127.0.0.1 大模型翻译网关   │               │
└───────────────┬──────────────────┘               │
                ▼                                  ▼
┌──────────────────────────────┐    ┌──────────────────────────────┐
│  项目L_AuthReal.dll (3.7 MB)  │    │  本地网关 (127.0.0.1:8787)    │
│  官方原版鉴权中心              │    │  ├─ /api2/*/translate/*      │
│  ← 仅内存中被恒值化, 磁盘纯净  │    │  │   └─▶ 任意大模型 API      │
└──────────────────────────────┘    │  └─ 其它请求透明回源官方       │
                                    └──────────────────────────────┘
```

### 为什么必须用代理 DLL

| 约束 | 说明 |
| :--- | :--- |
| 官方文件零修改 | `项目L.exe` / `项目L_AuthReal.dll` 磁盘 SHA256 与官网完全一致 |
| 必须进入进程 | 只有被 IAT 加载的 DLL 才能改写宿主内存、Hook 宿主函数 |
| 单文件可移植 | 复制 2 个文件即可在任意电脑生效，无需脚本/后台进程 |

---

## 二、能力一：会员特权判定旁路（CWE-602）

全部 PRO/VIP 特权集中在 `项目L_AuthReal.dll`，**均为本地布尔/枚举函数，无签名绑定、无服务端权威闭环**。

### 2.1 会员功能全集（FeatureType 枚举，14 项）

从 Qt 元对象字符串数据（RVA `0x0378162`）提取：

| idx | FeatureType | 官方名称 | 说明 |
| :--: | :--- | :--- | :--- |
| 0 | `Translation` | 翻译 | AI 屏幕取词一键翻译 |
| 1 | `TableRecognition` | 表格识别 | 表格结构还原 + 导出 Excel |
| 2 | `FormulaRecognition` | 公式识别 | 数学公式 → LaTeX |
| 3 | `SmartErase` | 智能擦除 | 智能移除杂物与敏感信息 |
| 4 | `GlobalMouse` | 全局鼠标 | 全局鼠标增强 |
| 5 | `ConfigSync` | 配置同步 | 云端备份设置与历史 |
| 6 | `LongScreenshotAutoCrop` | 长截图自动裁剪 | 滚动截图自动检测裁剪 |
| 7 | `RecordClip` | 录制片段 | 录屏快速裁剪 |
| 8 | `RecordKeyMouse` | 键鼠录制 | 键鼠操作可视化录制 |
| 9 | `ExportPreview` | 导出预览 | 实时预览编码效果 |
| 10 | `SaveAsPDF` | 另存为 PDF | 一键生成 PDF |
| 11 | `AutoMosaicSync` | 自动马赛克同步 | 自动马赛克处理与同步 |
| 12 | `IndustrialBarcode` | 工业条码识别 | Code128/EAN/UPC/ITF 等 20+ 格式 |
| 13 | `CameraRecording` | 摄像头录制 | 屏幕 + 摄像头画中画 |

### 2.2 补丁点清单（11 处，全部为函数入口恒值化）

| RVA | 原始字节 | 补丁字节 | 原始符号 |
| :--- | :--- | :--- | :--- |
| `0x0C3270` | `48 83 EC 28` | `B0 01 C3` | `UserInfo::isProUser()` |
| `0x09C430` | `48 83 C1 10` | `B0 01 C3` | `Application::isProUser()` |
| `0x0EE950` | `40 53 48 83 EC 20` | `B0 01 C3` | `VipInfo::isVip()` |
| `0x0EE910` | `40 53 48 83 EC 20` | `B0 01 C3` | `Subscription::isVip()` |
| `0x0EE7B0` | `40 53 48 83 EC 20` | `B0 01 C3` | `PrepaidInfo::isVip()` + `VipInfo::hasPrepaid()` **(ICF 折叠)** |
| `0x0A74D0` | `48 89 5C 24 10 48` | `B8 01 00 00 00 C3` | `checkFeatureAllow()` → 恒 `Allow(1)` |
| `0x0A8040` | `48 89 5C 24 10 56` | `31 C0 C3` | `featureStatus()` → 恒 `Available(0)` |
| `0x0A86F0` | `48 89 5C 24 08 57` | `32 C0 C3` | `isProFeature()` → 恒 `false` |
| `0x0A84B0` | `40 53 48 83 EC 20` | `B0 01 C3` | `hasActivatedTrialAccess()` → 恒 `true` |
| `0x0A8C30` | `40 53 55 56 57 48` | `C3` | `rescheduleTrialExpireTimer()` → 禁用倒计时 |
| `0x09D560` | `40 55 53 56 57 41` | `C3` | `showSubscriptionTrialReminder()` → 抑制弹窗 |

> 补丁语义：`B0 01 C3` = `mov al,1; ret`；`31 C0 C3` = `xor eax,eax; ret`；`C3` = `ret`。
> 全部为**帧未分配即返回**，无栈平衡风险。

### 2.3 ICF 折叠放大失效面

MSVC 链接器把语义完全相同的函数折叠到同一地址：

```
0x1800EE7B0  ← 同时承载两个导出符号
              ├─ ?hasPrepaid@VipInfo@项目L_Auth@@QEBA_NXZ
              └─ ?isVip@PrepaidInfo@项目L_Auth@@QEBA_NXZ
```

**影响**：1 处补丁顺带覆盖 2 个判定符号 → 单点失效影响面被放大。

---

## 三、能力二：翻译服务端算力本地化（大模型网关）

### 3.1 问题本质

翻译功能**没有本地模型**，必须请求云端。官方把 API 基地址硬编码在 `项目L.exe` 中：

```
RVA 0x2052D0  构建 Base URL 的 lambda:
  mov  edx, 0x15                     ; strlen("https://api.项目L.cn") = 21
  lea  rcx, [rip + 0xAEC3EF]         ; 指向常量字符串
  call QString::fromLatin1
  ...
  lea  rdx, [rip + 0xAEC3DB]         ; .com 分支
```

该常量经 `项目L_Net::registerVariableCallback("API_ENDPOINT", λ)` 注册为 `{API_ENDPOINT}` 变量，
被端点路径引用：

```
{API_ENDPOINT}/api2/ai/translate/text     → TranslateTextAI
{API_ENDPOINT}/api2/ai/translate/image    → TranslateImageAI
{API_ENDPOINT}/api2/tr/translate/text     → TranslateText
{API_ENDPOINT}/api2/tr/translate/image    → TranslateImage
```

### 3.2 内存重定向（3 处补丁）

| RVA | 原始 | 补丁 |
| :--- | :--- | :--- |
| `0xCF16E0` | `"https://api.项目L.cn"` | `"http://127.0.0.1:8787"` |
| `0x2052E5` | `BA 15 00 00 00` | `BA <len> 00 00 00` |
| `0x2052EA` | `48 8D 0D EF C3 AE 00` | `48 8D 0D <新 disp>` |
| `0x205316` | `48 8D 15 DB C3 AE 00` | `48 8D 15 <新 disp>` |

### 3.3 内嵌本地网关

代理库启动一个 `127.0.0.1` HTTP 服务（Winsock），承担**协议转换层**：

```
项目L.exe ──▶ 本地网关 ──┬─ /api2/*/translate/*  ──▶ 解析请求
                          │                          └─▶ 调用任意大模型 API (WinHTTP/HTTPS)
                          │                              └─▶ 转回 项目L 期望的 JSON
                          └─ 其它请求 (登录/账号/JWT) ──▶ 透明回源官方 API
```

**支持的大模型 API（自动识别协议风格）**：

| 风格 | 识别特征 | 请求格式 | 响应路径 |
| :--- | :--- | :--- | :--- |
| OpenAI 兼容 | 默认 | `POST /chat/completions` | `choices[0].message.content` |
| Google Gemini | `generativelanguage.googleapis.com` | `POST /v1beta/models/{m}:generateContent` | `candidates[0].content.parts[*].text` |
| Anthropic | `anthropic.com` | `POST /v1/messages` | `content[0].text` |

实测可直接对接：OpenAI / DeepSeek / Gemini / Claude / Kimi / 智谱 GLM / 通义千问 / Ollama / one-api 中转。

### 3.4 实测日志

```
bridge: listening on http://127.0.0.1:8789  (llm=https://api.deepseek.com/chat/completions)
bridge: {API_ENDPOINT} -> http://127.0.0.1:8789 (自定义大模型已接管)
bridge: -> https://api.deepseek.com/chat/completions (style=1 model=deepseek-chat len=35)
bridge: <- HTTP 401 (204 bytes)
bridge: translate done (193 bytes)
```

---

## 四、能力三：云控与自动更新剥离

| 云控函数 | RVA | 原始特征码 | 补丁 | 作用 |
| :--- | :--- | :--- | :--- | :--- |
| `项目L_Upgrade::checkNewVersion` | `0x452070` | `40 55 53 56 57 41 54` | `31 C0 C3` | 禁用自动更新检查 |
| `UserConfigGet` | `0x1C8BB0` | `40 55 53 56 57 41 56` | `31 C0 C3` | 禁用云端配置**下发** |
| `UserConfigUpdate` | `0x1C8DD0` | `40 55 53 56 57 41 56` | `31 C0 C3` | 禁用云端配置**上报** |

**更新检查原始 URL**（独立域名，不经 `{API_ENDPOINT}`）：

```
https://upgrade.项目L.cn/api/check/%1/%2/%3/%4/%5/%6/%7
```

**剥离后实测**：`项目L.exe` 不再直连任何外部主机，全部流量仅指向 `127.0.0.1`；
`upgrade.项目L.cn` 请求数为 **0**。

---

## 五、UI 注入（翻译设置面板）

### 5.1 面板控件布局

`PdConf::ConfWidgetTranslateKey`（`ui` 结构体位于 `widget + 0x60`）：

| 控件 | 偏移 | 类型 |
| :--- | :--- | :--- |
| `cmbService`（翻译服务下拉框） | `widget + 0x88` | `QComboBox*` |
| `chkCustomApiKey` | `widget + 0x90` | `QCheckBox*` |
| `edtID`（APP ID 输入框） | `widget + 0xB0` | `QLineEdit*` |
| `edtKey`（密钥输入框） | `widget + 0xB8` | `QLineEdit*` |
| vtable（`[3]` = scalar deleting dtor） | RVA `0xCE8228` | — |

### 5.2 注入实现（复刻官方写法）

```cpp
cmbService->insertItem(cmbService->count(), QIcon(),
                       tr("自定义翻译源"), QVariant(QString("custom")));
```

---

## 六、★ 四个致命坑点（本案例核心技术沉淀）

> 这四个坑全部会导致**进程崩溃**，且崩溃点与根因相隔数个模块，极难定位。
> 排查手段：**细粒度断点日志 `[1]~[6]` + 崩溃转储 minidump 解析**。

### 坑 1：5 字节 rel32 跳转溢出（`0xC0000005 EXECUTE`）

**现象**：打开设置面板即崩溃，异常码 `0xC0000005`，参数 `0x8`（执行不可访问内存）。

**根因**：宿主 EXE 与注入 DLL 在 64 位地址空间上可相隔 **9 GB+**（实测 `dist=0x223B4D140`），
远超 rel32 的 ±2 GB 范围。截断后跳转落点回绕到不可执行页：

```
CtorHook 实际地址 : 0x7FF9FE1D1D70   (注入 DLL)
宿主目标地址      : 0x7FF7DA684C80
间距 = 0x223B4D0EB > 2 GB  → rel32 截断
落点 = 0x7FF7FE1D1D70 (不可执行页) → EXECUTE 访问违例
```

**修复**：必须使用 **14 字节绝对跳转**

```asm
FF 25 00 00 00 00     ; jmp qword ptr [rip+0]
<8 字节绝对地址>
```

覆盖目标函数前 15 字节（3 条完整指令），无指令切断风险。

### 坑 2：构造函数返回值 `rax` 丢失（野指针 → 延迟堆损坏）

**现象**：设置面板打开后约 1 秒崩溃于 `Qt5Widgets.dll` 布局代码（**不是** Hook 点）。

**根因**：MSVC x64 约定下构造函数在 `rax` 中返回 `this`，而宿主工厂函数直接 `ret` 把 `rax` 交给调用方：

```asm
mov  ecx, 0xe0
call operator new          ; 分配对象
...
call <ctor>                ; 构造函数 (rax = this)
ret                        ; ← 直接把 rax 作为新对象指针返回
```

Hook 若声明为 `void`，末尾调用其他函数后 `rax` 变成垃圾值 → 调用方拿到野指针 → **延迟内存损坏**。

**修复**：Hook **必须返回 `self`**。

### 坑 3：漏转发第 3 个参数 `r8`（基类构造拿到垃圾指针）

**现象**：崩溃于构造函数**内部**（断点日志停在 `[2] original ctor calling...`，未到 `[3]`）。

**根因**：工厂函数反汇编显示构造函数是**三参数**：

```asm
mov  r8, rbx          ; ← 第 3 个参数！
mov  rdx, rdi
mov  rcx, rax         ; this
call <ctor>           ; ctor(this, arg1, arg2)
```

而该构造函数首部**直接以当前 `rcx/rdx/r8` 调用基类构造函数**，漏掉 `r8` 即崩溃。

**修复**：Hook 签名必须为三参数 `void* CtorHook(void* self, void* a2, void* a3)`。

### 坑 4：trampoline 栈语义错误

**现象**：同坑 2/3，难以区分。

**根因**：trampoline 被 `call` 进入时栈上多压 8 字节返回地址，原函数把「影子空间」
（`mov [rsp+0x10], rbx` 等）写进了 Hook 函数的栈帧，破坏局部变量。

**修复**：改用标准 **unhook-call-rehook**：

```
1) 还原目标函数原始字节
2) 以普通 call 调用原函数 (栈语义 100% 正确)
3) 重新写入绝对跳转
```

### 坑 5（网关侧）：JSON 解析器内存分配 BUG

```c
JVal* o = jnew(JOBJ);
o->keys = calloc(8, ...);
o->cap  = 8;        /* ← 设了容量却没分配 items 数组！ */
/* items 仍为 NULL → jpush 认为还有空间 → 写 NULL → 崩溃 */
```

**修复**：补上 `calloc` 并给 `jpush` 加防御性检查。

### 坑 6（网关侧）：Windows `SO_REUSEADDR` 允许多进程重复绑定同端口

**现象**：请求被僵死进程吞掉，客户端超时。

**修复**：改用 **`SO_EXCLUSIVEADDRUSE`** 独占绑定，端口被占则自动顺延。

---

## 七、双向彻底还原

| 步骤 | 动作 |
| :--- | :--- |
| 1 | 枚举并强制结束进程族（主程序 + 辅助进程），解除文件句柄锁定 |
| 2 | 用 `项目L_Auth.dll.orig` 覆盖恢复官方原版 |
| 3 | 删除 `项目L_AuthReal.dll` / `项目L_hook.ini` / `项目L_hook.log` 全部注入痕迹 |
| 4 | 复读校验 SHA256 = `c6a3d871...`，文件大小 = 3,766,072 字节 |
| 5 | 清理官方备份，状态回落为 `original` |

---

## 八、弱点总结（CWE-602）

| 弱点 | 说明 |
| :--- | :--- |
| **本地布尔判定** | 14 项特权全部由本地函数决定，无签名绑定 |
| **单一入口可恒值化** | `mov al,1; ret` 即可解除整个功能域 |
| **无完整性自校验** | 鉴权库无 CRC/哈希自检，替换 DLL 即生效 |
| **IAT 导入可代理** | 282 个符号全部按名导入，可用 PE Forwarder 完整顶替 |
| **API 端点可变量化** | `{API_ENDPOINT}` 由可注册回调提供，端点可任意改写 |
| **无 SSL Pinning** | 云端算力可整体本地化，服务端计费闭环失效 |
| **云控无签名校验** | 云端配置下发/更新检查无客户端校验，可整体剥离 |
| **ICF 折叠放大失效面** | 单点补丁覆盖多符号 |

---

## 九、纵深防御修复方案

1. **客户端加固**
   - 14 项特权判定下沉 Native + 代码虚拟化（VMProtect / Themida）；
   - `.text` 段运行时 CRC 自校验 + 关键函数页 `PAGE_EXECUTE_READ` 写保护；
   - 编译期禁用 ICF（`/OPT:NOICF`）避免单点失效扩散；
   - 反调试 / 反内存补丁：`CheckRemoteDebuggerPresent` + 硬件断点检测；
   - **关键**：对 `项目L_Auth.dll` 做签名校验（导入前校验 Authenticode / 内嵌哈希）。

2. **传输层收敛**
   - 全链路 TLS 双向证书绑定（SSL Pinning），阻断 API 端点重定向；
   - 请求级 Sign + Nonce + Timestamp 动态签名；
   - 端点基地址改为服务端签发（含时效），禁止本地常量。

3. **服务端权威闭环**
   - 特权状态不落本地布尔值，改为服务端签发的**短期 License Token（Ed25519 + Valid-Until）**；
   - 核心权益（翻译/OCR 额度）以服务端异步通知 + 二次验签为唯一凭据；
   - 云端配置下发必须**签名 + 客户端验签**，更新检查强制 TLS Pinning。

---

## 十、脱敏策略说明

| 层级 | 处理 | 本案例示例 |
| :--- | :--- | :--- |
| 产品名 / 可执行文件名 | **已替换** | `项目L.exe` / `项目L_Auth.dll` |
| 代码标识符（本工具自建） | **已替换** | `项目L_hook.c` / `项目L_bridge.c` |
| 官方域名 | **保留原文** | `api.项目L.cn` / `upgrade.项目L.cn` |
| 第三方组件名 | **保留原文** | `Qt5Core.dll` / `Qt5Widgets.dll` / `WinHTTP` |
| 结构体 / 符号名 | **已替换** | `?isVip@VipInfo@项目L_Auth@@...` |

> 判据：删掉后**无法复现**的 → 保留；只是「读起来像产品名」的 → 替换。

---

INT0 COLLECTIVE // 学术研究用途 // 支持正版 (https://项目L.cn/)
