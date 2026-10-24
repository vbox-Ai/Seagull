# 参数蓝图贡献指南

这份指南说明如何为仓库新增或更新公开的参数蓝图库。

## 目录位置

公开知识库源文件统一放在：

- `docs/knowledge/parameter-blueprints/`

构建后会复制到：

- `build/docs/knowledge/parameter-blueprints/`

## 基本规则

- blueprint 是主体资产，`workflow.md` 只是其中的执行步骤文件
- 公开 workflow / blueprint 只写抽象流程，不写完整可运行实现
- 真实任务证据仍放在 `artifacts/tasks/<task-id>/`
- 不要提交完整可运行实现、私有 patch、密钥或真实生产参数组合

## 先导出模板

```bash
node build/src/index.js --export-parameter-workflow-template ./tmp/my-workflow
```

导出后会得到：

- `metadata.json`
- `workflow.md`

## 填写内容

### `metadata.json`

至少补齐：

- `id`
- `title`
- `aliases`
- `keywords`
- `category`
- `status`
- `version`
- `lastUpdated`
- `summary`

### `workflow.md`

至少包含：

- `## 适用范围`
- `## 识别特征`
- `## 前置输入`
- `## 分阶段流程`
- `## 常见分叉`
- `## 最小 artifacts 契约`
- `## 成功判定`
- `## 禁止事项`

## 本地校验

```bash
node build/src/index.js --validate-parameter-workflow ./tmp/my-workflow
```

如果校验通过，再提交到：

- `docs/knowledge/parameter-blueprints/<workflow-id>/`

并同步更新：

- `docs/knowledge/parameter-blueprints/index.json`

## 查看现有 blueprint

```bash
node build/src/index.js --list-parameter-workflows
node build/src/index.js --show-parameter-workflow jd-h5st
```

## 提交 PR 前确认

- 已补齐 `metadata.json`
- 已补齐 `workflow.md`
- 已通过 `--validate-parameter-workflow`
- 没有泄露完整实现
- 没有写入真实敏感数据
