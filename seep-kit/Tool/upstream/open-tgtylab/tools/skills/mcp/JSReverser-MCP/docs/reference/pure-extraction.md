# Pure Extraction

这份文档是 **补环境通过后进入纯算法提纯阶段的执行协议**。

它不回答“怎么补环境”，只回答：

- 什么时候才允许开始提纯
- 提纯阶段该先做什么
- 如何把 hook 日志、运行时值和最终纯算代码串起来

## 适用前提

只有满足以下条件，才允许进入 `PureExtraction`：

- 目标请求、脚本、关键函数已确认
- 本地 `env rebuild` 已稳定跑通目标链路
- 已记录至少一条 `first divergence` 及修复路径
- 已至少一次服务端验收通过

若上述任一条件不满足，应返回 `Observe` / `Capture` / `Patch`，而不是继续提纯。

## 阶段目标

把当前链路拆成三层：

1. **环境层**：浏览器对象、页面状态、宿主噪音
2. **运行时层**：当前脚本内部的中间值与装配逻辑
3. **算法层**：可以用显式输入重放的纯算部分

`PureExtraction` 的目标不是“看懂全部页面代码”，而是把运行时层里真正属于算法的部分独立出来。

## 核心原则

- `Freeze-first`
- `Hook-local-runtime`
- `Boundary-before-rewrite`
- `Fixture-before-port`
- `Node-before-Python`
- `Evidence-first`

## 推荐步骤

### Step 1: Freeze

固定一条已通过服务端验收的样本，至少记录：

- 请求输入
- 时间相关字段
- token / fingerprint / vk
- clt / gs / gsd / tail / 最终签名
- 当轮使用的 cookie / user-agent / 页面状态摘要

没有固定样本，不允许进入下一步。

### Step 2: Hook Local Runtime

在本地补环境成功的 runtime 上继续 hook，不再优先回页面。

应优先采样：

- 关键函数输入
- 关键函数输出
- 关键中间值
- 影响分支的布尔判定或版本常量

目标不是拿更多结果，而是回答：

- 哪些值是算法输入
- 哪些值只是由环境驱动的运行时状态

### Step 3: Define Boundary

把当前链路切成最小可解释单元。

至少要明确：

- 哪些字段必须作为显式输入
- 哪些字段可由前一步推导
- 哪些字段仍属于环境层，不应塞入纯算实现
- 哪些分支是 token 族 / 版本常量 / 平台差异

如果这一层边界没写清楚，不允许直接开始重写纯算代码。

### Step 4: Build Fixture

在 task-local `run/` 下固化夹具。

夹具至少应包含：

- 输入
- 中间值
- 最终输出
- 版本信息 / 常量边界

夹具目标：

- 能对齐 runtime 输出
- 能验证后续 pure implementation
- 能作为 Python/其他宿主迁移的真值源

### Step 5: Extract Node Pure

先提纯 Node 纯算实现。

要求：

- 输入边界显式
- 输出边界显式
- 不再依赖大块浏览器宿主对象
- 不再依赖整页 runtime 调度
- 必须可用固定夹具对齐 runtime

### Step 6: Verify Node Pure

至少验证：

- pure implementation 与 runtime fixture 逐段一致
- 中间值一致或可解释
- 服务端验收仍通过

若这里不一致，应回退到 `Step 2` 或 `Step 3`，而不是直接改 Python。

### Step 7: Port

外部语言迁移只能发生在 Node pure 已稳定之后。

推荐顺序：

- Node pure
- Python pure
- 其他宿主 / SDK 封装

## 必备产物

建议至少有以下 task-local 产物：

- `run/exported-runtime.*`
- `run/pure-*.js`
- 可选 `run/pure_*.py`
- `run/fixtures.json` 或等价夹具文件
- `report.md` 中的 pure extraction 边界说明

## 禁止事项

- env rebuild 未通过就开始写 pure Python
- 没有固定样本就开始提纯
- 没有 local runtime hook 证据就凭页面大代码手猜算法边界
- 把整个页面状态对象直接塞进 pure implementation 输入
- 还没做 Node pure 就直接做 Python port

## 完成判据

`PureExtraction` 完成至少意味着：

- 已有一份 Node pure implementation
- 已有固定 fixture
- Node pure 与 runtime fixture 对齐
- 已说明已提纯部分与未提纯边界
- 如有 Python 版本，Python 与 Node pure 已对齐

## 与其他文档的关系

- 总阶段协议：`docs/reference/reverse-workflow.md`
- 补环境规范：`docs/reference/env-patching.md`
- 产物约束：`docs/reference/reverse-artifacts.md`
- 升级排查：`docs/reference/algorithm-upgrade-template.md`
