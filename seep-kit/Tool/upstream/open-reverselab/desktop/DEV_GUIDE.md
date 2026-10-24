# ReverseLab Desktop Harness — 开发者扩展指南 (DEV_GUIDE.md)

本文档面向逆向工程师与前端开发人员，说明如何调试、扩展及接入新工具。

---

## 1. 快速上手

### 1.1 前置要求
* Node.js >= 20，`pnpm` >= 9
* Rust >= 1.80 (MSVC 工具链)
* VS 2022 BuildTools (默认路径 `C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools`)

### 1.2 启动命令

```bash
# 进入桌面子工程
cd desktop

# 方式 A：纯前端 Web 快速调试 (浏览器访问 http://localhost:1420)
pnpm dev

# 方式 B：启动 Tauri 原生无边框桌面窗体 (自动加载 MSVC 编译环境)
pnpm dev:desktop

# 方式 C：生产构建验证
pnpm build
```

---

## 2. 如何接入新逆向工具或 MCP

所有逆向工具均按照 **契约优先 (Contract First)** 接入：

### 步骤 1：在 `src/core/types.ts` 定义数据模型
如果工具产生特殊的证据结构，在 `GraphStep.evidence` 中声明类型。

### 步骤 2：在 `src/engine/harnessGraph.ts` 注册状态节点
在 LangGraph 状态机中新增分析节点：

```typescript
const decompileNode = async (state: HarnessState): Promise<Partial<HarnessState>> => {
  const step: GraphStep = {
    id: `node-${Date.now()}`,
    parentId: state.steps[state.steps.length - 1]?.id || null,
    agentId: "sub-ghidra",
    title: "Ghidra Headless 伪代码反编译",
    status: "running",
    detail: "执行 ghidra_headless_analyze 脚本...",
    kbRef: "kb/pe-reverse/techniques/01-static/01-ghidra-decompile.md",
    timestamp: Date.now(),
  };
  emit(step);

  // 调度工具并记录日志
  logger.tool("sub-ghidra", "analyzeHeadless.bat ...", 1200);

  // 回填执行证据
  const doneStep: GraphStep = {
    ...step,
    status: "done",
    evidence: { decompilerOutput: "void check_license() { ... }" },
  };
  emit(doneStep);

  return { steps: [...state.steps, doneStep] };
};

// 将节点挂入图
graph.addNode("decompile", decompileNode);
graph.addEdge("kbRouting", "decompile");
```

---

## 3. 如何新增分析视图 (New View)

Harness 支持自由横向扩展视图（例如反汇编视图、十六进制查看器、YARA 匹配器）：

1. **注册视图标识**：在 `src/core/types.ts` 中的 `HarnessView` 联合类型中增加枚举，例如 `"canvas" | "console" | "diagnostics" | "hex"`.
2. **在 Sidebar 增加切换按钮**：在 `src/components/Sidebar.tsx` 的 Views 网格中添加按钮。
3. **在 App.tsx 挂载组件**：
```tsx
{viewMode === "hex" && <HexViewer currentTarget={currentSession?.target} />}
```
4. 组件直接调用 `useHarness()` 获取目标文件与日志，完全无需通过 Props 逐层透传。
