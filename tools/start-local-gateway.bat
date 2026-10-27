@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo  方案 C · 本地模型网关（Ollama / LM Studio）
echo ============================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0local-gateway.ps1" %*
echo.
pause
