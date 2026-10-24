# reverse agent schema versioning

这份文档说明 `reverse-agent-response.schema.json` 及其子 schema 的版本化约定。

## 当前版本

- `schemaVersion: "1.0"`
- `x-schemaVersion: "1.0"`

说明：

- `schemaVersion`：响应体里的运行时字段，给 client / agent 直接读取
- `x-schemaVersion`：schema 文件自身的版本标记，给文档和工具链读取

## 兼容策略

### 1. patch 级修改

例如：

- 补 `examples`
- 补文档说明
- 在不破坏旧字段的前提下增加可选字段

处理方式：

- 继续保留 `schemaVersion: "1.0"`
- 不要求 client 立刻升级

### 2. minor 级修改

例如：

- 新增推荐字段
- 新增新的 `detailLevel`
- 新增新的可选 continuation 扩展块

处理方式：

- 如果旧 client 仍可安全工作，可先保持 `1.0`
- 如果 client 需要按新字段做显式判断，再升到 `1.1`

### 3. major 级修改

例如：

- 删除现有字段
- 改变 `outcome` 语义
- 改变 `continuation` / `routeGuard` 结构
- 改变 failure taxonomy

处理方式：

- 升主版本，例如 `2.0`
- 同步更新：
  - 总 schema
  - 子 schema
  - 速查页
  - client 示例

## client 建议

外部 client 至少做这两件事：

1. 读取 `schemaVersion`
2. 对未知版本做保护分支

例如：

```ts
if (response.schemaVersion !== '1.0') {
  throw new Error(
    `Unsupported reverse-agent schema version: ${response.schemaVersion}`,
  );
}
```

如果想更宽松，也可以只校验主版本：

```ts
const major = String(response.schemaVersion ?? '').split('.')[0];
if (major !== '1') {
  throw new Error(
    `Unsupported reverse-agent schema major version: ${response.schemaVersion}`,
  );
}
```

## 当前推荐

- 短期内把 `1.0` 视为稳定基线
- 新增字段优先走向后兼容
- 真正破坏兼容时再升主版本
