# Algorithm Upgrade And First Divergence Template

这份模板用于“算法升级、混淆升级、版本切换”场景，目标是快速找到 `first divergence`，而不是重新从零逆。

## 开场必读

开始前先读：

1. `docs/reference/reverse-bootstrap.md`
2. `docs/reference/case-safety-policy.md`
3. `docs/reference/reverse-workflow.md`
4. 若当前问题已处于 `env-pass` 后的提纯阶段，再读 `docs/reference/pure-extraction.md`

升级模板也必须遵守仓库边界：

- 仓库 case 只保留抽象结论与方法
- 可执行升级实现、临时验证脚本、真实任务证据统一放 `artifacts/tasks/<task-id>/`

## 适用范围

- 签名算法换版本
- 本地纯算法结果和浏览器结果开始不一致
- `env rebuild` 还能跑，但最终参数失配
- VMP / AST / helper 名称发生迁移

## 输入建议

- 旧版本结论或旧版本产物
- 新版本 JS 文件或新页面证据
- `targetKeywords`
- `targetUrlPatterns`
- `targetFunctionNames`
- `targetActionDescription`
- 旧版与新版的关键样本输入
- portable runtime 的关键样本输出
- pure algorithm 的关键样本输出
- 固定夹具（若已有）

## 推荐顺序

1. 先做结构归一化
2. 再做目标驱动采样
3. 再看 `first divergence`
4. 先判断当前应该继续补 `env rebuild`、修 `portable runtime`，还是转 pure algorithm
5. 最后才改实现

## `first divergence` 检查表

优先看哪一层先分叉：

1. 目标请求
2. hook 命中的关键函数输出
3. token / nonce / sign 中间值
4. crypto helper
5. env collect / storage / fingerprint
6. 最终拼接

如果参数名很怪，不要卡在字段名本身，优先看：

- 哪个请求先变化
- 哪个函数先输出不同值
- 哪个页面动作触发了这段链路
- 哪个时间窗内出现关键证据

## 产物要求

- 一份更新后的 task artifact
- 一份差异摘要
- 一份本地 `env rebuild` 现状
- 一份纯算法候选实现或明确说明为何暂时不能纯化
- 一份夹具对齐结果
- 一份服务端验收结果

## 输出模板

1. 本次升级的 `first divergence`
2. 已确认未变化的部分
3. 已确认发生变化的部分
4. 当前是继续补 `env rebuild`、修 `portable runtime`，还是转 pure algorithm / 去混淆更合适
5. 当前夹具是否稳定，跨语言是否已可对齐
6. 当前服务端验收是否通过
7. 下一步最小行动
