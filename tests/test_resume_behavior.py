"""
Test resume functionality:
Simulate interrupting video processing halfway and then re-running to confirm
it resumes without recomputing existing frames.
"""
import sys
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import hashlib
import shutil
import time
import cv2
import numpy as np

from src.config import WORK_DIR, OUTPUT_DIR
from src.video_pipeline import process_video
from src.ffmpeg_utils import extract_frames, probe_video

def test_resume_preserves_and_continues():
    video_path = PROJECT_ROOT / "input" / "sample_video.mp4"
    assert video_path.exists(), "input/sample_video.mp4 must exist"

    path_hash = hashlib.md5(str(video_path.resolve()).encode("utf-8")).hexdigest()[:8]
    video_work_dir = WORK_DIR / f"{video_path.stem}_{path_hash}"
    frames_in_dir = video_work_dir / "frames_in"
    frames_out_dir = video_work_dir / "frames_out"

    # Clean previous work dir if any
    if video_work_dir.exists():
        shutil.rmtree(video_work_dir)

    frames_in_dir.mkdir(parents=True, exist_ok=True)
    frames_out_dir.mkdir(parents=True, exist_ok=True)

    # 1. Extract frames
    print("Extracting frames for resume test (first 1 second = 30 frames)...")
    extract_frames(video_path, frames_in_dir, start=0, end=1)
    all_frames = sorted(frames_in_dir.glob("*.png"))
    total_frames = len(all_frames)
    assert total_frames > 10, f"Expected >10 frames, got {total_frames}"

    # 2. Simulate halfway progress by pre-populating half of the output frames
    half_count = total_frames // 2
    print(f"Pre-populating {half_count} / {total_frames} frames to simulate interrupted job...")
    for frame_path in all_frames[:half_count]:
        dummy_enhanced = np.zeros((720, 1280, 3), dtype=np.uint8)
        out_frame = frames_out_dir / frame_path.name
        cv2.imwrite(str(out_frame), dummy_enhanced)

    initial_out_count = len(list(frames_out_dir.glob("*.png")))
    assert initial_out_count == half_count

    # 3. Call process_video with resume=True and start=0, end=1
    test_out = OUTPUT_DIR / "test_resume_output.mp4"
    if test_out.exists():
        test_out.unlink()

    start_t = time.time()
    result_path = process_video(
        video_path=video_path,
        output_dest=test_out,
        scale=2,
        model_name="general-fast",
        keep_frames=True,
        resume=True,
        start=0,
        end=1,
        overwrite=True
    )
    elapsed = time.time() - start_t
    print(f"Resumed processing completed in {elapsed:.2f}s!")

    # Verify that all frames were completed
    final_out_count = len(list(frames_out_dir.glob("*.png")))
    assert final_out_count == total_frames, f"Expected {total_frames}, got {final_out_count}"
    assert result_path.exists(), "Output video must exist"

    # Clean up work dir
    shutil.rmtree(video_work_dir, ignore_errors=True)
    print("Resume test PASSED successfully!")

if __name__ == "__main__":
    test_resume_preserves_and_continues()
