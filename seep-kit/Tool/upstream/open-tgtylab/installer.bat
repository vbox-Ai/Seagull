@echo off
chcp 65001 >nul 2>&1
title open-tgtylab Installer
cd /d "%~dp0"
python installer.py
if %errorlevel% neq 0 (
    echo [!] Python not found or installer.py failed
    echo     Make sure Python 3.8+ is installed
    pause
)
