---
id: "pe-reverse/10-license-keygen/09-runtime-callstack-locating"
title: "运行时调用栈定位法（静态 xref 断裂时的破局）"
title_en: "Runtime Call-Stack Locating When Static Xrefs Break"
summary: >
  当目标行为（如「某条件下弹出某窗口」）由 vtable / 函数指针间接调用触发时，静态交叉引用会
  完全断裂。本笔记给出以 Frida 钩统一系统入口、抓取回溯栈、静态 VA 换算、SEH handler 噪声
  排除、运行时解出加密字符串（键名/值名）为核心的定位方法论，并配套三组对照实验的假阳性
  排除纪律，避免把测试方法副作用误判为产品缺陷。
summary_en: >
  When a target behavior (e.g. "show a dialog under condition X") is triggered through vtable or
  function-pointer indirection, static cross-references break down entirely. This note presents a
  locating methodology built on Frida hooks at a unified system entry point, backtrace capture,
  static-VA-to-runtime address translation, SEH-handler noise filtering, and runtime resolution of
  encrypted strings (key/value names), plus a three-group controlled-experiment discipline that
  prevents test-method side effects from being misdiagnosed as product defects.
board: "pe-reverse"
category: "10-license-keygen"
signals:
  - "静态 xref 断裂"
  - "vtable 间接调用"
  - "函数指针"
  - "运行时定位"
  - "Frida 调用栈"
  - "Thread.backtrace"
  - "ASLR 地址换算"
  - "SEH handler 噪声"
  - "加密字符串"
  - "注册表值名"
  - "对话框定位"
  - "假阳性排除"
  - "对照组实验"
  - "弹窗触发条件"
difficulty: "advanced"
platform: ["windows"]
arch: ["x86"]
created: "2026-09-27"
---

# 运行时调用栈定位法

## 场景

目标程序在某个条件下弹出一个窗口，需要回答：**是谁、在什么条件下弹的？**

静态分析通常能定位**已知位点**（有明确特征码的补丁点），但当目标是
「**触发条件**」时，会撞上间接调用墙：

| 静态尝试 | 典型结果 |
|---|---|
| 搜索对话框标题/正文字符串 | 资源为英文，UI 中文来自语言包 → **全失败** |
| 反汇编对话框创建 API 调用点 | 仅 1 处 → 说明是**统一入口**动态构造 |
| 反查资源 ID 的写入点 | **0 处** → ID 经 vtable 传递，无 `call rel32` |
| 搜索 `call <弹框函数>` | 多处调用点，**无法判定哪条是目标路径** |

**卡点本质**：x86 成员函数经 vtable / 函数指针传递时，静态 xref 会彻底断裂。
此时继续静态推演性价比极低，应立刻切换到动态插桩。

## 输入信号

- 「某窗口/弹窗在特定条件下出现」但找不到触发分支
- 静态 xref 稀疏或为空（vtable / 函数指针 / 回调表）
- 关键字符串（键名、值名、消息模板）在静态数据段中为 **NULL**（运行时初始化）
- 程序有 ASLR，需要把静态 VA 映射到运行时地址

---

## 一、 钩统一系统入口

绝大多数 GUI 程序最终都会经过少数几个系统 API 创建窗口。
优先钩这些**收敛点**，而不是猜内部函数：

| 目标类型 | 推荐钩点 |
|---|---|
| Win32 对话框 | `CreateDialogIndirectParamA/W`、`DialogBoxIndirectParamA/W` |
| Win32 窗口 | `CreateWindowExA/W` |
| 消息框 | `MessageBoxA/W` |
| 文件访问 | `CreateFileA/W` |
| 注册表 | `RegQueryValueExA/W`、`RegOpenKeyExA/W` |

```javascript
var user32 = Process.getModuleByName("user32.dll");
var api = user32.getExportByName("CreateDialogIndirectParamA");
Interceptor.attach(api, {
  onEnter: function (args) {
    console.log("TITLE=" + JSON.stringify(dumpTitle(args[1])));
    Thread.backtrace(this.context, Backtracer.FUZZY).slice(0, 16).forEach(function (a) {
      var m = modOf(a);
      console.log("   " + a + "  " + m.name + "+0x" + a.sub(m.base).toString(16));
    });
  }
});
```

> **Frida 17 API 变更**：`Module.findExportByName` 已移除。
> 改用 `Process.getModuleByName("user32.dll").getExportByName("...")`
> 或 `Module.getGlobalExportByName("...")`。

### 1.1 解析对话框模板标题

模板首字段判断是否为扩展格式，再依次跳过 menu / class，读 title：

```javascript
function dumpTitle(p) {
  var off = (p.readU16() == 1 && p.add(2).readU16() == 0xffff) ? 26 : 18;
  var q = p.add(off);
  // menu
  if (q.readU16() == 0) q = q.add(2);
  else if (q.readU16() == 0xffff) q = q.add(4);
  else { while (q.readU16() != 0) q = q.add(2); q = q.add(2); }
  // class
  if (q.readU16() == 0) q = q.add(2);
  else if (q.readU16() == 0xffff) q = q.add(4);
  else { while (q.readU16() != 0) q = q.add(2); q = q.add(2); }
  return q.readUtf16String();
}
```

> **注意**：DLGTEMPLATE 的 menu / class / title 是 **null 结尾**字符串，
> 不是长度前缀。按长度前缀解析会整体错位（但仍可能"看起来"读到半截文本，极具迷惑性）。

---

## 二、 静态 VA → 运行时地址换算

模块基址随 ASLR 浮动。以镜像首选基址为基准算 delta：

```javascript
var mainMod = Process.enumerateModules()[0];
var delta = mainMod.base.sub(ptr("0x400000"));   // 首选基址 0x400000
function sa(va) { return ptr(va).add(delta); }
```

这样就能在任意静态 VA 下钩子：

```javascript
Interceptor.attach(sa("0x48E271"), { onEnter: function () { /* ... */ } });
```

### 2.1 回溯栈输出标注静态 VA

```javascript
function fmt(a) {
  var m = modOf(a);
  var off = a.sub(m.base);
  var s = m.name + "+0x" + off.toString(16);
  if (m.name.toLowerCase() == "target.exe") s += "  [VA 0x" + off.add(0x400000).toString(16) + "]";
  return a + "  " + s;
}
```

直接把运行时地址翻译回**静态 VA**，可无缝衔接 IDA / capstone 反汇编。

---

## 三、 从回溯栈提炼真调用者

典型输出：

```
TITLE="Target Application Registration"
  0x612A0A   CreateDialogIndirectParamA 内部
  0x618D12
  0x62F293
  0x612BB1   DoModal 包装
  0x62D971
  0x489683   ← 触发点（call 的下一条指令）
  0x669DCB   ← ★ SEH handler，噪声
  0x48E276   ← 真调用者
```

### 3.1 SEH handler 噪声必须排除

MSVC 的 `__try` 会把 handler 地址压栈，回溯时**会混入栈帧**。
识别方法：**函数序言处 `push -1` / `push <handler>`** 的第二个立即数即为 handler 地址。

```asm
00489620  6A FF           push -1
00489622  68 CB9D6600     push 0x669dcb      ← 这就是回溯里那个"调用者"
```

> 把回溯帧与反汇编交叉比对，凡是不构成 `call` 的帧一律剔除。

### 3.2 触发点 = `call` 的下一条指令

回溯里出现的 `0x489683` 实为 `call 0x612aac` 的返回地址。
回看该地址**前一条指令**，即拿到真正的调用点与参数。

---

## 四、 运行时解出被加密的字符串

程序常把键名/值名存为**运行时初始化的全局指针**，静态数据段读到的是 `NULL`。

解法：在判定点下钩子，读全局指针再解引用：

```javascript
Interceptor.attach(sa("0x48E271"), {
  onEnter: function () {
    var vp = ptr("0x788604").add(delta).readPointer();   // 全局指针 → 字符串地址
    console.log("值名 = " + vp.readAnsiString());
  }
});
```

输出：

```
[0x788604] 值名指针 = 0x6547270 -> "Serial"
```

> **这一步是定性关键**。在此之前所有推断都只是假设；
> 读出真实键名后，与实现策略一对照，根因瞬间闭合。

### 4.1 同时钩注册表 API 做交叉印证

```javascript
Interceptor.attach(adv.findExportByName("RegQueryValueExA"), {
  onEnter: function (args) {
    console.log("[RegQueryValueExA] hKey=" + args[0] + " name=" + JSON.stringify(args[1].readAnsiString()));
  }
});
```

**注意**：全局钩会产生海量噪声（如遍历 `SOFTWARE\Classes` 的扩展名关联）。
建议在判定点附近**精确钩**，或对输出做过滤。

---

## 五、 假阳性排除纪律（三组对照实验）

修复上线前**必须**构造对照组，否则会把测试方法的副作用误判为产品缺陷。

### 5.1 实例：集成文件告警

补丁产物在**孤立目录**运行时弹出
`cannot find 21 file(s) that are necessary for browser and system integration`。

| 场景 | 依赖文件 | 原缺陷现象 | 新告警 |
|---|---|---|---|
| 未打补丁 @ 孤立目录 | 无 | 有 | 无 |
| 已打补丁 @ 孤立目录 | 无 | 无 | **有** |
| **已打补丁 @ 完整目录** | **齐全** | **无** | **无** |

**机理**：补丁让程序正确走「已注册」路径 → 继续执行集成文件自检；
孤立目录当然自检失败。真实安装目录文件齐全，不会报。

### 5.2 纪律

```
任何"补丁引入的新现象"必须三组齐备才能定性：
  ① 未打补丁 + 原环境     ← 基线
  ② 已打补丁 + 原环境     ← 缺陷确认
  ③ 已打补丁 + 完整环境   ← 假阳性排除
缺任一组，就可能把测试假阳性当缺陷追一整天。
```

### 5.3 隔离测试的通用陷阱

从安装目录**复制单个 exe** 到临时目录运行，会破坏程序的相对资源查找：

- 集成文件（浏览器扩展、Shell 扩展、语言包）
- 同目录 DLL 依赖
- 资源清单

**正确做法**：要么复制**整个安装目录**，要么直接在原目录做**备份 → 替换 → 测试 → 还原**。

---

## 六、 完整流程

```
1. 钩收敛点    系统级统一入口（对话框/窗口/消息框/注册表）
2. 抓回溯栈    Thread.backtrace + 静态 VA 标注
3. 剔噪声      排除 SEH handler、非 call 帧
4. 定位触发点  回溯帧 → 反汇编确认 call 指令
5. 读加密串    判定点钩子 + 全局指针解引用
6. 反推条件    回看函数内 test/je/jne 链
7. 打桩        优先在判定面（二进制分支）而非策略面（注册表）
8. 三组对照    排除测试假阳性
9. 回归        端到端 + 幂等 + 差异白名单
```

## MCP 工具映射

| 攻击链步骤 | MCP 工具 | 说明 |
|---|---|---|
| 静态语义确认 | `ghidra_headless_analyze` / `mcp_ida_decompile_function` | 反编译触发点所在函数，确认判定链 |
| 资源定位 | `mcp_ida_list_strings_filter` | 搜对话框标题/正文，确认资源归属 |
| 交叉引用 | `mcp_ida_get_xrefs_to` | 对 API 调用点做 xref（间接调用时预期为空） |
| 运行时插桩 | `frida`（外部脚本） | 钩系统入口、抓栈、读加密串 |

## 证据与验证闭环

- 必须给出**完整回溯栈**（含静态 VA 标注）作为触发点定位证据。
- 必须给出**反汇编片段**证明触发点前一条指令是 `call`。
- 必须给出**运行时读出的真实键名/值名**，不能只有静态推断。
- 修复必须给出**三组对照实验结果表**，明确标注假阳性来源。
- 必须验证**版本自适应**：若新位点为某版本专属，需证明其它版本特征码零命中且不阻断。
- 回归测试须验证**对真实系统零副作用**（注册表与进程快照前后一致）。
