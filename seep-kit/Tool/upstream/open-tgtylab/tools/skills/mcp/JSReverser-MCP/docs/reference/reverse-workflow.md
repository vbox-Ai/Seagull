# Reverse Workflow

这份文档是 **模型执行协议**，不是人类教程。

目标：把前端逆向任务统一约束成稳定阶段，避免跳步骤、凭记忆推进或在补环境未收敛时过早提纯算法。

## 适用范围

适用于以下任务：

- 请求签名、加密参数、风控参数定位
- 页面运行时采样
- 本地 Node 补环境复现
- 补环境通过后的纯算法提纯
- 提纯后的 Python / 其他宿主迁移

## 核心原则

- `Observe-first`
- `Hook-preferred`
- `Breakpoint-last`
- `Rebuild-oriented`
- `Evidence-first`
- `Browser-truth-first`
- `Pure-extraction-after-pass`

## 阶段总览

1. `Observe`
2. `Capture`
3. `Rebuild`
4. `Patch`
5. `PureExtraction`
6. `Port`

任何任务都应明确自己当前处于哪个阶段；没有阶段结论，就不应直接切到下一阶段。

## 开场落地要求

开始正式逆向前，模型必须先明确四件事：

1. 已读取的入口文档
2. 当前阶段
3. 本轮 task artifact 路径：`artifacts/tasks/<taskId>/`
4. 本轮成功判定

若上述四项仍不明确，不应直接进入大规模抓取、补环境或纯算法提纯。

---

## 1. Observe

### 目标

- 确认目标请求、关键脚本、候选函数、触发动作
- 建立任务边界，避免盲猜环境或直接补宿主

### 必做动作

- 确认目标请求 URL / 参数 / 响应特征
- 定位 initiator、候选脚本 URL、候选函数名或关键字符串
- 记录页面动作、触发条件与目标 `targetContext`
- 把关键观察写入 task artifact

### 禁止事项

- 还没确认目标请求就开始补环境
- 还没定位关键脚本就开始手翻混淆代码

### 完成判据

- 已能回答：目标请求是谁发起的、哪段脚本参与、页面上如何触发

### 阶段落地契约

完成 `Observe` 的最小工作后，必须至少落地以下内容，再进入 `Capture`：

- `task.json`
  - 记录 `taskId`、`slug`、`targetUrl`、`goal`
  - 建议补充 `currentStage="Observe"`、当前结论摘要、成功判定
- `network.jsonl`
  - 至少一条目标请求或候选请求记录
- `scripts.jsonl`
  - 至少一条关键脚本、initiator 或候选脚本记录
- `report.md`
  - 初始化任务摘要、当前阶段、已确认部分、未确认部分、下一步
- 可选 `timeline.jsonl`
  - 记录“做了什么、看到什么、下一步为什么这样做”

没有这些最小落地，不应宣称 Observe 已完成。

---

## 2. Capture

### 目标

- 用最小侵入方式拿到运行时样本、参数、调用顺序和中间值

### 必做动作

- 优先使用 `hook` 或 preload hook
- 采样 fetch/xhr、候选函数、关键对象字段
- 尽量获取调用前后输入输出，而不是只抓最终结果
- 持续把样本写入 task artifact

### 禁止事项

- hook 不足时立刻切断点
- 一次性抓全部对象快照，导致噪音过大

### 完成判据

- 已有至少一条可复用的真实运行样本
- 已知道参数链路的最小调用序列

### 阶段落地契约

每次拿到有效样本或关键中间值后，必须立即追加：

- `runtime-evidence.jsonl`
  - hook 命中、输入输出、中间值、对象字段、cookie/storage 线索
- `network.jsonl`
  - 若采样确认了新的关键请求、headers、body、响应特征，需同步补充
- `scripts.jsonl`
  - 若确认了新的关键脚本、函数名、代码定位信息，需同步补充
- 可选 `replay/actions.json`
  - 当触发步骤较复杂、容易遗忘时，记录页面动作序列
- 建议 `timeline.jsonl`
  - 记录本轮为什么使用 hook / preload / 某个采样点

`Capture` 的新增证据不能只停留在对话里。

---

## 3. Rebuild

### 目标

- 把页面证据导出为本地可运行的 Node 复现工程

### 必做动作

- 导出 local rebuild bundle
- 固定入口、目标脚本、初始状态和必要 seed
- 在 `env/entry.js` 或等价入口上运行目标链路
- 记录当前运行失败点或首个可运行结果

### 禁止事项

- 没有页面证据就手写 `window/document/navigator`
- 直接用 Python `execjs` 开始补环境

### 完成判据

- 本地已有稳定复现入口
- 能看到当前运行错误或当前阶段输出

### 阶段落地契约

一旦进入 `Rebuild`，必须形成最小本地入口：

- `env/entry.js`
  - 当前本地复现入口
- `env/env.js`
  - 当前环境补丁主体
- `env/polyfills.js`
  - 当前 polyfill / host shim
- `env/capture.json`
  - 复现所需的固定上下文、seed、样本、关键输入
- `report.md`
  - 写清当前运行结果：报错、输出或阻塞点
- 建议 `timeline.jsonl`
  - 记录 rebuild 从哪份页面证据导出、当前失败点是什么

如果本地尚无稳定入口文件，不应宣称已进入稳定的 `Rebuild` 阶段。

---

## 4. Patch

### 目标

- 按代理日志和 `first divergence` 驱动补环境，直到本地链路可运行且服务端验收通过

### 真值对齐要求

- 不能只以“接口过了”作为补环境完成判据
- 优先对齐浏览器真实样本：最终参数、关键中间值、固定 fixture，至少命中其一
- 若浏览器结果与本地结果仍不一致，即使接口暂时通过，也只能记为 `partial`，不能直接宣称完全对齐
- 每轮 patch 后，除接口复测外，还应补一次“浏览器真值 vs 本地结果”的差异检查

### 必做动作

- 优先读取代理 env log
- 先记录 `first divergence`
- 只补当前 `first divergence` 对应的最小因果单元
- 每轮补丁后立即复测
- 记录 `first divergence` 是否前移
- 至少拿到一次服务端验收通过

### 禁止事项

- 没有代理日志就补宿主
- 没有 `first divergence` 记录就连补多个对象
- 把补环境成功误当成纯算法已完成

### 完成判据

- 本地 env rebuild 已稳定跑通目标链路
- 已有一次服务端验收通过
- 已与浏览器真实样本完成至少一种有效对齐：最终参数、关键中间值或固定 fixture
- 已记录至少一条 `first divergence` 及其修复路径

### 下一阶段输入

- 稳定样本
- 已通过验收的 local rebuild
- 关键中间值与调用边界证据

### 阶段落地契约

`Patch` 阶段要求“每轮补丁都留痕”：

- `timeline.jsonl`
  - 追加本轮补丁目标、观察到的 `first divergence`、是否前移
- `runtime-evidence.jsonl`
  - 追加与当前补丁直接相关的运行时证据
- `report.md`
  - 更新当前 `first divergence`、已修复项、未修复项、验收状态、浏览器对齐状态
- 必要时更新 `env/env.js`、`env/polyfills.js`、`env/capture.json`
  - 保证 task artifact 中始终保留“当前可运行版本”

如果只在聊天里描述 patch 结果，而没有同步 task artifact，不应视为一个完整 patch 回合。

---

## 5. PureExtraction

`PureExtraction` 不是补环境延长线，而是一个独立阶段。

详细协议见：`docs/reference/pure-extraction.md`

### 进入条件

- `Patch` 已完成
- 已有稳定样本、固定夹具候选、服务端验收记录

### 目标

- 把“环境噪音”与“算法输入”分开
- 先提纯 Node 可读纯算实现
- 形成稳定 fixture

### 禁止事项

- env rebuild 还没通过就开始翻 Python
- 还没区分输入边界就直接照抄页面对象

### 完成判据

- Node pure implementation 与 runtime fixture 对齐
- 已明确哪些值属于算法输入、哪些属于环境状态
- 若存在浏览器真实样本，pure 结果应优先对齐浏览器真值，而不只是“接口可用”

### 阶段落地契约

进入 `PureExtraction` 后，必须新增或更新：

- `run/pure-*.js`
  - Node 可读纯算实现
- 可选 `run/pure_*.py`
  - 外部语言实现
- `run/fixtures.json`
  - 固定输入、固定 runtimeContext、固定输出
- `report.md`
  - 记录 pure runtime 验收结果、输入边界、漂移边界

若没有稳定 fixture，不应宣称 pure 已完成。

---

## 6. Port

### 目标

- 把已提纯的 Node 纯算实现迁移到 Python 或其他宿主

### 必做动作

- 使用与 Node pure 相同夹具
- 逐段对齐输入、关键中间值与最终输出
- 保留外部语言调用边界说明

### 禁止事项

- 直接以页面 runtime 为真值源跳过 Node pure
- 没有 fixture 就直接改写为 Python

### 完成判据

- 外部语言版本与 Node pure 对齐
- 至少一条服务端验收通过

### 阶段落地契约

进入 `Port` 后，必须补充：

- `run/pure_*.py` 或其他宿主实现
- `report.md`
  - 对齐结果、未对齐项、宿主边界、服务端验收记录
- 必要时补充 `run/fixtures.json`
  - 保证跨宿主复测使用同一组夹具

如果只是“代码看起来翻译完了”，但没有夹具对齐与验收记录，不应视为 `Port` 完成。

---

## 阶段切换规则

- 只有 `env rebuild` 跑通且服务端验收通过后，才允许进入 `PureExtraction`
- 只有 Node pure 已稳定后，才建议进入 `Port`
- 任一阶段出现不一致，应优先回退到最早出现分叉的阶段，而不是继续往后补
- 每个阶段达到完成判据后，必须先完成该阶段的 task artifact 落地，再切换到下一阶段

## 必备产物

最少应沉淀：

- 目标请求与脚本证据
- task artifact 中的 `targetContext`
- local rebuild 入口
- 代理 env log
- `first divergence` 记录
- runtime 样本
- pure fixture
- pure implementation
- 服务端验收记录

## 配套文档

- `docs/reference/env-patching.md`
- `docs/reference/pure-extraction.md`
- `docs/reference/reverse-artifacts.md`
- `docs/reference/reverse-update-prompt-template.md`
- `docs/reference/reverse-report-template.md`
- `docs/reference/algorithm-upgrade-template.md`
