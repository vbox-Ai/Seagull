# 补环境落地规范

这份文档约束本仓库里的本地 Node 补环境流程，目标不是“一次性模拟浏览器”，而是基于 MCP 页面证据，让目标参数链路先跑通，再逐项补缺口。

## 目标原则

- 先取证，再补环境
- 最小宿主，逐项回填
- 代理诊断优先，盲补禁止
- 每次补丁都要能追溯到代理日志、first divergence 与页面证据

## 两阶段目标（现扩展为三阶段落地）

本仓库默认把“本地补环境”和“外部语言调用”拆成两个阶段：

### 阶段 1：Node 补环境复现

目标：

- 在 Node 里跑通目标链路
- 找出最小依赖集合
- 确认 first divergence
- 逐步删掉无关宿主和无关补丁

这一阶段的主产物是：

- `env/env.js`
- `env/polyfills.js`
- `env/entry.js`

### 阶段 2：可移植 JS 导出

目标：

- 把已经跑通的链路提纯成可调用的完整 JS
- 减少对 Node 特有能力和调试脚手架的依赖
- 为 Python `execjs`、`quickjs` 或其他宿主提供稳定函数入口

这一阶段的目标产物通常是：

- `run/exported-runtime.js`
- 或其他单文件 / 少量文件的 bundle

关键原则：

- 不要一开始就用 `Python + execjs` 做补环境
- 应该先在 Node 里补环境跑通，再导出可移植 JS
- `execjs` 更适合“调用提纯后的函数”，不适合“调试补环境过程”

### 阶段 3：纯算法提纯

阶段协议与进入条件见：`docs/reference/pure-extraction.md`

目标：

- 在 portable runtime 已可用后，继续提纯为可读纯算法
- 明确输入契约、随机/时间因子、固定常量和版本边界
- 为 Node / Python / 其他宿主提供可对齐的固定夹具

这一阶段的目标产物通常是：

- `run/pure-*.js`
- 可选 `run/pure_*.py`
- task-local 固定夹具与验收记录

关键原则：

- 只有在 `env rebuild` 跑通且服务端验收通过后，才进入纯算法提纯
- pure runtime 必须支持固定 runtimeContext 或同等控制项，以便跨语言对齐
- 可以保留少量版本绑定常量，但必须在 task artifact 里标出边界
- 纯算法实现仍属于 task-local 产物，不进入 `scripts/cases/*` 或仓库公开实现层

## 固定阶段

### 1. MCP 页面取证

先从浏览器侧拿证据，不要直接在 Node 里猜。

优先记录到 `capture.json` 的内容：

- `page.url`
- `page.title`
- `cookies`
- `localStorage`
- `sessionStorage`
- 目标请求样本
- Hook 命中的函数名、参数摘要、返回值摘要
- 目标脚本源码或脚本定位信息

这些数据应来自 MCP 页面观察，不允许人工脑补敏感值或宿主状态。

### 2. 本地最小环境启动

`env.js` 只负责提供基础宿主对象和最小 shim，让目标脚本可以开始执行。

允许放在 `env.js` 的内容：

- `window/self/global`
- `document/location/navigator`
- `history/screen/canvas`
- `localStorage/sessionStorage`
- `atob/btoa`
- 最小 `crypto` 外壳

不允许在这里堆站点定制逻辑、访问日志或大段猜测式补丁。

### 3. 代理诊断层

`polyfills.js` 专门负责代理诊断层。

推荐能力：

- `watch`
- `safeFunction`
- `makeFunction`
- 对 `window/document/navigator/storage/location` 的代理包装
- 统一的 `[env:get]` / `[env:set]` / `[env:has]` / `[env:ownKeys]` / `[env:call]` 诊断日志

代理诊断层的职责是告诉你：

- 哪个对象路径被访问了
- 缺的是值、函数，还是返回对象
- first divergence 首次出现在什么位置

代理诊断层不是用来直接伪造完整浏览器的。

### 4. 按缺口逐项回填

回填时只允许补当前 `first divergence` 对应的最小因果单元，而不是机械地一项项打地鼠。

一个补丁决策允许覆盖以下四类最小因果单元：

- 缺基础值：直接补常量，如 `navigator.userAgent`
- 缺函数壳：用 `makeFunction("createElement")`
- 缺返回对象：补最小返回结构，如 `document.createElement()` 的返回对象
- 缺最小对象契约：只补该对象当前链路不可分割的最小接口集，如 `localStorage.getItem/setItem/removeItem`

这里的“一次补一项”指的是“一次只做一个补丁决策”，而不是“永远只改一个属性名”。
如果代理日志和 `first divergence` 已经证明当前缺口是同一个最小对象契约，可以一起补完该契约；
如果只是看到多个零散访问，但还没有确认同属一个因果单元，就仍然只补当前最先阻塞执行的那一项。

每次补丁都应该满足：

- 能指出来源于哪条代理日志、哪条 `first divergence` 记录，以及哪条页面证据
- 能说明为什么只补这一项或这一个最小对象契约
- 补完后立刻复测
- 如果没有代理日志或没有 `first divergence` 记录，则不允许补丁

## 补丁判定表

| 观测现象                                                                                   | 常见缺口类型     | 推荐补法                                      | 不该做什么                                     |
| ------------------------------------------------------------------------------------------ | ---------------- | --------------------------------------------- | ---------------------------------------------- |
| `navigator.userAgent`、`location.href` 这类读取返回 `undefined`                            | 基础值缺失       | 直接补最小常量值                              | 不要顺手补整套 `navigator` / `location` 伪实现 |
| `document.createElement is not a function`                                                 | 函数壳缺失       | 先用 `makeFunction("createElement")` 挂函数壳 | 不要直接补完整 DOM 实现                        |
| `Cannot read properties of undefined (reading 'style')` 且前一步刚调用了 `createElement()` | 返回对象结构缺失 | 给该函数补最小返回对象                        | 不要把无关字段一并补全                         |
| `localStorage.getItem is not a function`                                                   | 宿主对象方法缺失 | 补 storage shim 的最小方法集                  | 不要引入站点私有缓存值                         |
| 同一对象连续出现多个接口缺失，且都指向同一 first divergence                                | 最小对象契约缺失 | 一次补该对象的最小接口集                      | 不要顺手扩成完整浏览器对象                     |
| `Illegal invocation` / brand check 失败                                                    | 宿主建模方式错误 | 先修对象形态或 this 绑定，再决定是否补值      | 不要把 brand-sensitive 对象直接套 Proxy 乱包   |
| `crypto.subtle` / `TextEncoder` 缺失                                                       | 平台 API 缺失    | 补最小平台 API 外壳或 polyfill                | 不要臆造算法结果                               |

## 负面示例

以下做法都属于盲补，不应出现：

- 页面里还没确认依赖来源，就一次性补完整 `window/document/navigator/crypto`
- 看到某个请求需要 Cookie，就手写真实 Cookie 原值进 `env.js`
- `createElement` 缺失时，直接复制一整套第三方 DOM 模拟库
- 只因为别的站点用过某个字段，就把相同字段硬塞到当前任务里
- 没有 first divergence 记录，只凭“脚本大概会读这个”去补宿主

## 文件职责边界

### `env/env.js`

职责：

- 提供基础宿主
- 提供最小 storage shim
- 提供最小编码/加密壳

禁止：

- 访问日志
- 大量站点定制分支
- 直接内联目标业务脚本

### `env/polyfills.js`

职责：

- 放代理诊断层
- 放可复用的函数伪装能力
- 放“缺函数壳”和“访问日志”的辅助逻辑

禁止：

- 大量业务值硬编码
- 直接替代 `env.js` 作为基础宿主

### `env/entry.js`

职责：

- 先加载 `env.js`
- 再加载 `polyfills.js`
- 读 `capture.json` 对应数据
- 加载目标脚本
- 输出 first divergence 和当前可调用状态

## 推荐判断顺序

1. 先跑一次 `env/entry.js`
2. 先看本地报错
3. 再读代理诊断日志，定位首个异常访问
4. 记录并确认当前 `first divergence`
5. 回到页面证据确认真实来源
6. 只补当前 `first divergence` 对应的最小因果单元
7. 必要时再用 `diff_env_requirements` 做辅助比对，而不是替代代理日志
8. 立即重跑 `env/entry.js`

## 禁止事项

- 不要猜环境
- 不要一次性全量模拟浏览器
- 不要没有页面证据就补 cookie / storage / header / UA
- 不要没有代理日志和 `first divergence` 记录就补宿主
- 不要把 `diff_env_requirements` 当成第一依据，跳过代理日志直接补
- 不要把补环境逻辑直接塞进 MCP 核心运行时

## 产物要求

每个任务目录至少应保持以下文件可复用：

- `env/env.js`
- `env/polyfills.js`
- `env/entry.js`
- `env/capture.json`

这四个文件共同构成最小 local rebuild 骨架。

如果后续要给 Python `execjs` 或其他宿主使用，建议额外导出：

- `run/exported-runtime.js`

如果后续要继续提纯为可读纯算法，建议再补：

- `run/pure-*.js`
- 可选 `run/pure_*.py`
- 固定夹具与服务端验收记录

这些文件的目标不是继续调试补环境，而是暴露稳定函数入口并保留可对齐的纯算结果，例如：

- `genSign(...)`
- `getToken(...)`
- `buildHeaders(...)`
- `genABogus(pathQuery, runtimeContext)`
