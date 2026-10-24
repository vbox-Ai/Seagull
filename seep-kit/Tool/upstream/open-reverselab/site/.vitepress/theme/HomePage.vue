<script setup lang="ts">
import { ref, computed } from 'vue'
import { useData } from 'vitepress'
import boards from '../boards.json'
import mcpTools from '../mcp-tools.json'

interface Board {
  name: string
  zh: string
  hue: string
  blurb: string
  articles: number
  categories: number
}

interface McpTool {
  id: string
  name: string
  launch_mode: string
  ai_callable: boolean
  notes: string
}

interface McpGroup {
  board: string
  tools: McpTool[]
}

const { lang } = useData()
const isEn = computed(() => lang.value.startsWith('en'))

const boardList = boards as Record<string, Board>
const boardKeys = Object.keys(boardList)

const mcpGroups = mcpTools as McpGroup[]
const mcpBoardNames: Record<string, Record<string, string>> = {
  'ctf-website': { zh: 'CTF / Web 攻防', en: 'CTF / Web' },
  android: { zh: 'Android 逆向', en: 'Android Reversing' },
  windows: { zh: 'Windows / PE 二进制', en: 'Windows / PE' },
  common: { zh: '通用逆向工具链', en: 'Core Toolchain' },
  misc: { zh: '自动化脚本工具', en: 'Automation Scripts' },
}

const enBlurbs: Record<string, string> = {
  'ctf-website': 'JWT / SQLi / SSRF / XSS / CORS / OAuth / CVE / payment exploits — verified closed-loop attack graph.',
  'apk-reverse': 'DEX / Native / IL2CPP / Frida hooks / unpacking / crypto cracking — memory to disassembled code.',
  'pe-reverse': 'Ghidra / x64dbg / triage / IOC / YARA / patching / evasion — full binary reverse lifecycle.',
  general: 'Cryptography / protocol reversing / kernel exploitation / game cheats / firmware / SDR / AI security.',
  windows: 'Windows internals: config injection / privilege escalation / thread & process injection bypasses.',
}

const boardSignals: Record<string, { zh: string; en: string }> = {
  'ctf-website': { zh: '入口信号: JWT / SQLi / SSRF / CVE → 脚本打点 → 闭环验证', en: 'Signals: JWT / SQLi / SSRF / CVE → Payloads → Evidence Loop' },
  'apk-reverse': { zh: '入口信号: 加密壳 / Native / JNI → Frida Hook → 内存脱壳', en: 'Signals: Packers / Native / JNI → Frida Hook → Memory Unpack' },
  'pe-reverse': { zh: '入口信号: 异常熵值 / 反调试 → Ghidra静态 → x64dbg验证', en: 'Signals: High Entropy / Anti-Debug → Ghidra → Dynamic Breakpoints' },
  'general': { zh: '入口信号: 未知协议 / 自定义PRNG → 逆向测试桩 → 重放破解', en: 'Signals: Custom Protocols / PRNG → Test Scaffold → Crypto Replay' },
  'windows': { zh: '入口信号: 权限令牌 / 敏感注册表 → 注入利用 → 防御规避', en: 'Signals: Security Tokens / Registry Keys → Injection → AV Evasion' },
}

const totalArticles = Object.values(boardList).reduce((s, b) => s + b.articles, 0)
const totalTools = mcpGroups.reduce((s, g) => s + g.tools.length, 0)

const activeMcpTab = ref<string>('all')
const mcpSearchQuery = ref<string>('')
const copiedCommand = ref<string | null>(null)
const activeTerminalTab = ref<'win' | 'unix' | 'agent'>('win')

const filteredMcpGroups = computed(() => {
  return mcpGroups
    .filter(g => activeMcpTab.value === 'all' || g.board === activeMcpTab.value)
    .map(g => ({
      ...g,
      tools: g.tools.filter(t => {
        const q = mcpSearchQuery.value.trim().toLowerCase()
        if (!q) return true
        return t.id.toLowerCase().includes(q) || t.name.toLowerCase().includes(q)
      })
    }))
    .filter(g => g.tools.length > 0)
})

const selectedTool = ref<McpTool | null>(mcpGroups[0]?.tools[0] || null)

const selectTool = (tool: McpTool) => {
  selectedTool.value = tool
}

const copyToClipboard = async (text: string, id: string) => {
  try {
    await navigator.clipboard.writeText(text)
    copiedCommand.value = id
    setTimeout(() => {
      if (copiedCommand.value === id) copiedCommand.value = null
    }, 2000)
  } catch (e) {
    // fallback
  }
}

const t = computed(() => ({
  sysStatus: isEn.value ? 'SYS_STAT: OPERATIONAL' : '系统状态: 运转就绪',
  agentEngine: isEn.value ? 'AGENT-NATIVE PROTOCOL' : 'AGENT 原生协议',
  specVerified: isEn.value ? '100% SPEC VERIFIED' : '100% 规则验证',
  kicker: isEn.value ? 'REVERSELAB // DEFENSIVE REVERSE-ENGINEERING BENCH' : 'REVERSELAB // 精密逆向工程实验台',
  title: isEn.value ? 'AI-Native Reverse Engineering & MCP Suite' : '开源逆向工程实验环境与自动化套件',
  tagline: isEn.value
    ? `An executable reverse-engineering lab with ${totalArticles} articles and ${totalTools} core tools across 5 attack networks: from entry signals to memory breakpoints, every technique is test-driven and agent-ready.`
    : `面向研究员与 AI Agent 的可执行逆向实验室：${totalArticles} 篇实战知识库与 ${totalTools} 个自动化工具，覆盖 5 大完整攻防攻击网，从入口信号到内存断点，每步皆可验证。`,
  enterKb: isEn.value ? 'Explore Knowledge Base' : '进入实战知识库',
  mcpExplorer: isEn.value ? 'MCP Tool Matrix' : '查看 MCP 工具生态',
  viewGitHub: isEn.value ? 'GitHub Repository' : 'GitHub 源码仓',
  statsArticles: isEn.value ? 'Executable Articles' : '篇实战手册',
  statsTools: isEn.value ? 'MCP & Core Tools' : '个自动化工具',
  statsBoards: isEn.value ? 'Attack Networks' : '大攻击网板块',
  statsVerified: isEn.value ? 'Test-Driven Playbooks' : '闭环实战打法',
  boardsTitle: isEn.value ? 'Attack Networks & Analysis Boards' : '5 大闭环攻击网与实战板块',
  boardsDesc: isEn.value
    ? 'Each board forms an end-to-end attack graph: entry signals → payload execution → branch analysis → evidence validation.'
    : '每个板块构成一条完整的闭环攻击网：入口信号识别 → 自动化脚本打点 → 路径分支研判 → 证据链闭环。',
  articleUnit: isEn.value ? 'Articles' : '篇手册',
  categoryUnit: isEn.value ? 'Categories' : '类技术',
  enterBoard: isEn.value ? 'Enter Board →' : '进入板块 →',
  mcpTitle: isEn.value ? 'Agent MCP Tool Ecosystem' : 'Agent 原生 MCP 工具矩阵',
  mcpDesc: isEn.value
    ? 'Standardized tools that autonomous AI agents (Codex, Claude Code) call directly to execute triage, static analysis, hook deployment, and crypto recovery.'
    : '标准化逆向自动化工具库，支持 AI Agent（Codex、Claude Code）直连调用，自动完成初筛、静态解包、Frida Hook 与加密还原。',
  mcpSearchPlaceholder: isEn.value ? 'Filter tools by name or id...' : '过滤工具名称或标识符...',
  allTabs: isEn.value ? 'All Boards' : '全板块',
  toolInspectorTitle: isEn.value ? 'Agent Invocation Inspector' : 'AI Agent 调用示意',
  startTitle: isEn.value ? 'Quickstart & Environment Setup' : '环境初始化与快速上手',
  startDesc: isEn.value
    ? 'Bootstrap your local workbench in seconds. All dependencies follow strictly audited offline recipes.'
    : '数秒完成本地实验环境初始化。工具链支持离线解包与自动化检测。',
  copyText: isEn.value ? 'Copy Snippet' : '复制命令',
  copiedText: isEn.value ? 'Copied!' : '已复制!',
}))

const kbPath = (b: string) => `${isEn.value ? '/en' : ''}/kb/${b}/README`
const mcpBoardName = (board: string) => mcpBoardNames[board]?.[isEn.value ? 'en' : 'zh'] ?? board
const blurbOf = (b: Board) => (isEn.value ? enBlurbs[b.name] ?? b.blurb : b.blurb)
const signalOf = (b: string) => (isEn.value ? boardSignals[b]?.en ?? '' : boardSignals[b]?.zh ?? '')

const winCommands = `git clone https://github.com/LING71671/open-reverselab.git
cd open-reverselab
.\\scripts\\misc\\bootstrap.ps1
.\\scripts\\misc\\install_tools.ps1 -CTF      # 安装 Web CTF 工具链
.\\scripts\\misc\\install_tools.ps1 -Android  # 安装 APK 逆向工具链
.\\scripts\\misc\\install_tools.ps1 -Windows  # 安装 PE 分析工具链`

const unixCommands = `git clone https://github.com/LING71671/open-reverselab.git
cd open-reverselab
bash ./scripts/misc/bootstrap.sh
python3 ./scripts/misc/lab_healthcheck.py`

const agentCommands = `python ./scripts/misc/setup_unattended_ctf_runner.py --overwrite
# Claude Code / Codex:
/loop /ctf-24h <target_url> [case_name]`
</script>

<template>
  <div class="rl-bench">
    <!-- Telemetry Status Bar -->
    <div class="rl-telemetry-bar">
      <div class="rl-telemetry-left">
        <span class="rl-telemetry-dot"></span>
        <span class="rl-telemetry-mono">{{ t.sysStatus }}</span>
        <span class="rl-telemetry-sep">/</span>
        <span class="rl-telemetry-mono">{{ t.agentEngine }}</span>
        <span class="rl-telemetry-sep">/</span>
        <span class="rl-telemetry-mono">{{ t.specVerified }}</span>
      </div>
      <div class="rl-telemetry-right">
        <span class="rl-telemetry-tag">v1.2.1-PROD</span>
      </div>
    </div>

    <!-- Hero Section -->
    <section class="rl-hero">
      <div class="rl-hero-meta">
        <span class="rl-hero-kicker">{{ t.kicker }}</span>
      </div>
      <h1 class="rl-hero-title">{{ t.title }}</h1>
      <p class="rl-hero-tagline">{{ t.tagline }}</p>

      <div class="rl-hero-actions">
        <a class="rl-btn rl-btn-primary" :href="kbPath('ctf-website')">
          <span>{{ t.enterKb }}</span>
          <span class="rl-btn-badge">{{ totalArticles }}</span>
        </a>
        <a class="rl-btn rl-btn-secondary" href="#mcp-ecosystem">
          <span>{{ t.mcpExplorer }}</span>
          <span class="rl-btn-badge rl-badge-accent">{{ totalTools }}+</span>
        </a>
        <a class="rl-btn rl-btn-ghost" href="https://github.com/LING71671/open-reverselab" target="_blank" rel="noopener">
          <svg class="rl-icon" viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
          </svg>
          <span>{{ t.viewGitHub }}</span>
        </a>
      </div>

      <!-- Instrument Gauges -->
      <div class="rl-gauge-grid">
        <div class="rl-gauge-card">
          <div class="rl-gauge-val">{{ totalArticles }}</div>
          <div class="rl-gauge-lbl">{{ t.statsArticles }}</div>
        </div>
        <div class="rl-gauge-card">
          <div class="rl-gauge-val">{{ totalTools }}+</div>
          <div class="rl-gauge-lbl">{{ t.statsTools }}</div>
        </div>
        <div class="rl-gauge-card">
          <div class="rl-gauge-val">5</div>
          <div class="rl-gauge-lbl">{{ t.statsBoards }}</div>
        </div>
        <div class="rl-gauge-card">
          <div class="rl-gauge-val">100%</div>
          <div class="rl-gauge-lbl">{{ t.statsVerified }}</div>
        </div>
      </div>
    </section>

    <!-- Boards Matrix -->
    <section class="rl-section" aria-labelledby="boards-title">
      <div class="rl-section-header">
        <div>
          <h2 id="boards-title" class="rl-section-title">{{ t.boardsTitle }}</h2>
          <p class="rl-section-desc">{{ t.boardsDesc }}</p>
        </div>
      </div>

      <div class="rl-board-matrix">
        <a
          v-for="(b, idx) in boardKeys"
          :key="b"
          class="rl-board-cell"
          :href="kbPath(b)"
          :style="{ '--bd-hue': boardList[b].hue }"
        >
          <div class="rl-cell-top">
            <span class="rl-board-id">#0{{ idx + 1 }}</span>
            <span class="rl-board-chip">
              {{ boardList[b].name }}
            </span>
            <span class="rl-cell-enter">{{ t.enterBoard }}</span>
          </div>

          <h3 class="rl-cell-title">
            {{ boardList[b].name }}
            <span v-if="!isEn" class="rl-cell-zh">{{ boardList[b].zh }}</span>
          </h3>

          <p class="rl-cell-blurb">{{ blurbOf(boardList[b]) }}</p>

          <div class="rl-cell-signal">
            <svg class="rl-signal-icon" viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
              <path d="M1 8a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .4.2l1.6 2.133 3.2-6.4a.5.5 0 0 1 .867-.04l2.4 4 1.533-1.84a.5.5 0 0 1 .767.64l-2 2.4a.5.5 0 0 1-.787.027L9.2 5.253 6.333 11a.5.5 0 0 1-.887.027L3.6 8.5H1.5A.5.5 0 0 1 1 8z"/>
            </svg>
            <span>{{ signalOf(b) }}</span>
          </div>

          <div class="rl-cell-footer">
            <div class="rl-cell-metric">
              <strong>{{ boardList[b].articles }}</strong> {{ t.articleUnit }}
            </div>
            <div class="rl-cell-metric">
              <strong>{{ boardList[b].categories }}</strong> {{ t.categoryUnit }}
            </div>
          </div>
        </a>
      </div>
    </section>

    <!-- MCP Tool Matrix & Inspector -->
    <section id="mcp-ecosystem" class="rl-section" aria-labelledby="mcp-title">
      <div class="rl-section-header">
        <div>
          <h2 id="mcp-title" class="rl-section-title">{{ t.mcpTitle }}</h2>
          <p class="rl-section-desc">{{ t.mcpDesc }}</p>
        </div>
      </div>

      <!-- Controls: Tabs + Filter -->
      <div class="rl-mcp-controls">
        <div class="rl-tabs">
          <button
            class="rl-tab-btn"
            :class="{ active: activeMcpTab === 'all' }"
            @click="activeMcpTab = 'all'"
          >
            {{ t.allTabs }}
          </button>
          <button
            v-for="g in mcpGroups"
            :key="g.board"
            class="rl-tab-btn"
            :class="{ active: activeMcpTab === g.board }"
            @click="activeMcpTab = g.board"
          >
            {{ mcpBoardName(g.board) }}
          </button>
        </div>

        <div class="rl-search-box">
          <input
            v-model="mcpSearchQuery"
            type="text"
            class="rl-search-input"
            :placeholder="t.mcpSearchPlaceholder"
          />
        </div>
      </div>

      <!-- Split Layout: Tool Catalog + Inspector -->
      <div class="rl-mcp-workbench">
        <div class="rl-mcp-catalog">
          <div v-for="g in filteredMcpGroups" :key="g.board" class="rl-mcp-group-block">
            <div class="rl-group-badge">{{ mcpBoardName(g.board) }} ({{ g.tools.length }})</div>
            <div class="rl-tools-wrap">
              <button
                v-for="tool in g.tools"
                :key="tool.id"
                class="rl-tool-pill"
                :class="{ active: selectedTool?.id === tool.id }"
                @click="selectTool(tool)"
              >
                <span class="rl-tool-dot" :class="{ 'ai-ready': tool.ai_callable }"></span>
                <span class="rl-tool-name">{{ tool.id }}</span>
                <span class="rl-tool-mode">{{ tool.launch_mode }}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Tool Detail / Protocol Inspector -->
        <div class="rl-mcp-inspector">
          <div class="rl-inspector-header">
            <span class="rl-inspector-title">{{ t.toolInspectorTitle }}</span>
            <span v-if="selectedTool" class="rl-status-pill">● ACTIVE</span>
          </div>

          <div v-if="selectedTool" class="rl-inspector-body">
            <div class="rl-inspector-row">
              <span class="lbl">TOOL ID:</span>
              <code class="val">{{ selectedTool.id }}</code>
            </div>
            <div class="rl-inspector-row">
              <span class="lbl">NAME:</span>
              <span class="val">{{ selectedTool.name }}</span>
            </div>
            <div class="rl-inspector-row">
              <span class="lbl">CALLABLE:</span>
              <span class="val">{{ selectedTool.ai_callable ? 'YES (AI Agent Ready)' : 'NO' }}</span>
            </div>
            <div class="rl-inspector-row">
              <span class="lbl">EXEC_MODE:</span>
              <span class="val">{{ selectedTool.launch_mode.toUpperCase() }}</span>
            </div>
            <div class="rl-inspector-code">
              <div class="rl-code-label">Agent JSON-RPC Payload:</div>
              <pre><code>{{ JSON.stringify({
  "server": "reverse_lab_tools",
  "tool": selectedTool.id,
  "arguments": {
    "target": "sample.bin",
    "mode": selectedTool.launch_mode
  }
}, null, 2) }}</code></pre>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Terminal Quickstart Station -->
    <section class="rl-section" aria-labelledby="start-title">
      <div class="rl-section-header">
        <div>
          <h2 id="start-title" class="rl-section-title">{{ t.startTitle }}</h2>
          <p class="rl-section-desc">{{ t.startDesc }}</p>
        </div>
      </div>

      <div class="rl-terminal-card">
        <div class="rl-terminal-header">
          <div class="rl-terminal-buttons">
            <button
              class="rl-term-tab"
              :class="{ active: activeTerminalTab === 'win' }"
              @click="activeTerminalTab = 'win'"
            >
              PowerShell (Windows)
            </button>
            <button
              class="rl-term-tab"
              :class="{ active: activeTerminalTab === 'unix' }"
              @click="activeTerminalTab = 'unix'"
            >
              Bash (macOS / Linux)
            </button>
            <button
              class="rl-term-tab"
              :class="{ active: activeTerminalTab === 'agent' }"
              @click="activeTerminalTab = 'agent'"
            >
              AI Agent (Codex / Claude)
            </button>
          </div>

          <button
            class="rl-copy-btn"
            @click="copyToClipboard(
              activeTerminalTab === 'win' ? winCommands : activeTerminalTab === 'unix' ? unixCommands : agentCommands,
              activeTerminalTab
            )"
          >
            {{ copiedCommand === activeTerminalTab ? t.copiedText : t.copyText }}
          </button>
        </div>

        <div class="rl-terminal-body">
          <pre v-if="activeTerminalTab === 'win'"><code>{{ winCommands }}</code></pre>
          <pre v-else-if="activeTerminalTab === 'unix'"><code>{{ unixCommands }}</code></pre>
          <pre v-else><code>{{ agentCommands }}</code></pre>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.rl-bench {
  max-width: 1160px;
  margin: 0 auto;
  padding: 0 24px 80px;
}

/* Telemetry Bar */
.rl-telemetry-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  margin: 16px 0 32px;
  background: var(--rl-surface);
  border: 1px solid var(--rl-line);
  border-radius: 8px;
  font-family: var(--rl-font-mono);
  font-size: 12px;
}
.rl-telemetry-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.rl-telemetry-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--rl-ok);
  box-shadow: 0 0 6px var(--rl-ok);
}
.rl-telemetry-mono {
  color: var(--rl-ink-soft);
  font-weight: 500;
}
.rl-telemetry-sep {
  color: var(--rl-muted);
}
.rl-telemetry-tag {
  background: var(--rl-surface-2);
  color: var(--rl-primary);
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;
  border: 1px solid var(--rl-line);
}

/* Hero Section */
.rl-hero {
  padding: 24px 0 56px;
  text-align: left;
}
.rl-hero-meta {
  margin-bottom: 16px;
}
.rl-hero-kicker {
  font-family: var(--rl-font-mono);
  font-size: 13px;
  font-weight: 600;
  color: var(--rl-accent);
  letter-spacing: 0.05em;
  background: var(--rl-accent-soft);
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid oklch(0.580 0.150 65 / 0.2);
}
.rl-hero-title {
  font-family: var(--rl-font-display);
  font-size: clamp(2.5rem, 5.5vw, 4.25rem);
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.1;
  margin: 0 0 20px;
  color: var(--rl-ink);
  text-wrap: balance;
}
.rl-hero-tagline {
  max-width: 72ch;
  font-size: 1.125rem;
  line-height: 1.7;
  color: var(--rl-ink-soft);
  margin-bottom: 32px;
  text-wrap: pretty;
}
.rl-hero-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 48px;
}
.rl-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 14px;
  text-decoration: none !important;
  transition: all 160ms ease-out;
}
.rl-btn-primary {
  background: var(--rl-primary);
  color: #fff !important;
  border: 1px solid var(--rl-primary);
}
.rl-btn-primary:hover {
  background: var(--rl-primary-2);
  transform: translateY(-1px);
}
.rl-btn-secondary {
  background: var(--rl-surface);
  color: var(--rl-ink) !important;
  border: 1px solid var(--rl-line);
}
.rl-btn-secondary:hover {
  border-color: var(--rl-primary);
  color: var(--rl-primary) !important;
}
.rl-btn-ghost {
  border: 1px solid var(--rl-line);
  color: var(--rl-muted) !important;
  background: transparent;
}
.rl-btn-ghost:hover {
  border-color: var(--rl-ink-soft);
  color: var(--rl-ink) !important;
}
.rl-btn-badge {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 12px;
  font-family: var(--rl-font-mono);
}
.rl-badge-accent {
  background: var(--rl-accent-soft);
  color: var(--rl-accent);
}

/* Gauge Cards */
.rl-gauge-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--rl-line);
}
.rl-gauge-card {
  background: var(--rl-surface);
  border: 1px solid var(--rl-line);
  padding: 16px 20px;
  border-radius: 8px;
}
.rl-gauge-val {
  font-family: var(--rl-font-mono);
  font-size: 2rem;
  font-weight: 700;
  color: var(--rl-ink);
  line-height: 1.1;
  margin-bottom: 4px;
}
.rl-gauge-lbl {
  font-size: 13px;
  color: var(--rl-muted);
  font-weight: 500;
}

/* Section Common */
.rl-section {
  padding: 56px 0 24px;
  border-top: 1px solid var(--rl-line);
}
.rl-section-header {
  margin-bottom: 28px;
}
.rl-section-title {
  font-family: var(--rl-font-display);
  font-size: 1.75rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--rl-ink);
  margin: 0 0 8px;
}
.rl-section-desc {
  font-size: 1rem;
  color: var(--rl-ink-soft);
  margin: 0;
}

/* Boards Matrix */
.rl-board-matrix {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 20px;
}
.rl-board-cell {
  display: flex;
  flex-direction: column;
  background: var(--rl-bg);
  border: 1px solid var(--rl-line);
  border-radius: 10px;
  padding: 24px;
  text-decoration: none !important;
  transition: all 180ms ease-out;
  position: relative;
}
.rl-board-cell:hover {
  border-color: hsl(var(--bd-hue, 278) 45% 55%);
  box-shadow: 0 6px 20px -8px hsl(var(--bd-hue, 278) 60% 70% / 0.25);
  transform: translateY(-2px);
}
.rl-cell-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}
.rl-board-id {
  font-family: var(--rl-font-mono);
  font-size: 12px;
  font-weight: 600;
  color: var(--rl-muted);
}
.rl-board-chip {
  font-family: var(--rl-font-mono);
  font-size: 12px;
  font-weight: 600;
  color: hsl(var(--bd-hue) 45% 30%);
  background: hsl(var(--bd-hue) 60% 96%);
  border: 1px solid hsl(var(--bd-hue) 50% 88%);
  padding: 2px 8px;
  border-radius: 4px;
}
.rl-cell-enter {
  margin-left: auto;
  font-size: 13px;
  font-weight: 600;
  color: var(--rl-primary);
  opacity: 0.8;
}
.rl-board-cell:hover .rl-cell-enter {
  opacity: 1;
  transform: translateX(2px);
}
.rl-cell-title {
  font-family: var(--rl-font-display);
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--rl-ink);
  margin: 0 0 10px;
}
.rl-cell-zh {
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--rl-muted);
  margin-left: 6px;
}
.rl-cell-blurb {
  font-size: 14px;
  line-height: 1.6;
  color: var(--rl-ink-soft);
  margin: 0 0 16px;
  flex-grow: 1;
}
.rl-cell-signal {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  background: var(--rl-surface-2);
  border: 1px solid var(--rl-line);
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-family: var(--rl-font-mono);
  color: var(--rl-ink-soft);
  margin-bottom: 16px;
  line-height: 1.4;
}
.rl-signal-icon {
  margin-top: 2px;
  flex-shrink: 0;
  color: hsl(var(--bd-hue) 60% 45%);
}
.rl-cell-footer {
  display: flex;
  gap: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--rl-line);
  font-size: 13px;
  color: var(--rl-muted);
}
.rl-cell-metric strong {
  color: var(--rl-ink);
  font-family: var(--rl-font-mono);
}

/* MCP Matrix Controls */
.rl-mcp-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 20px;
}
.rl-tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.rl-tab-btn {
  background: var(--rl-surface);
  border: 1px solid var(--rl-line);
  color: var(--rl-ink-soft);
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 140ms ease;
}
.rl-tab-btn:hover {
  color: var(--rl-ink);
  border-color: var(--rl-muted);
}
.rl-tab-btn.active {
  background: var(--rl-primary);
  border-color: var(--rl-primary);
  color: #fff;
}
.rl-search-input {
  background: var(--rl-surface);
  border: 1px solid var(--rl-line);
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 13px;
  color: var(--rl-ink);
  width: 240px;
  outline: none;
}
.rl-search-input:focus {
  border-color: var(--rl-primary);
}

/* MCP Workbench Split */
.rl-mcp-workbench {
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: 20px;
}
@media (max-width: 960px) {
  .rl-mcp-workbench {
    grid-template-columns: 1fr;
  }
}
.rl-mcp-catalog {
  background: var(--rl-surface);
  border: 1px solid var(--rl-line);
  border-radius: 8px;
  padding: 20px;
  max-height: 480px;
  overflow-y: auto;
}
.rl-mcp-group-block {
  margin-bottom: 20px;
}
.rl-mcp-group-block:last-child {
  margin-bottom: 0;
}
.rl-group-badge {
  font-family: var(--rl-font-mono);
  font-size: 12px;
  font-weight: 600;
  color: var(--rl-muted);
  text-transform: uppercase;
  margin-bottom: 10px;
}
.rl-tools-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.rl-tool-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--rl-bg);
  border: 1px solid var(--rl-line);
  border-radius: 6px;
  padding: 5px 10px;
  font-family: var(--rl-font-mono);
  font-size: 12px;
  color: var(--rl-ink);
  cursor: pointer;
  transition: all 120ms ease;
}
.rl-tool-pill:hover {
  border-color: var(--rl-primary);
}
.rl-tool-pill.active {
  border-color: var(--rl-primary);
  background: var(--rl-primary-soft);
  color: var(--rl-primary);
  font-weight: 600;
}
.rl-tool-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--rl-muted);
}
.rl-tool-dot.ai-ready {
  background: var(--rl-ok);
}
.rl-tool-mode {
  font-size: 10px;
  background: var(--rl-surface-2);
  padding: 1px 4px;
  border-radius: 3px;
  color: var(--rl-muted);
}

/* Inspector */
.rl-mcp-inspector {
  background: var(--rl-surface);
  border: 1px solid var(--rl-line);
  border-radius: 8px;
  padding: 20px;
  display: flex;
  flex-direction: column;
}
.rl-inspector-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--rl-line);
  padding-bottom: 12px;
  margin-bottom: 16px;
}
.rl-inspector-title {
  font-family: var(--rl-font-mono);
  font-size: 12px;
  font-weight: 600;
  color: var(--rl-ink);
}
.rl-status-pill {
  font-family: var(--rl-font-mono);
  font-size: 11px;
  color: var(--rl-ok);
  font-weight: 600;
}
.rl-inspector-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  margin-bottom: 10px;
}
.rl-inspector-row .lbl {
  font-family: var(--rl-font-mono);
  font-size: 11px;
  color: var(--rl-muted);
}
.rl-inspector-row .val {
  font-weight: 500;
  color: var(--rl-ink);
}
.rl-inspector-code {
  margin-top: 14px;
}
.rl-code-label {
  font-family: var(--rl-font-mono);
  font-size: 11px;
  color: var(--rl-muted);
  margin-bottom: 6px;
}
.rl-inspector-code pre {
  background: var(--rl-code-bg);
  color: #f1f5f9;
  padding: 12px;
  border-radius: 6px;
  font-size: 12px;
  margin: 0;
  overflow-x: auto;
}

/* Terminal Card */
.rl-terminal-card {
  background: var(--rl-code-bg);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
}
.rl-terminal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: oklch(0.200 0.020 280);
  padding: 8px 16px;
  border-bottom: 1px solid oklch(0.260 0.020 280);
}
.rl-terminal-buttons {
  display: flex;
  gap: 8px;
}
.rl-term-tab {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-family: var(--rl-font-mono);
  font-size: 12px;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 140ms ease;
}
.rl-term-tab:hover {
  color: #f8fafc;
}
.rl-term-tab.active {
  background: oklch(0.300 0.030 280);
  color: #f8fafc;
  font-weight: 600;
}
.rl-copy-btn {
  background: oklch(0.280 0.030 280);
  border: 1px solid oklch(0.380 0.040 280);
  color: #e2e8f0;
  font-family: var(--rl-font-mono);
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 140ms ease;
}
.rl-copy-btn:hover {
  background: var(--rl-primary);
  color: #fff;
}
.rl-terminal-body {
  padding: 20px;
}
.rl-terminal-body pre {
  margin: 0;
  color: #e2e8f0;
  font-family: var(--rl-font-mono);
  font-size: 13.5px;
  line-height: 1.6;
  overflow-x: auto;
}
</style>
