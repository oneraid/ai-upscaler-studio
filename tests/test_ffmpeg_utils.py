"""
Unit tests for FFmpeg and FFprobe utility wrappers.
"""
import sys
from pathlib import Path
import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.ffmpeg_utils import (
    check_ffmpeg_installed,
    probe_video,
    detect_nvenc,
)
from src.utils import format_bytes, get_disk_free_bytes


def test_check_ffmpeg_installed():
    ok, msg = check_ffmpeg_installed()
    assert ok is True
    assert msg == ""


def test_detect_nvenc():
    # On this RTX 4060 system, nvenc should be detected
    has_nvenc = detect_nvenc()
    assert isinstance(has_nvenc, bool)


def test_probe_sample_video():
    video_path = PROJECT_ROOT / "input" / "sample_video.mp4"
    if not video_path.exists():
        pytest.skip("input/sample_video.mp4 does not exist")

    info = probe_video(video_path)
    assert info["width"] == 640
    assert info["height"] == 360
    assert info["duration"] > 0
    assert info["has_audio"] is True
    assert info["fps_float"] > 0


def test_disk_utilities():
    bytes_formatted = format_bytes(1024 * 1024 * 50)
    assert "50.0 MB" in bytes_formatted

    free_bytes = get_disk_free_bytes(PROJECT_ROOT)
    assert free_bytes > 0
