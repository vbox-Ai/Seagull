# Reverse Report Template

这份模板用于沉淀单次逆向任务的结果。重点不是写长文，而是让别人能复现、续做、回看。

## 开场必读

开始写报告前，先确认当前任务遵守：

- `docs/reference/reverse-bootstrap.md`
- `docs/reference/case-safety-policy.md`
- `docs/reference/reverse-workflow.md`
- 若已进入提纯阶段，再参考 `docs/reference/pure-extraction.md`

## 1. 任务概况

- 任务名称：
- 目标页面：
- 目标接口与字段：
- 目标动作：
- 当前阶段：`Observe` / `Capture` / `Rebuild` / `Patch` / `PureExtraction` / `Port`
- task artifact：

## 2. 已确认结论

- 哪个请求参与参数生成
- 哪个脚本 / 函数最关键
- 哪些 cookie / storage / header 参与链路
- 哪些字段是必传，哪些是派生值

## 3. 运行时证据

- hook 记录摘要
- request -> initiator -> script / function 关联
- 输入输出样例
- 命中的时间窗 / 页面动作
- 代理 env log 摘要
- 当前 `first divergence` 记录

## 4. 本地复现状态

- `env rebuild` 当前入口
- 已补环境对象
- 尚未补齐的对象
- 本地执行报错
- 当前补丁决策对应的最小因果单元
- 最近一次 `diff_env_requirements` 结果（仅辅助）
- 当前浏览器真值对齐状态：`unknown` / `partial` / `pass`

## 5. `first divergence` / 差异分析

- 与旧版本或旧结论相比，最早分叉点在哪里
- 分叉发生在请求、函数输出、crypto、env collect、还是最终拼接
- 触发该分叉点的代理日志证据
- 当前为什么判定为这个最小因果单元
- 已确认差异
- 仍未确认差异

## 6. 风险与不确定性

- 置信度
- 是否依赖登录态
- 是否依赖远程下发
- 是否存在随机路径 / 时间敏感路径

## 7. 补丁与回滚步骤

- 本次补了哪些环境
- 每个补丁分别对应哪条代理日志和哪条页面证据
- 哪些补丁是临时性的
- 如果回滚，先撤哪几处

## 8. 验证

- 验证命令
- 关键输出
- 本轮补丁后 `first divergence` 是否前移
- 浏览器真实样本是否已对齐
- 对齐的是最终参数、关键中间值，还是固定 fixture
- 服务端是否通过
- 若“服务端通过”但“浏览器未对齐”，必须明确标记为 `partial`，不能直接写完全完成
- 还有哪些测试没覆盖

## 9. 下一步

- 下一步建议
- 如果下次版本再变，优先看哪里
