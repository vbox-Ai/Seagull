# Reverse Artifacts

推荐每个逆向任务都写入统一任务目录：

`artifacts/tasks/<taskId>/`

公开文档入口与本地任务产物分离：

- 公开索引：`scripts/cases/README.md`
- 正式规则 / 模板 / 契约：`docs/reference/`
- 人类使用指南：`docs/guides/`
- 本地私有任务产物：`artifacts/tasks/<taskId>/`

读取优先级：

1. 先复用已存在的 `artifacts/tasks/<taskId>/` 全链路数据。
2. 若不存在，再参考 `scripts/cases/*` 抽象 case。
3. 仍不足时，按参数方法论模板新建任务目录并执行。

## 最小必备文件

以下文件构成最小 task artifact，缺少其中任意一项都会影响续做：

- `task.json`
- `network.jsonl`
- `scripts.jsonl`
- `runtime-evidence.jsonl`
- `env/entry.js`
- `env/env.js`
- `env/polyfills.js`
- `env/capture.json`
- `report.md`

## 可选文件

以下文件按任务需要补充，不应默认全部生成：

- `timeline.jsonl`
- `cookies.json`
- `replay/actions.json`
- `run/`
- 站点专用 `env/scripts/`
- `run/exported-runtime.js`
- `run/pure-*.js`
- `run/pure_*.py`
- `run/fixtures.json`

这些文件的用途：

- 回看页面观察证据
- 追踪哪个请求、哪个脚本、哪个 cookie 参与参数生成
- 记录 local rebuild 进展
- 给 Codex / Claude / Gemini 续做同一个任务

注意：

- 可执行脚本与链路数据统一放 `artifacts/tasks/`，目录结构保持稳定便于复用。
- `scripts/cases/*` 仍保持抽象模板，不放可直接复用实现。
- 可直接复用任务骨架：`artifacts/tasks/_TEMPLATE/`。
- 真实 `artifacts/tasks/<taskId>/` 默认本地保留；共享前先做脱敏审查。

## 写入策略

为避免模型“知道要写 artifact，但不知道何时写、怎么写”，以下文件建议按固定策略更新：

### 适合追加（append）的文件

- `network.jsonl`
  - 每发现一条新的关键请求、响应特征、headers/body 线索就追加
- `scripts.jsonl`
  - 每确认一条新的关键脚本、函数定位、initiator 线索就追加
- `runtime-evidence.jsonl`
  - 每次 hook 命中、中间值采样、对象字段采样都追加
- `timeline.jsonl`
  - 每个阶段回合结束后追加一条“做了什么 / 看到什么 / 下一步”

这些文件的目标是保留增量证据，不应频繁整文件覆盖。

### 适合覆盖（overwrite）的文件

- `task.json`
  - 保留当前任务元信息、当前阶段、最近更新时间、最新摘要
- `env/entry.js`
- `env/env.js`
- `env/polyfills.js`
- `env/capture.json`

这些文件的目标是保存“当前最新可运行状态”，应允许覆盖更新，但要保证内容始终可直接续跑。

### 适合持续修订的人类摘要

- `report.md`
  - 允许反复改写
  - 但至少应稳定包含：
    - Current Stage
    - Confirmed
    - Unconfirmed
    - First Divergence
    - Current Acceptance
    - Next Step

## 阶段与文件的最低对应关系

### Observe

至少应出现：

- `task.json`
- `network.jsonl`
- `scripts.jsonl`
- `report.md`

### Capture

至少应新增：

- `runtime-evidence.jsonl`

复杂触发流程建议再补：

- `timeline.jsonl`
- `replay/actions.json`

### Rebuild

至少应出现：

- `env/entry.js`
- `env/env.js`
- `env/polyfills.js`
- `env/capture.json`

### Patch

至少应持续更新：

- `timeline.jsonl`
- `runtime-evidence.jsonl`
- `report.md`
- 必要时更新 `env/*`

### PureExtraction / Port

至少应新增或更新：

- `run/fixtures.json`
- `run/pure-*.js`
- 可选 `run/pure_*.py`
- `report.md`

## 关于 Python `execjs` 等外部宿主

如果目标是让 Python 直接调用某个签名函数，推荐产出两类不同文件：

1. local rebuild 文件

- 用于补环境、调试、读取代理 env log、定位 first divergence
- 典型文件：`env/env.js`、`env/polyfills.js`、`env/entry.js`

2. portable runtime 文件

- 用于外部宿主直接调用
- 典型文件：`run/exported-runtime.js`

建议流程：

1. 先在 Node local rebuild 中跑通链路
2. 先依据代理 env log 和 `first divergence` 完成最小因果单元补丁
3. 再把最小依赖提纯到 `run/exported-runtime.js`
4. 最后让 Python `execjs`、`quickjs` 或其他宿主调用导出函数

不要反过来直接在 `execjs` 里做补环境，这会让调试和定位缺口变得更困难。

## 关于 pure algorithm 产物

进入条件与阶段协议见：`docs/reference/pure-extraction.md`

当某个任务已经从 `env rebuild` 进入纯算法提纯阶段时，建议在 task-local `run/` 下补齐以下产物：

- `run/pure-*.js`：可读纯算实现
- 可选 `run/pure_*.py`：外部语言实现
- `run/fixtures.json` 或等价夹具：固定输入、固定 runtimeContext、固定输出
- `report.md` 中的 pure runtime 验收记录

建议在 `report.md` 中至少写明：

- Pure Algorithm Status
- Portable Runtime Status
- Fixture Result
- Server Acceptance
- Drift Boundary

注意：

- 这些 pure algorithm 文件仍是 task-local 产物，不属于仓库公开 case
- `scripts/cases/*` 只能描述“如何提纯”，不能直接存放某站点真实纯算实现
