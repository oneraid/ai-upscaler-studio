"""
Fetch CodeFormer architecture files from official GitHub repo if needed.
"""
import urllib.request
from pathlib import Path

ARCHS_DIR = Path(__file__).resolve().parent.parent / "src" / "archs"
ARCHS_DIR.mkdir(parents=True, exist_ok=True)

URLS = {
    "codeformer_arch.py": "https://raw.githubusercontent.com/sczhou/CodeFormer/master/basicsr/archs/codeformer_arch.py",
    "vqgan_arch.py": "https://raw.githubusercontent.com/sczhou/CodeFormer/master/basicsr/archs/vqgan_arch.py",
}

for filename, url in URLS.items():
    dest = ARCHS_DIR / filename
    if not dest.exists():
        print(f"Downloading {filename} from {url}...")
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=30) as resp, open(dest, "wb") as f:
                f.write(resp.read())
            print(f"Saved {dest.name} ({dest.stat().st_size} bytes)")
        except Exception as e:
            print(f"Failed to download {filename}: {e}")
    else:
        print(f"{filename} already exists.")
