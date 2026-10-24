# DeepSeek Harness Profile — Seep 逆向工作台

> 将此补丁导入 DSH Profile 目录，或通过 `--patch` 命令行动态挂载。
> DeepSeek Harness 的 MCP 遵循官方 Cordis Overlay 补丁标准，通过 `@deepseek-ai/dsh-mcp-client` 桥接。

---

## 一、 Agent 自动化部署与校验指令 (DSH 专属)

当用户在 DSH WebUI 或 CLI 对话框要求 **“部署工作台”** 或 **“校验安装是否完整”** 时：

### 1. 部署执行
```bash
cd setup
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

### 2. 自动生成无占位符的 Cordis 补丁
运行以下辅助脚本，自动解析当前物理路径并生成绝对路径配置：
```powershell
powershell -ExecutionPolicy Bypass -File .\setup\generate-configs.ps1
```
生成的补丁文件存放在 `setup/cordis.generated.yml`，符合官方 `- insert:` 语法，可直接引用或合并。

### 3. 校验与汇报输出
Agent 必须运行根目录校验脚本并向用户输出结构化 Markdown 体检卡片：
```bash
powershell -NoProfile -ExecutionPolicy Bypass -File .\check.ps1
```
依次核验并汇报：
* 📁 核心架构 (Tool/ 完整性，13 大案例工程)
* 🛠️ 技能系统 (softseep, apkseep 等 9 个 Skill)
* 🔌 MCP 服务 (seep, ida, playwright, js-reverse)
* 🧠 提示词与 Lab 状态机
* 🔧 内置工具箱 (Jadx, Radare2, Apktool)
* 📚 战术知识库 (289篇)
* 📖 部署与战术手册 (MANUAL/)

全部通过后，提示用户在对话框发送 `lab：` 正式开工。

---

## 二、 官方标准 Cordis Overlay 补丁模板 (遵照 DSH 规范)

根据 [DeepSeek Harness 官方 MCP 规范](https://deepseek-harness.github.io/deepseek-harness/guide/mcp-memory)，DSH 在合并补丁时顶层使用 `- insert:` 语法：

```yaml
# ==============================================================================
# DeepSeek Harness 官方 Cordis Overlay 补丁格式
# 放置路径:
#   - 单个 Profile 生效: $DSH_HOME/profiles/<name>/cordis.patch.yml
#   - 本机所有 Profile 生效: $DSH_HOME/cordis.patch.yml
# 命令行启动热加载:
#   dsh web --patch "<SEEP_ROOT>/setup/cordis.generated.yml"
# ==============================================================================
- insert:
    - id: seep-mcp
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: seep
        transport: stdio
        command: python
        args:
          - '<SEEP_ROOT>/Tool/mcp/seep_mcp_server.py'
        env:
          PYTHONIOENCODING: utf-8
        cwd: !!js process.cwd()

    - id: js-reverse-mcp
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: js-reverse
        transport: stdio
        command: npx
        args:
          - '-y'
          - 'js-reverse-mcp'

    - id: ida-mcp
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: ida
        transport: stdio
        command: '<IDA_PYTHON>'
        args:
          - '<IDA_ROOT>/Lib/site-packages/ida_pro_mcp/server.py'
        env:
          PYTHONIOENCODING: utf-8
```

> **提示**：运行 `powershell .\setup\generate-configs.ps1` 可以直接生成已填好真实路径的 `setup/cordis.generated.yml`，完全省去手动替换 `<SEEP_ROOT>` 的烦恼！

---

## 三、 Skill 加载与指令连接

DeepSeek Harness 的 `agent-instructions` 插件会自动读取项目根的 `AGENTS.md`。
本包已在 `Tool/prompts/AGENTS.md` 提供跨 agent 通用指令。

**推荐方式**：在 DSH 工作目录直接引用或软链：
```bash
cp Tool/prompts/AGENTS.md ./AGENTS.md
```

---

## 四、 约束与边界

- 不搬动 `Tool/mcp/Tool/`（seep MCP 内部硬编码了相对路径）
- IDA Pro 需自备授权（不随包分发，无授权时自动由 Radare2 替代）
- 所有测试目标须用户确认已获授权（G-Auth 门）
- 部署与排障详细手册详见 `MANUAL/DEPLOYMENT.md`
