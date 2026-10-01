"""
Model loading, automatic weight downloading, caching, and model instantiation.
"""
import os
import sys
from pathlib import Path
from typing import Optional, Dict, Any

import requests
import torch
from tqdm import tqdm

from basicsr.archs.rrdbnet_arch import RRDBNet
from realesrgan.archs.srvgg_arch import SRVGGNetCompact
from realesrgan import RealESRGANer
from gfpgan import GFPGANer

from src.config import (
    MODEL_REGISTRY,
    WEIGHTS_DIR,
    DEFAULT_TILE,
    DEFAULT_TILE_PAD,
    DEFAULT_PRE_PAD,
)
from src.utils import logger, is_cuda_available, clean_cuda_cache


def download_file(url: str, dest_path: Path, desc: Optional[str] = None) -> Path:
    """Download a file with a progress bar and atomic write."""
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    if dest_path.exists() and dest_path.stat().st_size > 0:
        return dest_path

    temp_path = dest_path.with_suffix(dest_path.suffix + ".download")
    desc = desc or dest_path.name
    logger.info(f"Downloading {desc} from {url}...")

    try:
        response = requests.get(url, stream=True, timeout=60)
        response.raise_for_status()
        total_size = int(response.headers.get("content-length", 0))

        with open(temp_path, "wb") as f, tqdm(
            desc=desc,
            total=total_size,
            unit="B",
            unit_scale=True,
            unit_divisor=1024,
            leave=True,
        ) as bar:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    bar.update(len(chunk))

        temp_path.replace(dest_path)
        logger.info(f"Successfully downloaded {dest_path.name}")
        return dest_path
    except Exception as e:
        if temp_path.exists():
            temp_path.unlink()
        logger.error(f"Failed to download {url}: {e}")
        raise


def get_model_weights_path(model_name: str) -> Path:
    """Get path to model weights file, downloading it if not present."""
    if model_name not in MODEL_REGISTRY:
        raise ValueError(
            f"Unknown model: '{model_name}'. Choose from: {list(MODEL_REGISTRY.keys())}"
        )
    
    info = MODEL_REGISTRY[model_name]
    weights_path = WEIGHTS_DIR / info["filename"]
    if not weights_path.exists():
        download_file(info["url"], weights_path, desc=info["filename"])
    return weights_path


class ModelManager:
    """
    Manages and caches loaded RealESRGAN and GFPGAN models
    so they are loaded only once and reused across frames/files.
    """
    def __init__(self):
        self._upsamplers: Dict[str, RealESRGANer] = {}
        self._face_enhancers: Dict[str, GFPGANer] = {}

    def get_upsampler(
        self,
        model_name: str = "general-x4",
        tile: int = DEFAULT_TILE,
        fp32: bool = False,
        device: Optional[torch.device] = None,
    ) -> RealESRGANer:
        """Get or load a cached RealESRGANer instance."""
        cuda_ok = is_cuda_available()
        if not cuda_ok:
            logger.warning(
                "=" * 60 + "\n"
                "[PERINGATAN] CUDA TIDAK TERSEDIA!\n"
                "Proses akan berjalan pada CPU dan akan SANGAT LAMBAT.\n"
                "=" * 60
            )
            device = torch.device("cpu")
            half = False
        else:
            device = device or torch.device("cuda")
            half = not fp32

        cache_key = f"{model_name}_{half}_{tile}_{device}"
        if cache_key in self._upsamplers:
            return self._upsamplers[cache_key]

        weights_path = get_model_weights_path(model_name)
        model_info = MODEL_REGISTRY[model_name]
        arch = model_info["arch"]
        arch_params = model_info["arch_params"]
        scale = model_info["scale"]

        if arch == "RRDBNet":
            model_net = RRDBNet(**arch_params)
        elif arch == "SRVGGNetCompact":
            model_net = SRVGGNetCompact(**arch_params)
        else:
            raise ValueError(f"Unsupported architecture: {arch}")

        logger.info(
            f"Loading model '{model_name}' (Arch: {arch}, Half: {half}, Tile: {tile}, Device: {device})..."
        )

        upsampler = RealESRGANer(
            scale=scale,
            model_path=str(weights_path),
            model=model_net,
            tile=tile,
            tile_pad=DEFAULT_TILE_PAD,
            pre_pad=DEFAULT_PRE_PAD,
            half=half,
            device=device,
        )

        self._upsamplers[cache_key] = upsampler
        return upsampler

    def get_face_enhancer(
        self,
        target_scale: int = 4,
        bg_upsampler: Optional[RealESRGANer] = None,
        device: Optional[torch.device] = None,
    ) -> GFPGANer:
        """Get or load a cached GFPGANer face restorer instance."""
        cuda_ok = is_cuda_available()
        device = device or (torch.device("cuda") if cuda_ok else torch.device("cpu"))
        weights_path = get_model_weights_path("face")

        cache_key = f"face_{target_scale}_{id(bg_upsampler)}_{device}"
        if cache_key in self._face_enhancers:
            return self._face_enhancers[cache_key]

        logger.info(f"Loading GFPGAN face enhancer (Target scale: {target_scale})...")
        face_enhancer = GFPGANer(
            model_path=str(weights_path),
            upscale=target_scale,
            arch="clean",
            channel_multiplier=2,
            bg_upsampler=bg_upsampler,
            device=device,
        )
        self._face_enhancers[cache_key] = face_enhancer
        return face_enhancer


# Global model manager singleton
model_manager = ModelManager()
