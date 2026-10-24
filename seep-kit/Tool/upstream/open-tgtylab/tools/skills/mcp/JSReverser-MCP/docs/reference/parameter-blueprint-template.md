# Parameter Blueprint Template

用于新增公开参数蓝图时的统一模板。

## 必填文件

- `metadata.json`
- `parts.json`
- `mutations.json`
- `workflow.md`

## `metadata.json` 必填字段

- `id`
- `title`
- `aliases`
- `keywords`
- `category`
- `status`
- `version`
- `lastUpdated`
- `summary`

## `parts.json` 建议字段

- `parameter`
- `parts[].index`
- `parts[].name`
- `parts[].role`
- `parts[].source`
- `parts[].how_to_get`
- `parts[].confidence`

## `mutations.json` 建议字段

- `parameter`
- `mutations[].id`
- `mutations[].applies_to_part`
- `mutations[].kind`
- `mutations[].base_algorithm`
- `mutations[].mutation_summary`
- `mutations[].logic`
- `mutations[].reproduce_hint`
- `mutations[].upgrade_watch`
- `mutations[].confidence`

## `workflow.md` 建议章节

1. 适用范围
2. 目标契约
3. 识别特征
4. 前置输入
5. 推荐工具顺序
6. 参数结构提示
7. 步骤清单
8. 观察点清单
9. 失败分支与转向
10. 常见分叉
11. 最小 artifacts 契约
12. 验收标准
13. 成功判定
14. 禁止事项

## 禁止内容

- 完整可运行实现
- 站点私有密钥、常量、补丁
- task-local 的敏感环境细节
