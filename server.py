"""
FastAPI Backend Server untuk AI Photo & Video Upscaler Studio.
Menyediakan REST API untuk pemrosesan Real-ESRGAN, GFPGAN, dan Video NVENC.
"""
import os
import sys
import time
import shutil
import zipfile
from pathlib import Path
from typing import Optional, List

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
import torch
from PIL import Image

# Import modul internal AI Upscaler
from src.config import (
    DEFAULT_SCALE,
    DEFAULT_TILE,
    DEFAULT_FACE_WEIGHT,
    OUTPUT_DIR,
    WORK_DIR,
    DEFAULT_CRF,
)
from src.image_pipeline import process_image
from src.video_pipeline import process_video
from src.ffmpeg_utils import probe_video
from src.utils import logger, get_disk_free_bytes, format_bytes

# Siapkan direktori kerja
UPLOADS_DIR = WORK_DIR / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="AI Upscaler API", version="2.0.0")

# Izinkan CORS untuk mode dev frontend (Vite di port 5173 atau port lain)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/system")
def get_system_status():
    """Mengembalikan informasi hardware GPU dan sistem."""
    free_bytes = get_disk_free_bytes(Path("."))
    if torch.cuda.is_available():
        gpu_name = torch.cuda.get_device_name(0)
        vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024**3)
        return {
            "has_gpu": True,
            "gpu_name": gpu_name,
            "vram_gb": round(vram_gb, 1),
            "cuda": True,
            "free_disk": format_bytes(free_bytes),
        }
    return {
        "has_gpu": False,
        "gpu_name": "CPU Mode",
        "vram_gb": 0,
        "cuda": False,
        "free_disk": format_bytes(free_bytes),
    }


@app.post("/api/enhance/photo")
async def enhance_photo_api(
    image: UploadFile = File(...),
    model: str = Form("general-x4"),
    scale: int = Form(4),
    face: bool = Form(False),
    face_weight: float = Form(DEFAULT_FACE_WEIGHT),
    tile: int = Form(DEFAULT_TILE),
    format: str = Form("png"),
    quality: int = Form(95),
):
    """Menerima unggahan foto dan memprosesnya dengan Real-ESRGAN/GFPGAN."""
    # Simpan file yang diunggah
    file_ext = Path(image.filename).suffix or ".png"
    temp_input_name = f"upload_{int(time.time() * 1000)}{file_ext}"
    input_path = UPLOADS_DIR / temp_input_name

    with open(input_path, "wb") as f:
        shutil.copyfileobj(image.file, f)

    # Dapatkan dimensi awal
    try:
        with Image.open(input_path) as img:
            orig_w, orig_h = img.size
    except Exception:
        orig_w, orig_h = (0, 0)

    start_time = time.time()
    try:
        result_path = process_image(
            input_path=input_path,
            output_dest=OUTPUT_DIR,
            scale=int(scale),
            model_name=model,
            face=bool(face),
            face_weight=float(face_weight),
            tile=int(tile),
            output_format=format.lower(),
            jpg_quality=int(quality),
            overwrite=True,
        )

        elapsed = time.time() - start_time

        try:
            with Image.open(result_path) as out_img:
                new_w, new_h = out_img.size
        except Exception:
            new_w, new_h = (0, 0)

        out_size_bytes = result_path.stat().st_size

        return {
            "success": True,
            "original_url": f"/api/file/input/{input_path.name}",
            "enhanced_url": f"/api/file/output/{result_path.name}",
            "orig_w": orig_w,
            "orig_h": orig_h,
            "new_w": new_w,
            "new_h": new_h,
            "scale": scale,
            "elapsed": round(elapsed, 2),
            "size_formatted": format_bytes(out_size_bytes),
            "filename": result_path.name,
        }
    except Exception as e:
        logger.error(f"Gagal memproses foto: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/enhance/video")
async def enhance_video_api(
    video: UploadFile = File(...),
    model: str = Form("general-fast"),
    scale: int = Form(2),
    face: bool = Form(False),
    face_weight: float = Form(DEFAULT_FACE_WEIGHT),
    tile: int = Form(DEFAULT_TILE),
    is_trim: bool = Form(False),
    start_sec: float = Form(0.0),
    end_sec: float = Form(5.0),
):
    """Menerima unggahan video dan meningkatkannya dengan NVENC + audio sync."""
    file_ext = Path(video.filename).suffix or ".mp4"
    temp_input_name = f"video_{int(time.time() * 1000)}{file_ext}"
    input_path = UPLOADS_DIR / temp_input_name

    with open(input_path, "wb") as f:
        shutil.copyfileobj(video.file, f)

    meta = probe_video(input_path)
    orig_w = meta.get("width", 0)
    orig_h = meta.get("height", 0)

    clip_start = float(start_sec) if is_trim else None
    clip_end = float(end_sec) if is_trim and end_sec > 0 else None

    start_time = time.time()
    try:
        result_path = process_video(
            video_path=input_path,
            output_dest=OUTPUT_DIR,
            scale=int(scale),
            model_name=model,
            face=bool(face),
            face_weight=float(face_weight),
            tile=int(tile),
            start=clip_start,
            end=clip_end,
            overwrite=True,
            resume=True,
        )

        elapsed = time.time() - start_time
        out_meta = probe_video(result_path)
        fps_val = out_meta.get("fps_float") or out_meta.get("fps") or 30.0
        out_size_bytes = result_path.stat().st_size

        return {
            "success": True,
            "video_url": f"/api/file/output/{result_path.name}",
            "orig_w": orig_w,
            "orig_h": orig_h,
            "new_w": out_meta.get("width", 0),
            "new_h": out_meta.get("height", 0),
            "fps": round(fps_val, 2),
            "scale": scale,
            "elapsed": round(elapsed, 1),
            "size_formatted": format_bytes(out_size_bytes),
            "filename": result_path.name,
        }
    except Exception as e:
        logger.error(f"Gagal memproses video: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/enhance/batch")
async def enhance_batch_api(
    files: List[UploadFile] = File(...),
    model: str = Form("general-x4"),
    scale: int = Form(4),
    face: bool = Form(False),
    face_weight: float = Form(DEFAULT_FACE_WEIGHT),
    tile: int = Form(DEFAULT_TILE),
    format: str = Form("png"),
):
    """Memproses banyak foto sekaligus dan membuat file unduhan ZIP."""
    if not files:
        raise HTTPException(status_code=400, detail="Tidak ada file yang diunggah.")

    batch_session_dir = WORK_DIR / f"batch_{int(time.time())}"
    batch_session_dir.mkdir(parents=True, exist_ok=True)

    processed_list = []
    errors = []
    start_time = time.time()

    for item in files:
        temp_in = UPLOADS_DIR / f"batch_in_{int(time.time()*1000)}_{item.filename}"
        with open(temp_in, "wb") as f:
            shutil.copyfileobj(item.file, f)

        try:
            res_path = process_image(
                input_path=temp_in,
                output_dest=batch_session_dir,
                scale=int(scale),
                model_name=model,
                face=bool(face),
                face_weight=float(face_weight),
                tile=int(tile),
                output_format=format.lower(),
                overwrite=True,
            )
            # Simpan juga ke OUTPUT_DIR
            final_out = OUTPUT_DIR / res_path.name
            shutil.copy2(res_path, final_out)
            processed_list.append({
                "name": item.filename,
                "url": f"/api/file/output/{final_out.name}",
            })
        except Exception as e:
            errors.append(f"{item.filename}: {str(e)}")

    # Buat ZIP file
    zip_filename = OUTPUT_DIR / f"batch_{int(time.time())}.zip"
    with zipfile.ZipFile(zip_filename, "w", zipfile.ZIP_DEFLATED) as zipf:
        for p in batch_session_dir.glob(f"*.{format.lower()}"):
            zipf.write(p, arcname=p.name)

    elapsed = time.time() - start_time

    return {
        "success": True,
        "total": len(files),
        "success_count": len(processed_list),
        "failed_count": len(errors),
        "elapsed": round(elapsed, 1),
        "items": processed_list,
        "zip_url": f"/api/file/output/{zip_filename.name}",
        "errors": errors,
    }


# Endpoints untuk serving file output dan upload
@app.get("/api/file/output/{filename}")
def get_output_file(filename: str):
    file_path = OUTPUT_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File tidak ditemukan")
    return FileResponse(file_path)


@app.get("/api/file/input/{filename}")
def get_input_file(filename: str):
    file_path = UPLOADS_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File tidak ditemukan")
    return FileResponse(file_path)


# Serve frontend bundle jika sudah di-build
DIST_DIR = Path(__file__).resolve().parent / "frontend" / "dist"
if DIST_DIR.exists():
    app.mount("/", StaticFiles(directory=str(DIST_DIR), html=True), name="static")


def open_browser(url: str):
    import webbrowser
    time.sleep(1.2)
    try:
        webbrowser.open(url)
    except Exception:
        pass


def main():
    import uvicorn
    import threading
    port = int(os.environ.get("PORT", 7860))
    app_url = f"http://127.0.0.1:{port}"
    print("\n=======================================================")
    print("🚀 AI Upscaler Studio (React + FastAPI) Siap")
    print(f"🔗 Buka di browser: {app_url}")
    print("=======================================================\n")
    threading.Thread(target=open_browser, args=(app_url,), daemon=True).start()
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")


if __name__ == "__main__":
    main()
