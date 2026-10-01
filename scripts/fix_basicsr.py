"""
Fix for basicsr compatibility with modern torchvision (>=0.17).
Replaces 'torchvision.transforms.functional_tensor' with 'torchvision.transforms.functional'
in basicsr/data/degradations.py.
"""
import sys
import site
import sysconfig
from pathlib import Path

def patch_basicsr() -> bool:
    candidate_paths = []
    
    # Try sysconfig paths
    purelib = sysconfig.get_path("purelib")
    if purelib:
        candidate_paths.append(Path(purelib))
    platlib = sysconfig.get_path("platlib")
    if platlib:
        candidate_paths.append(Path(platlib))
        
    # Try site packages
    try:
        candidate_paths.extend([Path(p) for p in site.getsitepackages()])
    except Exception:
        pass
        
    # Try sys.path
    for p in sys.path:
        path = Path(p)
        if "site-packages" in path.as_posix() or "dist-packages" in path.as_posix():
            candidate_paths.append(path)

    degradations_found = []
    for base in set(candidate_paths):
        target = base / "basicsr" / "data" / "degradations.py"
        if target.exists():
            degradations_found.append(target)

    if not degradations_found:
        print("[patch_basicsr] basicsr/data/degradations.py not found in any site-packages.")
        return False

    success = True
    for degradations_file in degradations_found:
        content = degradations_file.read_text(encoding="utf-8")
        target_str = "from torchvision.transforms.functional_tensor import rgb_to_grayscale"
        replacement_str = "from torchvision.transforms.functional import rgb_to_grayscale"

        if target_str in content:
            content = content.replace(target_str, replacement_str)
            degradations_file.write_text(content, encoding="utf-8")
            print(f"[patch_basicsr] Successfully patched: {degradations_file}")
        elif replacement_str in content:
            print(f"[patch_basicsr] Already patched: {degradations_file}")
        else:
            print(f"[patch_basicsr] Target line not found in: {degradations_file}")

    return success

if __name__ == "__main__":
    success = patch_basicsr()
    sys.exit(0 if success else 1)
