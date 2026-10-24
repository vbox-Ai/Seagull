# Kuaishou \_\_NS_hxfalcon Workflow

## 目标契约

- 目标字段：`__NS_hxfalcon`
- 常见位置：query 或 payload 内部字段
- 关键约束：不能只看 HTTP 200，必须看业务返回
- 目标结果：明确 VM bridge 调用形状，并以 strict-check 为最终验收

## 适用范围

- 目标请求中出现 `__NS_hxfalcon`
- 风控链路依赖 VM bridge、`$encode`、cat-version 或 route metadata
- 成功判定不能只看 HTTP 200，必须看业务返回

## 识别特征

- 同时能抓到 weak-check 与 strict-check 请求
- initiator 链上常出现 VM 对象、`Ee.call("$encode", ...)`、callback bridge
- 严格校验接口比弱校验接口更能暴露链路缺失

## 前置输入

- 一组 weak-check 请求样本
- 一组 strict-check 请求样本
- 已确认页面中可观察到 VM bridge、请求 patch 时机

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

### Step 1：固定 weak/strict 双样本

- 同时记录 weak-check 与 strict-check 请求
- 带上 response body preview，后续做 A/B 校验
- 必记：
  - URL / route
  - payload
  - `__NS_hxfalcon`
  - `result`
  - `hasData`

### Step 2：找 VM bridge

- 回溯到 VM bridge 调用点
- 确认 encoder wrapper、cat-version 读取路径、callback 形式
- 如果存在多个 VM 对象，优先跟到 strict-check 那条调用链

### Step 3：抓 encode 路径

- 观察 payload before encode
- 记录 VM bridge 参数、callback wiring、最终 sign 写入点
- 输出：
  - encode 输入
  - VM bridge 参数
  - callback / async 形态
  - 写回请求的时机

### Step 4：做 weak/strict 对照

- 搜索 `$encode`、`__NS_hxfalcon`、cat-version
- 对比 weak-check 与 strict-check 是否走同一编码路径
- 如果不一样，优先以 strict-check 为主线，weak-check 只做辅助

### Step 5：最小本地复现

- 只补最小 host：`window/document/navigator/storage/performance`
- 重点修复 VM host 方法、storage/performance 读取和 callback 差异
- 先让 bridge 调用跑通，再谈 pure runtime

### Step 6：严格验收

- 必须用 strict-check 作为主验收
- weak-check 只能作为早期路径验证，不可单独视为通过

### Step 7：pure extraction 门槛

- strict-check 已通过后，才进入 portable runtime / pure runtime

## 观察点清单

- weak / strict 两条请求的 payload 差异
- VM bridge 调用参数
- `cat-version` 读取点
- callback 是否异步返回
- sign 写入请求的准确时机

## 失败分支与转向

- **weak-check 通过但 strict-check 失败**  
  直接以 strict-check 为主线，优先查 route 差异和 cat-version，不要继续拿 weak-check 当成功。

- **找到 `$encode`，但输出仍被拒**  
  先对比 VM bridge 参数和 payload 形状，不要先改算法主体。

- **本地 bridge 跑不通**  
  先记 storage / performance / callback 的 first divergence，再补最小宿主。

- **pure runtime 和页面不一致**  
  回到 `$encode` 边界，先对齐固定 fixture，不要直接改 Python/其他端口。

## 常见分叉

- weak-check 通过但 strict-check 失败
- cat-version 改变 payload 形状或 signer 分支
- VM bridge 是 callback/async，但本地按 sync 处理
- storage/performance 依赖未补全

## 最小 artifacts 契约

- `request-summary.json`
- `network.jsonl`
- `scripts.jsonl`
- `hooks.jsonl`
- `notes.md`
- `divergence.md`
- `report.md`

## 验收标准

- 已固定 weak-check 与 strict-check 双样本
- 已确认 VM bridge 调用形状
- 已说明 strict-check 通过或失败的最早原因
- 如果未过 strict-check，也必须说明卡在哪一步

## 成功判定

- 已确认 VM bridge 调用形状
- 本地 signer 可生成候选 `__NS_hxfalcon`
- strict-check 返回 `result=1` 且 `hasData=true`

## 禁止事项

- 不以 weak-check 单独通过作为最终结论
- 不提交完整 VM/encoder 实现
- 不在 strict-check 通过前直接讨论纯算法迁移
