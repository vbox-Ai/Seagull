# 故障排查指南

这份文档集中回答 MCP 客户端接入、浏览器连接和 AI 配置里最常见的问题。

建议排查顺序：

1. 在项目目录执行 `npm ci && npm run build`
2. 执行 `node /ABSOLUTE/PATH/JSReverser-MCP/build/src/index.js --doctor`
3. 在 MCP 客户端里确认 command 是 `node`，args 第一项是绝对路径 `build/src/index.js`
4. 客户端连上后先调用 `diagnose_environment`
5. 接管浏览器前先用 `http://127.0.0.1:9222/json/version` 确认 remote debugging 已开启
6. 页面取证前再调用 `check_browser_health` 和 `list_pages`

## 客户端显示 `tools: none`

这不是正常状态，会影响后续调用。

`--toolProfile kernel` / `--toolProfile compact` 只会减少工具数量，不会让工具变成 none。默认 kernel 应暴露 35 个自动化优先工具；`--toolProfile compact` 会暴露 63 个高频工具；`--toolProfile full` 会暴露全部 110 个工具。

常见原因：

- 项目还没构建，`build/src/index.js` 不存在或还是旧版本
- MCP 配置里的路径不是绝对路径
- 客户端仍在用旧配置或旧进程，改完配置后没有重启
- JSON / TOML 配置写错，导致 MCP server 根本没有启动
- 配置里使用了不推荐的包执行方式，而不是本地 `node /ABSOLUTE/PATH/.../build/src/index.js`

推荐修复：

```bash
npm ci
npm run build
node /ABSOLUTE/PATH/JSReverser-MCP/build/src/index.js --doctor
```

MCP 客户端最小配置：

```json
{
  "mcpServers": {
    "jsreverser-mcp": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/JSReverser-MCP/build/src/index.js"]
    }
  }
}
```

如果 kernel 能看到工具但缺少更宽的工作流工具，先加：

```json
"--toolProfile",
"compact"
```

如果还需要低频调试工具，再加：

```json
"--toolProfile",
"full"
```

## 启动后访问地址不通

JSReverser-MCP 是 MCP stdio server，不是 HTTP Web 服务。启动 MCP 后没有一个需要用浏览器访问的项目主页。

如果你要接管已打开的 Chrome，需要访问的是 Chrome remote debugging 地址：

```bash
http://127.0.0.1:9222/json/version
```

这个地址能返回 `webSocketDebuggerUrl`，才说明浏览器远程调试端口已经打开。

启动 Chrome 示例：

```bash
google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-mcp
```

然后 MCP 配置里使用：

```json
"--browserUrl",
"http://127.0.0.1:9222"
```

注意：

- 目标业务网站地址不是 `--browserUrl`
- `--browserUrl` 只填 remote debugging HTTP 地址
- `--browserUrl` 和 `--wsEndpoint` 二选一
- 如果 `json/version` 都打不开，MCP 一定接管不了这个浏览器

## AI 配置和 `useAI`

外部 AI 是分析增强层，不是所有工具的硬依赖。

`useAI` 是工具参数，不是环境变量。需要在调用工具时显式传入，例如 `detect_crypto` 的 `useAI=true`。

`understand_code` 的行为：

- 总会先做本地静态分析
- 会尝试调用默认 AI provider 做语义分析
- 没有可用 provider 时，内部会捕获 AI 错误并回退为静态分析结果
- 返回里会带 `aiRuntime`，用于说明当前 provider 是否可用、是否处于 CLI fallback 或未配置状态

`detect_crypto` 的行为：

- 不传 `useAI` 或传 `false` 时，主要使用本地规则和 AST 分析
- 传 `useAI=true` 时，会附加 AI runtime 状态，AI 不可用时仍应先看本地检测结果

推荐先调用：

```text
diagnose_environment
```

再看返回里的 AI selection / provider 状态。

MCP 配置里的外部 AI 环境变量示例：

```json
"env": {
  "DEFAULT_LLM_PROVIDER": "gemini",
  "GEMINI_API_KEY": "your_key",
  "GEMINI_MODEL": "gemini-2.0-flash-exp"
}
```

## Codex 不愿意继续分析

把任务限定在你拥有或已获授权的目标上，并使用调试、兼容性验证、参数定位、本地复现这类明确的工程目标。

推荐表达：

- 我已获授权分析这个页面，请用 JSReverser-MCP 观察请求、脚本和运行时调用链
- 帮我定位我自己系统里的签名参数生成位置，并导出 local rebuild 便于兼容性测试
- 按 `reverse-bootstrap.md` 的流程走，先采证据，再 hook，再补环境，不要跳过证据直接猜

不要要求模型绕过访问控制、窃取凭证、攻击第三方系统或规避安全限制。遇到模型拒绝时，优先补充授权范围、目标页面归属、允许做的操作和预期交付物。

建议入口：

- [docs/reference/reverse-bootstrap.md](../reference/reverse-bootstrap.md)
- [docs/reference/case-safety-policy.md](../reference/case-safety-policy.md)
- [docs/reference/reverse-workflow.md](../reference/reverse-workflow.md)
