# Generic Query Token Workflow

## 目标契约

- 目标字段：query 中的 `token` / `sign` / `_signature`
- 常见伴生输入：URL path、route query、body/hash、时间戳、设备环境
- 目标结果：确认 query token 的构造顺序、写入点和验收边界

## 适用范围

- query string 中出现 `token`、`sign`、`_signature`、`a_bogus` 等字段
- 参数通常与 URL、body 摘要、时间戳、设备环境共同生成

## 识别特征

- 同一请求重复发起时 query 参数会变化
- 请求发起点附近常见 URL 拼接、编码、排序和摘要逻辑

## 前置输入

- 已定位目标请求
- 至少一份真实请求样本
- 当前页面可被 MCP 观察与 hook

## 推荐工具顺序

1. `network_request(action="list")`
2. `network_request(action="get")`
3. `get_request_initiator`
4. `list_scripts`
5. `search_in_scripts`
6. `hook_function` / `create_hook` / `inject_hook`
7. `record_reverse_evidence`
8. `export_rebuild_bundle`

## 步骤清单

### Step 1：固定 query 样本

- 固定一组样本
- 记录 query 各字段及其变化规律

### Step 2：定位构造链

- 搜参数名
- 搜 URL builder、router、request wrapper
- 关联请求 initiator

### Step 3：抓 query 写入前后值

- 捕获 query 对象构造前后值
- 记录编码前字符串、排序结果、最终 URL

### Step 4：最小本地复现

- 只重建必要拼接链路
- 明确哪些值来自页面环境，哪些值来自请求输入

### Step 5：做 divergence 检查

- 先对比参数输入集合
- 再对比排序、编码、摘要、时间和环境读取

## 观察点清单

- query 原始字段集合
- 排序前 / 排序后字符串
- 编码前文本
- 最终 URL
- 时间戳和随机值来源

## 失败分支与转向

- **搜到很多 sign/token 命中**  
  先回 initiator 链确认是哪个 request builder，不要继续盲搜。

- **本地生成 token 但接口不认**  
  先比最终 URL 和 query 归一化，再看算法主体。

- **随机值来源不清**  
  先记录“未确认来源”，不要手工脑补。

## 常见分叉

- query 排序策略变化
- URL 编码时机不同
- 时间戳或随机数来源不同
- request body/hash 被隐式并入 query sign

## 最小 artifacts 契约

- `request-summary.json`
- `network.jsonl`
- `hooks.jsonl`
- `notes.md`
- `rebuild/input-output.json`

## 验收标准

- 已固定至少一条 query 参数样本
- 已记录 query 构造前后值
- 已说明参数失败是输入不一致、排序编码问题还是环境问题

## 成功判定

- 能稳定复算目标 query 参数
- 能指出最早不一致位置
- 能解释字段来源与拼接顺序

## 禁止事项

- 不直接沉淀完整站点实现
- 不跳过 hook 直接手抄压缩逻辑
