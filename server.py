"""
FastAPI Backend Server untuk AI Photo & Video Upscaler Studio.
Menyediakan REST API untuk pemrosesan Real-ESRGAN, GFPGAN, dan Video NVENC.
"""
import os
import sys
import time
import shutil
import zipfile
import uuid
import threading
import subprocess
from pathlib import Path
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
import torch
from PIL import Image

# Import modul internal AI Upscaler
from src.config import (
    DEFAULT_SCALE,
    DEFAULT_TILE,
    DEFAULT_FACE_WEIGHT,
    OUTPUT_DIR,
    PHOTO_OUTPUT_DIR,
    VIDEO_OUTPUT_DIR,
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
PHOTO_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
VIDEO_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="AI Upscaler API", version="2.1.0")

# Izinkan CORS untuk mode dev frontend (Vite di port 5173 atau port lain)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Sistem Task / Job Progress untuk tracking progress Real-Time
TASKS: Dict[str, Dict[str, Any]] = {}
TASKS_LOCK = threading.Lock()


def create_task(
    media_type: str = "photo",
    filename: str = "",
    preview_url: str = "",
    model: str = "",
    scale: int = 4,
) -> str:
    task_id = f"task_{int(time.time() * 1000)}_{uuid.uuid4().hex[:6]}"
    with TASKS_LOCK:
        # Bersihkan task lama (> 2 jam)
        now = time.time()
        expired = [k for k, v in TASKS.items() if now - v.get("created_at", now) > 7200]
        for k in expired:
            TASKS.pop(k, None)

        TASKS[task_id] = {
            "task_id": task_id,
            "media_type": media_type,
            "filename": filename,
            "preview_url": preview_url,
            "model": model,
            "scale": scale,
            "status": "processing",
            "progress": 0,
            "message": "Menyiapkan antrean proses...",
            "result": None,
            "error": None,
            "created_at": now,
        }
    return task_id


def update_task(task_id: str, progress: int, message: str):
    with TASKS_LOCK:
        if task_id in TASKS:
            TASKS[task_id]["progress"] = max(0, min(100, int(progress)))
            TASKS[task_id]["message"] = message


def complete_task(task_id: str, result: Dict[str, Any]):
    with TASKS_LOCK:
        if task_id in TASKS:
            TASKS[task_id]["status"] = "completed"
            TASKS[task_id]["progress"] = 100
            TASKS[task_id]["message"] = "Selesai!"
            TASKS[task_id]["result"] = result


def fail_task(task_id: str, error_message: str):
    with TASKS_LOCK:
        if task_id in TASKS:
            TASKS[task_id]["status"] = "failed"
            TASKS[task_id]["message"] = f"Gagal: {error_message}"
            TASKS[task_id]["error"] = error_message


class OpenLocationRequest(BaseModel):
    path: Optional[str] = None
    filename: Optional[str] = None
    media_type: Optional[str] = "photo"  # "photo" | "video" | "batch"


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


@app.get("/api/task/{task_id}")
def get_task_status(task_id: str):
    """Mendapatkan status dan persentase progress terkini dari task."""
    with TASKS_LOCK:
        task = TASKS.get(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task ID tidak ditemukan")
        return dict(task)


@app.get("/api/tasks/active")
def get_active_tasks():
    """Mengembalikan daftar task yang sedang berjalan (processing)."""
    with TASKS_LOCK:
        active = [dict(v) for v in TASKS.values() if v.get("status") == "processing"]
        return {"tasks": active}


# ==========================================
# Worker Functions for Asynchronous Tasks
# ==========================================
def _photo_worker(
    task_id: str,
    input_path: Path,
    model: str,
    scale: int,
    face: bool,
    face_weight: float,
    tile: int,
    format: str,
    quality: int,
    orig_w: int,
    orig_h: int,
):
    start_time = time.time()
    try:
        def _prog(pct, msg):
            update_task(task_id, pct, msg)

        result_path = process_image(
            input_path=input_path,
            output_dest=PHOTO_OUTPUT_DIR,
            scale=int(scale),
            model_name=model,
            face=bool(face),
            face_weight=float(face_weight),
            tile=int(tile),
            output_format=format.lower(),
            jpg_quality=int(quality),
            overwrite=True,
            progress_callback=_prog,
        )

        elapsed = time.time() - start_time
        try:
            with Image.open(result_path) as out_img:
                new_w, new_h = out_img.size
        except Exception:
            new_w, new_h = (0, 0)

        out_size_bytes = result_path.stat().st_size

        res = {
            "success": True,
            "original_url": f"/api/file/input/{input_path.name}",
            "enhanced_url": f"/api/file/output/photo/{result_path.name}",
            "orig_w": orig_w,
            "orig_h": orig_h,
            "new_w": new_w,
            "new_h": new_h,
            "scale": scale,
            "elapsed": round(elapsed, 2),
            "size_formatted": format_bytes(out_size_bytes),
            "filename": result_path.name,
            "absolute_path": str(result_path.resolve()),
            "folder_path": str(PHOTO_OUTPUT_DIR.resolve()),
            "media_type": "photo",
        }
        complete_task(task_id, res)
    except Exception as e:
        logger.error(f"Gagal memproses foto: {e}", exc_info=True)
        fail_task(task_id, str(e))


def _video_worker(
    task_id: str,
    input_path: Path,
    model: str,
    scale: int,
    face: bool,
    face_weight: float,
    tile: int,
    clip_start: Optional[float],
    clip_end: Optional[float],
    orig_w: int,
    orig_h: int,
):
    start_time = time.time()
    try:
        def _prog(pct, msg):
            update_task(task_id, pct, msg)

        result_path = process_video(
            video_path=input_path,
            output_dest=VIDEO_OUTPUT_DIR,
            scale=int(scale),
            model_name=model,
            face=bool(face),
            face_weight=float(face_weight),
            tile=int(tile),
            start=clip_start,
            end=clip_end,
            overwrite=True,
            resume=True,
            progress_callback=_prog,
        )

        elapsed = time.time() - start_time
        out_meta = probe_video(result_path)
        fps_val = out_meta.get("fps_float") or out_meta.get("fps") or 30.0
        out_size_bytes = result_path.stat().st_size

        res = {
            "success": True,
            "video_url": f"/api/file/output/video/{result_path.name}",
            "orig_w": orig_w,
            "orig_h": orig_h,
            "new_w": out_meta.get("width", 0),
            "new_h": out_meta.get("height", 0),
            "fps": round(fps_val, 2),
            "scale": scale,
            "elapsed": round(elapsed, 1),
            "size_formatted": format_bytes(out_size_bytes),
            "filename": result_path.name,
            "absolute_path": str(result_path.resolve()),
            "folder_path": str(VIDEO_OUTPUT_DIR.resolve()),
            "media_type": "video",
        }
        complete_task(task_id, res)
    except Exception as e:
        logger.error(f"Gagal memproses video: {e}", exc_info=True)
        fail_task(task_id, str(e))


def _batch_worker(
    task_id: str,
    temp_files: List[Any],
    model: str,
    scale: int,
    face: bool,
    face_weight: float,
    tile: int,
    format: str,
):
    start_time = time.time()
    try:
        batch_session_dir = WORK_DIR / f"batch_{int(time.time())}"
        batch_session_dir.mkdir(parents=True, exist_ok=True)

        processed_list = []
        errors = []
        total_items = len(temp_files)

        update_task(task_id, 5, f"Memulai pemrosesan {total_items} foto...")

        for idx, (original_filename, temp_in) in enumerate(temp_files):
            pct = 5 + int((idx / total_items) * 82)
            update_task(
                task_id,
                pct,
                f"Memproses foto {idx + 1}/{total_items} ({original_filename})...",
            )
            try:
                res_path = process_image(
                    input_path=temp_in,
                    output_dest=PHOTO_OUTPUT_DIR,
                    scale=int(scale),
                    model_name=model,
                    face=bool(face),
                    face_weight=float(face_weight),
                    tile=int(tile),
                    output_format=format.lower(),
                    overwrite=True,
                )
                # Copy ke batch_session_dir untuk file zip
                shutil.copy2(res_path, batch_session_dir / res_path.name)
                processed_list.append({
                    "name": original_filename,
                    "url": f"/api/file/output/photo/{res_path.name}",
                    "absolute_path": str(res_path.resolve()),
                })
            except Exception as e:
                errors.append(f"{original_filename}: {str(e)}")

        update_task(task_id, 92, "Mengompresi hasil ke arsip ZIP...")
        zip_filename = PHOTO_OUTPUT_DIR / f"batch_{int(time.time())}.zip"
        with zipfile.ZipFile(zip_filename, "w", zipfile.ZIP_DEFLATED) as zipf:
            for p in batch_session_dir.glob(f"*.{format.lower()}"):
                zipf.write(p, arcname=p.name)

        elapsed = time.time() - start_time
        res = {
            "success": True,
            "total": total_items,
            "success_count": len(processed_list),
            "failed_count": len(errors),
            "elapsed": round(elapsed, 1),
            "items": processed_list,
            "zip_url": f"/api/file/output/photo/{zip_filename.name}",
            "errors": errors,
            "absolute_path": str(zip_filename.resolve()),
            "folder_path": str(PHOTO_OUTPUT_DIR.resolve()),
            "media_type": "batch",
        }
        complete_task(task_id, res)
    except Exception as e:
        logger.error(f"Gagal memproses batch: {e}", exc_info=True)
        fail_task(task_id, str(e))


# ==========================================
# Endpoints untuk Upscaling (Asinkron / Task)
# ==========================================
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
    """Menerima unggahan foto dan memprosesnya di latar belakang dengan tracking persentase."""
    file_ext = Path(image.filename).suffix or ".png"
    temp_input_name = f"upload_{int(time.time() * 1000)}{file_ext}"
    input_path = UPLOADS_DIR / temp_input_name

    with open(input_path, "wb") as f:
        shutil.copyfileobj(image.file, f)

    try:
        with Image.open(input_path) as img:
            orig_w, orig_h = img.size
    except Exception:
        orig_w, orig_h = (0, 0)

    task_id = create_task(
        media_type="photo",
        filename=image.filename or "",
        preview_url=f"/api/file/input/{temp_input_name}",
        model=model,
        scale=scale,
    )
    threading.Thread(
        target=_photo_worker,
        args=(
            task_id,
            input_path,
            model,
            scale,
            face,
            face_weight,
            tile,
            format,
            quality,
            orig_w,
            orig_h,
        ),
        daemon=True,
    ).start()

    return {"task_id": task_id, "status": "processing"}


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
    """Menerima unggahan video dan memprosesnya dengan tracking persentase frame per frame."""
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

    task_id = create_task(
        media_type="video",
        filename=video.filename or "",
        preview_url=f"/api/file/input/{temp_input_name}",
        model=model,
        scale=scale,
    )
    threading.Thread(
        target=_video_worker,
        args=(
            task_id,
            input_path,
            model,
            scale,
            face,
            face_weight,
            tile,
            clip_start,
            clip_end,
            orig_w,
            orig_h,
        ),
        daemon=True,
    ).start()

    return {"task_id": task_id, "status": "processing"}


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
    """Memproses banyak foto sekaligus dan membuat file unduhan ZIP dengan progress persentase."""
    if not files:
        raise HTTPException(status_code=400, detail="Tidak ada file yang diunggah.")

    temp_files = []
    for item in files:
        temp_in = UPLOADS_DIR / f"batch_in_{int(time.time()*1000)}_{item.filename}"
        with open(temp_in, "wb") as f:
            shutil.copyfileobj(item.file, f)
        temp_files.append((item.filename, temp_in))

    task_id = create_task(
        media_type="batch",
        filename=f"{len(temp_files)} foto",
        preview_url="",
        model=model,
        scale=scale,
    )
    threading.Thread(
        target=_batch_worker,
        args=(task_id, temp_files, model, scale, face, face_weight, tile, format),
        daemon=True,
    ).start()

    return {"task_id": task_id, "status": "processing"}


# ==========================================
# Endpoints untuk Akses File Lokal (Windows Explorer & Open)
# ==========================================
@app.post("/api/open-folder")
def open_folder_endpoint(req: OpenLocationRequest):
    """Membuka File Explorer pada lokasi file dan menyeleksi file tersebut."""
    target_path = None
    if req.path:
        target_path = Path(req.path)
    elif req.filename:
        if req.media_type == "video":
            target_path = VIDEO_OUTPUT_DIR / req.filename
        else:
            target_path = PHOTO_OUTPUT_DIR / req.filename
        if not target_path.exists():
            target_path = OUTPUT_DIR / req.filename

    # Jika file tidak spesifik ditemukan, buka foldernya langsung
    if not target_path or not target_path.exists():
        fallback_folder = VIDEO_OUTPUT_DIR if req.media_type == "video" else PHOTO_OUTPUT_DIR
        if fallback_folder.exists():
            if sys.platform == "win32":
                os.startfile(str(fallback_folder.resolve()))
            else:
                subprocess.Popen(["xdg-open", str(fallback_folder.resolve())])
            return {"success": True, "opened": str(fallback_folder.resolve())}
        raise HTTPException(status_code=404, detail="File atau folder output tidak ditemukan")

    resolved_path = str(target_path.resolve())
    if sys.platform == "win32":
        # /select,"path" membuka Windows Explorer dengan file terpilih
        subprocess.Popen(f'explorer.exe /select,"{resolved_path}"')
    else:
        subprocess.Popen(["xdg-open", str(target_path.parent.resolve())])
    return {"success": True, "path": resolved_path}


@app.post("/api/open-file")
def open_file_endpoint(req: OpenLocationRequest):
    """Membuka file hasil upscale langsung dengan default app (Windows Photos, VLC, dsb)."""
    target_path = None
    if req.path:
        target_path = Path(req.path)
    elif req.filename:
        if req.media_type == "video":
            target_path = VIDEO_OUTPUT_DIR / req.filename
        else:
            target_path = PHOTO_OUTPUT_DIR / req.filename
        if not target_path.exists():
            target_path = OUTPUT_DIR / req.filename

    if not target_path or not target_path.exists():
        raise HTTPException(status_code=404, detail="File tidak ditemukan")

    resolved_path = str(target_path.resolve())
    if sys.platform == "win32":
        os.startfile(resolved_path)
    else:
        subprocess.Popen(["xdg-open", resolved_path])
    return {"success": True, "path": resolved_path}


# ==========================================
# Endpoints untuk Serving File Output dan Upload
# ==========================================
@app.get("/api/file/output/photo/{filename}")
def get_photo_output_file(filename: str):
    file_path = PHOTO_OUTPUT_DIR / filename
    if not file_path.exists():
        file_path = OUTPUT_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File foto tidak ditemukan")
    return FileResponse(file_path)


@app.get("/api/file/output/video/{filename}")
def get_video_output_file(filename: str):
    file_path = VIDEO_OUTPUT_DIR / filename
    if not file_path.exists():
        file_path = OUTPUT_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File video tidak ditemukan")
    return FileResponse(file_path)


@app.get("/api/file/output/{filename}")
def get_output_file(filename: str):
    for candidate in [
        PHOTO_OUTPUT_DIR / filename,
        VIDEO_OUTPUT_DIR / filename,
        OUTPUT_DIR / filename,
    ]:
        if candidate.exists():
            return FileResponse(candidate)
    raise HTTPException(status_code=404, detail="File output tidak ditemukan")


@app.get("/api/file/input/{filename}")
def get_input_file(filename: str):
    file_path = UPLOADS_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File input tidak ditemukan")
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
    port = int(os.environ.get("PORT", 7860))
    app_url = f"http://127.0.0.1:{port}"
    print("\n=======================================================")
    print("🚀 AI Upscaler Studio (React + FastAPI) Siap")
    print(f"📁 Output Foto  : {PHOTO_OUTPUT_DIR}")
    print(f"📁 Output Video : {VIDEO_OUTPUT_DIR}")
    print(f"🔗 Buka di browser: {app_url}")
    print("=======================================================\n")
    threading.Thread(target=open_browser, args=(app_url,), daemon=True).start()
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")


if __name__ == "__main__":
    main()
