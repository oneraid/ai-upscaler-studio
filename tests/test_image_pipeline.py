"""
Unit and integration tests for the image processing pipeline.
"""
import sys
from pathlib import Path
import numpy as np
import cv2
import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.image_pipeline import (
    read_image_with_exif,
    write_image_safely,
    process_image,
)
from src.utils import get_output_filepath


@pytest.fixture
def temp_test_dir(tmp_path):
    """Temporary test directory fixture."""
    test_dir = tmp_path / "img_test"
    test_dir.mkdir(parents=True, exist_ok=True)
    return test_dir


def test_get_output_filepath_directory():
    in_path = Path("input/sample.png")
    out_dir = Path("output/")
    out_file = get_output_filepath(in_path, out_dir, scale=4, custom_ext=".jpg")
    assert out_file == out_dir / "sample_x4.jpg"


def test_get_output_filepath_explicit_file():
    in_path = Path("input/sample.png")
    out_explicit = Path("output/custom_name.png")
    out_file = get_output_filepath(in_path, out_explicit, scale=4)
    assert out_file == out_explicit


def test_read_and_write_image_alpha(temp_test_dir):
    # Create 4-channel BGRA image
    arr = np.zeros((64, 64, 4), dtype=np.uint8)
    arr[:, :, 0] = 255  # Blue
    arr[:, :, 3] = 128  # Half alpha
    test_img_path = temp_test_dir / "alpha_test.png"
    write_image_safely(arr, test_img_path)

    loaded = read_image_with_exif(test_img_path)
    assert loaded.shape == (64, 64, 4)
    assert np.all(loaded[:, :, 3] == 128)


def test_process_image_scaling_and_max_side(temp_test_dir):
    # Create test input image 50x50
    arr = np.full((50, 50, 3), 120, dtype=np.uint8)
    in_path = temp_test_dir / "tiny.png"
    cv2.imwrite(str(in_path), arr)

    out_dest = temp_test_dir / "out"
    # Test scale=2
    result_path = process_image(
        input_path=in_path,
        output_dest=out_dest,
        scale=2,
        model_name="general-fast",
        max_side=1000,
        output_format="png",
        overwrite=True,
    )
    assert result_path.exists()
    out_img = cv2.imread(str(result_path))
    assert out_img.shape == (100, 100, 3)

    # Test max_side restriction (e.g. max_side=80)
    result_bounded = process_image(
        input_path=in_path,
        output_dest=out_dest,
        scale=2,
        model_name="general-fast",
        max_side=80,
        output_format="png",
        overwrite=True,
    )
    bounded_img = cv2.imread(str(result_bounded))
    assert max(bounded_img.shape[:2]) <= 80


def test_process_corrupted_image_raises_error(temp_test_dir):
    corrupt_path = temp_test_dir / "broken.jpg"
    corrupt_path.write_text("invalid content", encoding="utf-8")

    with pytest.raises(Exception):
        process_image(
            input_path=corrupt_path,
            output_dest=temp_test_dir,
            scale=2,
        )
