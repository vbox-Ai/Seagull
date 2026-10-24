# ReverseLab Desktop Harness — 开发与设计规范 (STANDARDS.md)

本文档规范 `desktop` 工程的代码风格、UI/UX 美学准则以及开源安全合规要求。

---

## 1. UI / UX 美学与交互标准 (Impeccable Standard)

桌面 Harness 严格遵循 **暗黑精工实验室 (Dark Precision Lab)** 标准，拒绝粗制滥造与廉价科幻感：

### 1.1 配色与质感红线
* **基底背景**：纯黑暗阶 `#09090b` (Canvas), `#0d0d10` (Sidebar), `#121215` (Surface/Cards)。
* **描边与分割**：精细暗灰 `#27272a` (Subtle), `#3f3f46` (Hover)。
* **按键交互**：纯白/浅灰高反差实体按键（`bg-zinc-100 text-zinc-950 hover:bg-white`），参照 Linear/Raycast 质感。
* **绝对禁止**：
  * 禁止使用高饱和电光青蓝（如 `#06b6d4`, `cyan-400`）作为大面积背景或描边。
  * 禁止添加虚假的发光光晕（Glow/Neon）和浮夸渐变。
  * 禁止使用非必要的装饰性图标（如星号 Sparkles、彩色盾牌）。

### 1.2 文案与认知负荷
* **极简冷峻**：禁止向用户展示描述性套话（如“投放样本即可全自主闭环”）。
* **隐藏技术实现细节**：绝对禁止在用户界面露出“LangGraph.js TS 引擎”、“Tauri v2”等框架名。
* **语义高度凝练**：统一采用 `Target`、`Goal`、`Run`、`Reset` 等工业标准操作词。

---

## 2. 状态机与代码质量规范

1. **强类型保证**：严格开启 TypeScript `strict: true`、`noUnusedLocals: true`，禁止遗留隐式 `any`。
2. **状态与渲染解耦**：
   * 引擎核心位于 `src/engine/`，纯 TypeScript 编写，禁止在引擎中直接调用 React Hooks 或 DOM API。
   * 所有跨组件状态通过 `HarnessContext` 进行统一调度，禁止滥用全局 Mutable 变量。
3. **日志可追溯**：
   * 工具调用必须通过 `logger.tool(agentId, command, durationMs)` 记录耗时与指令。
   * 关键分析产物必须通过 `logger.evidence(agentId, title, data)` 记录结构化 JSON。

---

## 3. 开源安全与脱敏规范 (PUBLICATION.md)

本仓库为公开开源工程，提交前必须遵守：
1. **禁止硬编码本机路径**：如含有特定用户名的绝对路径。
2. **禁止泄漏目标凭据**：禁止提交任何真实目标系统的 API Key、Token 或私人样本。
3. **格式化与发布自检**：任何改动提交前，必须运行：
   ```bash
   python scripts/misc/public_release_check.py
   ```
   输出必须为 `{"overall": "PASS", "failures": []}`。
