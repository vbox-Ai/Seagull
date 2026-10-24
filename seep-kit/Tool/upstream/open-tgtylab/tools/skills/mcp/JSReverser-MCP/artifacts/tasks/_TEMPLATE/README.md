# Reverse Task Template

这个目录是 **task artifact 起手模板**。

目标不是提供某个站点的现成实现，而是确保任意 reverse task 一开始就有：

- 明确的任务元信息
- 可追加的证据文件
- 可迭代的本地 env rebuild 入口
- 可持续修订的人类摘要

## 目录说明

- `task.json`
  - 当前任务元信息、目标、阶段、成功判定
- `network.jsonl`
  - 关键请求 / 响应证据
- `scripts.jsonl`
  - 关键脚本 / initiator / 定位信息
- `runtime-evidence.jsonl`
  - hook、中间值、对象字段、环境线索
- `timeline.jsonl`
  - 每一轮“做了什么 / 观察到什么 / 下一步”
- `report.md`
  - 人类可读摘要，给 AI / 人续做
- `env/`
  - Node local rebuild 入口、env patch、polyfill、capture
- `replay/`
  - 页面触发动作序列
- `run/`
  - 本地运行、校验、trace、pure runtime 等执行脚本

## 使用约束

1. 先改 `task.json`，明确：
   - `taskId`
   - `targetUrl`
   - `goal`
   - `currentStage`
   - `successCriteria`

2. Observe 阶段至少补：
   - `network.jsonl`
   - `scripts.jsonl`
   - `report.md`

3. Capture 阶段至少补：
   - `runtime-evidence.jsonl`
   - 必要时 `replay/actions.json`

4. Rebuild / Patch 阶段持续更新：
   - `env/*`
   - `timeline.jsonl`
   - `report.md`

5. 真实任务目录默认本地保留，分享前先脱敏。

## 第一次接手任务时的 5 步起手顺序

1. 改 `task.json`
   - 填 `taskId`、`targetUrl`、`goal`、`currentStage`
   - 写清本轮成功判定

2. 写第一批 `network.jsonl`
   - 至少记录目标请求或候选目标请求

3. 写第一批 `scripts.jsonl`
   - 至少记录 initiator、候选脚本或关键定位线索

4. 初始化 `report.md`
   - 先写 Current Stage / Confirmed / Unconfirmed / Next Step

5. 再决定进入哪个阶段
   - 证据还不够：继续 `Observe`
   - 已有最小采样点：进入 `Capture`
   - 已有稳定页面证据并要本地复现：进入 `Rebuild`

如果这 5 步还没做完，不建议直接开始大规模 hook、补环境或 pure extraction。

## 不要做的事

- 不要把真实站点敏感值直接写进模板
- 不要把模板当成公开 case
- 不要只在对话里描述结论而不回写 artifact
