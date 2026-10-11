# ⚡ AI Photo & Video Upscaler Studio

## Penjelasan Singkat Project

**AI Photo & Video Upscaler Studio** adalah aplikasi berbasis kecerdasan buatan (AI) untuk meningkatkan resolusi dan kualitas **foto** serta **video** (super-resolution 2x/3x/4x, deblur, denoise, dan restorasi detail wajah) yang berjalan **100% lokal, gratis, dan privat** langsung di komputer Anda tanpa memerlukan koneksi internet, tanpa API berbayar, dan tanpa mengunggah data ke server luar.

Proyek ini menyediakan dua mode antarmuka:
- 🌟 **Modern Web Studio**: Antarmuka grafis modern berbasis **React 19**, **Vite**, dan **FastAPI** dengan tema *Dark Glassmorphism*, slider pembanding *Before/After* interaktif, studio pemotong video (durasi & rasio), pemutar video hasil, dan mode pemrosesan batch.
- 💻 **Command-Line Interface (CLI)**: Antarmuka terminal via skrip `enhance.py` untuk pemrosesan cepat maupun otomasi skrip.

---

## Persyaratan Sistem

| Komponen | Spesifikasi Rekomendasi | Keterangan |
|---|---|---|
| **Sistem Operasi** | Windows 10 / 11 (64-bit) | PowerShell 5.1+ atau Command Prompt |
| **GPU** | NVIDIA GeForce RTX 3060 / 4060 ke atas (VRAM 6–8 GB+) | Mendukung CUDA 12.1+ |
| **Python** | Python 3.10 atau 3.11 | Hindari Python 3.12+ demi kompatibilitas `basicsr` |
| **FFmpeg** | Versi 6.0+ / 7.0+ dengan dukungan NVENC | Wajib terdaftar di `PATH` sistem |
| **Node.js** *(Opsional)* | Node.js v18+ | Hanya jika ingin memodifikasi source code frontend |

---

## Model AI & Teknologi yang Digunakan

| Kategori | Model / Arsitektur | Fungsi Utama |
|---|---|---|
| **Foto (Super-Resolution)** | **Real-ESRGAN** (`realesr-general-x4v3`, `RealESRGAN_x4plus`, `anime_6B`) | Perbesaran resolusi 2x, 3x, 4x, restorasi tekstur, deblur, dan denoise |
| **Wajah (Face Restoration)** | **CodeFormer** & **GFPGAN v1.4** | Restorasi mata, rambut, bibir, dan tekstur kulit pada foto/video potret |
| **Video Upscale** | **Real-ESRGAN Compact** (`realesr-general-x4v3`) + **NVENC** | Upscaling frame-by-frame berkecepatan tinggi dengan temporal flicker minimal |
| **Motion Interpolation** | **FFmpeg Minterpolate (MCI / Blend)** | Menaikkan frame rate video ke **60 FPS** atau **2x FPS** (Ultra Mulus) |
| **Video Cropper** | **FFmpeg Spatial Filter + NVENC Stream Engine** | Pemotongan durasi waktu (trim) dan aspek rasio (16:9, 9:16, 1:1, dll) |

---

## Fitur Utama

- 🎨 **Modern React Studio (Navigasi Sidebar Modular)**:
  - 🖼️ **Image Upscale (Single & Batch Terpadu)**:
    - Unggah **1 foto** atau **banyak foto sekaligus** dalam satu area drop zone yang sama.
    - Untuk 1 foto: slider interaktif Before/After langsung aktif dengan zoom dan navigasi detail.
    - Untuk banyak foto (Batch): antrean pemrosesan otomatis, galeri visual tiap foto dengan status real-time, inspeksi perbandingan Before/After langsung dari item batch, dan tombol unduh seluruh hasil dalam **1 arsip ZIP**.
    - Opsi kustomisasi lengkap: pilihan format (PNG, JPG, WEBP), resolusi target (1080p, 2K, 4K, 8K), dan pengatur kejernihan/wajah.
  - 📹 **Video Upscale**: Peningkatan video frame-by-frame dengan akselerasi NVIDIA NVENC, restorasi wajah video per frame, opsi target FPS (60 FPS / 2x FPS), temporal anti-flicker filter, dan fitur uji coba beberapa detik.
  - ✂️ **Crop Video Studio**:
    - **Crop Durasi Waktu (Trim):** Input durasi waktu fleksibel (misal `02:21 - 02:40`), tombol sinkronisasi playhead video (*"Ambil Playhead"*), dual range scrubber, serta tombol putar cuplikan.
    - **Crop Aspek Rasio Spasial:** Pilihan rasio instan `16:9` (YouTube/PC), `9:16` (TikTok/Reels/Shorts), `1:1` (Instagram Feed), `4:5` (Potret IG), `4:3`, `21:9`, dan `Bebas/Custom`.
    - **Interactive Visual Crop Box:** Kotak potong visual dengan garis bantu *Rule of Thirds* yang dapat **digeser langsung (*drag & drop*)** di atas video player.
    - **Alur Kerja Terintegrasi:** Tombol instan *"🚀 Kirim ke Tab Video Upscale"* untuk langsung memperbesar video hasil crop tanpa perlu upload ulang.
- 🎭 **Restorasi Wajah Ganda (CodeFormer & GFPGAN)**: Pilihan antara ketajaman ultra detail (CodeFormer) atau kehalusan natural (GFPGAN) dengan pengaturan intensitas bobot wajah.
- 📐 **Presets Resolusi Cerdas**: Pilihan skala langsung (1x, 2x, 3x, 4x) atau preset standar industri (1080p FHD, 1440p 2K, 4K UHD, 8K UHD) dengan rasio aspek yang selalu terjaga.
- ⚡ **Akselerasi Hardware NVIDIA NVENC**: Encoding video hingga 3–5x lebih cepat langsung memanfaatkan chip hardware GPU RTX Anda.
- 🔁 **Resume Video Otomatis**: Jika proses render video terhenti, program akan otomatis melanjutkan dari frame terakhir tanpa mengulang dari awal.
- 🛡️ **Automatic OOM Recovery**: Jika VRAM penuh saat memproses gambar resolusi tinggi, sistem otomatis membagi pemrosesan ke ukuran tile yang lebih kecil (`400 -> 256 -> 128 -> 64`).
- 📁 **Akses Desktop Windows Terpadu**: Tombol langsung untuk *"Buka Folder di File Explorer"*, *"Buka File Langsung"*, dan *"Salin Path"*.

---

## Cara Instalasi

### 1. Pasang FFmpeg
Pastikan FFmpeg sudah terpasang di komputer Anda. Periksa lewat PowerShell:
```powershell
ffmpeg -version
```
Jika belum terpasang, pasang dengan cepat melalui Windows Package Manager (`winget`):
```powershell
winget install Gyan.FFmpeg
```
*(Tutup dan buka kembali terminal setelah instalasi).*

### 2. Jalankan Skrip Setup Otomatis
Buka terminal PowerShell di folder proyek ini (`E:\Programming\AI Upscaler`), lalu jalankan:
```powershell
powershell -ExecutionPolicy Bypass -File setup_windows.ps1
```
Skrip ini akan secara otomatis:
1. Membuat virtual environment Python (`.venv`).
2. Menginstall PyTorch CUDA (`cu121`), torchvision, Real-ESRGAN, GFPGAN, FastAPI, dan seluruh dependensi.
3. Menerapkan patch kompatibilitas `basicsr` terhadap modul torchvision terbaru.
4. Memverifikasi ketersediaan encoder hardware NVENC pada kartu grafis NVIDIA Anda.
5. Mengunduh file bobot model AI resmi ke folder `weights/`.

---

## Cara Menjalankan

### Opsi 1: Menjalankan Web Studio (Rekomendasi)
Antarmuka visual modern berbasis browser:

- **Cara Paling Mudah**: Cukup **klik dua kali (double-click)** file [**`run_ui.bat`**](file:///e:/Programming/AI%20Upscaler/run_ui.bat) di Windows Explorer.
- **Atau via PowerShell**:
  ```powershell
  .\run_ui.ps1
  # atau: .venv\Scripts\python.exe server.py
  ```
Browser Anda akan otomatis terbuka ke alamat **`http://127.0.0.1:7860`**.

> **Tips Development Frontend (Opsional):**  
> Jika ingin memodifikasi tampilan antarmuka React secara langsung dengan fitur *Hot-Reload*:
> ```powershell
> cd frontend
> npm run dev
> ```
> Buka `http://localhost:5173` di browser. Untuk membangun kembali file produksi, jalankan `npm run build`.

---

### Opsi 2: Menggunakan Command-Line Interface (CLI)

Aktifkan virtual environment terlebih dahulu:
```powershell
.venv\Scripts\Activate.ps1
```
*(Atau panggil langsung menggunakan `.venv\Scripts\python.exe enhance.py ...`)*

#### 1. Upscale Foto Standar (4x)
```powershell
python enhance.py input\foto.jpg --scale 4
```
Hasil tersimpan di `output\foto_x4.png`.

#### 2. Upscale Foto dengan Restorasi Wajah (GFPGAN)
```powershell
python enhance.py input\potret.jpg --scale 4 --face --face-weight 0.6
```

#### 3. Upscale Gambar PNG Transparan
```powershell
python enhance.py input\logo.png --scale 2 --format png
```

#### 4. Upscale Video 2x (Cepat dengan NVENC)
```powershell
python enhance.py input\video.mp4 --scale 2 --model general-fast
```

#### 5. Uji Coba Video Singkat (misal: 5 detik pertama)
```powershell
python enhance.py input\video.mp4 --start 0 --end 5 --scale 2
```

#### 6. Mode Batch (Proses Satu Folder Penuh)
```powershell
python enhance.py input\ -o output\ --scale 4
```

---

## Lisensi & Atribusi

Proyek ini dibangun menggunakan model dan pustaka open-source:
- [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN) oleh Xintao Wang dkk. (BSD 3-Clause License)
- [CodeFormer](https://github.com/sczhou/CodeFormer) oleh Shangchen Zhou dkk. (S-Lab / NTU)
- [GFPGAN](https://github.com/TencentARC/GFPGAN) oleh Tencent ARC Lab (Apache 2.0 License)
- [BasicSR](https://github.com/XPixelGroup/BasicSR) oleh XPixelGroup (Apache 2.0 License)
- [FastAPI](https://fastapi.tiangolo.com/) oleh Sebastián Ramírez (MIT License)
- [React](https://react.dev/) & [Vite](https://vite.dev/) (MIT License)
- [FFmpeg](https://ffmpeg.org/) (LGPL/GPL)
