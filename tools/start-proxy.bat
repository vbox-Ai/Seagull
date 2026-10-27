@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo  方案 A · 本地代理升权
echo  Trae Base URL 填 http://127.0.0.1:8787/v1
echo  统计查看 http://127.0.0.1:8787/__status
echo ============================================
node trae-rule-proxy.js
pause
