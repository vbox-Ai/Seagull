# 参数站点映射模板（站点补充层）

更新时间：2026-03-05

## 开场强制约束

开始填写站点映射前，先读：

1. `docs/reference/reverse-bootstrap.md`
2. `docs/reference/case-safety-policy.md`
3. `docs/reference/reverse-workflow.md`
4. 若当前任务已通过 `env-pass`，或目标是“补环境后做纯算法提纯”，继续读 `docs/reference/pure-extraction.md`

边界保持一致：

- 这里只补站点映射与判定口径，不写完整可执行实现
- 仓库 case 只保留抽象映射，task-local 目录才放可运行代码

## 目标

- 在“站点无关方法论模板”基础上，补充某站点特有映射。
- 只记录映射关系与判定标准，不记录可执行细节。

## 1. 站点信息

- 站点：`<site_name>`
- 参数名：`<param_name>`
- 常见入口：`<entry_function_or_class>`
- 相关脚本：`<script_url_pattern>`
- 入口页面 / host：`<entry_url_b64 | api_host_b64>`

## 2. 请求映射

- 目标接口模式：
  - `method`: `<GET/POST/...>`
  - `urlPattern`: `<domain/path pattern>`
  - `functionId/operation`: `<optional>`
- 参数所在位置：
  - `query` / `body` / `header`

## 3. 字段映射

- 参数相关字段：
  - 必填：`<field_a>`, `<field_b>`, ...
  - 可选：`<field_x>`, `<field_y>`, ...
- 依赖种子类型：
  - cookie 键：`<k1,k2,...>`
  - storage 键：`<k1,k2,...>`
  - 指纹能力：`<canvas/webgl/...>`

## 4. 站点特有风险点

- 初始化时机（首屏/异步脚本/懒加载）：
  - `<note>`
- 高变更点（版本字段、动态算法、下发 token）：
  - `<note>`
- 常见误判：
  - `<note>`

## 5. 验证口径（站点版）

- 结构口径：
  - `<segment_count / charset / length>`
- 行为口径：
  - `<status + business code>`
- 差异容忍：
  - `<which part can differ but still pass>`

## 6. 回归清单

- 脚本版本变化后是否仍满足输出契约？
- `requiredInputs` 是否新增/删除？
- 代理 env log 的首个异常路径是否变化？
- first divergence 是否变化或前移？

## 7. 关联文档

- 方法论模板：`docs/reference/parameter-methodology-template.md`
- 安全规范：`docs/reference/case-safety-policy.md`
- 工具读写契约：`docs/reference/tool-io-contract.md`
