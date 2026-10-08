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
        weights_path = get_model_weights_path(model_name)
        model_info = MODEL_REGISTRY[model_name]
        arch = model_info["arch"]
        arch_params = model_info["arch_params"]
        scale = model_info["scale"]

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

        # SwinIR transformer attention layers overflow in FP16 leading to NaNs (black output).
        # SwinIR must always run in full FP32 precision.
        if arch == "SwinIR":
            half = False

        cache_key = f"{model_name}_{half}_{tile}_{device}"
        if cache_key in self._upsamplers:
            return self._upsamplers[cache_key]

        if arch == "RRDBNet":
            model_net = RRDBNet(**arch_params)
        elif arch == "SRVGGNetCompact":
            model_net = SRVGGNetCompact(**arch_params)
        elif arch == "SwinIR":
            from src.archs.swinir_arch import SwinIR, SwinIRWrapper
            model_net = SwinIR(**arch_params)
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

        # Wrap SwinIR model to guarantee tile dimensions divisible by window_size
        if arch == "SwinIR":
            upsampler.model = SwinIRWrapper(upsampler.model, window_size=arch_params.get("window_size", 8))

        self._upsamplers[cache_key] = upsampler
        return upsampler

    def get_face_enhancer(
        self,
        target_scale: int = 4,
        face_model: str = "gfpgan",
        bg_upsampler: Optional[RealESRGANer] = None,
        device: Optional[torch.device] = None,
    ) -> Any:
        """Get or load a cached face restorer instance (GFPGAN, CodeFormer, or RestoreFormer)."""
        cuda_ok = is_cuda_available()
        device = device or (torch.device("cuda") if cuda_ok else torch.device("cpu"))
        
        # Normalize face model key
        face_key = face_model.lower().strip()
        if face_key not in ("gfpgan", "codeformer", "restoreformer", "face"):
            face_key = "gfpgan"
        
        weights_name = "face" if face_key == "face" else face_key
        weights_path = get_model_weights_path(weights_name)

        cache_key = f"{face_key}_{target_scale}_{id(bg_upsampler)}_{device}"
        if cache_key in self._face_enhancers:
            return self._face_enhancers[cache_key]

        logger.info(f"Loading {face_key.upper()} face enhancer (Target scale: {target_scale})...")
        if face_key == "codeformer":
            face_enhancer = CodeFormerRestorer(
                model_path=str(weights_path),
                upscale=target_scale,
                bg_upsampler=bg_upsampler,
                device=device,
            )
        elif face_key == "restoreformer":
            face_enhancer = GFPGANer(
                model_path=str(weights_path),
                upscale=target_scale,
                arch="RestoreFormer",
                channel_multiplier=2,
                bg_upsampler=bg_upsampler,
                device=device,
            )
        else:
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


class CodeFormerRestorer:
    """Helper for face restoration with CodeFormer model."""
    def __init__(self, model_path: str, upscale: int = 2, bg_upsampler=None, device=None):
        import cv2
        from facexlib.utils.face_restoration_helper import FaceRestoreHelper
        from basicsr.utils import img2tensor, tensor2img
        from torchvision.transforms.functional import normalize
        from src.archs.codeformer_arch import CodeFormer

        self.upscale = upscale
        self.bg_upsampler = bg_upsampler
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu') if device is None else device

        self.codeformer = CodeFormer(
            dim_embd=512, codebook_size=1024, n_head=8, n_layers=9,
            connect_list=['32', '64', '128', '256']
        )
        loadnet = torch.load(model_path, map_location="cpu")
        keyname = 'params_ema' if 'params_ema' in loadnet else ('params' if 'params' in loadnet else None)
        state_dict = loadnet[keyname] if keyname else loadnet
        self.codeformer.load_state_dict(state_dict, strict=True)
        self.codeformer.eval().to(self.device)

        self.face_helper = FaceRestoreHelper(
            upscale_factor=upscale,
            face_size=512,
            crop_ratio=(1, 1),
            det_model='retinaface_resnet50',
            save_ext='png',
            use_parse=True,
            device=self.device,
            model_rootpath='gfpgan/weights'
        )

    @torch.no_grad()
    def enhance(self, img, has_aligned=False, only_center_face=False, paste_back=True, weight=0.6):
        import cv2
        from basicsr.utils import img2tensor, tensor2img
        from torchvision.transforms.functional import normalize

        self.face_helper.clean_all()
        if has_aligned:
            img = cv2.resize(img, (512, 512))
            self.face_helper.cropped_faces = [img]
        else:
            self.face_helper.read_image(img)
            self.face_helper.get_face_landmarks_5(only_center_face=only_center_face, eye_dist_threshold=5)
            self.face_helper.align_warp_face()

        for cropped_face in self.face_helper.cropped_faces:
            cropped_face_t = img2tensor(cropped_face / 255.0, bgr2rgb=True, float32=True)
            normalize(cropped_face_t, (0.5, 0.5, 0.5), (0.5, 0.5, 0.5), inplace=True)
            cropped_face_t = cropped_face_t.unsqueeze(0).to(self.device)

            try:
                output = self.codeformer(cropped_face_t, w=weight, adain=True)[0]
                restored_face = tensor2img(output.squeeze(0), rgb2bgr=True, min_max=(-1, 1))
            except Exception as e:
                logger.warning(f"CodeFormer inference error: {e}")
                restored_face = cropped_face

            restored_face = restored_face.astype('uint8')
            self.face_helper.add_restored_face(restored_face)

        if not has_aligned and paste_back:
            if self.bg_upsampler is not None:
                bg_img = self.bg_upsampler.enhance(img, outscale=self.upscale)[0]
            else:
                bg_img = None
            self.face_helper.get_inverse_affine(None)
            restored_img = self.face_helper.paste_faces_to_input_image(upsample_img=bg_img)
            return self.face_helper.cropped_faces, self.face_helper.restored_faces, restored_img
        else:
            return self.face_helper.cropped_faces, self.face_helper.restored_faces, None


# Global model manager singleton
model_manager = ModelManager()
