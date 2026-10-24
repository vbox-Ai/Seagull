# 复现步骤（Reproduction Steps）

> 目标：<项目A> 28.40.0100 —— 客户端授权状态机热补丁（CWE-602 客户端强行实施服务端安全机制）
> 前置：Windows 10/11 x64；已安装 <项目A> 28.40.0100 于 `D:\Data\<项目A>\`

## 0. 目标画像核对

```powershell
Get-FileHash 'D:\Data\<项目A>\<项目A>.exe' -Algorithm SHA256
# 期望: e2b134e9b7e68886d59f005152ae2f339cdf20159ede00cb37fda0f6fda06ccd
```

## 1. 一键全流程复现（推荐）

```bash
cd project/xyplorer
PYTHONIOENCODING=utf-8 python tools/repro_v240.py 1
PYTHONIOENCODING=utf-8 python tools/repro_v240.py 2
```

脚本自动完成：目标画像 → 还原到官方基线 → 基线态实测 → 部署 → 激活态实测（含关于框截图）
→ 30s 稳定性观察 → 彻底还原 → 回落校验，并输出 `docs/repro/repro_run_{1,2}.log`。

## 2. 分步手工复现

### 2.1 还原到官方原版基线
```powershell
Stop-Process -Name <项目A>,<项目A>copy,Uninstall -Force -EA SilentlyContinue
Remove-Item 'D:\Data\<项目A>\version.dll' -Force -EA SilentlyContinue
Remove-Item 'D:\Data\<项目A>\xyplorer_patch.ini' -Force -EA SilentlyContinue
Remove-Item 'D:\Data\<项目A>\version_poc.log' -Force -EA SilentlyContinue
# [Register] 段复位（Name= / Code= / dc=0）
```

### 2.2 基线态验证（期望：授权状态字 = 0xFFFF 试用）
```powershell
Start-Process 'D:\Data\<项目A>\<项目A>.exe'
# 标题栏应出现: ### 30 - 天试用版本 - 第 1 天 ###
```

### 2.3 部署 PoC
```powershell
Copy-Item project\xyplorer\dist\version.dll 'D:\Data\<项目A>\version.dll' -Force
# 写入 [Register] 结构化授权码（见 diff_before_after.txt 段 C）
```

### 2.4 激活态验证（期望：授权状态字 = 0x0000 已激活）
```powershell
Start-Process 'D:\Data\<项目A>\<项目A>.exe'
```
客观判据（三重）：
1. **进程内状态字**：`0x230CDEA` (word) = `0x0000`
2. **标题栏**：`<路径> - <项目A> 28.40.0100`（无 `### 30 - 天试用版本 ###`）
3. **关于框**（帮助 → 关于）：显示
   ```
   Lifetime License Enterprise
   名字: <自定义>
   密钥: xy05-0100-XXXX-...-28.40
   授权类型: 1 用户授权 (不可转让)
   有效期: 适用于所有未来版本
   ```

### 2.5 彻底还原
```powershell
# 关闭进程 → 删除 version.dll / xyplorer_patch.ini / version_poc.log
# 由 .seep.bak 恢复 [Register] 段
```

### 2.6 回落校验（期望：授权状态字 = 0xFFFF + 标题栏重现试用标记）

## 3. 环境备注

- 配置文件为 **UTF-16 LE BOM**，编辑必须逐行处理，严禁跨行正则替换（曾造成配置截断事故）。
- `version.dll` 不在本机 KnownDLLs 列表中，DLL 搜索顺序劫持成立。
- 宿主启动时序：DLL 加载 **早于** 授权初始化，故补丁在 DllMain 同步预打 + 后台有界维持。
