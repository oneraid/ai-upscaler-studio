"""
Utility functions for logging, device checking, memory management, and file handling.
"""
import logging
import os
import shutil
import sys
from pathlib import Path
from typing import Optional, Dict, Any, Tuple

import torch

from src.config import IMAGE_EXTENSIONS, VIDEO_EXTENSIONS

logger = logging.getLogger("ai_upscaler")


def setup_logging(verbose: bool = False) -> None:
    """Configure console logging level and format."""
    level = logging.DEBUG if verbose else logging.INFO
    format_str = "[%(levelname)s] %(message)s" if not verbose else "[%(levelname)s] %(asctime)s - %(name)s - %(message)s"
    
    # Remove existing handlers to avoid duplicates
    root_logger = logging.getLogger()
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)
        
    logging.basicConfig(level=level, format=format_str, stream=sys.stdout)
    logger.setLevel(level)


def is_cuda_available() -> bool:
    """Check if CUDA is available."""
    return torch.cuda.is_available()


def get_gpu_info() -> Dict[str, Any]:
    """Get GPU name and memory information if available."""
    if not is_cuda_available():
        return {
            "available": False,
            "name": "None (CPU Mode)",
            "vram_total_mb": 0,
            "vram_free_mb": 0,
        }
    
    device_name = torch.cuda.get_device_name(0)
    total_mem = torch.cuda.get_device_properties(0).total_memory / (1024 ** 2)
    return {
        "available": True,
        "name": device_name,
        "vram_total_mb": round(total_mem, 1),
    }


def clean_cuda_cache() -> None:
    """Empty CUDA cache if CUDA is active."""
    if is_cuda_available():
        try:
            torch.cuda.empty_cache()
            torch.cuda.ipc_collect()
        except Exception:
            pass


def get_disk_free_bytes(path: Path) -> int:
    """Get free disk space in bytes for the drive containing path."""
    resolved = path.resolve()
    # Find existing ancestor directory
    while not resolved.exists() and resolved.parent != resolved:
        resolved = resolved.parent
    usage = shutil.disk_usage(resolved)
    return usage.free


def format_bytes(num_bytes: int) -> str:
    """Format bytes into human-readable string (KB, MB, GB)."""
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if abs(num_bytes) < 1024.0:
            return f"{num_bytes:3.1f} {unit}"
        num_bytes /= 1024.0
    return f"{num_bytes:.1f} PB"


def is_image_file(path: Path) -> bool:
    """Check if path is a supported image file."""
    return path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS


def is_video_file(path: Path) -> bool:
    """Check if path is a supported video file."""
    return path.is_file() and path.suffix.lower() in VIDEO_EXTENSIONS


def get_output_filepath(
    input_path: Path,
    output_dest: Path,
    scale: int,
    custom_ext: Optional[str] = None
) -> Path:
    """
    Compute output file path according to specifications:
    If output_dest is a directory (or has no suffix), filename is <name>_x<scale>.<ext>.
    If output_dest has a file suffix, use output_dest directly.
    """
    stem = input_path.stem
    target_ext = custom_ext if custom_ext else input_path.suffix.lower()
    if not target_ext.startswith("."):
        target_ext = f".{target_ext}"

    if output_dest.suffix:
        # User specified an exact output filename
        out_file = output_dest
        out_file.parent.mkdir(parents=True, exist_ok=True)
        return out_file

    output_dest.mkdir(parents=True, exist_ok=True)
    return output_dest / f"{stem}_x{scale}{target_ext}"
