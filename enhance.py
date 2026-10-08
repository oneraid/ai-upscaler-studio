#!/usr/bin/env python
"""
AI Photo & Video Upscaler
CLI entry point for upscaling images and videos locally using Real-ESRGAN and GFPGAN.
"""
import argparse
import sys
import time
from pathlib import Path

from src.config import (
    DEFAULT_SCALE,
    DEFAULT_TILE,
    DEFAULT_MAX_SIDE,
    DEFAULT_FACE_WEIGHT,
    DEFAULT_CRF,
    DEFAULT_JPG_QUALITY,
    OUTPUT_DIR,
    PHOTO_OUTPUT_DIR,
    VIDEO_OUTPUT_DIR,
    IMAGE_EXTENSIONS,
    VIDEO_EXTENSIONS,
)
from src.image_pipeline import process_image
from src.video_pipeline import process_video
from src.models import model_manager
from src.utils import (
    setup_logging,
    logger,
    is_image_file,
    is_video_file,
    get_gpu_info,
)


def parse_args():
    parser = argparse.ArgumentParser(
        description="AI Photo & Video Upscaler - 100% lokal berbasis Real-ESRGAN & GFPGAN"
    )
    parser.add_argument(
        "input",
        type=str,
        help="Path ke file foto, file video, atau folder untuk batch processing",
    )
    parser.add_argument(
        "-o", "--output",
        type=str,
        default=str(OUTPUT_DIR),
        help="Folder atau file output (default: output/)",
    )
    parser.add_argument(
        "-s", "--scale",
        type=int,
        choices=[2, 3, 4, 8],
        default=DEFAULT_SCALE,
        help="Faktor upscale: 2, 3, 4, atau 8 (default: 4)",
    )
    parser.add_argument(
        "-m", "--model",
        type=str,
        default="auto",
        choices=["auto", "general-x4", "swinir-x4", "general-fast", "anime"],
        help="Model AI (auto: foto = general-x4, video = general-fast)",
    )
    parser.add_argument(
        "--face",
        action="store_true",
        help="Aktifkan restorasi wajah (GFPGAN / CodeFormer)",
    )
    parser.add_argument(
        "--face-model",
        type=str,
        default="gfpgan",
        choices=["gfpgan", "codeformer", "restoreformer"],
        help="Model restorasi wajah: gfpgan, codeformer, atau restoreformer (default: gfpgan)",
    )
    parser.add_argument(
        "--face-weight",
        type=float,
        default=DEFAULT_FACE_WEIGHT,
        help="Bobot blend restorasi wajah 0.0 - 1.0 (default: 0.6)",
    )
    parser.add_argument(
        "--clarity",
        type=float,
        default=DEFAULT_CLARITY,
        help="Tingkat ketajaman / micro-contrast unsharp mask 0.0 - 1.0 (default: 0.0)",
    )
    parser.add_argument(
        "--tile",
        type=int,
        default=DEFAULT_TILE,
        help="Ukuran tile (0 = tanpa tiling, default: 400). Turunkan jika OOM",
    )
    parser.add_argument(
        "--fp32",
        action="store_true",
        help="Paksa full precision FP32 (default: FP16 jika CUDA tersedia)",
    )
    parser.add_argument(
        "--max-side",
        type=int,
        default=DEFAULT_MAX_SIDE,
        help="Batas sisi terpanjang foto (default: 4096)",
    )
    parser.add_argument(
        "--format",
        type=str,
        choices=["png", "jpg", "jpeg", "webp"],
        default="png",
        help="Format output foto: png, jpg, webp (default: png)",
    )
    parser.add_argument(
        "--jpg-quality",
        type=int,
        default=DEFAULT_JPG_QUALITY,
        help="Kualitas jika format output jpg (default: 95)",
    parser.add_argument(
        "--fps",
        type=int,
        default=0,
        help="Target frame rate (FPS) video (misal: 60 untuk 60 FPS, -2 untuk 2x FPS asli, 0 = pertahankan asli)",
    )
    parser.add_argument(
        "--crf",
        type=int,
        default=DEFAULT_CRF,
        help="Kualitas encode video CRF (default: 18, lebih kecil = lebih tinggi)",
    )
    parser.add_argument(
        "--codec",
        type=str,
        choices=["auto", "h264_nvenc", "libx264", "hevc_nvenc"],
        default="auto",
        help="Video encoder codec (default: auto)",
    )
    parser.add_argument(
        "--keep-frames",
        action="store_true",
        help="Pertahankan frame sementara di .work/ untuk debug",
    )
    parser.add_argument(
        "--resume",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Lanjutkan proses video yang terputus (default: True, gunakan --no-resume untuk matikan)",
    )
    parser.add_argument(
        "--start",
        type=float,
        default=None,
        help="Mulai proses video dari detik ke-N",
    )
    parser.add_argument(
        "--end",
        type=float,
        default=None,
        help="Selesai proses video pada detik ke-N",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Timpa file output jika sudah ada",
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Tampilkan log detail untuk debugging",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    setup_logging(verbose=args.verbose)

    input_path = Path(args.input)
    output_dest = Path(args.output)

    if not input_path.exists():
        logger.error(f"Input path tidak ditemukan: {input_path}")
        sys.exit(1)

    gpu_info = get_gpu_info()
    if gpu_info["available"]:
        logger.info(
            f"Hardware: {gpu_info['name']} (VRAM Total: {gpu_info['vram_total_mb']} MB) | Presisi: {'FP32' if args.fp32 else 'FP16'}"
        )
    else:
        logger.warning("Hardware: CPU Mode (CUDA tidak terdeteksi)")

    start_time = time.time()

    # Collect files to process
    items_to_process = []
    if input_path.is_dir():
        for p in sorted(input_path.iterdir()):
            if is_image_file(p) or is_video_file(p):
                items_to_process.append(p)
        if not items_to_process:
            logger.warning(f"Tidak ditemukan file gambar atau video yang didukung di folder {input_path}")
            sys.exit(0)
        logger.info(f"Mode batch: Ditemukan {len(items_to_process)} file di {input_path}")
    else:
        items_to_process.append(input_path)

    # Process items
    success_count = 0
    fail_count = 0

    for idx, item in enumerate(items_to_process, 1):
        if len(items_to_process) > 1:
            logger.info(f"\n[{idx}/{len(items_to_process)}] Memproses: {item.name}")

        is_img = is_image_file(item)
        is_vid = is_video_file(item)

        if not is_img and not is_vid:
            logger.warning(f"File tidak didukung: {item.name}, dilewati.")
            fail_count += 1
            continue

        # Determine model
        if args.model == "auto":
            selected_model = "general-fast" if is_vid else "general-x4"
        else:
            selected_model = args.model

        dest_for_item = (PHOTO_OUTPUT_DIR if is_img else VIDEO_OUTPUT_DIR) if output_dest == OUTPUT_DIR else output_dest
        try:
            if is_img:
                process_image(
                    input_path=item,
                    output_dest=dest_for_item,
                    scale=args.scale,
                    model_name=selected_model,
                    face=args.face,
                    face_model=args.face_model,
                    face_weight=args.face_weight,
                    clarity=args.clarity,
                    tile=args.tile,
                    fp32=args.fp32,
                    max_side=args.max_side,
                    output_format=args.format,
                    jpg_quality=args.jpg_quality,
                    overwrite=args.overwrite,
                )
            else:
                process_video(
                    video_path=item,
                    output_dest=dest_for_item,
                    scale=args.scale,
                    model_name=selected_model,
                    face=args.face,
                    face_weight=args.face_weight,
                    tile=args.tile,
                    fp32=args.fp32,
                    crf=args.crf,
                    codec=args.codec,
                    keep_frames=args.keep_frames,
                    resume=args.resume,
                    start=args.start,
                    end=args.end,
                    overwrite=args.overwrite,
                    target_fps=args.fps,
                )
            success_count += 1
        except KeyboardInterrupt:
            logger.warning("\nOperasi dihentikan oleh pengguna.")
            sys.exit(130)
        except Exception as e:
            logger.error(f"Gagal memproses {item.name}: {e}")
            if args.verbose:
                logger.exception("Detail traceback:")
            fail_count += 1
            if len(items_to_process) == 1:
                # Single file mode should exit with non-zero
                sys.exit(1)

    elapsed = time.time() - start_time
    logger.info(
        f"\nSelesai dalam {elapsed:.2f}s | Berhasil: {success_count} | Gagal: {fail_count}"
    )

    if fail_count > 0 and success_count == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
