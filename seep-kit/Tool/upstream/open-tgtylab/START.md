# 快速开始

## 第一次使用

### Windows 用户

1. 双击 `启动.bat`
2. 等待部署完成（会自动下载工具，可能需要几分钟）
3. 重启你的 AI 工具
4. 打开 `open-tgtylab` 目录开始使用

### macOS / Linux 用户

```bash
chmod +x tgtylab-files/install.sh
./tgtylab-files/install.sh
```

## 我想确认能不能跑

1. 双击 `验证.bat`（Windows）或运行 `python scripts/misc/lab_healthcheck.py`
2. 确认所有检查都通过
3. 打开 AI 工具，输入一个测试问题

## 我要做 Web CTF

1. 打开 AI 工具，进入 `open-tgtylab` 目录
2. 输入：`对 http://target.example.com 做信息收集和漏洞扫描`
3. AI 会自动调用 MCP 工具和知识库

## 我要分析 APK

1. 把 APK 放到 `samples/android/`
2. 输入：`分析这个 APK 的加密方案和通信接口`
3. AI 会调用 `android_app_baseline` + `android_crypto_unpack_recipe`

## 我要分析 PE / EXE

1. 把样本放到 `samples/pe/`
2. 输入：`分析这个样本的行为和 IOC`
3. AI 会调用 `sample_full_workup` 一键全分析

## 我要检查 MCP 工具

1. 打开 AI 工具，输入 `检查 MCP server 健康状态`
2. 确认 `reverse_lab_tools` 出现
3. 如果没有，检查 `.mcp.json` 路径是否正确
