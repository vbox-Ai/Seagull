# 参数复现方法论模板（站点无关）

更新时间：2026-03-05

## 开场强制约束

开始填写这个模板之前，先读：

1. `docs/reference/reverse-bootstrap.md`
2. `docs/reference/case-safety-policy.md`
3. `docs/reference/reverse-workflow.md`
4. 若当前任务已通过 `env-pass`，或目标是“补环境后做纯算法提纯”，继续读 `docs/reference/pure-extraction.md`

填写与实现边界：

- 这个模板只描述方法、输入契约、验证口径、分叉记录，不承载完整可执行实现
- 仓库内 `scripts/cases/*` 只能沉淀抽象模板，不得写入可直接复用的完整签名链路
- 可执行脚本、任务证据、运行日志统一放 `artifacts/tasks/<task-id>/`

如果模型在开场没有先确认这些边界，就不应直接开始写 case 或写代码。

## 适用范围

- 适用于任意“请求参数可复现”类任务（签名、令牌、时间戳衍生字段、混合指纹参数）。
- 不绑定具体站点与参数名。

## 0. 任务定义

- 目标参数：`<param_name>`
- 目标请求：`<method> <url_pattern>`
- 成功标准：
  - 参数结构校验通过（段数/长度/编码格式）
  - 单次请求闭环满足预期（HTTP 状态 + 业务字段）

## 1. 输入契约（必须先填）

- `requestSpec`
  - `url` / `method` / `headers schema` / `body schema`
- `paramContract`
  - 字段名、类型、编码方式、是否与时间相关
- `runtimeSeedSchema`
  - cookie 键名集合
  - localStorage/sessionStorage 键名集合
  - 仅记录格式与长度，不记录敏感原值
- `clockPolicy`
  - 是否固定时间戳、偏移容忍度

## 2. 标准流程（固定顺序）

1. Observe

- 定位参数所在请求、触发动作、脚本来源、候选入口函数。

2. Capture

- 最小采样（优先 Hook，必要时断点），只保留字段结构证据。

3. Rebuild

- 本地最小补环境：先读代理 env log，先记录 `first divergence`，再按最小因果单元补丁，禁止一次性脑补。

4. Verify

- 单次验签闭环，记录状态码、业务码、响应摘要。

5. Divergence

- 记录 first divergence（首个差异点）并给出下一步补丁方向。

## 3. 补环境策略（最小因果单元）

- 每次只做一个补丁决策，而不是机械地一次改一个属性名。
- 一个补丁决策可对应：
  - 一个值 / 一个函数壳 / 一个返回对象 / 一个最小对象契约
- 补丁前必须先确认：
  - 当前代理 env log
  - 当前 `first divergence`
  - 对应页面证据
- `diff_env_requirements` 仅作辅助，不替代代理日志。
- 每次补丁后立刻复测并记录 `first divergence` 是否前移。
- 失败时使用“上一版本可用快照”回退。

## 4. 验证口径

- 结构验证：
  - 参数段数/长度/字符集符合预期。
- 行为验证：
  - 单次目标请求返回可接受结果。
- 差异验证：
  - 允许值不同，但闭环必须通过。

## 5. 输出契约（统一）

- `paramShape`: 段数、长度、编码规则
- `requiredInputs`: 复现所需最小输入字段
- `envDependencies`: 补环境依赖清单
- `proxyLogSummary`: 当前代理日志摘要
- `patchDecision`: 当前最小因果单元补丁决策
- `verifyResult`: 状态码、业务摘要
- `firstDivergence`: 首差异与后续动作

## 6. 安全边界

- 仓库内只保留抽象方法与验收标准。
- 不提交真实 cookie/token/storage 原文。
- 不提交可直接复用的完整可执行脚本。
- 可执行实现统一放 `artifacts/tasks/<task-id>/`。
