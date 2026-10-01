# Launcher PowerShell untuk AI Upscaler React Studio
Set-Location -Path $PSScriptRoot

if (-not (Test-Path ".venv\Scripts\python.exe")) {
    Write-Host "[ERROR] Virtual environment belum ditemukan. Jalankan setup_windows.ps1 terlebih dahulu." -ForegroundColor Red
    exit 1
}

Write-Host "🚀 Menjalankan AI Upscaler Studio (React + FastAPI)..." -ForegroundColor Cyan
& ".venv\Scripts\python.exe" server.py
