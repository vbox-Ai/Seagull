#!/bin/bash
# ============================================================================
# open-tgtylab 一键安装器 (v2.0) — Bundle Installer
#
# 让"装完 = 本地效果"。完成：
#   1. 环境检测（平台 / Python / Git / uv）
#   2. clone Hunter → ~/.agents/skills/hunter（若未装）
#   3. 部署增强版 CLAUDE.md / system-prompt / settings / hooks → ~/.claude/
#   4. 安装 Python 依赖（reverse_lab_tools + mcp + dnspython）
#   5. 下载外部工具（nuclei / dalfox / xray / sqlmap）→ ~/hunter-bin/
#   6. 注册 MCP（.mcp.json）
#   7. 验证（hunter_contract_check + 工具探测）
#
# 用法:
#   ./tgtylab-files/install.sh                 # 自动检测，工作目录=当前目录
#   ./tgtylab-files/install.sh --dir /path     # 指定 Open-tgtylab 工作目录
#
# 不需要 sudo。所有东西装到用户目录。
# ============================================================================

set -uo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; GRAY='\033[0;37m'; NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." 2>/dev/null && pwd)"

# ── 管道执行自举 ─────────────────────────────────────────────────────────────
# `curl | bash` 时 $0 是 bash，SCRIPT_DIR 解析错误 → REPO_ROOT 不含仓库内容。
# 检测到缺 config-bundle 时，clone 自己到临时目录并转交执行。
if [ ! -d "$REPO_ROOT/tgtylab-files/config-bundle" ]; then
    echo "[*] 检测到远程执行 — 先 clone OpenTgtyLab 仓库..."
    BOOT_TMP="$(mktemp -d "${TMPDIR:-/tmp}/opentgtylab-boot.XXXXXX")"
    git clone --depth 1 "https://github.com/GeniusHu-tgty/Open-tgtylab.git" "$BOOT_TMP/Open-tgtylab" >/dev/null 2>&1 \
        || { echo "[ERR] clone 失败"; exit 1; }
    echo "[*] 仓库已就绪，继续安装..."
    exec bash "$BOOT_TMP/Open-tgtylab/tgtylab-files/install.sh" "$@"
fi

CLAUDE_DIR="$HOME/.claude"
HUNTER_DIR="$HOME/.agents/skills/hunter"
BIN_DIR="$HOME/hunter-bin"
HUNTER_URL="https://github.com/GeniusHu-tgty/Hunter.git"

log()  { echo -e "${CYAN}[*]${NC} $*"; }
ok()   { echo -e "${GREEN}[OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
fail() { echo -e "${RED}[ERR]${NC} $*"; exit 1; }

# ── 1. 环境检测 ─────────────────────────────────────────────────────────────
detect_env() {
    log "检测环境..."
    OS="linux"
    case "$(uname -s)" in
        Darwin) OS="macos" ;;
        MINGW*|MSYS*|CYGWIN*) OS="windows" ;;
        *) OS="linux" ;;
    esac
    # WSL 检测
    if [ -f /proc/version ] && grep -qi microsoft /proc/version 2>/dev/null; then
        OS="wsl"
    fi
    echo "    平台: $OS"

    PYTHON=""
    for cand in python3.12 python3.11 python3; do
        if command -v "$cand" >/dev/null 2>&1; then
            PYTHON="$cand"
            break
        fi
    done
    [ -z "$PYTHON" ] && fail "未找到 Python 3.11+"
    # 版本检查
    local pyver
    pyver=$("$PYTHON" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null)
    case "$pyver" in
        3.1[1-9]|3.2*|3.3*) : ;;
        *) fail "Python 版本过低: $pyver（需要 3.11+，建议 3.12）" ;;
    esac
    echo "    Python: $PYTHON ($pyver)"

    command -v git >/dev/null 2>&1 || fail "未找到 git"
    echo "    Git: OK"

    # uv（reverse_lab_tools 需要）
    if command -v uv >/dev/null 2>&1; then
        echo "    uv: OK"
    else
        warn "未找到 uv，将尝试自动安装"
        curl -LsSf https://astral.sh/uv/install.sh | sh >/dev/null 2>&1 \
            && export PATH="$HOME/.local/bin:$PATH" \
            && command -v uv >/dev/null 2>&1 && echo "    uv: 已安装" \
            || warn "uv 安装失败，reverse_lab_tools 可能无法启动（可手动装）"
    fi
}

# ── 2. 安装 Hunter（若未装）────────────────────────────────────────────────
install_hunter() {
    if [ -f "$HUNTER_DIR/mcp_server.py" ]; then
        ok "Hunter 已存在: $HUNTER_DIR"
        # 确保 edu_ip.db 已构建（gz → db）
        if [ -f "$HUNTER_DIR/core/edu/data/edu_ip.db.gz" ] && [ ! -f "$HUNTER_DIR/core/edu/data/edu_ip.db" ]; then
            (cd "$HUNTER_DIR" && "$PYTHON" core/edu/build_edu_db.py >/dev/null 2>&1) && ok "edu_ip.db 已构建" || warn "edu_ip.db 构建失败"
        fi
        return 0
    fi
    log "安装 Hunter → $HUNTER_DIR"
    mkdir -p "$HOME/.agents/skills"
    git clone --depth 1 "$HUNTER_URL" "$HUNTER_DIR" >/dev/null 2>&1 \
        || fail "Hunter clone 失败，检查网络"
    ok "Hunter 已安装"
    # 构建 edu_ip.db
    if [ -f "$HUNTER_DIR/core/edu/data/edu_ip.db.gz" ]; then
        (cd "$HUNTER_DIR" && "$PYTHON" core/edu/build_edu_db.py >/dev/null 2>&1) && ok "edu_ip.db 已构建" || warn "edu_ip.db 构建失败"
    fi
}

# ── 3. 部署配置 → ~/.claude/ ────────────────────────────────────────────────
deploy_config() {
    log "部署配置到 $CLAUDE_DIR ..."
    mkdir -p "$CLAUDE_DIR"

    # 备份现有配置
    local bak="$CLAUDE_DIR/backups/tgtylab-$(date +%Y%m%d-%H%M%S)"
    if [ -d "$CLAUDE_DIR" ] && [ -n "$(ls "$CLAUDE_DIR"/*.md "$CLAUDE_DIR"/*.toml 2>/dev/null)" ]; then
        mkdir -p "$bak"
        cp "$CLAUDE_DIR/CLAUDE.md" "$CLAUDE_DIR/system-prompt.md" "$CLAUDE_DIR/config.toml" "$bak/" 2>/dev/null
        ok "已备份旧配置 → $bak"
    fi

    # 部署增强版 CLAUDE.md
    local bundle_claude="$REPO_ROOT/tgtylab-files/config-bundle/CLAUDE.md"
    if [ -f "$bundle_claude" ]; then
        cp "$bundle_claude" "$CLAUDE_DIR/CLAUDE.md"
        ok "CLAUDE.md (增强版, $(wc -l < "$CLAUDE_DIR/CLAUDE.md") 行)"
    else
        warn "config-bundle/CLAUDE.md 缺失，跳过"
    fi

    # system-prompt.md
    local bundle_sp="$REPO_ROOT/tgtylab-files/config-bundle/system-prompt.md"
    [ -f "$bundle_sp" ] && cp "$bundle_sp" "$CLAUDE_DIR/system-prompt.md" && ok "system-prompt.md"

    # config.toml（让 Claude Code 读 system-prompt）
    # 已存在则不覆盖（保护用户现有 API/模型配置），只确保 model_instructions_file 指向存在
    if [ -f "$CLAUDE_DIR/config.toml" ]; then
        if ! grep -q "model_instructions_file" "$CLAUDE_DIR/config.toml" 2>/dev/null; then
            echo 'model_instructions_file = "system-prompt.md"' >> "$CLAUDE_DIR/config.toml"
        fi
        ok "config.toml (保留现有, 补充 model_instructions_file)"
    else
        echo 'model_instructions_file = "system-prompt.md"' > "$CLAUDE_DIR/config.toml"
        ok "config.toml"
    fi

    # hooks（pre-tool-call gate）
    if [ -f "$REPO_ROOT/.claude/hooks/pre-tool-call.sh" ]; then
        mkdir -p "$CLAUDE_DIR/.claude/hooks" 2>/dev/null
        cp "$REPO_ROOT/.claude/hooks/pre-tool-call.sh" "$CLAUDE_DIR/.claude/hooks/" 2>/dev/null
        ok "hooks/pre-tool-call.sh"
    fi

    # settings.local.json（权限 + MCP 白名单，与开发者本地一致）
    if [ -f "$REPO_ROOT/settings.local.json" ]; then
        if [ -f "$CLAUDE_DIR/settings.local.json" ]; then
            # 已存在则合并 MCP 白名单（保留用户已有权限，避免覆盖）
            "$PYTHON" - <<'PYEOF' "$REPO_ROOT/settings.local.json" "$CLAUDE_DIR/settings.local.json" 2>/dev/null
import json, sys
src = json.load(open(sys.argv[1]))
dst = json.load(open(sys.argv[2]))
# 合并 permissions.allow（去重）
allow = set(dst.get("permissions", {}).get("allow", []))
allow.update(src.get("permissions", {}).get("allow", []))
dst.setdefault("permissions", {})["allow"] = sorted(allow)
# 合并 enabledMcpjsonServers
servers = set(dst.get("enabledMcpjsonServers", []))
servers.update(src.get("enabledMcpjsonServers", []))
dst["enabledMcpjsonServers"] = sorted(servers)
# 合并 hooks
hooks = dict(src.get("hooks", {}))
for k, v in dst.get("hooks", {}).items():
    hooks.setdefault(k, v)
dst["hooks"] = hooks
# 不覆盖 defaultMode / env（保留用户选择）
json.dump(dst, open(sys.argv[2], "w"), indent=2, ensure_ascii=False)
PYEOF
            ok "settings.local.json (已合并 MCP 白名单)"
        else
            cp "$REPO_ROOT/settings.local.json" "$CLAUDE_DIR/settings.local.json"
            ok "settings.local.json（权限 + MCP 白名单）"
        fi
    fi
}

# ── 4. Python 依赖 ──────────────────────────────────────────────────────────
install_python_deps() {
    log "安装 Python 依赖..."
    # reverse_lab_tools 的依赖
    local rlt="$REPO_ROOT/tools/skills/mcp/ReverseLabToolsMCP"
    if [ -d "$rlt" ]; then
        if command -v uv >/dev/null 2>&1; then
            (cd "$rlt" && uv sync >/dev/null 2>&1) && ok "reverse_lab_tools uv sync" || warn "uv sync 失败（可手动）"
        fi
    fi
    # mcp + dnspython（hunter 需要；mcp 必须 1.20-1.28.x，新版移除了 fastmcp 旧路径）
    "$PYTHON" -m pip install -q "mcp>=1.20,<1.29" dnspython >/dev/null 2>&1 \
        && ok "mcp(1.20-1.28) + dnspython" || warn "pip install 失败（可手动: pip install 'mcp>=1.20,<1.29' dnspython）"
}

# ── 5. 下载外部工具 → ~/hunter-bin/ ────────────────────────────────────────
download_external_tools() {
    log "下载外部工具 → $BIN_DIR ..."
    mkdir -p "$BIN_DIR"

    # 平台架构
    local arch=""
    case "$(uname -m)" in
        x86_64|amd64) arch="amd64" ;;
        aarch64|arm64) arch="arm64" ;;
        *) arch="amd64" ;;
    esac

    # nuclei
    if ! command -v nuclei >/dev/null 2>&1 && [ ! -f "$BIN_DIR/nuclei" ]; then
        log "  下载 nuclei..."
        curl -sL "https://github.com/projectdiscovery/nuclei/releases/latest/download/nuclei_${OS}_${arch}.zip" \
            -o /tmp/nuclei.zip 2>/dev/null
        if command -v unzip >/dev/null 2>&1; then
            (cd "$BIN_DIR" && unzip -o -q /tmp/nuclei.zip nuclei 2>/dev/null) && chmod +x "$BIN_DIR/nuclei" 2>/dev/null && ok "nuclei" || warn "nuclei 下载失败"
        else
            warn "无 unzip，跳过 nuclei（可手动装）"
        fi
    fi

    # dalfox
    if ! command -v dalfox >/dev/null 2>&1 && [ ! -f "$BIN_DIR/dalfox" ]; then
        log "  下载 dalfox..."
        curl -sL "https://github.com/hahwul/dalfox/releases/latest/download/dalfox_${OS}_${arch}.tar.gz" \
            -o /tmp/dalfox.tar.gz 2>/dev/null
        if command -v tar >/dev/null 2>&1; then
            (cd "$BIN_DIR" && tar xzf /tmp/dalfox.tar.gz dalfox 2>/dev/null) && chmod +x "$BIN_DIR/dalfox" 2>/dev/null && ok "dalfox" || warn "dalfox 下载失败"
        else
            warn "无 tar，跳过 dalfox（可手动装）"
        fi
    fi

    # sqlmap（git 克隆）
    if ! command -v sqlmap >/dev/null 2>&1 && [ ! -d "$BIN_DIR/sqlmap" ]; then
        log "  下载 sqlmap..."
        git clone --depth 1 https://github.com/sqlmapproject/sqlmap.git "$BIN_DIR/sqlmap" >/dev/null 2>&1 \
            && ok "sqlmap" || warn "sqlmap 下载失败"
    fi

    # xray（无官方 release API，跳过并提示）
    if ! command -v xray >/dev/null 2>&1 && [ ! -f "$BIN_DIR/xray" ]; then
        warn "xray 需从官网手动下载（无公开 release API）"
    fi

    # PATH 提示
    if [ -d "$BIN_DIR" ] && [ -n "$(ls -A "$BIN_DIR" 2>/dev/null)" ]; then
        grep -q "hunter-bin" "$HOME/.bashrc" 2>/dev/null || {
            echo "export PATH=\"$BIN_DIR:\$PATH\"" >> "$HOME/.bashrc"
            ok "已将 $BIN_DIR 加入 PATH（.bashrc）"
        }
    fi
}

# ── 6. 注册 MCP ─────────────────────────────────────────────────────────────
deploy_mcp() {
    log "注册 MCP ..."
    # .mcp.json 已随仓库提供，确保引用路径正确
    local mcp="$REPO_ROOT/.mcp.json"
    [ -f "$mcp" ] && ok ".mcp.json 已就绪（hunter_tools + reverse_lab_tools）" || warn ".mcp.json 缺失"
}

# ── 7. 验证 ─────────────────────────────────────────────────────────────────
verify() {
    log "验证安装..."
    # Hunter 契约检查
    if [ -f "$HUNTER_DIR/mcp_server.py" ]; then
        (cd "$HUNTER_DIR" && "$PYTHON" -c "
import sys
sys.path.insert(0, '.')
try:
    import mcp_server
    from core.tool_catalog import classify_tool_inventory
    inv = mcp_server._registered_tool_inventory()
    core = inv['core']
    cve = [t for t in core if t.startswith('hunter_cve_')]
    print(f'    [OK] 核心工具 {len(core)} 个 (CVE: {len(cve)})')
    if len(cve) < 12:
        print('    [WARN] CVE 工具不足 12')
except Exception as e:
    print(f'    [WARN] 契约验证失败: {e}')
" 2>/dev/null) 2>/dev/null || warn "Hunter 契约验证失败（可手动: hunter_contract_check）"
    fi

    # 外部工具探测
    echo "    工具状态:"
    for t in nuclei dalfox sqlmap xray nmap; do
        local found=0
        if command -v "$t" >/dev/null 2>&1; then found=1; fi
        if [ -f "$BIN_DIR/$t" ] || [ -x "$BIN_DIR/$t" ]; then found=1; fi
        if [ -d "$BIN_DIR/$t" ] && [ "$t" = "sqlmap" ]; then found=1; fi
        if [ "$found" = "1" ]; then
            echo "      $t: ✅"
        else
            echo "      $t: ⚠️ 未装（可手动装到 $BIN_DIR 或加 PATH）"
        fi
    done
}

# ── main ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${GREEN}  open-tgtylab 一键安装 v2.0${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# 解析 --dir
WORK_DIR="$REPO_ROOT"
while [[ $# -gt 0 ]]; do
    case "$1" in
        --dir)
            [ $# -ge 2 ] || fail "--dir requires a value"
            WORK_DIR="${2/#\~/$HOME}"
            shift 2
            ;;
        -h|--help)
            echo "Usage: install.sh [--dir /path/to/workspace]"
            exit 0
            ;;
        *) fail "unknown argument: $1" ;;
    esac
done

detect_env
install_hunter
deploy_config
install_python_deps
download_external_tools
deploy_mcp
verify

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${GREEN}  安装完成！${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""
echo "  下一步:"
echo "    1. 在 Open-tgtylab 目录启动你的 AI 助手 (Claude Code / Codex / ...)"
echo "    2. 输入 tgty 验证演习框架已加载"
echo "    3. 输入 hunter_healthcheck + hunter_capabilities 验证 MCP"
echo ""
echo "  外部工具缺的（xray 等）可手动安装后加入 ~/hunter-bin/"
echo ""
