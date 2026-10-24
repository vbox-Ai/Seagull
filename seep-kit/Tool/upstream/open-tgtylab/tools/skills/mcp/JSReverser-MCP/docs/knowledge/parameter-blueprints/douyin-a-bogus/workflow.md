# Douyin a_bogus Workflow

## 目标契约

- 目标字段：`a_bogus`
- 常见位置：query
- 常见伴生字段：`msToken`、`webid`、route query 字段
- 目标结果：确认 query 写点 / send-time patch 点，并建立最小可复现链路

## 适用范围

- 目标请求中出现 `a_bogus`
- 常见于 query 参数签名、资源列表或页面数据拉取链路
- 需要区分 query 写点和 send-time patch

## 识别特征

- 请求里常伴随 `msToken`、`webid`、route query 字段
- `search_in_scripts` 能命中 `a_bogus`、`bdms`、`secsdk`、`sdk-glue`
- 写点可能发生在 `URLSearchParams.append/set` 或发送前补丁路径

## 前置输入

- 一条成功的 resource-list 请求样本
- 已确认目标 API 与 query 字段
- 页面可用 hook、network、script 工具

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

### Step 1：锁定 resource-list 请求

- 找到携带 `a_bogus` 的成功请求
- 固定 query、headers、companion fields、返回结果
- 必记：
  - `a_bogus`
  - `msToken`
  - `webid`
  - route query
  - 业务响应 `status_code`

### Step 2：回 initiator 链

- 用 `get_request_initiator` 回溯到 runtime loader 与 security bundle
- 记录 business entry -> runtime.js -> sdk-glue.js -> secsdk -> bdms 等链路

### Step 3：判断写点还是 send-time patch

- hook `URLSearchParams.append/set`
- hook `XMLHttpRequest.open/send`
- 判断是请求构造时写入，还是发送前二次补丁
- 如果 append / set 没命中，不要立刻判定没写点，要继续查 send-time helper

### Step 4：做脚本对位

- 搜索 `a_bogus`、`resource/list`、send-time helper
- 确认 query 归一化和 patch helper 所在 bundle
- 输出：
  - 命中脚本 URL
  - helper 名称 / 调用点
  - 是否存在二次变异

### Step 5：最小本地复现

- 在 `artifacts/tasks/<task-id>/run/` 搭最小 host
- 只补 `window/document/navigator/location/history/screen/storage/crypto/fetch/XMLHttpRequest`
- 只以页面已证实的依赖为准
- 本地复现优先对齐 pathQuery 和 send 前 URL，不要先对齐算法细节

### Step 6：portable runtime / pure extraction 门槛

- 先导出 portable runtime
- 只有在 env-pass 且服务端校验通过后，再进入纯算法提取

## 观察点清单

- `a_bogus` 被写入时的调用栈
- append 前 query
- send 前最终 query
- `msToken` / `webid` 来源分类
- runtime loader -> security bundle 顺序

## 失败分支与转向

- **`URLSearchParams.append/set` 没命中**  
  优先回查 `XMLHttpRequest.send` 附近的 patch helper，不要直接认定参数来自别处。

- **append 命中了，但服务端不认**  
  比较 append 后 query 与 send 前 final query，优先排查 send-time patch。

- **本地环境在 `location` / `URL` 上崩**  
  先记 brand check first divergence，再修最小宿主，不要大面积补环境。

- **有 signer 输出，但接口仍失败**  
  先比对 pathQuery 归一化、route query 和 companion fields，不要先改 signer。

## 常见分叉

- `msToken` / `webid` 来源未确认
- query 归一化顺序不同
- `location` / `URL` brand check 导致本地 host 崩溃
- send-time patch 漏抓，导致本地只复现到半链路

## 最小 artifacts 契约

- `request-summary.json`
- `network.jsonl`
- `scripts.jsonl`
- `hooks.jsonl`
- `notes.md`
- `divergence.md`
- `run/exported-runtime.js`

## 验收标准

- 已固定一条成功 resource-list 请求
- 已确认 query 写点或 send-time patch 至少一处
- 已解释 `msToken` / `webid` 依赖属于哪一类来源
- 本地最小链路能说明失败点或通过点

## 成功判定

- 已确认 `a_bogus` 写点或 send-time patch 点
- 本地 signer 能生成非空 `a_bogus`
- 生成请求可通过目标资源请求校验

## 禁止事项

- 不提交完整 signer 实现
- 不把真实请求值、私有 cookie、task-local runtime 直接放进公开 workflow
- 不在 env-pass 前直接跳 pure extraction
