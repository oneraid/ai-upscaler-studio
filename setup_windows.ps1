# setup_windows.ps1
# Script setup otomatis untuk AI Upscaler (Windows + NVIDIA RTX)

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "     AI Photo & Video Upscaler - Setup Windows            " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Cek Versi Python (3.10 atau 3.11)
Write-Host "`n[1/7] Memeriksa versi Python..." -ForegroundColor Yellow
$PythonCmd = $null

# Coba py launcher
if (Get-Command py -ErrorAction SilentlyContinue) {
    $py310 = py -3.10 -c "import sys; print(sys.version_info[:2])" 2>$null
    if ($LASTEXITCODE -eq 0 -and $py310 -match "\(3, 10\)") {
        $PythonCmd = "py -3.10"
        Write-Host "Python 3.10 ditemukan melalui py launcher." -ForegroundColor Green
    } else {
        $py311 = py -3.11 -c "import sys; print(sys.version_info[:2])" 2>$null
        if ($LASTEXITCODE -eq 0 -and $py311 -match "\(3, 11\)") {
            $PythonCmd = "py -3.11"
            Write-Host "Python 3.11 ditemukan melalui py launcher." -ForegroundColor Green
        }
    }
}

if (-not $PythonCmd) {
    if (Get-Command python -ErrorAction SilentlyContinue) {
        $ver = python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null
        if ($ver -eq "3.10" -or $ver -eq "3.11") {
            $PythonCmd = "python"
            Write-Host "Python $ver ditemukan di PATH." -ForegroundColor Green
        } else {
            Write-Host "[PERINGATAN] Python default Anda adalah versi $ver." -ForegroundColor Yellow
            Write-Host "Real-ESRGAN & basicsr bekerja paling stabil pada Python 3.10 atau 3.11." -ForegroundColor Yellow
            Write-Host "Sangat disarankan menginstal Python 3.10 (misal: 'winget install Python.Python.3.10')." -ForegroundColor Yellow
            $PythonCmd = "python"
        }
    } else {
        Write-Host "[ERROR] Python tidak ditemukan! Silakan instal Python 3.10." -ForegroundColor Red
        exit 1
    }
}

# 2. Buat venv .venv
Write-Host "`n[2/7] Menyiapkan virtual environment (.venv)..." -ForegroundColor Yellow
if (-not (Test-Path ".venv\Scripts\python.exe")) {
    Write-Host "Membuat .venv menggunakan $PythonCmd..."
    Invoke-Expression "$PythonCmd -m venv .venv"
} else {
    Write-Host ".venv sudah ada." -ForegroundColor Green
}

$VenvPython = Join-Path (Get-Location) ".venv\Scripts\python.exe"
$HasUv = [bool](Get-Command uv -ErrorAction SilentlyContinue)

# 3. Install PyTorch CUDA & Dependencies
Write-Host "`n[3/7] Menginstall PyTorch CUDA dan dependencies..." -ForegroundColor Yellow
if ($HasUv) {
    Write-Host "Menggunakan uv untuk instalasi cepat..." -ForegroundColor Green
    uv pip install --python "$VenvPython" torch torchvision --index-url https://download.pytorch.org/whl/cu121
    uv pip install --python "$VenvPython" -r requirements.txt
} else {
    Write-Host "Menggunakan pip..." -ForegroundColor Green
    & "$VenvPython" -m pip install --upgrade pip
    & "$VenvPython" -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
    & "$VenvPython" -m pip install -r requirements.txt
}

# 4. Jalankan Patch basicsr
Write-Host "`n[4/7] Memeriksa dan menerapkan patch kompatibilitas basicsr..." -ForegroundColor Yellow
& "$VenvPython" scripts/fix_basicsr.py

# 5. Cek FFmpeg dan FFprobe
Write-Host "`n[5/7] Memeriksa FFmpeg dan FFprobe..." -ForegroundColor Yellow
$FfmpegCmd = Get-Command ffmpeg -ErrorAction SilentlyContinue
$FfprobeCmd = Get-Command ffprobe -ErrorAction SilentlyContinue

if ($FfmpegCmd -and $FfprobeCmd) {
    Write-Host "FFmpeg ditemukan: $($FfmpegCmd.Source)" -ForegroundColor Green
} else {
    Write-Host "[PERINGATAN] FFmpeg atau FFprobe belum terpasang di PATH!" -ForegroundColor Yellow
    Write-Host "Untuk menginstal di Windows, jalankan perintah berikut di PowerShell:" -ForegroundColor Cyan
    Write-Host "    winget install Gyan.FFmpeg" -ForegroundColor White
    Write-Host "Setelah itu, buka kembali PowerShell agar PATH diperbarui." -ForegroundColor Yellow
}

# 6. Download Model Default
Write-Host "`n[6/7] Menyiapkan model default ke weights/..." -ForegroundColor Yellow
& "$VenvPython" -c @"
from src.models import get_model_weights_path
print('Mengunduh model general-x4 (RealESRGAN_x4plus)...')
get_model_weights_path('general-x4')
print('Mengunduh model general-fast (realesr-general-x4v3)...')
get_model_weights_path('general-fast')
print('Model default siap!')
"@

# 7. Self-Test
Write-Host "`n[7/7] Menjalankan Self-Test sistem..." -ForegroundColor Yellow
Write-Host "----------------------------------------------------------" -ForegroundColor Gray
& "$VenvPython" -c @"
import torch
import shutil
import subprocess

print('PyTorch Version      :', torch.__version__)
cuda_ok = torch.cuda.is_available()
print('CUDA Available       :', cuda_ok)
if cuda_ok:
    gpu_name = torch.cuda.get_device_name(0)
    vram = torch.cuda.get_device_properties(0).total_memory / (1024**2)
    print('GPU Device Name      :', gpu_name)
    print(f'VRAM Total           : {vram:.1f} MB ({vram/1024:.2f} GB)')
else:
    print('GPU Device Name      : TIDAK ADA (CPU Mode)')

ffmpeg_path = shutil.which('ffmpeg')
if ffmpeg_path:
    try:
        res = subprocess.run(['ffmpeg', '-version'], stdout=subprocess.PIPE, text=True)
        first_line = res.stdout.splitlines()[0] if res.stdout else 'Terdeteksi'
        print('FFmpeg Version       :', first_line)
    except Exception:
        print('FFmpeg Version       : Terpasang di', ffmpeg_path)
else:
    print('FFmpeg Version       : Belum terpasang di PATH')
"@
Write-Host "----------------------------------------------------------" -ForegroundColor Gray

Write-Host "`nSetup selesai! Anda dapat menjalankan AI Upscaler dengan:" -ForegroundColor Green
Write-Host "    .venv\Scripts\python.exe enhance.py input\foto.jpg --scale 4" -ForegroundColor Cyan
Write-Host "atau aktifkan venv terlebih dahulu:" -ForegroundColor Green
Write-Host "    .venv\Scripts\Activate.ps1" -ForegroundColor Cyan
Write-Host "    python enhance.py input\foto.jpg --scale 4" -ForegroundColor Cyan
