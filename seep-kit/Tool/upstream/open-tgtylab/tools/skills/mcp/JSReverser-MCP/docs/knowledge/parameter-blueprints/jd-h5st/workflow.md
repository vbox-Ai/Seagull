# JD H5ST Workflow

## 目标契约

- 目标字段：`h5st`
- 常见位置：header 或 query
- 常见伴生输入：时间戳、body 摘要、UA、cookie、`sec-ch-ua`
- 目标结果：说明 `h5st` 的输入边界、拼接顺序、中间值和 first divergence
- 结构化提示：优先结合同目录下的 `parts.json` 与 `mutations.json` 阅读

## 适用范围

- 请求头或参数中出现 `h5st`
- 目标链路依赖时间、环境、请求体摘要、UA、cookie 等多种输入
- 需要优先用页面证据回收参数组成，而不是直接本地猜测

## 识别特征

- `search_in_scripts` 能命中 `h5st`
- 请求发起前存在参数拼接、摘要、编码与环境读取
- 升级后常表现为结果整体不同，但结构仍接近旧链路

## 前置输入

- 至少一份真实请求样本
- 已确认目标接口和参数位置
- 页面可正常调用 hook、network、script 相关工具

## 推荐工具顺序

1. `network_request(action="list")`
2. `network_request(action="get")`
3. `get_request_initiator`
4. `list_scripts`
5. `search_in_scripts`
6. `hook_function` / `create_hook` / `inject_hook`
7. `record_reverse_evidence`
8. `export_rebuild_bundle`

## 参数结构提示

- 先看 `parts.json`，确认 `h5st` 大致由哪些段组成
- 再看 `mutations.json`，确认哪些段不是标准摘要/编码流程
- 如果某一段无法确认来源，先在 workflow 里标记 `inferred`，不要伪装成 confirmed

## 步骤清单

### Step 1：固定请求样本

- 调 `network_request(action="list")` 找到带 `h5st` 的成功请求
- 再用 `network_request(action="get")` 固定一条样本
- 必记：
  - URL / method
  - header / query / body
  - cookie / UA / 时间字段
  - 返回结果特征

### Step 2：回 initiator 链

- 调 `get_request_initiator`
- 找到业务入口、请求封装层、安全 bundle
- 记录调用链里出现的函数名、脚本 URL、包装层顺序

### Step 3：定位脚本入口

- 调 `list_scripts`
- 调 `search_in_scripts` 搜索：
  - `h5st`
  - `sign`
  - `digest`
  - `hmac`
  - `md5`
- 输出：
  - 候选脚本 URL
  - 候选函数名
  - 可能的请求 patch 点

### Step 4：抓中间值

- 优先 hook：
  - 请求发送前参数组装函数
  - `JSON.stringify`
  - 编码 / 摘要函数入口
- 必记：
  - 原始输入对象
  - 摘要前文本
  - 中间摘要值
  - 最终 `h5st`
  - 哪一段对应 `parts.json` 中的哪一项

### Step 5：确认依赖来源

- 明确哪些依赖来自 cookie、storage、navigator、location、request body
- 未确认来源前不进入纯本地猜测
- 这一步要写进 `notes.md`：
  - 哪些字段已确认来源
  - 哪些字段未确认
  - 下一轮优先补哪一类证据
  - 哪些段涉及 `mutations.json` 中的变体

### Step 6：最小本地复现

- 用最小输入重建链路
- 只保留页面证据已确认的依赖
- 本地只允许先补最小宿主，不要直接复制整段实现
- 先比较浏览器侧输入与本地输入，不一致先停在 first divergence

### Step 7：升级排查

- 先复用旧流程
- 再抓新样本
- 对比旧新链路的最早分叉点

## 观察点清单

- `h5st` 写入前的原始输入
- body 摘要文本
- header / query 参与签名的字段集合
- 时间戳精度
- cookie / UA / `sec-ch-ua` 是否被拼入
- 是否存在标准摘要后的二次 encode / remap

## 失败分支与转向

- **搜不到 `h5st` 关键字**  
  回 initiator 链，优先找请求封装层和摘要函数，而不是继续全局盲搜。

- **hook 到了摘要函数，但结果对不上**  
  先比摘要前文本和输入字段顺序，再比 `mutations.json` 里记录的变体，不要先猜算法常量。

- **本地复现直接崩**  
  先记 first divergence，再补最小宿主；不要一次补完整浏览器。

- **升级后整体都变了**  
  先对比时间精度、字段集合、排序和 `mutations.json` 里标的变体，再看算法主体。

## 常见分叉

- 时间精度变化
- body 摘要拼接顺序变化
- header 参与签名的字段集合变化
- cookie / UA / sec-ch-ua 被新增或改位置
- 原有同步链路变成异步摘要链路

## 最小 artifacts 契约

- `request-summary.json`
- `network.jsonl`
- `scripts.jsonl`
- `hooks.jsonl`
- `notes.md`
- `rebuild/input-output.json`
- `divergence.md`

## 验收标准

- 已固定至少一条可复查请求样本
- 已记录至少一组“输入 -> 中间值 -> 输出”
- 已明确 first divergence 所在阶段
- 如果未完全复现，也必须说明卡在什么依赖来源

## 成功判定

- 能说明 h5st 的输入边界和中间链路
- 能稳定复算或明确 first divergence
- 能解释升级后差异属于哪一阶段

## 禁止事项

- 不在公开 workflow 中存放 h5st 完整可运行实现
- 不把站点私有 patch、密钥或常量映射写进公共知识库
- 不跳过 request/hook 证据直接硬猜算法
