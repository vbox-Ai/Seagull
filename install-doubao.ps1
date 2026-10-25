# 豆包（Doubao）破甲注入
#
# 和别的目标不一样：豆包的全局记忆不在本地磁盘，存在字节云端、绑定账号。
# 本地只有开关状态（IndexedDB 里的 switchMemoryV2_），没有记忆正文。
# 所以这里不写文件，而是用 CDP 驱动豆包客户端自身的登录会话去调云端接口：
#   /alice/generaltask/memory/get_agentsmd   读全局记忆
#   /alice/generaltask/memory/set_agentsmd   整份覆盖写全局记忆
#
# 前提：豆包必须以 --remote-debugging-port=<Port> 运行。没开的话本脚本会自动
# 重启豆包到调试模式（会话在云端，重启不丢聊天记录）。
#
# 用法：
#   .\install-doubao.ps1                          # 装 V4（Claude 版）提示词
#   .\install-doubao.ps1 -SourcePrompt .\x.md     # 指定提示词
#   .\install-doubao.ps1 -Status                  # 看当前全局记忆
#   .\install-doubao.ps1 -Uninstall               # 还原注入前的记忆
#   .\install-doubao.ps1 -RestoreMemory           # 只装回原始记忆（界面按钮走这条）

param(
    [string]$SourcePrompt,
    [string]$Version = 'v4',
    [switch]$Uninstall,
    # 只把云端全局记忆还原成注入前的原文，其余一概不动。
    # 界面上的「装回原始记忆」按钮走这条路径；豆包没有技能库，效果与 -Uninstall 相同。
    [switch]$RestoreMemory,
    [switch]$Status,
    [switch]$NoLaunch,
    # 绕过全局记忆字符上限：新建对话，把完整提示词作为首条消息直接发进去
    [switch]$InjectChat,
    # 抓记忆页的网络请求，逆出「记忆条目」接口（写多条分片用）
    [switch]$ProbeMemory,
    # 二分探测 set_agentsmd 的字符上限（探测后自动还原原记忆）
    [switch]$ProbeCap,
    # 自定义探测档位（字符数），不给就用默认档
    [int[]]$ProbeSizes,
    [int]$ProbeSeconds = 25,
    [int]$Port = 9222
)

$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$Root = if ($ScriptRoot) { $ScriptRoot } else { $PSScriptRoot }
if (-not $Root) { $Root = Split-Path -Parent $MyInvocation.MyCommand.Path }

# 统一 UTF-8 输出：避免按系统代码页（GBK/437…）写 stdout 导致界面日志乱码
try {
    $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
} catch { }
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
function Read-Utf8([string]$Path) { return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8) }
function Write-Utf8([string]$Path, [string]$Text) {
    $dir = Split-Path -Parent $Path
    if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $tmp = "$Path.tmp"
    [System.IO.File]::WriteAllText($tmp, $Text, $Utf8NoBom)
    Move-Item -LiteralPath $tmp -Destination $Path -Force
}
function Write-Log([string]$Text) {
    $dir = Join-Path $env:USERPROFILE '.doubao'
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $f = Join-Path $dir 'seagull-doubao.log'
    try { Add-Content -LiteralPath $f -Value ("[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Text) -Encoding UTF8 } catch { }
}

# ---------- 提示词来源 ----------
$promptMap = @{ 'v4' = '海鸥V8·破甲版v4-claude.md'; 'v3' = '海鸥V8·破甲版v3.md'; 'v5' = '海鸥V8·破甲版v5.md' }
# 本构建不再随包分发提示词：卸载/还原/查状态模式都跳过提示词解析与读取
# （-Status 只读云端记忆，不需要提示词；以前要求它必须存在，状态查询直接报「提示词文件不存在」）。
if (-not ($Uninstall -or $RestoreMemory -or $Status -or $ProbeMemory -or $ProbeCap)) {
    if (-not $SourcePrompt) { $SourcePrompt = Join-Path $Root $promptMap[$Version] }
    if (-not (Test-Path -LiteralPath $SourcePrompt)) { throw "提示词文件不存在: $SourcePrompt" }
    $srcText = Read-Utf8 $SourcePrompt
    $srcHash = (Get-FileHash -LiteralPath $SourcePrompt -Algorithm SHA256).Hash
}

$stateDir = Join-Path $env:USERPROFILE '.doubao\managed-prompts'
$stateFile = Join-Path $stateDir 'state.json'
$backupFile = Join-Path $stateDir 'agentsmd-backup.md'

# ---------- 找豆包 ----------
function Resolve-DoubaoExe {
    $cands = @()
    foreach ($rp in @('HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
                      'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
                      'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*')) {
        $item = Get-ItemProperty $rp -ErrorAction SilentlyContinue |
            Where-Object { $_.DisplayName -like '*豆包*' -and $_.InstallLocation } | Select-Object -First 1
        if ($item) { $cands += ((($item.InstallLocation -replace '^"|"$', '').TrimEnd('\')) + '\Doubao.exe') }
    }
    $proc = Get-Process Doubao -ErrorAction SilentlyContinue | Where-Object { $_.Path } | Select-Object -First 1
    if ($proc) { $cands += $proc.Path }
    $cands += 'E:\Doubao\Doubao.exe'
    $cands += (Join-Path $env:LOCALAPPDATA 'Doubao\Doubao.exe')
    $cands += (Join-Path ${env:ProgramFiles} 'Doubao\Doubao.exe')
    foreach ($c in $cands) {
        if ($c -and (Test-Path -LiteralPath $c)) { return (Resolve-Path -LiteralPath $c).Path }
    }
    return ''
}

function Get-DoubaoProcs { return @(Get-Process Doubao -ErrorAction SilentlyContinue) }

function Test-DebugPort {
    try {
        $r = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/version" -TimeoutSec 3 -ErrorAction Stop
        return [bool]$r.webSocketDebuggerUrl
    } catch { return $false }
}

function Start-DoubaoDebug([string]$Exe) {
    # app\Doubao.exe 是真正的 Chromium 主体；根目录那个是启动器，调试参数要交给 app 下的。
    # $Exe 本身已指向 app 下时别再拼，避免出现 app\app\Doubao.exe。
    $appExe = $Exe
    if ($Exe -notlike '*\app\Doubao.exe') {
        $candidate = Join-Path (Split-Path -Parent $Exe) 'app\Doubao.exe'
        if (Test-Path -LiteralPath $candidate) { $appExe = $candidate }
    }
    # Chromium 136+：使用默认 user-data-dir 时 --remote-debugging-port 会被静默忽略。
    # 必须给一个专用、持久化的调试 Profile，端口才会真正打开。登录态存在该 Profile，
    # 第一次扫码登录一次后，后续注入复用同一个登录，不用每次重扫。
    $profile = Join-Path $env:USERPROFILE '.doubao\cdp-profile'
    if (-not (Test-Path -LiteralPath $profile)) { New-Item -ItemType Directory -Path $profile -Force | Out-Null }
    $argList = @(
        "--remote-debugging-port=$Port",
        ('--user-data-dir="{0}"' -f $profile),
        "--no-first-run",
        "--no-default-browser-check"
    )
    Start-Process -FilePath $appExe -ArgumentList $argList | Out-Null
    for ($i = 0; $i -lt 40; $i++) {
        Start-Sleep -Milliseconds 500
        if (Test-DebugPort) { return $true }
    }
    return $false
}

# ---------- CDP ----------
function Get-CdpTargets {
    return @(Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/list" -TimeoutSec 10)
}

function Select-DoubaoTarget {
    $list = Get-CdpTargets
    # 优先级：www.doubao.com 的 iframe（旧版结构）→ 对话页 doubao-chat/chat（当前版本）
    #        → 启动器页 → 任意 www.doubao.com
    # 绝不能选 doubao://doubao-background —— 那是后台页，调接口只会返回 HTML
    foreach ($pat in @('doubao-chat/chat', 'doubao-launcher/chat')) {
        $t = $list | Where-Object { $_.url -like "*$pat*" } | Select-Object -First 1
        if ($t) { return $t }
    }
    $t = $list | Where-Object { $_.type -eq 'iframe' -and $_.url -like '*www.doubao.com*' } | Select-Object -First 1
    if ($t) { return $t }
    return ($list | Where-Object { $_.url -like '*www.doubao.com*' } | Select-Object -First 1)
}

function Wait-DoubaoTarget([int]$TimeoutSec = 60) {
    # 豆包刚启动时对话页还没建出来，轮询等它出现
    for ($i = 0; $i -lt $TimeoutSec; $i++) {
        $t = Select-DoubaoTarget
        if ($t) { return $t }
        Start-Sleep -Seconds 1
    }
    return $null
}

function Invoke-CdpEval([string]$WsUrl, [string]$Expression, [int]$TimeoutSec = 120) {
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $ct = [System.Threading.CancellationToken]::None
    $ms = $TimeoutSec * 1000
    if (-not $ws.ConnectAsync([Uri]$WsUrl, $ct).Wait($ms)) { throw 'CDP 连接超时' }
    try {
        $payload = @{
            id     = 1
            method = 'Runtime.evaluate'
            params = @{
                expression    = $Expression
                awaitPromise  = $true
                returnByValue = $true
                userGesture   = $true
                timeout       = $ms
            }
        } | ConvertTo-Json -Depth 10 -Compress
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
        $seg = New-Object 'System.ArraySegment[byte]' -ArgumentList @(, $bytes)
        if (-not $ws.SendAsync($seg, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $ct).Wait($ms)) { throw 'CDP 发送超时' }

        $buf = New-Object byte[] 262144
        $sb = New-Object System.Text.StringBuilder
        do {
            $seg2 = New-Object 'System.ArraySegment[byte]' -ArgumentList @(, $buf)
            $r = $ws.ReceiveAsync($seg2, $ct).Result
            [void]$sb.Append([System.Text.Encoding]::UTF8.GetString($buf, 0, $r.Count))
        } while (-not $r.EndOfMessage)

        $msg = $sb.ToString() | ConvertFrom-Json
        if ($msg.error) { throw ("CDP 错误: " + ($msg.error | ConvertTo-Json -Compress)) }
        if ($msg.result.exceptionDetails) {
            throw ("页面异常: " + $msg.result.exceptionDetails.text + " / " + $msg.result.exceptionDetails.exception.description)
        }
        return $msg.result.result.value
    } finally { $ws.Dispose() }
}

# 通用 CDP 命令：发一条 {id=1,method,params}，读到 id=1 的响应为止。
# Runtime.evaluate 之外的域（Page / Input / Network）都用它。
function Invoke-CdpCommand([string]$WsUrl, [string]$Method, $Params, [int]$TimeoutSec = 60) {
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $ct = [System.Threading.CancellationToken]::None
    $ms = $TimeoutSec * 1000
    if (-not $ws.ConnectAsync([Uri]$WsUrl, $ct).Wait($ms)) { throw 'CDP 连接超时' }
    try {
        $payload = @{ id = 1; method = $Method; params = $Params } | ConvertTo-Json -Depth 12 -Compress
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
        $seg = New-Object 'System.ArraySegment[byte]' -ArgumentList @(, $bytes)
        if (-not $ws.SendAsync($seg, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $ct).Wait($ms)) { throw 'CDP 发送超时' }
        $buf = New-Object byte[] 262144
        $sb = New-Object System.Text.StringBuilder
        for ($n = 0; $n -lt 200; $n++) {
            $sb.Clear() | Out-Null
            do {
                $seg2 = New-Object 'System.ArraySegment[byte]' -ArgumentList @(, $buf)
                $r = $ws.ReceiveAsync($seg2, $ct).Result
                [void]$sb.Append([System.Text.Encoding]::UTF8.GetString($buf, 0, $r.Count))
            } while (-not $r.EndOfMessage)
            $msg = $sb.ToString() | ConvertFrom-Json
            if ($msg.id -eq 1) {
                if ($msg.error) { throw ("CDP 错误: " + ($msg.error | ConvertTo-Json -Compress)) }
                return $msg.result
            }
        }
        throw "CDP 未收到 $Method 的响应"
    } finally { $ws.Dispose() }
}

# 监听 N 秒网络请求，只打印 URL 命中 $UrlFilter 的（含 postData）。
# 用法：脚本进入监听后，你在豆包里点开「设置 → 记忆」，请求就会被抓下来。
function Invoke-CdpListen([string]$WsUrl, [int]$Seconds, [string]$UrlFilter) {
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $ct = [System.Threading.CancellationToken]::None
    if (-not $ws.ConnectAsync([Uri]$WsUrl, $ct).Wait(10000)) { throw 'CDP 连接超时' }
    $seen = @{}
    try {
        $payload = @{ id = 1; method = 'Network.enable'; params = @{} } | ConvertTo-Json -Depth 6 -Compress
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
        $seg = New-Object 'System.ArraySegment[byte]' -ArgumentList @(, $bytes)
        [void]$ws.SendAsync($seg, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $ct).Wait(10000)

        $deadline = (Get-Date).AddSeconds($Seconds)
        $buf = New-Object byte[] 524288
        while ((Get-Date) -lt $deadline) {
            $cts = New-Object System.Threading.CancellationTokenSource
            $cts.CancelAfter(1000)
            $sb = New-Object System.Text.StringBuilder
            try {
                do {
                    $seg2 = New-Object 'System.ArraySegment[byte]' -ArgumentList @(, $buf)
                    $r = $ws.ReceiveAsync($seg2, $cts.Token).Result
                    [void]$sb.Append([System.Text.Encoding]::UTF8.GetString($buf, 0, $r.Count))
                } while (-not $r.EndOfMessage)
            } catch { continue }
            $raw = $sb.ToString()
            if (-not $raw) { continue }
            try { $msg = $raw | ConvertFrom-Json } catch { continue }
            if ($msg.method -ne 'Network.requestWillBeSent') { continue }
            $req = $msg.params.request
            if (-not $req -or -not $req.url) { continue }
            if ($req.url -notmatch $UrlFilter) { continue }
            $key = $req.method + ' ' + $req.url
            if ($seen.ContainsKey($key)) { continue }
            $seen[$key] = $true
            Write-Host ("`n  [{0}] {1}" -f $req.method, $req.url) -ForegroundColor Cyan
            if ($req.postData) {
                $pd = $req.postData
                if ($pd.Length -gt 600) { $pd = $pd.Substring(0, 600) + '...(截断)' }
                Write-Host ("      body: " + $pd) -ForegroundColor DarkGray
            }
        }
    } finally { $ws.Dispose() }
}

# 把一段文本塞进豆包输入框（优先 execCommand 触发前端框架，失败回落 Input.insertText）。
function Set-DoubaoInput([string]$WsUrl, [string]$Text) {
    $focus = Invoke-CdpEval $WsUrl "(()=>{const el=document.querySelector('[contenteditable=""true""]')||document.querySelector('textarea');if(!el)return 'no-input';el.focus();return 'ok';})()" 30
    if ($focus -ne 'ok') { throw "找不到豆包输入框（$focus）" }

    $b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($Text))
    $js = @"
(async()=>{
  const text = new TextDecoder().decode(Uint8Array.from(atob("$b64"), c=>c.charCodeAt(0)));
  const el = document.querySelector('[contenteditable="true"]') || document.querySelector('textarea');
  if (!el) return 'no-input';
  el.focus();
  if (el.tagName === 'TEXTAREA') {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;
    setter.call(el, text);
    el.dispatchEvent(new Event('input',{bubbles:true}));
  } else {
    document.execCommand('insertText', false, text);
  }
  const got = (el.innerText || el.value || '').length;
  return 'typed:' + got;
})()
"@
    $r = Invoke-CdpEval $WsUrl $js 180
    if ($r -notlike 'typed:*') { throw "写入输入框失败: $r" }
    $got = [int]($r -replace 'typed:', '')
    if ($got -lt 10) {
        # 框架不认 execCommand 时，用 CDP 原生插入
        [void](Invoke-CdpCommand $WsUrl 'Input.insertText' @{ text = $Text } 180)
        $got = [int]((Invoke-CdpEval $WsUrl "(()=>{const el=document.querySelector('[contenteditable=""true""]')||document.querySelector('textarea');return (el&&((el.innerText||el.value||'').length))||0;})()" 30))
    }
    return $got
}

function Send-DoubaoEnter([string]$WsUrl) {
    $p = @{ key = 'Enter'; code = 'Enter'; windowsVirtualKeyCode = 13; nativeVirtualKeyCode = 13; text = "`r" }
    [void](Invoke-CdpCommand $WsUrl 'Input.dispatchKeyEvent' (@{ type = 'keyDown' } + $p) 30)
    [void](Invoke-CdpCommand $WsUrl 'Input.dispatchKeyEvent' (@{ type = 'keyUp' } + $p) 30)
}

$JS_GET = @'
(async()=>{
  try {
    const r = await fetch("https://www.doubao.com/alice/generaltask/memory/get_agentsmd", {method:"POST",
      headers:{"content-type":"application/json"}, body:"{}", credentials:"include"});
    const txt = await r.text();
    let j = null; try { j = JSON.parse(txt); } catch(e) {}
    const c = (j && j.data && j.data.content) || "";
    return JSON.stringify({ok: r.status === 200 && !!j, status: r.status, len: c.length,
                           content: c, raw: j ? "" : txt.slice(0, 200)});
  } catch(e) { return JSON.stringify({ok:false, status:-1, len:0, content:"", raw:"ERR "+e.message}); }
})()
'@

function Read-AgentsMd([string]$WsUrl) {
    $raw = Invoke-CdpEval $WsUrl $JS_GET
    return ($raw | ConvertFrom-Json)
}

function Write-AgentsMd([string]$WsUrl, [string]$Content) {
    $b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($Content))
    $js = @"
(async()=>{
  try {
    const content = new TextDecoder().decode(Uint8Array.from(atob("$b64"), c=>c.charCodeAt(0)));
    const r = await fetch("https://www.doubao.com/alice/generaltask/memory/set_agentsmd", {method:"POST",
      headers:{"content-type":"application/json"}, body: JSON.stringify({content}), credentials:"include"});
    const t = await r.text();
    return JSON.stringify({status: r.status, body: t.slice(0, 300)});
  } catch(e) { return JSON.stringify({status:-1, body:"ERR "+e.message}); }
})()
"@
    return (Invoke-CdpEval $WsUrl $js | ConvertFrom-Json)
}

# ---------- 主流程 ----------
Write-Host "== 豆包破甲 ==" -ForegroundColor Cyan
$exe = Resolve-DoubaoExe
    Write-Host "  豆包程序 : $(if ($exe) { $exe } else { '未找到（请确认已安装豆包客户端）' })"
Write-Host "  提示词   : $SourcePrompt"
Write-Host "  调试端口 : $Port"

if (-not (Test-DebugPort)) {
    if ($NoLaunch -or $Status) {
        # -Status 是只读查询：没开调试端口就直说，不替用户重启客户端；
        # -NoLaunch 是调用方明确要求别启动客户端。
        Write-Host "  [×] 豆包没有以调试模式运行（端口 $Port 不通）。请先打开豆包客户端，再点安装。" -ForegroundColor Red
        Write-Log "Abort: debug port $Port closed (NoLaunch=$NoLaunch Status=$Status)"
        exit 1
    }
    $running = Get-DoubaoProcs
    if ($running.Count -gt 0) {
        Write-Host "  [i] 豆包正在运行但没有开调试端口，重启到调试模式（聊天记录在云端，不会丢）" -ForegroundColor Yellow
        $running | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }
    if (-not $exe) {
        Write-Host "  [×] 没找到豆包客户端，无法自动打开调试模式。" -ForegroundColor Red
        Write-Host "      请先安装并登录豆包，保持它开着，再点一次安装。" -ForegroundColor Yellow
        Write-Log "Abort: Doubao.exe not found"
        exit 1
    }
    Write-Host "  [i] 启动豆包（调试模式，专用调试 Profile）..." -ForegroundColor Yellow
    if (-not (Start-DoubaoDebug $exe)) {
        Write-Host "  [×] 豆包已启动，但调试端口 $Port 仍然不通。" -ForegroundColor Red
        Write-Host "      第一次会打开一个全新的调试窗口：请扫码登录一次（和主账号同一个即可）。" -ForegroundColor Yellow
        Write-Host "      登录后回到界面重新点一次安装；之后会复用这个登录，不再需要重扫。" -ForegroundColor Yellow
        Write-Log "Abort: debug port $Port still closed after launch"
        exit 1
    }
    Write-Host "  [i] 首次使用请在调试窗口里扫码登录（云端记忆绑定账号，登录同账号即生效）。" -ForegroundColor DarkGray
}

$target = Wait-DoubaoTarget 60
if (-not $target) { throw "等不到豆包对话页的调试目标（60 秒），确认豆包已登录并打开主界面" }
Write-Host "  调试目标 : $($target.type) $($target.url)"
$ws = $target.webSocketDebuggerUrl

# ---------- 抓「记忆条目」接口 ----------
if ($ProbeMemory) {
    Write-Host "`n[抓包] 挂 fetch 钩子，然后让豆包自己写一条记忆，抓出记忆条目接口" -ForegroundColor Cyan
    $hook = @'
(()=>{
  if (window.__hs_hooked) return 'already';
  window.__hs_calls = [];
  const of = window.fetch;
  window.fetch = async function(...args){
    const url = (typeof args[0] === 'string') ? args[0] : ((args[0] && args[0].url) || '');
    let body = args[1] && args[1].body;
    if (typeof body === 'string' && body.length > 600) body = body.slice(0,600) + '...';
    const res = await of.apply(this, args);
    if (/memory|agentsmd/i.test(url)) {
      let txt = '';
      try { txt = await res.clone().text(); } catch(e) {}
      window.__hs_calls.push({
        url: url,
        method: (args[1] && args[1].method) || 'GET',
        status: res.status,
        body: body || '',
        resp: (txt || '').slice(0, 400)
      });
    }
    return res;
  };
  window.__hs_hooked = true;
  return 'hooked';
})()
'@
    Write-Host ("  钩子: " + (Invoke-CdpEval $ws $hook 30))
    $probeMsg = '请记住：这是一条测试记忆，编号 HS-MEM-PROBE，内容为「海鸥注入探测」。'
    [void](Set-DoubaoInput $ws $probeMsg)
    Send-DoubaoEnter $ws
    Write-Host "  已发送测试记忆请求，等 15 秒收集接口..." -ForegroundColor DarkGray
    Start-Sleep -Seconds 15
    $raw = Invoke-CdpEval $ws "JSON.stringify(window.__hs_calls||[])" 30
    Write-Host "`n[结果]" -ForegroundColor Cyan
    $calls = @()
    try { $calls = @($raw | ConvertFrom-Json) } catch { }
    if ($calls.Count -eq 0) {
        Write-Host "  没抓到 memory 请求（可能模型没调记忆接口，改用人工路径：设置 → 记忆，再跑一次 -ProbeMemory）" -ForegroundColor Yellow
    } else {
        foreach ($c in $calls) {
            Write-Host ("  [{0}] {1} -> {2}" -f $c.method, $c.url, $c.status) -ForegroundColor Green
            if ($c.body) { Write-Host ("      req : " + $c.body) -ForegroundColor DarkGray }
            if ($c.resp) { Write-Host ("      resp: " + $c.resp) -ForegroundColor DarkGray }
        }
    }
    Write-Log "ProbeMemory calls=$($calls.Count)"
    exit 0
}

# ---------- 探测 set_agentsmd 字符上限 ----------
if ($ProbeCap) {
    $orig = Read-AgentsMd $ws
    Write-Host "`n[探测] 当前云端记忆 $($orig.len) 字符（探测结束会自动还原）" -ForegroundColor Cyan
    $lastOk = 0
    $firstFail = 0
    $sizes = if ($ProbeSizes -and $ProbeSizes.Count -gt 0) { $ProbeSizes } else { @(8000, 16000, 24000, 32000, 40000, 50000) }
    foreach ($sz in $sizes) {
        # 构造「恰好 $sz 字符」的探测内容：头尾标记 + 等长填充，用于精确定位上限
        $head = 'PROBE-' + $sz + ':'
        $tail = ':END'
        $fill = $sz - $head.Length - $tail.Length
        if ($fill -lt 0) { $fill = 0 }
        $probe = $head + ('x' * $fill) + $tail
        $res = Write-AgentsMd $ws $probe
        $after = Read-AgentsMd $ws
        $ok = ($after.content -eq $probe)
        Write-Host ("  {0,6} 字符 -> status={1} 读回={2} {3}" -f $probe.Length, $res.status, $after.len, $(if ($ok) { 'OK' } else { 'FAIL' }))
        if ($ok) { $lastOk = $probe.Length } else { $firstFail = $probe.Length; break }
    }
    Write-Host "`n  结论：能写入的最大档 $lastOk 字符；首次失败档 $firstFail 字符" -ForegroundColor Cyan
    Write-Log "ProbeCap lastOk=$lastOk firstFail=$firstFail"
    if ($orig.len -gt 0) {
        [void](Write-AgentsMd $ws $orig.content)
        $now = Read-AgentsMd $ws
        Write-Host "  已还原原记忆（$($now.len) 字符）" -ForegroundColor Green
    } else {
        [void](Write-AgentsMd $ws '')
        Write-Host "  原记忆为空，已清空探测内容" -ForegroundColor Green
    }
    exit 0
}

# ---------- 对话注入：不碰云端记忆，把完整提示词作为首条消息发进去 ----------
if ($InjectChat) {
    Write-Host "`n[对话注入] 完整提示词 $($srcText.Length) 字符（不经过云端记忆，无字符上限）" -ForegroundColor Cyan
    [void](Invoke-CdpCommand $ws 'Page.navigate' @{ url = 'https://www.doubao.com/chat/' } 30)
    Start-Sleep -Seconds 4
    $t2 = Wait-DoubaoTarget 30
    if ($t2) { $ws = $t2.webSocketDebuggerUrl }
    $got = Set-DoubaoInput $ws $srcText
    Write-Host "  输入框已填入 $got 字符" -ForegroundColor Green
    Send-DoubaoEnter $ws
    Start-Sleep -Seconds 3
    Write-Log "InjectChat chars=$got"
    Write-Host "  已发送。等这一轮回复完，之后正常接着聊即可。" -ForegroundColor Green
    Write-Host "  注意：这是首条消息式注入，每开一个新对话都要再跑一次（可做成界面按钮）。" -ForegroundColor DarkGray
    exit 0
}

# 状态
if ($Status) {
    $cur = Read-AgentsMd $ws
    Write-Host "`n[状态]" -ForegroundColor Cyan
    Write-Host "  云端全局记忆 : $($cur.len) 字符"
    Write-Host "  本地备份     : $(if (Test-Path -LiteralPath $backupFile) { "$((Get-Item $backupFile).Length) 字节" } else { '无' })"
    Write-Host "  注入状态     : $(if (Test-Path -LiteralPath $stateFile) { '已注入（可 -Uninstall 还原）' } else { '未注入' })"
    if ($cur.len -gt 0) {
        $head = ($cur.content -split "`n" | Select-Object -First 6) -join "`n"
        Write-Host "`n--- 记忆开头 ---`n$head`n---"
    }
    Write-Log "Status: len=$($cur.len)"
    exit 0
}

# 卸载 / 装回原始记忆
if ($Uninstall -or $RestoreMemory) {
    $done = @()
    if (Test-Path -LiteralPath $backupFile) {
        $bak = Read-Utf8 $backupFile
        # 备份内容本身就是海鸥V8·破甲版注入时（上一版工具写进去的、或用户手工贴的），
        # 还原它等于把破甲留着 —— 这种情况直接清空，才算真卸干净。
        if ($bak -match '海鸥V8·破甲版|中转站保护') {
            $r = Write-AgentsMd $ws ''
            $cur = Read-AgentsMd $ws
            $done += "备份内容本身是上一次的注入 → 已清空云端记忆（现在 $($cur.len) 字符）"
        } else {
            $r = Write-AgentsMd $ws $bak
            $cur = Read-AgentsMd $ws
            if ($cur.content -eq $bak) { $done += "全局记忆已还原（$($cur.len) 字符）" }
            else { $done += "还原后校验不一致（当前 $($cur.len) 字符）" }
        }
        Remove-Item -LiteralPath $backupFile -Force
    } else {
        $r = Write-AgentsMd $ws ''
        $done += "没有备份，已清空全局记忆"
    }
    if (Test-Path -LiteralPath $stateFile) { Remove-Item -LiteralPath $stateFile -Force }

    Write-Log "Uninstall: $($done -join '; ')"
    # 收拾本地痕迹：日志 + 空目录。~/.doubao 是本脚本专用的（豆包自己的数据在
    # %LOCALAPPDATA%\Doubao\User Data），空掉就删，别在用户 Home 下留垃圾。
    $logFile = Join-Path $env:USERPROFILE '.doubao\seagull-doubao.log'
    if (Test-Path -LiteralPath $logFile) {
        Remove-Item -LiteralPath $logFile -Force
        $done += "已删除日志 seagull-doubao.log"
    }
    foreach ($d in @($stateDir, (Join-Path $env:USERPROFILE '.doubao'))) {
        if ((Test-Path -LiteralPath $d) -and -not @(Get-ChildItem -LiteralPath $d -Force)) {
            Remove-Item -LiteralPath $d -Force
            $done += "已删除空目录 $(Split-Path -Leaf $d)"
        }
    }

    Write-Host $(if ($RestoreMemory) { "`n[完成] 装回原始记忆" } else { "`n[完成] 卸载" }) -ForegroundColor Green
    $done | ForEach-Object { Write-Host "  - $_" }
    # $exe 可能已经是 app\Doubao.exe（进程路径优先），别拼成 app\app\
    $appExe = if (-not $exe) { 'Doubao.exe' }
              elseif ($exe -like '*\app\Doubao.exe') { $exe }
              else { Join-Path (Split-Path -Parent $exe) 'app\Doubao.exe' }
    Write-Host "`n  提示：豆包仍以调试模式运行（端口 $Port）。要恢复正常模式，关掉豆包后不带参数启动：" -ForegroundColor DarkGray
    Write-Host "        $appExe" -ForegroundColor DarkGray
    exit 0
}

# 备份（只在首次注入时备份，别把注入后的内容当原始记忆备份了）
$before = Read-AgentsMd $ws
Write-Host "  写入前   : $($before.len) 字符"
if (-not (Test-Path -LiteralPath $backupFile)) {
    if ($before.len -gt 0) {
        Write-Utf8 $backupFile $before.content
        Write-Host "  [i] 原记忆已备份 → $backupFile" -ForegroundColor DarkGray
    } else {
        Write-Utf8 $backupFile ''
        Write-Host "  [i] 原记忆为空，已记录空备份（卸载时会清空而不是还原）" -ForegroundColor DarkGray
    }
}

# 写入
$res = Write-AgentsMd $ws $srcText
Write-Host "  接口返回 : status=$($res.status) $($res.body)"
$after = Read-AgentsMd $ws
$ok = ($after.content -eq $srcText)

Write-Utf8 $stateFile (@{
    prompt       = $SourcePrompt
    sha256       = $srcHash
    chars        = $srcText.Length
    writtenAt    = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
    exactMatch   = $ok
} | ConvertTo-Json -Depth 4)

Write-Host "`n[校验]" -ForegroundColor Cyan
Write-Host "  写入后   : $($after.len) 字符"
Write-Host "  逐字一致 : $ok"
Write-Log "Inject: chars=$($srcText.Length) exact=$ok status=$($res.status)"

if ($ok) {
    Write-Host "`n[完成] 豆包全局记忆已替换为 $((Split-Path -Leaf $SourcePrompt))" -ForegroundColor Green
    Write-Host "  生效验证：在豆包里开一个通用任务问一句，看是否按海鸥V8·破甲版规范回应"
    Write-Host "  还原命令：.\install-doubao.ps1 -Uninstall"
} else {
    Write-Host "`n[失败] 写进去了但读回来对不上 —— 云端可能有审核或长度截断" -ForegroundColor Red
    Write-Host "  写入前 $($before.len) 字符 / 期望 $($srcText.Length) 字符 / 实际 $($after.len) 字符"
    exit 2
}
