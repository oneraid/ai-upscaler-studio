"""
FFmpeg and FFprobe wrapper utilities for video probing, frame extraction, and video encoding.
"""
import json
import os
import shutil
import subprocess
from fractions import Fraction
from pathlib import Path
from typing import Dict, Any, Optional, Tuple, List

from src.utils import logger


def check_ffmpeg_installed() -> Tuple[bool, str]:
    """Check if ffmpeg and ffprobe are available on PATH."""
    ffmpeg_path = shutil.which("ffmpeg")
    ffprobe_path = shutil.which("ffprobe")
    if not ffmpeg_path or not ffprobe_path:
        msg = (
            "FFmpeg atau FFprobe tidak ditemukan di PATH sistem!\n"
            "Untuk menginstal di Windows, jalankan perintah berikut di PowerShell:\n"
            "    winget install Gyan.FFmpeg\n"
            "Setelah instalasi selesai, buka kembali terminal Anda."
        )
        return False, msg
    return True, ""


def ensure_ffmpeg() -> None:
    """Ensure ffmpeg is installed, raising RuntimeError with guidance if missing."""
    ok, err_msg = check_ffmpeg_installed()
    if not ok:
        logger.error(err_msg)
        raise RuntimeError(err_msg)


def detect_nvenc() -> bool:
    """Check if ffmpeg supports NVIDIA NVENC hardware acceleration."""
    try:
        res = subprocess.run(
            ["ffmpeg", "-encoders"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=True,
        )
        return "h264_nvenc" in res.stdout
    except Exception as e:
        logger.debug(f"Error checking nvenc support: {e}")
        return False


def detect_hevc_nvenc() -> bool:
    """Check if ffmpeg supports NVIDIA HEVC NVENC hardware acceleration."""
    try:
        res = subprocess.run(
            ["ffmpeg", "-encoders"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=True,
        )
        return "hevc_nvenc" in res.stdout
    except Exception as e:
        logger.debug(f"Error checking hevc_nvenc support: {e}")
        return False


def probe_video(video_path: Path) -> Dict[str, Any]:
    """Probe video metadata using ffprobe."""
    ensure_ffmpeg()
    
    cmd = [
        "ffprobe",
        "-v", "error",
        "-show_entries", "format=duration,size,bit_rate",
        "-show_streams",
        "-of", "json",
        str(video_path.resolve()),
    ]
    
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"ffprobe gagal membaca video {video_path}: {res.stderr}")

    info = json.loads(res.stdout)
    video_stream = None
    audio_stream = None

    for stream in info.get("streams", []):
        if stream.get("codec_type") == "video" and video_stream is None:
            video_stream = stream
        elif stream.get("codec_type") == "audio" and audio_stream is None:
            audio_stream = stream

    if not video_stream:
        raise ValueError(f"Tidak ada video stream ditemukan di {video_path}")

    # Resolution
    width = int(video_stream.get("width", 0))
    height = int(video_stream.get("height", 0))

    # FPS
    r_frame_rate = video_stream.get("r_frame_rate", "30/1")
    try:
        fps_fraction = Fraction(r_frame_rate)
        fps_float = float(fps_fraction)
    except Exception:
        fps_fraction = Fraction(30, 1)
        fps_float = 30.0

    # Duration
    duration_str = video_stream.get("duration") or info.get("format", {}).get("duration")
    duration = float(duration_str) if duration_str else 0.0

    # Frame count
    nb_frames_str = video_stream.get("nb_frames")
    if nb_frames_str and nb_frames_str.isdigit() and int(nb_frames_str) > 0:
        frame_count = int(nb_frames_str)
    elif duration > 0 and fps_float > 0:
        frame_count = int(round(duration * fps_float))
    else:
        frame_count = 0

    has_audio = audio_stream is not None

    return {
        "width": width,
        "height": height,
        "fps_rational": str(fps_fraction),
        "fps_float": fps_float,
        "duration": duration,
        "frame_count": frame_count,
        "has_audio": has_audio,
        "audio_codec": audio_stream.get("codec_name") if audio_stream else None,
    }


def extract_frames(
    video_path: Path,
    output_dir: Path,
    start: Optional[float] = None,
    end: Optional[float] = None,
) -> int:
    """
    Extract video frames to PNG in output_dir (%08d.png).
    Honors start and end times in seconds if provided.
    Returns count of extracted frames.
    """
    ensure_ffmpeg()
    output_dir.mkdir(parents=True, exist_ok=True)
    pattern = output_dir / "%08d.png"

    cmd: List[str] = ["ffmpeg", "-y"]
    
    if start is not None and start > 0:
        cmd.extend(["-ss", str(start)])
    if end is not None and end > 0:
        cmd.extend(["-to", str(end)])

    cmd.extend([
        "-i", str(video_path.resolve()),
        "-qscale:v", "1",
        "-pix_fmt", "rgb24",
        str(pattern),
    ])

    logger.debug(f"Running ffmpeg extract: {' '.join(cmd)}")
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"Gagal mengekstrak frame dari {video_path}: {res.stderr}")

    frames = sorted(output_dir.glob("*.png"))
    return len(frames)


def encode_video_from_frames(
    frames_dir: Path,
    output_video_path: Path,
    fps_rational: str,
    crf: int = 18,
    codec: str = "auto",
    audio_source: Optional[Path] = None,
    has_audio: bool = False,
    start: Optional[float] = None,
    end: Optional[float] = None,
    target_fps: Optional[int] = None,
) -> None:
    """
    Encode upscaled frames into an MP4 video, merging audio from audio_source if available.
    Supports motion-compensated / blended frame rate interpolation if target_fps is provided.
    """
    ensure_ffmpeg()
    output_video_path.parent.mkdir(parents=True, exist_ok=True)
    pattern = str(frames_dir / "%08d.png")

    # Check frame resolution from first frame
    first_frame = next(frames_dir.glob("*.png"), None)
    frame_w, frame_h = 0, 0
    if first_frame:
        try:
            from PIL import Image
            with Image.open(first_frame) as img:
                frame_w, frame_h = img.width, img.height
        except Exception:
            pass

    is_ultra_res = frame_w > 4096 or frame_h > 4096

    # Select codec
    nvenc_supported = detect_nvenc()
    hevc_nvenc_supported = detect_hevc_nvenc()
    selected_codec = codec

    if codec == "auto":
        # NVENC H.264 has a hardware limit of 4096x4096. For 8K (>4096), prioritize HEVC NVENC
        if is_ultra_res and hevc_nvenc_supported:
            selected_codec = "hevc_nvenc"
        elif nvenc_supported and not is_ultra_res:
            selected_codec = "h264_nvenc"
        elif hevc_nvenc_supported:
            selected_codec = "hevc_nvenc"
        else:
            selected_codec = "libx264"
    elif "nvenc" in codec and not (nvenc_supported or hevc_nvenc_supported):
        logger.warning(
            f"Codec {codec} diminta tetapi NVENC tidak tersedia pada FFmpeg. Fallback ke libx264."
        )
        selected_codec = "libx264"

    def build_cmd(use_codec: str, include_interpolation: bool = True) -> List[str]:
        cmd: List[str] = [
            "ffmpeg", "-y",
            "-framerate", str(fps_rational),
            "-i", pattern,
        ]

        # Audio input if available
        if has_audio and audio_source and audio_source.is_file():
            if start is not None and start > 0:
                cmd.extend(["-ss", str(start)])
            if end is not None and end > 0:
                cmd.extend(["-to", str(end)])
            cmd.extend(["-i", str(audio_source.resolve())])

        # Motion Interpolation (Up FPS)
        if include_interpolation and target_fps and target_fps > 0:
            if is_ultra_res or frame_w > 1920:
                vf_expr = f"minterpolate=fps={target_fps}:mi_mode=blend"
            else:
                vf_expr = f"minterpolate=fps={target_fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1"
            cmd.extend(["-vf", vf_expr, "-r", str(target_fps)])

        # Video encoding settings
        if "nvenc" in use_codec:
            cmd.extend([
                "-c:v", use_codec,
                "-preset", "p5",
                "-cq", str(crf),
                "-pix_fmt", "yuv420p",
            ])
            if "hevc" in use_codec:
                cmd.extend(["-tag:v", "hvc1"])
        else:
            cmd.extend([
                "-c:v", "libx264",
                "-preset", "fast" if is_ultra_res else "medium",
                "-crf", str(crf),
                "-pix_fmt", "yuv420p",
            ])
            if is_ultra_res:
                # Restrict threads and lookahead buffer for 8K/ultra-res to prevent malloc OOM crashes
                cmd.extend([
                    "-threads", "4",
                    "-x264-params", "rc-lookahead=10:sync-lookahead=2",
                ])

        # Audio encoding settings
        if has_audio and audio_source and audio_source.is_file():
            cmd.extend([
                "-c:a", "aac",
                "-b:a", "192k",
                "-map", "0:v:0",
                "-map", "1:a:0?",
                "-shortest",
            ])
        else:
            cmd.extend(["-map", "0:v:0"])

        cmd.append(str(output_video_path.resolve()))
        return cmd

    cmd = build_cmd(selected_codec)
    logger.debug(f"Running ffmpeg encode: {' '.join(cmd)}")
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

    if res.returncode != 0:
        if "nvenc" in selected_codec:
            logger.warning(
                f"NVENC encoding ({selected_codec}) gagal: {res.stderr.strip()[:120]}... Mencoba fallback CPU..."
            )
            fallback_cmd = build_cmd("libx264")
            res_fb = subprocess.run(fallback_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if res_fb.returncode != 0:
                raise RuntimeError(f"Gagal melakukan encode video dengan libx264: {res_fb.stderr}")
        else:
            raise RuntimeError(f"Gagal melakukan encode video: {res.stderr}")
