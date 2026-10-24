# ReverseLab Desktop Harness

ReverseLab Desktop 是专为 `open-reverseLab` 打造的现代化、低耦合 AI 逆向工程自动化桌面工作台。

基于 **TypeScript + Tauri v2 + React 19 + LangGraph.js + @xyflow/react** 构建。

---

## 核心特性

* **极简暗黑精工设计**：无边框内嵌顶栏，采用 Linear 级哑光深黑设计语言，零廉价电光蓝与浮夸特效。
* **双模式研判胶囊**：
  * **许愿闭环 (Wish Mode)**：输入逆向意图，全自动进行初筛、知识库攻击网查表、并行子 Agent 调度与算法还原。
  * **交互诊断 (Interactive Mode)**：提供专家级逐步交互、实时日志监控与断点干预。
* **多重视图无缝切换**：
  * **拓扑画板 (Graph)**：React Flow 驱动的动态水平分支图，自动平滑聚焦活跃节点。
  * **终端日志 (Logs)**：虚拟化高频结构化日志流，支持 Level 过滤、关键字检索与载荷展开。
  * **诊断中心 (Diag)**：双层环境体检，覆盖本机逆向工具链、4 大 MCP 协议服务及样本初筛。
* **低耦合分层架构**：领域契约、业务探针、日志总线与状态机引擎完全无头化，与 UI 彻底解耦。

---

## 规范与文档导航

* [分层解耦架构设计 (ARCHITECTURE.md)](file:///e:/open-reverseLab/desktop/ARCHITECTURE.md)
* [开发者与工具扩展指南 (DEV_GUIDE.md)](file:///e:/open-reverseLab/desktop/DEV_GUIDE.md)
* [UI/UX 美学与合规规范 (STANDARDS.md)](file:///e:/open-reverseLab/desktop/STANDARDS.md)

---

## 快速启动

```bash
# 启动桌面原生无边框客户端
cd desktop
pnpm dev:desktop

# 或启动纯 Web 调试模式
pnpm dev
```
