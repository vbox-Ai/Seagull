# Reverse Bootstrap

更新时间：2026-03-07

这份文档是 **模型首读入口**。

用途不是解释所有细节，而是保证模型在新会话一开始就走对仓库工作流，不跳步、不越界、不把 task-local 实现误写进仓库 case。

## 何时必须先读

只要出现以下任一情况，就先读本文件：

- 新开一个逆向任务
- 继续一个已有逆向任务
- 用户说“补环境”“提纯”“导出 Python”“升级算法”“修签名”
- 需要写 `scripts/cases/*`
- 需要在 `artifacts/tasks/<task-id>/` 下继续补链路

## 开场必读顺序

读完本文件后，继续按顺序读取：

1. `docs/reference/case-safety-policy.md`
2. `docs/reference/reverse-workflow.md`
3. 若任务已通过 `env-pass`，或目标明确是“补环境后提纯算法”，继续读 `docs/reference/pure-extraction.md`

如果是“按模板开新 case”，再继续读：

4. `docs/reference/parameter-methodology-template.md`
5. `docs/reference/parameter-site-mapping-template.md`

完成上述规则必读后，如果是“继续已有任务”，优先读取：

1. `artifacts/tasks/<task-id>/`
2. `scripts/cases/*` 抽象 case

## 第一条正式工作回复必须包含

- 已读取哪些必读文档
- 当前阶段：`Observe` / `Capture` / `Rebuild` / `Patch` / `PureExtraction` / `Port`
- 本次产出落点：`scripts/cases/*` 还是 `artifacts/tasks/<task-id>/`
- 本轮成功判定：要拿到什么证据、什么验收结果

缺任意一项，都说明还没有正确进入仓库工作流。

## 仓库硬边界

- `scripts/cases/*` 只允许抽象模板、输入契约、验证口径、风险边界
- `artifacts/tasks/<task-id>/` 才允许放可执行实现、完整链路、真实任务证据
- 不得把真实 cookie/token/storage 原文放进仓库公开层
- 不得把某站点可直接复用的完整签名实现写进仓库 case

## 阶段切换红线

- 没做页面观察，不进入补环境
- 没有代理 env log 和 `first divergence`，不做盲补
- `env rebuild` 未跑通且服务端未验收通过，不进入 `PureExtraction`
- Node pure 未稳定，不直接写 Python pure

## 最短执行口令

开始逆向前先读 `docs/reference/reverse-bootstrap.md`，再按其中要求继续读 `docs/reference/case-safety-policy.md`、`docs/reference/reverse-workflow.md`，若已进入 `env-pass` 后的提纯阶段再读 `docs/reference/pure-extraction.md`。第一条正式工作回复必须说明已读文档、当前阶段、产物落点和本轮成功判定。
