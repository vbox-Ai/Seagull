# Case 安全规范

更新时间：2026-03-07

状态：**当前生效规范**，不是历史归档文档。

模型开场入口请先读：`docs/reference/reverse-bootstrap.md`

## 目标

- 约束仓库内 `scripts/cases/*` 仅保留抽象方法，不存放可直接复用的完整逆向/签名实现。
- 降低被直接滥用的法律与合规风险。
- 把“仓库公开层”和“task-local 可执行层”彻底分开。

## 仓库文档分层

- `docs/reference/`：放规则、契约、模板、索引
- `docs/guides/`：放给人类用户看的操作指南
- `scripts/cases/README.md`：放公开参数 / 链路索引
- `artifacts/tasks/<task-id>/`：放本地私有任务产物，不作为仓库公开文档入口

新增正式文档时，不要再直接放到 `docs/` 根目录。

## 强制规则

1. 仓库内 case 文件必须是“不可运行抽象模板”。
2. 仓库内 case 只允许包含：

- 输入契约（字段名、类型、格式）
- 复现流程（Observe/Capture/Rebuild/Verify）
- 验证口径（状态码、结构、差异判定）
- 风险边界（脱敏、禁提交项）

3. 仓库内 case 禁止包含：

- 完整可执行签名链路代码
- 真实 cookie/token/storage 原文
- 固定可复用的生产参数组合
- 可直接调用线上接口的一键脚本

## 本地执行约定

- 可执行代码与完整链路产物统一放在任务目录（按参数/任务拆分）：
  - `artifacts/tasks/<task-id>/`
- 推荐目录结构：
  - `task.json`（目标与边界）
  - `runtime-evidence.jsonl`（关键证据）
  - `env/`（补环境脚本）
  - `run/`（可执行脚本与运行日志）
  - `report.md`（结果与 `first divergence`）
- Git 提交规则：
  - 仅 `artifacts/tasks/_TEMPLATE/` 允许默认入库
  - 真实 `artifacts/tasks/<task-id>/` 默认视为本地私有任务目录，不应直接提交
  - 如果确实需要共享某个任务目录，必须先完成脱敏审查，再显式 `git add -f`

## 复用优先级

1. 优先读取 `artifacts/tasks/<task-id>/`（完整链路）。
2. 若不存在对应 task，再读取 `scripts/cases/*` 抽象 case。
3. 若仍无参考，按方法论模板新建任务并沉淀到 `artifacts/tasks/`。
4. 如果要公开展示“有哪些参数 / 链路已沉淀”，统一更新 `scripts/cases/README.md`，不要把真实 task 目录当公开索引。

## 与模型入口的关系

- 模型新会话起手应先读 `docs/reference/reverse-bootstrap.md`
- `reverse-bootstrap` 会强制模型继续读取本规范与阶段协议
- `reverse-task-index`、`reverse-update-prompt-template`、参数模板都应把本规范作为开场前置，而不是可选参考

## 评审清单

- 该 case 是否在仓库内可直接运行？
- 是否出现真实敏感值？
- 是否提供了可直接复用的完整算法实现？
- 是否仅保留抽象流程与验收标准？
- 是否把真实 `task-id` 目录误提交进 Git？

任何一项不满足，视为不合规，需要回退为抽象模板后再合入。
