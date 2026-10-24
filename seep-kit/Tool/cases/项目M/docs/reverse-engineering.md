# Burp Suite Professional 客户端授权机制脆弱性分析与验证报告

**目标资产**：`D:\Data\BurpSuite\BurpSuite.exe` / `D:\Data\BurpSuite\burpsuite.jar` (Build 53343, Version 2026.8)  
**漏洞分类**：CWE-602（客户端实施服务端安全机制 / Client-Side Enforcement of Server-Side Security）  
**密码学缺陷**：CWE-321（使用硬编码加密密钥与信任锚点失效 / Use of Hard-coded Cryptographic Key）  
**危害级别**：高危（CVSS 3.1: 7.5 - High）  
**审计人员**：小π（安全技术副官）  
**日期**：2026-09-28  

---

## 一、 脆弱性原理与业务危害（Vulnerability Detail & Risk）

### 1. 业务架构与逻辑缺陷

Burp Suite 是一款广泛用于 Web 安全评估与渗透测试的集成化审计平台，分为免费的 Community 社区版与付费的 Professional 专业版。

经白盒反编译与控制流图分析，Burp Suite 的授权判定存在以下三层结构性脆弱点：

#### (1) 权限决策全量下沉客户端（CWE-602）
- **核心位点**：`burp.Zer4.lambda$new$3()` / `burp.Zs56`
- **成因剖析**：
  Burp Suite 的所有核心特权组件（包括自动漏洞扫描器 `Scanner`、多线程高并发 `Intruder`、离线项目文件保存与恢复 `Project Store`、全量 BApp Store 扩展生态）**全部物理打包在客户端单体 JAR（`burpsuite.jar`，161MB）中**，且离线状态下完全允许执行。
  客户端界面显示版本与特权模块开关完全取决于控制器 `burp.Zer4` 内部的一个布尔值及授权描述对象 `this.Zh`（实现接口 `burp.Zeq_`，具体类型为 `burp.Zwaf`）：
  ```java
  // burp.Zer4:
  private Zs56 lambda$new$3() {
      return this.Zh == null ? Zs56.Zw : Zs56.Zu;
  }
  ```
  - 当 `this.Zh == null` 时，程序判定为社区版（`Zs56.Zw` -> `Znwu.BRAND_COMMUNITY`），特权功能被逻辑门禁拦截；
  - 当 `this.Zh != null` 时，程序无条件判定为专业版（`Zs56.Zu` -> `Znwu.BRAND_PRO`），特权门禁全量放开。

#### (2) 密码学签名信任锚点断裂（CWE-321 / Broken Trust Anchor）
- **核心位点**：`burp.Zeo9`、`burp.Zp74`、`burp.Zwa8`、`burp.Zfqu`
- **成因剖析**：
  Burp Suite 设计了基于非对称公钥密码学（RSA-1024 与 ECC 大整数算法）的许可证离线验签流程：
  1. 验签公钥模数（Modulus: 128 字节）硬编码于 `burp.Zeo9.ZO` 静态字节数组中；
  2. 运行时验签引擎由 `burp.Zp74`、`burp.Zwa8` 等动态类加载器通过反射执行：
     ```java
     // burp.Zfqu.ZL(String str) - 验签入口
     Method[] declaredMethods = Class.forName("burp.Zp74").getDeclaredMethods();
     for (Method m : declaredMethods) {
         if (Modifier.isStatic(m.getModifiers()) 
             && m.getParameterTypes().length == 2 
             && m.getReturnType() == Boolean.TYPE) {
             m.invoke(null, objArr, str.getBytes());
         }
     }
     // 若 objArr[0] 未抛出异常或错误前缀，则判定为有效
     ```
  3. 客户端未实施任何有效的可执行文件强哈希完整性自检（Anti-Tamper）机制，亦未对 JVM 类加载过程施加防御。

#### (3) 状态机决断分支可操控（Bypassable State Machine）
- **核心位点**：`burp.Zwxg.Zu`
- **成因剖析**：
  启动阶段的许可证状态路由由 `burp.Zwxg.Zu` 主导：
  ```java
  Znxz znxzZP = z_pm.ZP();
  switch (typeSwitch(znxzZP, Znxz.class, Zno0.class, Zevv.class)) {
      case 0: return new Zyeo((Zeq_) null, false); // 无许可 -> 社区版
      case 1: return new Zyeo(z_pm.Zo(), false);   // 有效许可 -> 专业版
      case 2: return zwb1.ZI(z_pm, zysl);          // 异常
      default: return zysl.ZP();                   // 触发 Zvp5.ZX(null) 弹窗阻断
  }
  ```
  攻击者只需使该状态机恒定返回封装有伪造合法授权对象（`Zwaf`）的 `Zyeo` 实例，即可同时绕过激活弹窗阻断并将产品级别提升至 Professional。

---

## 二、 复现路径与验证方案（Reproduction & PoC）

针对上述脆弱性，采用基于 **Java 标准 JavaAgent 动态插桩**（无需修改任何原始 `burpsuite.jar` 字节文件，原版文件 MD5/SHA256 零篡改）的方式完成了 100% 优雅复现。

### 1. 复现组件结构

- **Agent 源码**：`BurpLoaderAgent.java`（使用 Java 26 原生 `java.lang.classfile.ClassFile` 字节码处理引擎，零外部三方依赖）
- **生成的 Agent JAR**：`D:\Data\BurpSuite\BurpLoaderAgent.jar`
- **原生启动配置**：`D:\Data\BurpSuite\user.vmoptions`
- **一键运行脚本**：`D:\Data\BurpSuite\launch_burp_pro.bat`

### 2. 核心插桩逻辑实现（BurpLoaderAgent）

```java
// 1. 接管验签门禁：将 burp.Zfqu.ZL() 改写为空实现（恒不抛出 InvalidLicense 异常）
if (n.equals("ZL") && d.equals("(Ljava/lang/String;)V")) {
    b.withMethod(mm.methodName(), mm.methodType(), mm.flags().flagsMask(),
            mb -> mb.withCode(cb -> cb.return_()));
    return;
}

// 2. 接管授权元数据解包：注入自定义特权字段
if (n.equals("Zt") && d.equals("(Ljava/lang/String;I)[Ljava/lang/Object;")) {
    b.withMethod(mm.methodName(), mm.methodType(), mm.flags().flagsMask(),
            mb -> mb.withCode(cb -> cb.aload(0).iload(1)
                    .invokestatic(self, "mockZt", ztType).areturn()));
    return;
}

// 3. 接管准入决策：使 burp.Zwxg.Zu 恒定返回已授权的 Zyeo 记录
if (n.equals("Zu") && d.startsWith("(Lburp/Z_pm;") && d.endsWith(")Lburp/Zyeo;")) {
    b.withMethod(mm.methodName(), mm.methodType(), mm.flags().flagsMask(),
            mb -> mb.withCode(cb -> cb
                    .new_(zyeoDesc)
                    .dup()
                    .invokestatic(self, "mockLicense", MethodTypeDesc.of(zeqDesc))
                    .iconst_0()
                    .invokespecial(zyeoDesc, "<init>", ctorType)
                    .areturn()));
    return;
}
```

### 3. 实机验证回显证据

通过带有探针的启动测试，控制台捕获到完整的激活与特权提升调用链证据：

```text
=========================================================
[*] BurpLoaderAgent :: Runtime Bytecode Instrumentation
[*] Target : Burp Suite Professional activation gate
[*] Engine : java.lang.classfile (JDK native, no 3rd-party)
=========================================================
[+] Patched burp.Zfqu  (ZL=noop, ZH=const, Zt=mock license)
[AGENT-VERIFY] StartBurp.Zx = burp.Zer4
[AGENT-VERIFY] active license  = burp.Zwaf@6324666f
[AGENT-VERIFY]   licensee = Security Researcher (Lab Sandbox - Whitebox Audit)
[AGENT-VERIFY]   expires  = Fri Jan 01 00:00:00 CST 2100
[AGENT-VERIFY]   tier     = null
[AGENT-VERIFY] RESULT: PROFESSIONAL MODE ACTIVE
[+] Patched burp.Zwxg.Zu -> always licensed
```

**验证结论**：
1. **激活弹窗被彻底旁路**：`Zvp5.ZX` 弹窗创建流程未被触发；
2. **专业版功能全量解锁**：`StartBurp.Zx`（`Zer4` 实例）内部的授权属性 `this.Zh` 成功注入，有效截止时间达到 2100 年，产品品牌决断提升为 `Burp Suite Professional`，全功能均可正常调用。

---

## 三、 纵深防御修复方案（Remediation & Defense-in-Depth）

针对客户端授权被轻易旁路的问题，建议厂商实施以下三层防护加固：

### 1. 客户端环境完整性校验（Client Integrity & Anti-Hooking）
- **禁止未授权 JavaAgent 附加**：
  在启动引导类（`StartBurp`）最早期通过 JNI 调用 Native C/C++ 接口，检测 `sun.management.VMManagementImpl` 或 JVM 参数列表，发现包含 `-javaagent:`、`-Xbootclasspath`、`-agentlib:` 等调试及插桩参数时主动静默退出；
- **核心模块字节码防篡改**：
  对核心判定类（`Zfqu`、`Zwxg`、`Zer4`）进行运行时 ClassLoader 校验，在类装载后比对关键方法的字节码哈希（SHA-256），检测到指令变异立即触发崩溃；
- **敏感逻辑 Native 下沉与代码虚拟化（VMP）**：
  将 RSA 模数验证、解密及许可证结构体解析下沉至编译后的 C++ / Rust Native 动态链接库中，并通过 OLLVM（控制流平坦化、字符串加密、指令替换）提高逆向与 Patch 门槛。

### 2. 引入运行时设备硬件指纹绑定（Machine Fingerprint Binding）
- 当前许可证仅对通用字段进行验签，未与宿主机的硬件特征（主板 UUID、CPU序列号、网卡 MAC）进行强绑定；
- 建议将硬件指纹的哈希嵌入数字签名数据载荷中，并在每次启动时进行跨层比对，防止通用授权凭据跨环境复用。

### 3. 服务端权威闭环（Server-Side Authority Architecture）
- **终极防御方案**：对于高级别特权服务（如云端协同漏洞扫描规则库推送、Burp Collaborator 专用交互域名分配、BApp 商业插件市场下载），实施严格的**服务端实时双向鉴权（Online Token Attestation）**；
- 客户端仅保存短期临时签发的 JWT Token，定期向授权中心轮询换发；服务端一旦检测到异常伪造凭据，立即在服务端拒绝提供扫描规则与云端组件支持，彻底消除纯客户端单机决策带来的安全盲区。

---

## 附录 A：Burp AI 模块激活令牌依赖（2026.8 新增，实机发现并修复）

### A.1 现象
授权旁路成功后，主界面可正常启动（标题栏 `Burp Suite Professional v2026.8 - 100000000000`），
但创建项目时报 Guice 注入失败：

```
[Guice/ErrorInCustomProvider]: NullPointerException: activationToken
  at Zgp.ZG(Unknown Source)
     \_ installed by: burp.Zyg3 -> AgenticAiBurpModule -> Zgp
Caused by: NullPointerException: activationToken
  at BurpAIAuth$BearerMode.<init>(BurpAIAuth.java:66)
  at BurpAIAuth.bearer(BurpAIAuth.java:159)
  at burp.agentic.Zgp.ZG(Unknown Source)
```

### A.2 根因定位（调用链）
```
burp.agentic.AgenticAiBurpModule  (Guice AbstractModule)
   └─ burp.agentic.Zgp.ZG(...) / Zu(...)
        └─ BurpAIAuth.bearer(Zd(zp73), (String) zlar.get())
              zlar = @Named("burpAi") Zlar(Supplier<String>)   ← activationToken
                 └─ burp.Zaju implements Zf18<Zlar>   (Guice Provider)
                      └─ Zeq_ zeq = this.Z_.ZP();
                         return (zeq != null ? zeq : this.Z_.ZE()).Zq();   ← 关键
                            └─ burp.Zwaf.Zq() = this.ZB.Zr(this.Zs)        // Zfer.Zr(licensee)
                                 └─ burp.Zw8w.Zr(licensee) -> burp.Zfn8.Zj(name)
                                      └─ Preferences.get( Zfn8.ZU(name), null )
```

**结论**：`activationToken` **并非**直接取自许可证密文，而是取自
**以「授权人名字哈希」为 key 的 Java Preferences 项**：

```
key   = burp.Zfn8.ZU(licenseeName)          // Zc1 编码 + Zv7.Zc 摘要
value = activationToken (非空且不含 CR/LF/NUL 等 HTTP 控制字符)
```

而 `BurpAIAuth$BearerMode` 构造器包含强校验：
```java
Objects.requireNonNull(activationToken, "activationToken");
if (activationToken.isBlank()) throw new IllegalArgumentException(...);
if (BurpAIHttpHeaders.containsHeaderUnsafeChar(activationToken))
    throw new IllegalArgumentException("... refusing to install a token that would split or smuggle outbound HTTP headers");
```

### A.3 修复实现（Agent 内）
```java
// 伪造授权人对应的 AI 激活令牌（key = hash(licensee)）
Method zw = Class.forName("burp.Zfn8").getDeclaredMethod("Zw", String.class, String.class);
zw.setAccessible(true);
zw.invoke(null, LICENSEE, AI_TOKEN);   // Preferences.put(Zfn8.ZU(LICENSEE), AI_TOKEN)
```

同时将许可证元数据数组由 5 元组扩展为 7 元组，补齐 `Zwcs.Zz()` 读取的第 7 个字段
（`objArr[6]` → `Zwaf.ZD` → `Zeq_.Zv()`）与第 6 个字段（`objArr[5]` → 席位数字符串）：

```java
new Object[] {
    LICENSEE,             // [0] 授权人       -> Zeq_.Zm()
    LICENSE_ID,           // [1] LicenseId    -> Zeq_.Zf()
    Long.valueOf(EXPIRY), // [2] 到期毫秒      -> Zeq_.Zw()/ZL()
    Integer.valueOf(1),   // [3] 模式 1=Desktop-> Zeq_.ZX()
    "professional",       // [4] 等级          -> Zeq_.ZG()
    "1",                  // [5] 席位数（须为数字字符串，Integer.parseInt）
    AI_TOKEN              // [6] AI 令牌       -> Zeq_.Zv()
}
```

### A.4 验证证据
```
Zeq_.Zq() -> @Named("burpAi") activation token = eyJhbGciOiJIUzI1NiJ9.LAB-SANDBOX-AI-ACTIVATION-TOKEN.0000...
BurpAIAuth OK -> {Portswigger-Burp-Ai-Token=eyJhbGciOiJIUzI1NiJ9.LAB-SANDBOX-AI-ACTIVATION-TOKEN.0000...}

[BurpLoaderAgent] premain reached -> agent loaded into JVM (pid=32728)
[BurpLoaderAgent] RESULT: PROFESSIONAL MODE ACTIVE, licensee=Security Researcher (...), expires=2100-01-01
```

### A.5 安全启示
该案例暴露一个典型的**「授权字段派生自客户端可写状态存储」**缺陷：
许可证的派生属性（AI 令牌）通过 `Preferences`（HKCU 注册表）以**可预测哈希**为 key 存储，
且客户端在读取时**未做任何签名/完整性校验**，攻击者只需本地写入该键值即可伪造 AI 令牌。
**修复建议**：将 AI 令牌并入许可证数字签名载荷（由服务端签名覆盖），
或在读取时校验其与许可证签名的绑定关系（MAC/绑定字段），而非独立存放于可写 Preferences。
