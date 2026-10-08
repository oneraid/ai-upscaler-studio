"""
Configuration, constants, paths, and model registry for AI Upscaler.
"""
from pathlib import Path
from typing import Dict, Any

# Base directories
PROJECT_ROOT = Path(__file__).resolve().parent.parent
WEIGHTS_DIR = PROJECT_ROOT / "weights"
OUTPUT_DIR = PROJECT_ROOT / "output"
PHOTO_OUTPUT_DIR = OUTPUT_DIR / "photo"
VIDEO_OUTPUT_DIR = OUTPUT_DIR / "video"
INPUT_DIR = PROJECT_ROOT / "input"
WORK_DIR = PROJECT_ROOT / ".work"

# Pastikan folder output dan subfolder photo/video tersedia
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
PHOTO_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
VIDEO_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Supported file formats
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}
VIDEO_EXTENSIONS = {".mp4", ".mkv", ".mov", ".avi", ".webm", ".flv", ".wmv"}

# Model registry
# Official release URLs from xinntao/Real-ESRGAN and TencentARC/GFPGAN
MODEL_REGISTRY: Dict[str, Dict[str, Any]] = {
    "general-x4": {
        "filename": "RealESRGAN_x4plus.pth",
        "url": "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth",
        "arch": "RRDBNet",
        "scale": 4,
        "arch_params": {
            "num_in_ch": 3,
            "num_out_ch": 3,
            "num_feat": 64,
            "num_block": 23,
            "num_grow_ch": 32,
            "scale": 4,
        },
        "description": "General photos, highest quality (RRDBNet)",
    },
    "general-fast": {
        "filename": "realesr-general-x4v3.pth",
        "url": "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-general-x4v3.pth",
        "arch": "SRVGGNetCompact",
        "scale": 4,
        "arch_params": {
            "num_in_ch": 3,
            "num_out_ch": 3,
            "num_feat": 64,
            "num_conv": 32,
            "upscale": 4,
            "act_type": "prelu",
        },
        "description": "Fast and lightweight, best for video (SRVGGNetCompact)",
    },
    "anime": {
        "filename": "RealESRGAN_x4plus_anime_6B.pth",
        "url": "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.2.4/RealESRGAN_x4plus_anime_6B.pth",
        "arch": "RRDBNet",
        "scale": 4,
        "arch_params": {
            "num_in_ch": 3,
            "num_out_ch": 3,
            "num_feat": 64,
            "num_block": 6,
            "num_grow_ch": 32,
            "scale": 4,
        },
        "description": "Optimized for anime / illustrations (6-block RRDBNet)",
    },
    "swinir-x4": {
        "filename": "003_realSR_BSRGAN_DFOWMFC_s64w8_SwinIR-M_x4_GAN.pth",
        "url": "https://github.com/JingyunLiang/SwinIR/releases/download/v0.0/003_realSR_BSRGAN_DFOWMFC_s64w8_SwinIR-M_x4_GAN.pth",
        "arch": "SwinIR",
        "scale": 4,
        "arch_params": {
            "upscale": 4,
            "in_chans": 3,
            "img_size": 64,
            "window_size": 8,
            "img_range": 1.0,
            "depths": [6, 6, 6, 6, 6, 6],
            "embed_dim": 180,
            "num_heads": [6, 6, 6, 6, 6, 6],
            "mlp_ratio": 2,
            "upsampler": "nearest+conv",
            "resi_connection": "1conv",
        },
        "description": "SwinIR Transformer, SOTA natural texture & clarity",
    },
    "face": {
        "filename": "GFPGANv1.4.pth",
        "url": "https://github.com/TencentARC/GFPGAN/releases/download/v1.3.0/GFPGANv1.4.pth",
        "arch": "GFPGANv1Clean",
        "scale": 2,
        "arch_params": {
            "channel_multiplier": 2,
        },
        "description": "Face restoration with GFPGAN v1.4",
    },
    "gfpgan": {
        "filename": "GFPGANv1.4.pth",
        "url": "https://github.com/TencentARC/GFPGAN/releases/download/v1.3.0/GFPGANv1.4.pth",
        "arch": "GFPGANv1Clean",
        "scale": 2,
        "arch_params": {
            "channel_multiplier": 2,
        },
        "description": "GFPGAN v1.4 (Smooth & aesthetic face beauty)",
    },
    "codeformer": {
        "filename": "codeformer.pth",
        "url": "https://github.com/sczhou/CodeFormer/releases/download/v0.1.0/codeformer.pth",
        "arch": "CodeFormer",
        "scale": 2,
        "description": "CodeFormer (High fidelity natural details & crisp eyes/skin)",
    },
    "restoreformer": {
        "filename": "RestoreFormer.pth",
        "url": "https://github.com/TencentARC/GFPGAN/releases/download/v1.3.4/RestoreFormer.pth",
        "arch": "RestoreFormer",
        "scale": 2,
        "description": "RestoreFormer Transformer Face Restoration",
    },
}

# Defaults
DEFAULT_SCALE = 4
DEFAULT_TILE = 400
DEFAULT_TILE_PAD = 10
DEFAULT_PRE_PAD = 0
DEFAULT_MAX_SIDE = 8192
DEFAULT_FACE_WEIGHT = 0.6
DEFAULT_FACE_MODEL = "gfpgan"
DEFAULT_CLARITY = 0.0
DEFAULT_CRF = 18
DEFAULT_JPG_QUALITY = 95

# Tile fallback sequence for CUDA OOM recovery
TILE_FALLBACKS = [400, 256, 128, 64]
