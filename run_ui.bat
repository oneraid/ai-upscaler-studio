@echo off
title AI Photo and Video Upscaler - React Studio
echo ===================================================
echo   Memulai AI Photo and Video Upscaler (React UI)
echo ===================================================
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo [ERROR] Virtual environment belum ditemukan!
    echo Silakan jalankan setup_windows.ps1 terlebih dahulu.
    pause
    exit /b 1
)

echo Membuka antarmuka di browser...
.venv\Scripts\python.exe server.py
pause
