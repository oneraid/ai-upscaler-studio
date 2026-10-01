"""
Unit tests for CLI argument parsing and validation.
"""
import sys
from pathlib import Path
import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from enhance import parse_args


def test_cli_defaults(monkeypatch):
    test_args = ["enhance.py", "input/tes.jpg"]
    monkeypatch.setattr(sys, "argv", test_args)
    args = parse_args()

    assert args.input == "input/tes.jpg"
    assert args.scale == 4
    assert args.model == "auto"
    assert args.face is False
    assert args.tile == 400
    assert args.fp32 is False
    assert args.max_side == 4096
    assert args.format == "png"
    assert args.resume is True


def test_cli_custom_options(monkeypatch):
    test_args = [
        "enhance.py",
        "input/sample_video.mp4",
        "-o", "custom_output/",
        "-s", "2",
        "-m", "general-fast",
        "--face",
        "--face-weight", "0.7",
        "--tile", "256",
        "--fp32",
        "--max-side", "2048",
        "--format", "webp",
        "--crf", "22",
        "--codec", "h264_nvenc",
        "--keep-frames",
        "--no-resume",
        "--start", "1.5",
        "--end", "4.5",
        "--overwrite",
        "-v",
    ]
    monkeypatch.setattr(sys, "argv", test_args)
    args = parse_args()

    assert args.output == "custom_output/"
    assert args.scale == 2
    assert args.model == "general-fast"
    assert args.face is True
    assert args.face_weight == 0.7
    assert args.tile == 256
    assert args.fp32 is True
    assert args.max_side == 2048
    assert args.format == "webp"
    assert args.crf == 22
    assert args.codec == "h264_nvenc"
    assert args.keep_frames is True
    assert args.resume is False
    assert args.start == 1.5
    assert args.end == 4.5
    assert args.overwrite is True
    assert args.verbose is True
