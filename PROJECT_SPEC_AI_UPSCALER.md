# PROJECT SPEC: AI Photo & Video Upscaler (Lokal, Windows + NVIDIA)

> Dokumen ini adalah instruksi lengkap untuk AI agent. Bangun project sesuai spesifikasi di bawah, jalankan, uji, dan perbaiki sampai semua **Acceptance Criteria** (bagian 12) terpenuhi.

---

## 1. Tujuan

Membuat tool command-line berbasis Python untuk meningkatkan kualitas **foto** dan **video** (upscale 2x/4x, kurangi blur/noise, perbaiki wajah) menggunakan model AI open source yang berjalan **100% lokal dan gratis**. Tidak ada API berbayar, tidak ada upload ke server.

## 2. Lingkungan Target

| Item | Nilai |
|---|---|
| OS | Windows 10/11 |
| GPU | NVIDIA GeForce RTX 4060 Laptop, **VRAM 8 GB** |
| Python | 3.10 atau 3.11 (hindari 3.12+ karena kompatibilitas basicsr/realesrgan) |
| Shell | PowerShell |
| Internet | Hanya untuk install dependency dan download model sekali |

Catatan penting untuk VRAM 8 GB:
- Gunakan **FP16 (half precision)** by default.
- Gunakan **tiling** (default `tile=400`; turun ke 256 atau 128 jika terjadi CUDA out-of-memory).
- Tangkap `torch.cuda.OutOfMemoryError`, kosongkan cache (`torch.cuda.empty_cache()`), lalu retry otomatis dengan tile lebih kecil.

## 3. Tech Stack

- **Python** + virtual environment (`venv`)
- **PyTorch versi CUDA** (install dari index `https://download.pytorch.org/whl/cu121` atau versi CUDA terbaru yang didukung; verifikasi dengan `torch.cuda.is_available()`)
- **Real-ESRGAN** (paket `realesrgan`, bergantung pada `basicsr`) untuk upscaling
- **GFPGAN** (paket `gfpgan`, bergantung pada `facexlib`) untuk restorasi wajah
- **FFmpeg** (binary eksternal) untuk decode/encode video
- **OpenCV** (`opencv-python`), **NumPy**, **Pillow**
- **tqdm** untuk progress bar
- **argparse** (atau `typer`) untuk CLI
- **pytest** untuk test

### Known issue yang HARUS ditangani

1. `basicsr` versi lama error `ModuleNotFoundError: No module named 'torchvision.transforms.functional_tensor'` pada torchvision >= 0.17. Solusi: patch import di file `basicsr/data/degradations.py` (ganti ke `torchvision.transforms.functional`), **atau** pin versi torch/torchvision yang kompatibel, **atau** buat skrip `scripts/fix_basicsr.py` yang melakukan patch otomatis. Dokumentasikan solusi yang dipilih di README.
2. Pastikan `numpy` kompatibel (jika error terkait NumPy 2.x, pin `numpy<2`).
3. Verifikasi sendiri versi paket terbaru yang saling cocok; jangan asal menebak. Simpan hasil akhir yang berhasil di `requirements.txt` dengan versi ter-pin.

## 4. Struktur Folder

```
ai-upscaler/
├── README.md
├── requirements.txt
├── setup_windows.ps1          # skrip setup otomatis (venv, install, download model, cek ffmpeg)
├── enhance.py                 # entry point CLI
├── src/
│   ├── __init__.py
│   ├── config.py              # konstanta, path, daftar model + URL
│   ├── models.py              # loader model (RealESRGAN, GFPGAN), cache, download otomatis
│   ├── image_pipeline.py      # proses satu foto
│   ├── video_pipeline.py      # proses video (ekstrak frame, enhance, encode)
│   ├── ffmpeg_utils.py        # cek ffmpeg, probe video, ekstrak/encode
│   └── utils.py               # logging, format file, handle OOM, helper
├── weights/                   # file model .pth (di-download otomatis, masuk .gitignore)
├── input/                     # contoh input
├── output/                    # hasil
└── tests/
    ├── test_cli.py
    └── test_image_pipeline.py
```

## 5. Model yang Didukung

Download otomatis ke `weights/` jika belum ada (verifikasi URL rilis resmi; jika URL berubah, cari di halaman GitHub Releases masing-masing repo):

| Nama di CLI | File | Kegunaan |
|---|---|---|
| `general-x4` (default) | `RealESRGAN_x4plus.pth` | Foto umum, kualitas terbaik |
| `general-fast` | `realesr-general-x4v3.pth` | Lebih cepat dan ringan, cocok untuk video |
| `anime` | `RealESRGAN_x4plus_anime_6B.pth` | Anime/ilustrasi |
| face (opsional) | `GFPGANv1.4.pth` | Restorasi wajah (flag `--face`) |

Sumber:
- Real-ESRGAN: https://github.com/xinntao/Real-ESRGAN/releases
- GFPGAN: https://github.com/TencentARC/GFPGAN/releases

Rekomendasi default: **foto pakai `general-x4`, video pakai `general-fast`** (jauh lebih cepat, kualitas masih bagus).

## 6. Antarmuka CLI

```
python enhance.py <input> [opsi]
```

`<input>` boleh berupa: satu file foto, satu file video, atau satu folder (proses batch semua file yang didukung).

| Opsi | Default | Keterangan |
|---|---|---|
| `-o, --output` | `output/` | Folder atau file output |
| `-s, --scale` | `4` | Faktor upscale akhir: 2, 3, atau 4 (model x4 lalu di-resize ke target jika bukan 4) |
| `-m, --model` | auto | `general-x4`, `general-fast`, `anime` (auto: foto = general-x4, video = general-fast) |
| `--face` | off | Aktifkan GFPGAN untuk restorasi wajah |
| `--face-weight` | `0.5` | Blend restorasi wajah (0 sampai 1) |
| `--tile` | `400` | Ukuran tile (0 = tanpa tiling). Turunkan jika OOM |
| `--fp32` | off | Paksa full precision (default FP16) |
| `--max-side` | `4096` | Batas sisi terpanjang hasil foto (cegah hasil raksasa) |
| `--format` | `png` (foto) | Foto: `png`/`jpg`/`webp`. Video selalu `mp4` |
| `--jpg-quality` | `95` | Kualitas jika output jpg |
| `--crf` | `18` | Kualitas encode video (lebih kecil = lebih bagus/besar) |
| `--codec` | `auto` | `auto`, `h264_nvenc`, `libx264`, `hevc_nvenc`. Auto = pakai NVENC jika tersedia, fallback ke libx264 |
| `--keep-frames` | off | Simpan frame sementara (untuk debug) |
| `--resume` | on | Lanjutkan proses video yang terputus |
| `--start / --end` | - | Proses potongan video saja (detik), berguna untuk tes cepat |
| `--overwrite` | off | Timpa file output yang sudah ada |
| `-v, --verbose` | off | Log detail |

Contoh:

```powershell
python enhance.py input\foto.jpg --scale 4 --face
python enhance.py input\video.mp4 --scale 2 --model general-fast
python enhance.py input\ -o output\ --scale 4
python enhance.py input\video.mp4 --start 0 --end 5   # tes cepat 5 detik
```

## 7. Pipeline Foto

1. Baca gambar dengan OpenCV (`cv2.IMREAD_UNCHANGED`), tangani channel alpha (pisahkan RGB dan alpha, upscale alpha terpisah dengan resize biasa lalu gabungkan kembali) dan gambar grayscale.
2. Baca orientasi EXIF dan koreksi rotasi.
3. Upscale dengan Real-ESRGAN (`RealESRGANer`, `half=True`, `tile=<opsi>`, `tile_pad=10`, `pre_pad=0`).
4. Jika `--face`: pakai `GFPGANer` dengan `upscale=<scale>`, `bg_upsampler=<realesrgan>`, `only_center_face=False`, `paste_back=True`, `weight=<face-weight>`.
5. Jika `--scale` bukan 4: resize hasil ke target dengan `cv2.INTER_LANCZOS4` (atau `INTER_AREA` saat mengecilkan).
6. Terapkan `--max-side`.
7. Simpan hasil. Nama output: `<nama>_x<scale>.<ext>`.

## 8. Pipeline Video

Pendekatan: **ekstrak frame, enhance per frame, encode ulang, gabungkan audio asli.**

1. `ffprobe` untuk ambil FPS, resolusi, durasi, jumlah frame, dan info audio.
2. Buat folder kerja sementara `.work/<nama_video>/` berisi `frames_in/` dan `frames_out/`.
3. Ekstrak frame ke PNG (`ffmpeg -i video -qscale:v 1 frames_in/%08d.png`), hormati `--start/--end`.
   - Alternatif yang boleh dipilih agent jika lebih efisien: streaming frame lewat pipe ffmpeg (tanpa simpan ke disk), tapi **fitur resume** harus tetap ada.
4. Loop semua frame dengan `tqdm` (tampilkan FPS proses dan ETA). Lewati frame yang sudah ada di `frames_out/` (resume).
5. Setelah semua selesai, encode:
   - Deteksi NVENC (`ffmpeg -encoders` mengandung `h264_nvenc`). Jika ada: `-c:v h264_nvenc -preset p5 -cq <crf> -pix_fmt yuv420p`. Jika tidak: `-c:v libx264 -crf <crf> -preset medium -pix_fmt yuv420p`.
   - Framerate sama dengan sumber (gunakan nilai rasional dari ffprobe, jangan dibulatkan).
6. Gabungkan audio asli (`-c:a copy`, atau re-encode AAC jika container tidak cocok). Jika video tidak punya audio, lewati tanpa error.
7. Bersihkan folder sementara kecuali `--keep-frames`.
8. Estimasi ruang disk sebelum mulai (frame PNG hasil upscale bisa sangat besar). Peringatkan jika ruang bebas kurang dari estimasi, dan beri saran `--scale 2`.
9. Peringatan: jika hasil akan melebihi 4K (misal 1080p x4 = 8K), beri peringatan dan sarankan `--scale 2`.

## 9. Penanganan Error

- **CUDA OOM**: tangkap, `empty_cache()`, turunkan tile bertahap (400, 256, 128, 64), retry otomatis; jika tetap gagal, keluar dengan pesan jelas.
- **CUDA tidak tersedia**: jalan dengan CPU, tampilkan peringatan besar bahwa proses akan sangat lambat.
- **FFmpeg tidak ditemukan**: pesan error yang jelas plus instruksi install (`winget install Gyan.FFmpeg`) dan cara menambahkan ke PATH.
- **File tidak didukung / rusak**: lewati file itu di mode batch, catat di log, lanjut ke file berikutnya.
- **Ctrl+C**: hentikan dengan rapi, jangan hapus frame yang sudah jadi (agar bisa resume).
- Semua path harus aman untuk Windows (spasi, karakter unicode); gunakan `pathlib`.

## 10. Setup Windows (`setup_windows.ps1`)

Skrip harus melakukan:
1. Cek versi Python (3.10/3.11), beri pesan jika tidak sesuai.
2. Buat venv `.venv` dan aktifkan.
3. Install PyTorch CUDA, lalu `pip install -r requirements.txt`.
4. Jalankan patch basicsr jika diperlukan.
5. Cek `ffmpeg` dan `ffprobe` di PATH; jika belum ada, tampilkan instruksi.
6. Download model default ke `weights/`.
7. Jalankan self-test kecil: cetak nama GPU, `torch.cuda.is_available()`, VRAM, dan versi ffmpeg.

## 11. README.md (wajib, bahasa Indonesia)

Isi minimal: cara install (langkah demi langkah), cara pakai + contoh perintah, tabel model, tips performa untuk RTX 4060 8GB, troubleshooting (OOM, error basicsr, ffmpeg tidak ketemu, hasil terlalu besar), dan catatan bahwa AI upscaling menebak detail sehingga hasil bisa tidak akurat pada sumber yang sangat buruk.

## 12. Acceptance Criteria

Agent harus **benar-benar menjalankan** dan memverifikasi:

- [ ] `setup_windows.ps1` berjalan sampai selesai di mesin target dan self-test melaporkan GPU RTX 4060 terdeteksi.
- [ ] `python enhance.py input\tes.jpg --scale 4` menghasilkan foto 4x lebih besar tanpa error dan tanpa OOM.
- [ ] Foto dengan wajah + `--face` menghasilkan wajah yang lebih tajam.
- [ ] PNG dengan transparansi tetap mempertahankan alpha.
- [ ] Video pendek (misal 720p, 5 detik) dengan `--scale 2` menghasilkan mp4 yang bisa diputar, durasi sama, **audio tetap ada dan sinkron**.
- [ ] Menghentikan proses video di tengah (Ctrl+C) lalu menjalankan ulang akan **melanjutkan** dan tidak mengulang dari nol.
- [ ] Mode batch pada folder memproses semua file dan tidak berhenti karena satu file rusak.
- [ ] OOM di-handle otomatis (uji dengan `--tile 0` pada gambar besar).
- [ ] `pytest` lulus.
- [ ] README lengkap dan akurat sesuai perilaku aktual.

## 13. Catatan Kualitas Kode

- Type hints dan docstring singkat pada fungsi publik.
- Logging dengan modul `logging` (bukan `print` berserakan), level diatur oleh `-v`.
- Model di-load **sekali** dan dipakai ulang untuk semua frame/file (jangan load ulang per frame).
- Jangan hardcode path absolut; semua relatif terhadap root project.
- Tambahkan `.gitignore` (`.venv/`, `weights/`, `output/`, `.work/`, `__pycache__/`).
- Jangan menambahkan dependency berbayar atau yang memerlukan API key.

## 14. Pengembangan Lanjutan (opsional, setelah semua acceptance criteria lulus)

- GUI sederhana (Gradio atau Streamlit) di atas modul yang sama.
- Opsi interpolasi frame (RIFE) untuk menaikkan FPS video.
- Model denoise/deblur tambahan sebagai pre-processing untuk sumber yang sangat burik.
- Preview sebelum/sesudah (perbandingan side-by-side atau slider).

---

## Cara Menjalankan Agent

Beri agent perintah seperti ini, dengan file ini di folder kerja:

> Baca `PROJECT_SPEC_AI_UPSCALER.md` lalu bangun project-nya di folder `ai-upscaler/`. Jalankan setup, uji semua acceptance criteria di mesin ini, dan perbaiki sampai semuanya lulus. Laporkan hasil tiap kriteria.
