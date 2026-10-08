"""
Architecture definitions for AI Upscaler Studio:
- SwinIR
- CodeFormer
- VQGAN
"""
from src.archs.swinir_arch import SwinIR, SwinIRWrapper
from src.archs.codeformer_arch import CodeFormer

__all__ = ["SwinIR", "SwinIRWrapper", "CodeFormer"]
