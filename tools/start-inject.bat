@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo  方案 B · 第二步：CDP 传输层注入
echo  需要 Trae 已开启 9222 调试端口
echo  停止：Ctrl+C
echo ============================================
node cdp-inject-rules.js
pause
