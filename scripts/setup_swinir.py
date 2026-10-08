"""
Setup swinir_arch in src/archs with SwinIRWrapper.
"""
from pathlib import Path

source = Path("e:/Programming/AI Upscaler/.venv/Lib/site-packages/basicsr/archs/swinir_arch.py")
dest = Path("e:/Programming/AI Upscaler/src/archs/swinir_arch.py")

content = source.read_text(encoding="utf-8")

# Replace arch_util import with self-contained helpers
helper_code = '''
import collections.abc
from itertools import repeat

def _ntuple(n):
    def parse(x):
        if isinstance(x, collections.abc.Iterable):
            return x
        return tuple(repeat(x, n))
    return parse

to_2tuple = _ntuple(2)

def trunc_normal_(tensor, mean=0., std=1., a=-2., b=2.):
    return torch.nn.init.trunc_normal_(tensor, mean=mean, std=std, a=a, b=b)
'''

content = content.replace("from .arch_util import to_2tuple, trunc_normal_", helper_code)
# Handle ARCH_REGISTRY if basicsr is not imported
content = content.replace("from basicsr.utils.registry import ARCH_REGISTRY", "try:\n    from basicsr.utils.registry import ARCH_REGISTRY\nexcept ImportError:\n    class _Dummy:\n        def register(self): return lambda c: c\n    ARCH_REGISTRY = _Dummy()")

# Append SwinIRWrapper
wrapper_code = '''

class SwinIRWrapper(nn.Module):
    """
    Wrapper for SwinIR that ensures input tile dimensions are divisible by window_size (8),
    avoiding dimension mismatch errors during window partitioning.
    """
    def __init__(self, swinir_model, window_size=8):
        super().__init__()
        self.model = swinir_model
        self.window_size = window_size
        self.scale = getattr(swinir_model, 'upscale', 4)

    def forward(self, x):
        _, _, h, w = x.size()
        mod_pad_h = (self.window_size - h % self.window_size) % self.window_size
        mod_pad_w = (self.window_size - w % self.window_size) % self.window_size
        if mod_pad_h != 0 or mod_pad_w != 0:
            x = F.pad(x, (0, mod_pad_w, 0, mod_pad_h), 'reflect')
        output = self.model(x)
        if mod_pad_h != 0 or mod_pad_w != 0:
            output = output[:, :, :h * self.scale, :w * self.scale]
        return output
'''
content += wrapper_code

dest.write_text(content, encoding="utf-8")
print(f"Created {dest.name} ({dest.stat().st_size} bytes)")
