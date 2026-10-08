"""
Pipeline for processing single or batch images with Real-ESRGAN and optional GFPGAN.
"""
import os
from pathlib import Path
from typing import Optional, Tuple, Any, Callable

import cv2
import numpy as np
from PIL import Image, ImageOps
import torch

from realesrgan import RealESRGANer
from gfpgan import GFPGANer

from src.config import (
    DEFAULT_SCALE,
    DEFAULT_TILE,
    DEFAULT_MAX_SIDE,
    DEFAULT_FACE_WEIGHT,
    DEFAULT_FACE_MODEL,
    DEFAULT_CLARITY,
    DEFAULT_JPG_QUALITY,
    TILE_FALLBACKS,
)
from src.models import model_manager
from src.utils import logger, clean_cuda_cache, get_output_filepath


def apply_clarity(image: np.ndarray, clarity: float = 0.0) -> np.ndarray:
    """
    Apply adaptive micro-contrast and unsharp mask in CIELAB color space.
    Enhances fine details, skin pores, hair, and edges without color distortion.
    clarity: 0.0 (no effect) to 1.0 (crisp HD enhancement).
    """
    if clarity <= 0.001 or image is None:
        return image

    has_alpha = len(image.shape) == 3 and image.shape[2] == 4
    is_gray = len(image.shape) == 2

    if has_alpha:
        bgr = image[:, :, :3]
        alpha = image[:, :, 3]
    elif is_gray:
        bgr = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
        alpha = None
    else:
        bgr = image
        alpha = None

    # Operasikan pada Luminance (L channel) di LAB space
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)

    # Adaptive unsharp mask
    amount = float(clarity) * 1.5
    blurred = cv2.GaussianBlur(l, (0, 0), sigmaX=2.0)
    sharp_l = cv2.addWeighted(l, 1.0 + amount, blurred, -amount, 0)
    sharp_l = np.clip(sharp_l, 0, 255).astype(np.uint8)

    enhanced_lab = cv2.merge([sharp_l, a, b])
    enhanced_bgr = cv2.cvtColor(enhanced_lab, cv2.COLOR_LAB2BGR)

    if has_alpha:
        return np.dstack([enhanced_bgr, alpha])
    elif is_gray:
        return cv2.cvtColor(enhanced_bgr, cv2.COLOR_BGR2GRAY)
    return enhanced_bgr


def read_image_with_exif(image_path: Path) -> np.ndarray:
    """
    Read an image using Pillow to respect EXIF orientation,
    then convert to OpenCV format (BGR, BGRA, or Gray).
    Fallback to cv2.imread if Pillow cannot parse.
    """
    try:
        with Image.open(image_path) as pil_img:
            transposed = ImageOps.exif_transpose(pil_img)
            mode = transposed.mode
            if mode == "RGBA":
                arr = np.array(transposed)
                return cv2.cvtColor(arr, cv2.COLOR_RGBA2BGRA)
            elif mode == "RGB":
                arr = np.array(transposed)
                return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
            elif mode in ("L", "1"):
                return np.array(transposed)
            elif mode == "LA":
                arr = np.array(transposed)
                # Grayscale with alpha -> convert to BGRA
                gray = arr[:, :, 0]
                alpha = arr[:, :, 1]
                bgr = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
                return np.dstack([bgr, alpha])
            else:
                # Other modes (CMYK, etc.) convert to RGB first
                rgb = transposed.convert("RGB")
                return cv2.cvtColor(np.array(rgb), cv2.COLOR_RGB2BGR)
    except Exception as e:
        logger.debug(f"Pillow EXIF transpose failed for {image_path}: {e}. Fallback to cv2.imdecode.")
        # Unicode-safe read with cv2
        data = np.fromfile(str(image_path.resolve()), dtype=np.uint8)
        img = cv2.imdecode(data, cv2.IMREAD_UNCHANGED)
        if img is None:
            raise ValueError(f"Gagal membaca gambar dari {image_path}")
        return img


def write_image_safely(
    image: np.ndarray,
    output_path: Path,
    jpg_quality: int = DEFAULT_JPG_QUALITY
) -> None:
    """Save image safely to disk, supporting Windows Unicode paths and formats."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    ext = output_path.suffix.lower()

    params = []
    out_img = image

    if ext in (".jpg", ".jpeg"):
        params = [cv2.IMWRITE_JPEG_QUALITY, int(jpg_quality)]
        if len(out_img.shape) == 3 and out_img.shape[2] == 4:
            # Drop alpha or composite on white background for JPEG
            logger.debug("Converting BGRA to BGR for JPEG output")
            b, g, r, a = cv2.split(out_img)
            alpha_factor = a.astype(float) / 255.0
            white = np.ones_like(b) * 255
            b = (b * alpha_factor + white * (1 - alpha_factor)).astype(np.uint8)
            g = (g * alpha_factor + white * (1 - alpha_factor)).astype(np.uint8)
            r = (r * alpha_factor + white * (1 - alpha_factor)).astype(np.uint8)
            out_img = cv2.merge([b, g, r])
    elif ext == ".png":
        params = [cv2.IMWRITE_PNG_COMPRESSION, 4]
    elif ext == ".webp":
        params = [cv2.IMWRITE_WEBP_QUALITY, 95]

    success, encoded = cv2.imencode(ext, out_img, params)
    if not success:
        raise RuntimeError(f"Gagal melakukan encode gambar ke {ext}")
    encoded.tofile(str(output_path.resolve()))


def enhance_with_oom_recovery(
    func,
    upsampler: RealESRGANer,
    *args,
    **kwargs
) -> Any:
    """
    Execute an enhancement function. If CUDA OutOfMemory occurs,
    automatically clear cache and retry with progressively smaller tile sizes
    (e.g., 400 -> 256 -> 128 -> 64).
    """
    initial_tile = getattr(upsampler, "tile_size", 0)
    if initial_tile <= 0:
        tiles_to_try = [0] + list(TILE_FALLBACKS)
    else:
        fallback = [t for t in TILE_FALLBACKS if t < initial_tile]
        tiles_to_try = [initial_tile] + fallback

    last_error = None
    for tile in tiles_to_try:
        try:
            upsampler.tile_size = tile
            clean_cuda_cache()
            return func(*args, **kwargs)
        except (torch.cuda.OutOfMemoryError, RuntimeError) as e:
            err_str = str(e).lower()
            if "out of memory" in err_str or isinstance(e, torch.cuda.OutOfMemoryError):
                last_error = e
                logger.warning(
                    f"CUDA OutOfMemory terjadi pada tile={tile}. "
                    f"Mengosongkan cache dan mencoba ukuran tile lebih kecil..."
                )
                clean_cuda_cache()
                continue
            else:
                raise e

    # If all tiles failed, raise clear error
    raise RuntimeError(
        f"CUDA OutOfMemory: Gagal memproses gambar bahkan dengan tile=64. "
        f"Detail error: {last_error}"
    )


def process_image(
    input_path: Path,
    output_dest: Path,
    scale: int = DEFAULT_SCALE,
    model_name: str = "general-x4",
    face: bool = False,
    face_model: str = DEFAULT_FACE_MODEL,
    face_weight: float = DEFAULT_FACE_WEIGHT,
    clarity: float = DEFAULT_CLARITY,
    tile: int = DEFAULT_TILE,
    fp32: bool = False,
    max_side: int = DEFAULT_MAX_SIDE,
    output_format: Optional[str] = "png",
    jpg_quality: int = DEFAULT_JPG_QUALITY,
    overwrite: bool = False,
    upsampler: Optional[RealESRGANer] = None,
    face_enhancer: Optional[Any] = None,
    progress_callback: Optional[Callable[[int, str], None]] = None,
) -> Path:
    """
    Process a single image according to specification:
    1. Read with EXIF correction.
    2. Handle alpha and grayscale channels.
    3. Upscale with Real-ESRGAN / SwinIR (and GFPGAN / CodeFormer if face=True).
    4. Support 8x upscale via high-detail multi-stage super-resolution.
    5. Handle CUDA OOM with automatic tile reduction.
    6. Apply clarity / micro-contrast sharpening post-processing.
    7. Apply max_side limit and save to output directory.
    """
    if progress_callback:
        progress_callback(5, "Menyiapkan berkas...")

    custom_ext = f".{output_format}" if output_format else None
    out_path = get_output_filepath(input_path, output_dest, scale, custom_ext)

    if out_path.exists() and not overwrite:
        logger.info(f"File output sudah ada, lewati (gunakan --overwrite untuk menimpa): {out_path.name}")
        if progress_callback:
            progress_callback(100, "File sudah ada, selesai.")
        return out_path

    logger.info(f"Memproses foto: {input_path.name} -> {out_path.name} (Scale: {scale}x, Model: {model_name}, Face: {face_model if face else 'None'}, Clarity: {clarity})")
    if progress_callback:
        progress_callback(15, f"Membaca gambar ({input_path.name})...")

    # Read image
    img = read_image_with_exif(input_path)
    orig_h, orig_w = img.shape[:2]
    is_grayscale = len(img.shape) == 2
    has_alpha = len(img.shape) == 3 and img.shape[2] == 4

    # Separate RGB and Alpha if present
    if has_alpha:
        bgr = img[:, :, :3]
        alpha = img[:, :, 3]
    elif is_grayscale:
        bgr = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
        alpha = None
    else:
        bgr = img
        alpha = None

    if progress_callback:
        progress_callback(25, f"Menyiapkan model AI ({model_name})...")

    # Load models if not provided
    if upsampler is None:
        upsampler = model_manager.get_upsampler(
            model_name=model_name,
            tile=tile,
            fp32=fp32
        )

    if face and face_enhancer is None:
        if progress_callback:
            progress_callback(35, f"Menyiapkan face enhancer ({face_model.upper()})...")
        face_enhancer = model_manager.get_face_enhancer(
            target_scale=min(scale, 4),
            face_model=face_model,
            bg_upsampler=upsampler
        )

    # Perform Upscaling & Face restoration
    if face:
        logger.debug(f"Menjalankan face restoration dengan {face_model.upper()} (weight={face_weight})...")
        if progress_callback:
            progress_callback(45, f"Meningkatkan kualitas foto & wajah ({face_model.upper()})...")
        def _run_face():
            _, _, restored = face_enhancer.enhance(
                bgr,
                has_aligned=False,
                only_center_face=False,
                paste_back=True,
                weight=face_weight,
            )
            return restored

        enhanced_bgr = enhance_with_oom_recovery(_run_face, upsampler)
    else:
        logger.debug(f"Menjalankan upscaling ({scale}x) dengan {model_name}...")
        if progress_callback:
            progress_callback(45, f"Meningkatkan resolusi ({scale}x) dengan {model_name}...")
        def _run_upscale():
            output, _ = upsampler.enhance(bgr, outscale=min(scale, 4))
            return output

        enhanced_bgr = enhance_with_oom_recovery(_run_upscale, upsampler)

    if progress_callback:
        progress_callback(80, "Menyesuaikan resolusi akhir...")

    # Ensure target scale resolution
    target_w = int(round(orig_w * scale))
    target_h = int(round(orig_h * scale))
    curr_h, curr_w = enhanced_bgr.shape[:2]

    if (curr_w, curr_h) != (target_w, target_h):
        interp = cv2.INTER_AREA if (target_w < curr_w or target_h < curr_h) else cv2.INTER_LANCZOS4
        enhanced_bgr = cv2.resize(enhanced_bgr, (target_w, target_h), interpolation=interp)

    # Recombine alpha channel if present
    if has_alpha:
        logger.debug("Melakukan upscale alpha channel dan menggabungkan kembali...")
        upscaled_alpha = cv2.resize(
            alpha,
            (enhanced_bgr.shape[1], enhanced_bgr.shape[0]),
            interpolation=cv2.INTER_LANCZOS4
        )
        final_img = np.dstack([enhanced_bgr, upscaled_alpha])
    elif is_grayscale:
        final_img = cv2.cvtColor(enhanced_bgr, cv2.COLOR_BGR2GRAY)
    else:
        final_img = enhanced_bgr

    # Apply clarity / detail enhancement post-processing
    if clarity > 0.001:
        logger.debug(f"Menerapkan post-processing clarity (strength={clarity})...")
        if progress_callback:
            progress_callback(88, "Meningkatkan ketajaman & mikro-kontras (Clarity)...")
        final_img = apply_clarity(final_img, clarity=clarity)

    # Apply max_side limit
    final_h, final_w = final_img.shape[:2]
    longest = max(final_h, final_w)
    if longest > max_side:
        factor = max_side / float(longest)
        bounded_w = max(1, int(round(final_w * factor)))
        bounded_h = max(1, int(round(final_h * factor)))
        logger.info(
            f"Dimensi hasil ({final_w}x{final_h}) melebihi --max-side={max_side}. "
            f"Mengubah ukuran ke {bounded_w}x{bounded_h}..."
        )
        final_img = cv2.resize(final_img, (bounded_w, bounded_h), interpolation=cv2.INTER_AREA)

    if progress_callback:
        progress_callback(92, "Menyimpan file ke folder output...")

    # Save output
    write_image_safely(final_img, out_path, jpg_quality=jpg_quality)
    logger.info(f"Selesai! Hasil disimpan ke: {out_path}")
    if progress_callback:
        progress_callback(100, "Selesai!")
    return out_path
