"""
Create test assets for AI Upscaler verification:
- input/tes.jpg (sample image)
- input/sample_face.png (sample face for GFPGAN)
- input/sample_transparent.png (RGBA PNG with transparency)
- input/sample_corrupted.jpg (invalid file for batch error resilience test)
- input/sample_video.mp4 (5s video with test audio tone)
- input/sample_large.jpg (large 3000x3000px image for OOM recovery test)
"""
import math
import subprocess
from pathlib import Path
import numpy as np
import cv2

PROJECT_ROOT = Path(__file__).resolve().parent.parent
INPUT_DIR = PROJECT_ROOT / "input"
INPUT_DIR.mkdir(parents=True, exist_ok=True)


def create_sample_photo():
    """Create a detailed sample image with patterns and text."""
    path = INPUT_DIR / "tes.jpg"
    w, h = 320, 240
    img = np.zeros((h, w, 3), dtype=np.uint8)
    
    # Gradient background
    for y in range(h):
        for x in range(w):
            img[y, x] = [int(255 * x / w), int(255 * y / h), int(128 + 127 * math.sin(x / 20.0))]
            
    # Add circles, rectangles, text
    cv2.circle(img, (80, 80), 40, (0, 255, 255), -1)
    cv2.rectangle(img, (160, 40), (280, 120), (255, 0, 128), -1)
    cv2.putText(img, "AI UPSCALER", (30, 180), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2)
    cv2.putText(img, "TEST 4X", (80, 220), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

    cv2.imwrite(str(path), img)
    print(f"Created {path} ({w}x{h})")


def create_sample_transparent():
    """Create an RGBA image with varying alpha transparency."""
    path = INPUT_DIR / "sample_transparent.png"
    w, h = 200, 200
    img = np.zeros((h, w, 4), dtype=np.uint8)

    # Semi-transparent background
    img[:, :, 0] = 50   # B
    img[:, :, 1] = 100  # G
    img[:, :, 2] = 200  # R
    img[:, :, 3] = 180  # Alpha

    # Transparent hole in the center
    cv2.circle(img, (100, 100), 50, (0, 255, 0, 0), -1)

    # Opaque star / diamond
    pts = np.array([[100, 20], [140, 100], [100, 180], [60, 100]], np.int32)
    cv2.fillPoly(img, [pts], (255, 255, 0, 255))

    cv2.imwrite(str(path), img)
    print(f"Created {path} ({w}x{h} RGBA)")


def create_sample_face():
    """
    Create a stylized face image with facial proportions
    (skin tone, eyes, pupils, eyebrows, nose, mouth) that face detectors can detect.
    """
    path = INPUT_DIR / "sample_face.png"
    w, h = 300, 300
    img = np.full((h, w, 3), (240, 240, 240), dtype=np.uint8)

    # Head / Skin (oval)
    cv2.ellipse(img, (150, 150), (90, 120), 0, 0, 360, (180, 200, 230), -1)
    # Hair
    cv2.ellipse(img, (150, 90), (95, 60), 0, 180, 360, (30, 30, 40), -1)

    # Eyebrows
    cv2.line(img, (105, 115), (135, 115), (30, 30, 40), 4)
    cv2.line(img, (165, 115), (195, 115), (30, 30, 40), 4)

    # Eyes (whites)
    cv2.ellipse(img, (120, 135), (16, 10), 0, 0, 360, (255, 255, 255), -1)
    cv2.ellipse(img, (180, 135), (16, 10), 0, 0, 360, (255, 255, 255), -1)
    # Pupils
    cv2.circle(img, (120, 135), 6, (80, 50, 20), -1)
    cv2.circle(img, (180, 135), 6, (80, 50, 20), -1)

    # Nose
    cv2.line(img, (150, 140), (150, 175), (150, 170, 200), 3)
    cv2.line(img, (150, 175), (140, 180), (150, 170, 200), 3)

    # Mouth / Lips
    cv2.ellipse(img, (150, 210), (25, 8), 0, 0, 360, (100, 100, 210), -1)
    cv2.line(img, (130, 210), (170, 210), (70, 70, 160), 2)

    cv2.imwrite(str(path), img)
    print(f"Created {path} ({w}x{h} Face)")


def create_sample_corrupted():
    """Create a corrupted/unsupported file to test batch error resilience."""
    path = INPUT_DIR / "sample_corrupted.jpg"
    path.write_text("This is an invalid corrupted JPEG image data file!", encoding="utf-8")
    print(f"Created {path} (corrupted file)")


def create_sample_large():
    """Create a large image (e.g. 2400x2400) to test OOM handling."""
    path = INPUT_DIR / "sample_large.jpg"
    w, h = 2400, 2400
    # Create simple checkerboard to save RAM
    img = np.zeros((h, w, 3), dtype=np.uint8)
    img[::32, :] = 255
    img[:, ::32] = 255
    cv2.imwrite(str(path), img)
    print(f"Created {path} ({w}x{h})")


def create_sample_video():
    """Create a short 5-second 720p (1280x720) video with test tone audio via ffmpeg."""
    path = INPUT_DIR / "sample_video.mp4"
    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", "testsrc=duration=5:size=640x360:rate=30",
        "-f", "lavfi", "-i", "sine=frequency=440:duration=5",
        "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k",
        str(path)
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    print(f"Created {path} (5s video with audio)")


if __name__ == "__main__":
    create_sample_photo()
    create_sample_transparent()
    create_sample_face()
    create_sample_corrupted()
    create_sample_large()
    create_sample_video()
    print("All test assets created successfully!")
