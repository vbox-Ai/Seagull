# ReverseLab Desktop Harness — Design Brief (Impeccable Shape)

## 1. Job and Audience
- **Audience**: 逆向工程师、安全研究员、CTF 选手与 AI 辅助分析人员。
- **Context & Mindset**: 带着具体的二进制样本或靶场目标进入，希望摆脱繁琐配置与冗长命令行，追求“许愿级”的自动化闭环推进与清晰可控的推理全过程。
- **Visitor Mode**: **Operate**（专注高效完成逆向研判，界面克制、精密、高信息信噪比）。

## 2. Outcome and Proof
- **Primary Task**: 拖入样本/URL + 输入一句高层意图愿望（如“逆出 License 算法”），系统自主完成初筛、动态分析、反调试绕过与证据捕获。
- **Success Criteria**: 
  - AI 每一个步骤与推理决策作为动态节点实时在无限画布上生长点亮；
  - 自动屏蔽非当前任务领域的杂音节点，只展示专属业务链；
  - 终局结算优雅交付：纯净可执行的 Python 脚本、修复后的二进制或提取的 Flag。
- **Real Evidence**: 所有结论严格对应实际执行产生的产物（`exports/`、`notes/`、`reports/`），绝不凭空捏造。

## 3. Selected Direction (Visual & Interaction Thesis)
- **Visual World**: **无影灯下的精密实验室控制台**（参考 `DESIGN.md`，深黑/冷靛暗调背景 `oklch(0.16 0.02 280)`，琥珀校准强调色，系统黑体 + JetBrains Mono 等宽字体）。
- **Focal Experience**:
  - **State 0（静谧发射台）**：居中 Spotlight 式极简愿望输入仓 + 样本拖拽区，顶栏常驻环境健康指示灯；
  - **State 1（流式拓扑生长）**：按下回车后愿望仓平滑收缩至底栏，画布自中央展开，首个节点诞生；
  - **State 2（多分支动态演进）**：主 Agent 沿水平向右推进，子 Agent 并发分支上下平行展开并最终汇流；相机自动缓动居中跟焦最新卡片；
  - **State 3（深入抽屉窥镜）**：点击紧凑卡片，右侧平滑滑出反编译代码、Hex 视图与工具原始日志；
  - **State 4（战果结算卡）**：目标达成，画布背景微暗，中央弹出高精度战果卡片，支持一键复制代码与二进制下载。

## 4. Scope and Boundaries
- **In-Scope**:
  - 完整的 Tauri v2 桌面 Native 架构；
  - 基于 `@xyflow/react` 的定制动态水平树画布（含平滑平移动效与自定义节点）；
  - 双层穿透式环境健康监控抽屉（物理二进制检测 + MCP 挂载探测）；
  - 本地 Python 逆向脚本与 MCP 调用的 Tauri Rust 命令桥接。
- **Anti-Goals（明确不做的反模式）**：
  - 不做毫无信息量的纯 AI 聊天气泡列表；
  - 不做铺满全屏、未过滤的全景静态预制大杂烩流程图；
  - 不做阻碍专业操作的花哨粒子、闪烁炫光或无意义的 3D 旋转。

## 5. Interaction & Layout Architecture
- **Top Bar**: 项目工作区标识 + `● 工具链 21/23 就绪` 状态胶囊（点击呼出设置抽屉）。
- **Main Canvas**: 无限网格视口，支持物理手势平移（Pan）、滚轮缩放（Zoom），内置跟随相机（可被鼠标拖拽随时打断）。
- **Node Component**:
  - 紧凑胶囊体（260×64px），带运行呼吸灯（RUNNING / DONE / FAILED）；
  - 动作名称 + 关键提取物微标 + KB 关联手册标签（点击弹出知识悬浮卡）。
- **Bottom Bar**: 常驻收缩态输入栏，支持追加指令或人工干预（Human-in-the-Loop）。
- **Settings Drawer**: 结构化工具矩阵表格，展示绝对路径、就绪状态及一键自愈命令。

## 6. Constraints & Execution Contract
- **Platform**: Tauri v2 (Rust backend) + React 19 + TypeScript + Vite + TailwindCSS。
- **Workspace Containment**: 根目录严格守在当前仓库，样本文件允许任意外部路径拖入引用，产物统一就地归档。
- **Finish Gate**: 满足 WCAG AA 级高对比度暗色标准，遵循 Impeccable 极速响应性能，无丢帧。
