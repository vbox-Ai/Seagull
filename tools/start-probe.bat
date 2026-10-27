@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo  方案 B · 第一步：探测模型请求出口
echo  监听 30 秒，期间请在 Trae 里发一条消息
echo ============================================
node probe-model-endpoint.js
echo.
echo 监听结束。看上面结论：命中 page 才能用方案 B。
pause
