# Generic Header Signature Workflow

## 目标契约

- 目标字段：header 中的 `sign` / `x-sign` / `signature`
- 常见伴生输入：时间戳、nonce、body 摘要、cookie、UA
- 目标结果：确认 header 签名的输入边界、写入点和 first divergence

## 适用范围

- 请求头中存在 `sign`、`x-sign`、`signature`、自定义校验头
- 参数通常在请求发送前动态生成
- 可能依赖时间戳、nonce、body 摘要、cookie、UA、环境字段

## 识别特征

- 目标字段出现在 request headers
- `search_in_scripts` 搜索 `sign` / `digest` / `hmac` / `sha` / `md5` 有命中
- 请求发起点附近存在对象拼接、摘要计算、编码转换

## 前置输入

- 一条真实请求样本
- 参数所在位置已确认是 header
- 页面已被 MCP 接管
- 能调用 `list_scripts`、`search_in_scripts`、hook / network 相关工具

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

### Step 1：固定 header 签名请求

- 锁定带签名头的请求
- 记录 URL、method、headers、query、body、cookie、时间相关字段

### Step 2：找 initiator 与脚本入口

- 先 `list_scripts`
- 再 `search_in_scripts` 搜索字段名、摘要关键词、请求封装函数名
- 必要时结合 `get_request_initiator`

### Step 3：抓 header 写入前后值

- 优先 hook 请求发送前的拼接点
- 优先观察 `JSON.stringify`、编码函数、摘要入口、request wrapper
- 记录输入对象、排序、拼接顺序、中间摘要值

### Step 4：确认依赖来源

- 确认时间戳、nonce、cookie、UA、storage、navigator 等来源
- 只接受页面证据，不猜环境

### Step 5：最小本地复现

- 基于页面证据构建最小输入
- 仅搬运必要依赖，不直接复制整段业务代码

### Step 6：定位 first divergence

- 比较页面链路与本地链路
- 找到最早不一致的输入、排序、编码、摘要或环境读取点

## 观察点清单

- header 写入前原始输入
- 摘要前文本
- header 字段顺序
- 时间戳 / nonce 来源
- cookie / UA 是否参与签名

## 失败分支与转向

- **关键字搜索噪音太大**  
  先回 initiator 链缩小脚本范围，再继续搜摘要入口。

- **本地结果不一致**  
  先比输入集合、排序和编码，再比摘要函数。

- **环境读取报错**  
  先记 first divergence，不要一次补全浏览器环境。

## 常见分叉

- 时间戳位数不一致
- header 排序参与签名
- body 序列化顺序变化
- cookie / UA 混入但未记录来源
- 页面用了异步摘要或 wasm/custom crypto

## 最小 artifacts 契约

- `request-summary.json`
- `network.jsonl`
- `scripts.jsonl`
- `hooks.jsonl`
- `notes.md`
- `divergence.md`

## 验收标准

- 已固定一条 header 签名请求
- 已记录至少一组中间值
- 已指出最早不一致点或说明通过原因

## 成功判定

- 能说明参数生成的输入边界
- 能指出最早 first divergence
- 本地复现结果与页面结果一致，或已明确差异原因

## 禁止事项

- 不猜 cookie、storage、UA、时间来源
- 不在公开 workflow 中放完整可执行实现
- 不把 task-local 私有 patch 回填进公共模板
