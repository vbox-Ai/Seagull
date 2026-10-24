# AI 安装协议（AI Install Protocol）

> 本文件是给 AI 代理（Claude Code / Codex / Gemini CLI / 任意 Agent）看的安装说明。
> 用户只提供一句极简提示词，你负责根据本协议完成全部安装、连接和验证。

---

## 核心认知

**OpenTgtyLab 和 Hunter 是一体的**，必须搭配安装，缺一不可：

| 项目 | 作用 | 安装位置 |
|---|---|---|
| **OpenTgtyLab** | 安全研究工作台：逆向工具、知识库、增强版 CLAUDE.md 配置、MCP 服务 | 工作目录（用户指定或当前目录） |
| **Hunter** | Web/API 安全评估框架：179 个核心 MCP 工具（含 12 个 CVE 扫描器） | `~/.agents/skills/hunter` |

**连接方式（装到约定位置即自动连接）：**
- Hunter 必须装到 `~/.agents/skills/hunter` —— OpenTgtyLab 的 `.mcp.json` 从这里启动 `hunter_tools`
- Hunter 通过环境变量 `OPEN_TGTYLAB_ROOT` 找 OpenTgtyLab 里的 `reverse_lab_tools`（105 个逆向工具）
- 双方共用 Python MCP SDK（**必须 `mcp>=1.20,<1.29`**，新版移除了 `mcp.server.fastmcp` 旧路径）
- 外部扫描器（nuclei / dalfox / sqlmap）共享 `~/hunter-bin/`（或系统 PATH）

---

## 第一步：检测现状

运行以下命令，判断用户处于哪种情况：

```bash
echo "=== 检测 ==="
test -f ~/.claude/CLAUDE.md && echo "CLAUDE.md: 存在" || echo "CLAUDE.md: 无"
grep -q "tgty\|§-1" ~/.claude/CLAUDE.md 2>/dev/null && echo "CLAUDE.md: 增强版" || echo "CLAUDE.md: 旧版/无"
test -f ~/.agents/skills/hunter/mcp_server.py && echo "Hunter: 已装" || echo "Hunter: 未装"
ls <工作目录>/Open-tgtylab/README.md 2>/dev/null && echo "OpenTgtyLab: 已clone" || echo "OpenTgtyLab: 未clone"
python3 -c "import mcp" 2>/dev/null && echo "mcp: 已装" || echo "mcp: 未装"
```

| 检测结果 | 情况 | 走哪个分支 |
|---|---|---|
| 都无 | 全新安装 | **A 全新** |
| OpenTgtyLab 有旧 CLAUDE.md + Hunter 无 | 只装过工作台旧版 | **B 补全 + 升级** |
| Hunter 有 + OpenTgtyLab 无 | 只装过 Hunter | **C 补全工作台** |
| 都是增强版 + 工具就位 | 已完整安装 | **D 更新** |

---

## 分支 A：全新安装

```bash
# 1. clone 两个仓库
git clone https://github.com/GeniusHu-tgty/Open-tgtylab.git
git clone https://github.com/GeniusHu-tgty/Hunter.git ~/.agents/skills/hunter

# 2. 部署 OpenTgtyLab 配置
cd Open-tgtylab
# 运行官方安装器（macOS/Linux）
bash tgtylab-files/install.sh
# 或 Windows：双击 启动.bat

# 3. 验证
# install.sh 已自动处理：CLAUDE.md 部署 / 依赖安装 / 外部工具下载 / MCP 注册
```

---

## 分支 B：已装旧版工作台（升级 + 补 Hunter）

```bash
# 1. 备份现有 CLAUDE.md
cp ~/.claude/CLAUDE.md ~/.claude/CLAUDE.md.bak-$(date +%Y%m%d)

# 2. clone/更新 Hunter
git clone https://github.com/GeniusHu-tgty/Hunter.git ~/.agents/skills/hunter 2>/dev/null \
  || (cd ~/.agents/skills/hunter && git pull)

# 3. 更新 OpenTgtyLab 到最新
cd <OpenTgtyLab 目录>
git pull

# 4. 重跑安装器（会备份旧配置 + 部署增强版）
bash tgtylab-files/install.sh
```

---

## 分支 C：只装了 Hunter（补工作台）

```bash
# 1. clone OpenTgtyLab
git clone https://github.com/GeniusHu-tgty/Open-tgtylab.git

# 2. 部署配置
cd Open-tgtylab
bash tgtylab-files/install.sh

# 3. Hunter 已装，安装器会自动检测并跳过重复安装
```

---

## 分支 D：已完整安装（更新）

```bash
# 1. 更新 Hunter
cd ~/.agents/skills/hunter && git pull

# 2. 更新 OpenTgtyLab
cd <OpenTgtyLab 目录> && git pull

# 3. 补依赖（如果有新增）
python3 -m pip install "mcp>=1.20,<1.29" dnspython
# 4. 外部工具检查
# 缺的：nuclei/dalfox/sqlmap 下载到 ~/hunter-bin/
```

---

## 最终验证（所有分支都要跑）

```bash
echo "=== 验证 ==="
# 1. CLAUDE.md 是增强版
grep -q "tgty" ~/.claude/CLAUDE.md && echo "✅ CLAUDE.md 增强版" || echo "❌ CLAUDE.md 旧版"

# 2. Hunter 契约（179 工具 + 12 CVE）
cd ~/.agents/skills/hunter
python3 -c "
import sys; sys.path.insert(0, '.')
import mcp_server
inv = mcp_server._registered_tool_inventory()
core = inv['core']
cve = [t for t in core if t.startswith('hunter_cve_')]
print(f\"✅ 核心工具 {len(core)} (CVE: {len(cve)})\")
assert len(core) >= 179, '核心工具不足 179'
assert len(cve) >= 12, 'CVE 工具不足 12'
" 2>&1

# 3. reverse_lab_tools 能被找到（互连验证）
cd ~/.agents/skills/hunter
OPEN_TGTYLAB_ROOT=<OpenTgtyLab 目录> python3 -c "
import sys; sys.path.insert(0, '.')
import mcp_server
# 触发 reverse_lab_tools 加载
try:
    mcp_server._import_reverse_lab_tools()
    inv = mcp_server._registered_tool_inventory()
    re_tools = inv.get('extensions', {}).get('reverse_lab_tools', [])
    print(f'✅ reverse_lab_tools: {len(re_tools)} 个逆向工具')
except Exception as e:
    print(f'⚠️ reverse_lab_tools 加载失败: {e}（不影响核心，可手动检查 REVERSELAB_MCP_PATH）')
"

# 4. 外部工具
for t in nuclei dalfox sqlmap nmap; do
  command -v $t >/dev/null 2>&1 && echo "✅ $t" || echo "⚠️ $t 未装"
done
```

**所有 ✅ 才算装完。** 有 ❌ 就修复后重试，不要停在半路。

---

## 环境特殊说明

| 环境 | 注意 |
|---|---|
| **Windows** | 用 `启动.bat` 部署；`~/.agents/skills/hunter` 在 `C:\Users\<user>\.agents\skills\hunter` |
| **WSL** | 与 Linux 相同；若 `/mnt/c` 只读，把 OpenTgtyLab clone 到 WSL 内（如 `~/Open-tgtylab`） |
| **macOS** | `./tgtylab-files/install.sh`；无 sudo |
| **Python** | 必须 3.11+，建议 3.12 |
| **mcp 版本** | 必须 `>=1.20,<1.29`（新版移除了 `mcp.server.fastmcp`） |

---

## 常见问题

- **"mcp.server.fastmcp" 找不到** → 装错版本，`pip install "mcp>=1.20,<1.29"`
- **Hunter 契约检查失败** → `cd ~/.agents/skills/hunter && git pull` 再重试
- **reverse_lab_tools 找不到** → 确认 `OPEN_TGTYLAB_ROOT` 指向 OpenTgtyLab 目录
- **nuclei/dalfox 没有** → 下载到 `~/hunter-bin/` 或 `go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest`
