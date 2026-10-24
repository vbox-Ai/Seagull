# 浏览器连接指南

这份指南解决两个问题：

- 怎么让 MCP 直接接管你已经打开的 Chrome
- 怎么判断它到底有没有真正连上浏览器

## 为什么要直连浏览器

如果你已经手动登录、过了验证码或完成了复杂交互，直接接管当前 Chrome 比重新打开一个干净实例更实用。

常见收益：

- 复用登录态
- 复用 Cookie / Storage
- 保留手动操作后的页面状态

## 第一步：启动带 remote debugging 的 Chrome

### Windows

```bash
"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\\tmp\\chrome-mcp"
```

### macOS

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-mcp
```

### Linux

```bash
google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-mcp
```

## 第二步：确认 remote debugging 已开启

浏览器访问：

```bash
http://127.0.0.1:9222/json/version
```

如果能看到 `webSocketDebuggerUrl`，说明 remote debugging 已经正常开启。

## 第三步：选择连接方式

### 方式 A：`--browserUrl`

最适合新手。

```bash
--browserUrl http://127.0.0.1:9222
```

特点：

- 配置简单
- 不需要自己解析 websocket 地址

### 方式 B：`--wsEndpoint`

更精确，适合你已经知道自己在接哪个浏览器实例。

先拿 websocket 地址：

```bash
curl http://127.0.0.1:9222/json/version
```

然后读取 `webSocketDebuggerUrl`。

### 方式 C：`--autoConnect`

如果你本机经常就是 `9222` 这种常见端口，可以直接让服务自动探测。

```bash
--autoConnect
```

## 第四步：如何确认 MCP 已真正接管浏览器

推荐验证顺序：

1. 手动打开一个目标页面
2. 启动 MCP
3. 调用 `list_pages`
4. 看返回里是否出现你刚刚打开的页面
5. 再调用 `network_request(action="list")` 或 `list_scripts`

如果能看到你当前页面的请求和脚本，说明接管成功。

## 常见误区

- 能启动 MCP，不代表已经接管浏览器
- 配了 `browserUrl`，但 Chrome 没开 remote debugging，连接不会成功
- `--browserUrl` 和 `--wsEndpoint` 不要同时配置
- 已经接管远程 Chrome 时，不要再强制 MCP 自己起一个新浏览器
- JSReverser-MCP 是 stdio MCP server，不是 HTTP Web 服务；没有项目主页需要访问
- 目标业务网站地址不要填进 `--browserUrl`，这里只能填 Chrome remote debugging 地址

更多排查见 [docs/guides/troubleshooting.md](troubleshooting.md)。
