@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo  方案 D · 分层拆解（不改一个字，只选常驻/按需）
echo ============================================
node split-rules.js %*
echo.
pause
