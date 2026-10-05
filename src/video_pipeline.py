"""
Pipeline for video upscaling: frame extraction, per-frame enhancement, re-encoding, and audio merging.
"""
import hashlib
import os
import shutil
import sys
from pathlib import Path
from typing import Optional, Callable

import cv2
import numpy as np
from tqdm import tqdm

from realesrgan import RealESRGANer
from gfpgan import GFPGANer

from src.config import (
    WORK_DIR,
    DEFAULT_SCALE,
    DEFAULT_TILE,
    DEFAULT_FACE_WEIGHT,
    DEFAULT_CRF,
)
from src.ffmpeg_utils import (
    probe_video,
    extract_frames,
    encode_video_from_frames,
    ensure_ffmpeg,
)
from src.image_pipeline import enhance_with_oom_recovery
from src.models import model_manager
from src.utils import (
    logger,
    get_disk_free_bytes,
    format_bytes,
    get_output_filepath,
)


def process_video(
    video_path: Path,
    output_dest: Path,
    scale: int = DEFAULT_SCALE,
    model_name: str = "general-fast",
    face: bool = False,
    face_weight: float = DEFAULT_FACE_WEIGHT,
    tile: int = DEFAULT_TILE,
    fp32: bool = False,
    crf: int = DEFAULT_CRF,
    codec: str = "auto",
    keep_frames: bool = False,
    resume: bool = True,
    start: Optional[float] = None,
    end: Optional[float] = None,
    overwrite: bool = False,
    upsampler: Optional[RealESRGANer] = None,
    face_enhancer: Optional[GFPGANer] = None,
    progress_callback: Optional[Callable[[int, str], None]] = None,
    target_fps: int = 0,
) -> Path:
    """
    Process a video file according to specifications:
    1. Probe metadata (FPS, resolution, duration, audio).
    2. Estimate disk space and warn if insufficient.
    3. Check resolution exceeding 4K and warn.
    4. Extract frames into .work/<video_hash>/frames_in/.
    5. Enhance each frame with resume support and progress bar.
    6. Re-encode video with audio preservation.
    7. Clean up work folder unless keep_frames is True.
    """
    ensure_ffmpeg()

    out_path = get_output_filepath(video_path, output_dest, scale, custom_ext=".mp4")
    if out_path.exists() and not overwrite:
        logger.info(f"File output video sudah ada, lewati: {out_path.name}")
        if progress_callback:
            progress_callback(100, "File video sudah ada, selesai.")
        return out_path

    if progress_callback:
        progress_callback(2, "Menganalisis metadata video...")

    logger.info(f"Memulai pipeline video untuk: {video_path.name}")
    info = probe_video(video_path)
    orig_w, orig_h = info["width"], info["height"]
    fps_rational = info["fps_rational"]
    has_audio = info["has_audio"]
    frame_count = info["frame_count"]

    target_w = orig_w * scale
    target_h = orig_h * scale
    logger.info(
        f"Resolusi asli: {orig_w}x{orig_h} -> Target: {target_w}x{target_h} ({scale}x) | FPS: {fps_rational}"
    )

    # 4K resolution check
    if target_w * target_h > 3840 * 2160:
        logger.warning(
            f"[PERINGATAN] Resolusi target ({target_w}x{target_h}) melebihi 4K (3840x2160)! "
            f"Proses dan encode akan membutuhkan daya komputasi dan ruang disk yang sangat besar. "
            f"Disarankan mempertimbangkan parameter '--scale 2'."
        )

    # Unique work directory based on video stem and path hash
    path_hash = hashlib.md5(str(video_path.resolve()).encode("utf-8")).hexdigest()[:8]
    video_work_dir = WORK_DIR / f"{video_path.stem}_{path_hash}"
    frames_in_dir = video_work_dir / "frames_in"
    frames_out_dir = video_work_dir / "frames_out"

    frames_in_dir.mkdir(parents=True, exist_ok=True)
    frames_out_dir.mkdir(parents=True, exist_ok=True)

    # Estimate disk space
    est_frames = frame_count if frame_count > 0 else 300
    if start is not None or end is not None:
        calc_start = start or 0.0
        calc_end = end or info["duration"]
        est_frames = max(1, int(round((calc_end - calc_start) * info["fps_float"])))

    # Approx 2.5MB per 1080p PNG frame, scaled accordingly
    bytes_per_frame = int(target_w * target_h * 3 * 0.4)
    total_estimated_bytes = est_frames * bytes_per_frame
    free_space = get_disk_free_bytes(video_work_dir)

    logger.info(
        f"Estimasi frame: ~{est_frames} | Kebutuhan disk: ~{format_bytes(total_estimated_bytes)} | "
        f"Ruang disk bebas: {format_bytes(free_space)}"
    )

    if free_space < total_estimated_bytes:
        logger.warning(
            f"[PERINGATAN RUANG DISK] Ruang disk bebas ({format_bytes(free_space)}) "
            f"lebih kecil dari estimasi kebutuhan ({format_bytes(total_estimated_bytes)})! "
            f"Pertimbangkan untuk menggunakan '--scale 2' atau bersihkan drive."
        )

    # Extract frames
    existing_in = list(frames_in_dir.glob("*.png"))
    if not existing_in:
        logger.info(f"Mengekstrak frame dari video...")
        if progress_callback:
            progress_callback(5, "Mengekstrak frame dari video...")
        extracted_count = extract_frames(
            video_path,
            frames_in_dir,
            start=start,
            end=end
        )
        logger.info(f"Berhasil mengekstrak {extracted_count} frame.")
    else:
        logger.info(f"Menggunakan {len(existing_in)} frame yang sudah diekstrak sebelumnya.")

    frame_files = sorted(frames_in_dir.glob("*.png"))
    total_frames = len(frame_files)
    if not frame_files:
        raise RuntimeError("Tidak ada frame yang diekstrak untuk diproses!")

    if progress_callback:
        progress_callback(12, f"Mempersiapkan model AI untuk {total_frames} frame...")

    # Model loading
    if upsampler is None:
        upsampler = model_manager.get_upsampler(
            model_name=model_name,
            tile=tile,
            fp32=fp32
        )

    if face and face_enhancer is None:
        face_enhancer = model_manager.get_face_enhancer(
            target_scale=scale,
            bg_upsampler=upsampler
        )

    logger.info(f"Meningkatkan kualitas frame video (Resume: {resume})...")
    if progress_callback:
        progress_callback(15, f"Memulai upscaling video (0/{total_frames} frame)...")

    # Processing loop with resume support and graceful interrupt
    try:
        pbar = tqdm(frame_files, desc="Upscaling Video", unit="frame")
        for idx, in_frame_path in enumerate(pbar):
            out_frame_path = frames_out_dir / in_frame_path.name
            if resume and out_frame_path.exists() and out_frame_path.stat().st_size > 0:
                pass
            else:
                # Read frame
                data = np.fromfile(str(in_frame_path.resolve()), dtype=np.uint8)
                frame_img = cv2.imdecode(data, cv2.IMREAD_COLOR)
                if frame_img is None:
                    logger.warning(f"Frame rusak atau tidak terbaca: {in_frame_path.name}, dilewati.")
                    continue

                # Enhance frame
                if face:
                    def _run_face():
                        _, _, restored = face_enhancer.enhance(
                            frame_img,
                            has_aligned=False,
                            only_center_face=False,
                            paste_back=True,
                            weight=face_weight,
                        )
                        return restored
                    enhanced = enhance_with_oom_recovery(_run_face, upsampler)
                else:
                    def _run_upscale():
                        output, _ = upsampler.enhance(frame_img, outscale=scale)
                        return output
                    enhanced = enhance_with_oom_recovery(_run_upscale, upsampler)

                # Resize if needed
                if (enhanced.shape[1], enhanced.shape[0]) != (target_w, target_h):
                    enhanced = cv2.resize(enhanced, (target_w, target_h), interpolation=cv2.INTER_LANCZOS4)

                # Save enhanced frame
                success, encoded = cv2.imencode(".png", enhanced, [cv2.IMWRITE_PNG_COMPRESSION, 3])
                if success:
                    encoded.tofile(str(out_frame_path.resolve()))

            if progress_callback:
                pct = 15 + int(((idx + 1) / total_frames) * 73)
                progress_callback(pct, f"Memproses frame {idx + 1}/{total_frames} ({pct}%)")
    except KeyboardInterrupt:
        logger.warning(
            "\n[INTERRUPT] Proses video dihentikan oleh pengguna (Ctrl+C). "
            "Frame yang telah diproses tersimpan di folder kerja untuk melanjutkan proses berikutnya."
        )
        raise

    # Calculate target FPS if requested
    computed_fps = 0
    if target_fps == -2:
        computed_fps = int(round(info["fps_float"] * 2))
    elif target_fps > 0:
        computed_fps = int(target_fps)

    final_target_fps = computed_fps if computed_fps > round(info["fps_float"]) else 0
    fps_msg = f" ({final_target_fps} FPS Motion Interpolation)" if final_target_fps > 0 else ""

    # Encode video
    logger.info(f"Melakukan re-encode frame ke file video: {out_path.name}{fps_msg}...")
    if progress_callback:
        progress_callback(90, f"Meng-encode ulang video{fps_msg} (NVENC / H.264 & audio sync)...")

    encode_video_from_frames(
        frames_dir=frames_out_dir,
        output_video_path=out_path,
        fps_rational=fps_rational,
        crf=crf,
        codec=codec,
        audio_source=video_path,
        has_audio=has_audio,
        start=start,
        end=end,
        target_fps=final_target_fps if final_target_fps > 0 else None,
    )

    logger.info(f"Video upscaling selesai: {out_path}")

    # Cleanup temporary work directory unless keep_frames is requested
    if not keep_frames:
        logger.info(f"Membersihkan frame sementara di {video_work_dir.name}...")
        if progress_callback:
            progress_callback(98, "Membersihkan data kerja sementara...")
        try:
            shutil.rmtree(video_work_dir, ignore_errors=True)
        except Exception as e:
            logger.debug(f"Pembersihan work dir gagal: {e}")
    else:
        logger.info(f"Frame sementara dipertahankan di: {video_work_dir}")

    if progress_callback:
        progress_callback(100, "Selesai!")

    return out_path
