import React, { useState, useEffect, useRef } from 'react';
import {
  Crop,
  Video,
  Scissors,
  Download,
  FolderOpen,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  Maximize2,
  Clock,
  Layers,
  CheckCircle2,
  AlertCircle,
  Move,
} from 'lucide-react';

// Format seconds into "mm:ss" or "hh:mm:ss"
const formatSecondsToTime = (totalSeconds) => {
  if (isNaN(totalSeconds) || totalSeconds < 0) return '00:00';
  const sec = Math.floor(totalSeconds);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

// Parse string "mm:ss" or "hh:mm:ss" or number into seconds
const parseTimeToSeconds = (str) => {
  if (!str) return 0;
  const parts = str.trim().split(':').map((p) => parseFloat(p) || 0);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 1) {
    return parts[0];
  }
  return 0;
};

// Aspect ratio presets definitions
const RATIO_PRESETS = [
  { id: 'original', label: 'Asli', ratio: null, desc: 'Resolusi Asli', icon: '◻️' },
  { id: '16:9', label: '16:9', ratio: 16 / 9, desc: 'Landscape / YouTube', icon: '🖥️' },
  { id: '9:16', label: '9:16', ratio: 9 / 16, desc: 'Portrait / TikTok / Reels', icon: '📱' },
  { id: '1:1', label: '1:1', ratio: 1 / 1, desc: 'Square / IG Feed', icon: '⏹️' },
  { id: '4:5', label: '4:5', ratio: 4 / 5, desc: 'Portrait IG Post', icon: '📷' },
  { id: '4:3', label: '4:3', ratio: 4 / 3, desc: 'Standar Klasik', icon: '📺' },
  { id: '21:9', label: '21:9', ratio: 21 / 9, desc: 'Sinematik Ultrawide', icon: '🎬' },
  { id: 'custom', label: 'Bebas', ratio: null, desc: 'Kustom Bebas', icon: '📐' },
];

export default function CropStudio({ onSendToUpscaler }) {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [videoMeta, setVideoMeta] = useState(null);

  // Crop Duration (Trim) States
  const [isTrimActive, setIsTrimActive] = useState(true);
  const [startSec, setStartSec] = useState(0);
  const [endSec, setEndSec] = useState(0);
  const [startTimeInput, setStartTimeInput] = useState('00:00');
  const [endTimeInput, setEndTimeInput] = useState('00:00');
  const [isPlayingSnippet, setIsPlayingSnippet] = useState(false);

  // Crop Aspect Ratio States
  const [selectedRatio, setSelectedRatio] = useState('original'); // 'original' | '16:9' | '9:16' | '1:1' | ...
  // Crop geometry relative to video coordinate space: { x, y, width, height }
  const [cropBox, setCropBox] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [alignMode, setAlignMode] = useState('center'); // 'left' | 'center' | 'right' | 'top' | 'bottom'

  // Processing & Polling
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  // References
  const videoRef = useRef(null);
  const resultVideoRef = useRef(null);
  const pollTimerRef = useRef(null);
  const videoContainerRef = useRef(null);
  const isDraggingBoxRef = useRef(false);
  const dragStartPosRef = useRef({ x: 0, y: 0, boxX: 0, boxY: 0 });

  // Cleanup object URL
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, []);

  // Update initial crop box when ratio or metadata changes
  const calculateCropForRatio = (ratioId, origW, origH, align = 'center') => {
    if (!origW || !origH) return { x: 0, y: 0, width: 0, height: 0 };
    if (ratioId === 'original') {
      return { x: 0, y: 0, width: origW, height: origH };
    }

    const preset = RATIO_PRESETS.find((p) => p.id === ratioId);
    if (!preset || !preset.ratio) {
      // Custom: default to 80% centered box
      const cw = Math.round((origW * 0.8) / 2) * 2;
      const ch = Math.round((origH * 0.8) / 2) * 2;
      return {
        x: Math.round((origW - cw) / 2 / 2) * 2,
        y: Math.round((origH - ch) / 2 / 2) * 2,
        width: cw,
        height: ch,
      };
    }

    const targetRatio = preset.ratio;
    const currentRatio = origW / origH;
    let cw, ch, cx, cy;

    if (currentRatio > targetRatio) {
      // Video lebih lebar daripada target: tinggi tetap penuh, lebar dipotong
      ch = origH;
      cw = Math.round((ch * targetRatio) / 2) * 2;
      if (cw > origW) cw = origW - (origW % 2);

      if (align === 'left') {
        cx = 0;
      } else if (align === 'right') {
        cx = origW - cw;
      } else {
        cx = Math.round((origW - cw) / 2);
      }
      cy = 0;
    } else {
      // Video lebih tinggi daripada target: lebar tetap penuh, tinggi dipotong
      cw = origW;
      ch = Math.round((cw / targetRatio) / 2) * 2;
      if (ch > origH) ch = origH - (origH % 2);

      if (align === 'top') {
        cy = 0;
      } else if (align === 'bottom') {
        cy = origH - ch;
      } else {
        cy = Math.round((origH - ch) / 2);
      }
      cx = 0;
    }

    // Pastikan angka genap (even) untuk kompatibilitas encoder FFmpeg
    cw = cw - (cw % 2);
    ch = ch - (ch % 2);
    cx = Math.max(0, Math.min(origW - cw, cx - (cx % 2)));
    cy = Math.max(0, Math.min(origH - ch, cy - (cy % 2)));

    return { x: cx, y: cy, width: cw, height: ch };
  };

  const applyRatioPreset = (ratioId, align = alignMode) => {
    setSelectedRatio(ratioId);
    if (videoMeta?.width && videoMeta?.height) {
      const newBox = calculateCropForRatio(ratioId, videoMeta.width, videoMeta.height, align);
      setCropBox(newBox);
    }
  };

  const applyAlignment = (align) => {
    setAlignMode(align);
    if (videoMeta?.width && videoMeta?.height) {
      const newBox = calculateCropForRatio(selectedRatio, videoMeta.width, videoMeta.height, align);
      setCropBox(newBox);
    }
  };

  // Handle Video Loading
  const processVideoFile = (selected) => {
    if (!selected) return;
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    localStorage.removeItem('upscaler_active_crop_task');
    setFile(selected);
    const objectUrl = URL.createObjectURL(selected);
    setPreviewUrl(objectUrl);
    setResult(null);
    setError(null);
  };

  const handleVideoMetadataLoaded = (e) => {
    const v = e.target;
    if (!v.videoWidth || !v.videoHeight) return;

    const w = v.videoWidth;
    const h = v.videoHeight;
    const dur = v.duration || 0;

    setVideoMeta({
      name: file ? file.name : 'input_video.mp4',
      size: file ? (file.size / (1024 * 1024)).toFixed(1) + ' MB' : '-',
      width: w,
      height: h,
      duration: dur,
      durationFormatted: formatSecondsToTime(dur),
    });

    // Default duration trim: full video
    setStartSec(0);
    setEndSec(dur);
    setStartTimeInput('00:00');
    setEndTimeInput(formatSecondsToTime(dur));

    // Default crop box: original full resolution
    const initialBox = calculateCropForRatio(selectedRatio, w, h, alignMode);
    setCropBox(initialBox);
  };

  // Sync Start / End with Playhead
  const setStartFromCurrentTime = () => {
    if (!videoRef.current) return;
    const cur = videoRef.current.currentTime;
    setStartSec(cur);
    setStartTimeInput(formatSecondsToTime(cur));
    if (endSec <= cur && videoMeta?.duration) {
      const newEnd = Math.min(videoMeta.duration, cur + 5);
      setEndSec(newEnd);
      setEndTimeInput(formatSecondsToTime(newEnd));
    }
  };

  const setEndFromCurrentTime = () => {
    if (!videoRef.current) return;
    const cur = videoRef.current.currentTime;
    if (cur > startSec) {
      setEndSec(cur);
      setEndTimeInput(formatSecondsToTime(cur));
    } else {
      setError('Waktu selesai harus lebih besar dari waktu mulai.');
      setTimeout(() => setError(null), 3000);
    }
  };

  const handleStartTimeInputChange = (val) => {
    setStartTimeInput(val);
    const sec = parseTimeToSeconds(val);
    if (!isNaN(sec) && sec >= 0 && (!videoMeta || sec <= videoMeta.duration)) {
      setStartSec(sec);
    }
  };

  const handleEndTimeInputChange = (val) => {
    setEndTimeInput(val);
    const sec = parseTimeToSeconds(val);
    if (!isNaN(sec) && sec > 0 && (!videoMeta || sec <= videoMeta.duration)) {
      setEndSec(sec);
    }
  };

  // Play snippet between start and end
  const togglePlaySnippet = () => {
    if (!videoRef.current) return;
    const v = videoRef.current;
    if (isPlayingSnippet) {
      v.pause();
      setIsPlayingSnippet(false);
    } else {
      v.currentTime = startSec;
      v.play();
      setIsPlayingSnippet(true);
    }
  };

  // Monitor playhead during snippet playback
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const v = videoRef.current;
    if (isPlayingSnippet && endSec > startSec && v.currentTime >= endSec) {
      v.pause();
      v.currentTime = startSec;
      setIsPlayingSnippet(false);
    }
  };

  // Quick Duration Presets
  const applyDurationPreset = (seconds) => {
    if (!videoMeta?.duration) return;
    const maxDur = videoMeta.duration;
    if (seconds === -1) {
      // Full duration
      setStartSec(0);
      setEndSec(maxDur);
      setStartTimeInput('00:00');
      setEndTimeInput(formatSecondsToTime(maxDur));
    } else {
      const cutEnd = Math.min(maxDur, startSec + seconds);
      setEndSec(cutEnd);
      setEndTimeInput(formatSecondsToTime(cutEnd));
    }
  };

  // Drag and Drop Crop Box on Preview Overlay
  const handleBoxMouseDown = (e) => {
    e.preventDefault();
    isDraggingBoxRef.current = true;
    dragStartPosRef.current = {
      x: e.clientX,
      y: e.clientY,
      boxX: cropBox.x,
      boxY: cropBox.y,
    };
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDraggingBoxRef.current || !videoContainerRef.current || !videoMeta?.width || !videoMeta?.height) return;
      const rect = videoContainerRef.current.getBoundingClientRect();
      const scaleX = videoMeta.width / rect.width;
      const scaleY = videoMeta.height / rect.height;

      const deltaX = (e.clientX - dragStartPosRef.current.x) * scaleX;
      const deltaY = (e.clientY - dragStartPosRef.current.y) * scaleY;

      let newX = dragStartPosRef.current.boxX + deltaX;
      let newY = dragStartPosRef.current.boxY + deltaY;

      const maxX = videoMeta.width - cropBox.width;
      const maxY = videoMeta.height - cropBox.height;

      newX = Math.max(0, Math.min(maxX, Math.round(newX / 2) * 2));
      newY = Math.max(0, Math.min(maxY, Math.round(newY / 2) * 2));

      setCropBox((prev) => ({
        ...prev,
        x: newX,
        y: newY,
      }));
    };

    const handleMouseUp = () => {
      isDraggingBoxRef.current = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [cropBox.width, cropBox.height, videoMeta]);

  // Polling Task Status
  const startPolling = (taskId) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    setIsProcessing(true);
    localStorage.setItem('upscaler_active_crop_task', taskId);

    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/task/${taskId}`);
        if (!res.ok) return;
        const data = await res.json();
        setProgress(data.progress || 0);
        if (data.message) setProgressMsg(data.message);

        if (data.status === 'completed') {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
          setResult(data.result);
          setIsProcessing(false);
          setProgress(100);
          localStorage.removeItem('upscaler_active_crop_task');
        } else if (data.status === 'failed') {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
          setError(data.error || 'Gagal memotong video.');
          setIsProcessing(false);
          localStorage.removeItem('upscaler_active_crop_task');
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 400);
  };

  // Recover active crop task on mount
  useEffect(() => {
    const savedTaskId = localStorage.getItem('upscaler_active_crop_task');
    if (savedTaskId) {
      startPolling(savedTaskId);
    }
  }, []);

  // Submit Crop Job
  const handleProcessCrop = async () => {
    if (!file && !previewUrl) {
      setError('Silakan pilih file video terlebih dahulu.');
      return;
    }

    if (isTrimActive && endSec <= startSec) {
      setError('Waktu selesai pemotongan durasi harus lebih besar dari waktu mulai.');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setProgress(0);
    setProgressMsg('Menyiapkan video untuk dipotong...');

    try {
      let uploadFile = file;
      if (!uploadFile && previewUrl) {
        const fetched = await fetch(previewUrl);
        const blob = await fetched.blob();
        uploadFile = new File([blob], videoMeta?.name || 'input_video.mp4', { type: 'video/mp4' });
      }

      const formData = new FormData();
      formData.append('video', uploadFile);
      formData.append('is_trim', isTrimActive);
      formData.append('start_sec', startSec);
      formData.append('end_sec', endSec);

      const hasRatioCrop =
        selectedRatio !== 'original' &&
        cropBox.width > 0 &&
        cropBox.height > 0 &&
        videoMeta &&
        (cropBox.width < videoMeta.width || cropBox.height < videoMeta.height);

      formData.append('is_crop_ratio', hasRatioCrop);
      if (hasRatioCrop) {
        formData.append('crop_x', cropBox.x);
        formData.append('crop_y', cropBox.y);
        formData.append('crop_w', cropBox.width);
        formData.append('crop_h', cropBox.height);
      }
      formData.append('ratio_name', selectedRatio);

      const res = await fetch('/api/crop/video', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || `Server error (${res.status})`);
      }

      const data = await res.json();
      if (data.task_id) {
        startPolling(data.task_id);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Terjadi kesalahan saat memproses crop video.');
      setIsProcessing(false);
      localStorage.removeItem('upscaler_active_crop_task');
    }
  };

  const copyPath = (path) => {
    if (!path) return;
    navigator.clipboard.writeText(path);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenFolder = async (path, filename) => {
    try {
      await fetch('/api/open-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, filename, media_type: 'video' }),
      });
    } catch (e) {
      console.error('Gagal membuka folder:', e);
    }
  };

  const handleOpenFile = async (path, filename) => {
    try {
      await fetch('/api/open-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, filename, media_type: 'video' }),
      });
    } catch (e) {
      console.error('Gagal membuka file:', e);
    }
  };

  // Selected duration calculation
  const cutDuration = Math.max(0, endSec - startSec);
  const formattedCutDuration = formatSecondsToTime(cutDuration);

  return (
    <div className="studio-grid">
      {/* Kolom Kiri: Kontrol Crop Durasi & Crop Rasio */}
      <div className="glass-card studio-panel">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: 'var(--accent-gradient)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
            }}
          >
            <Crop size={20} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)' }}>
              Studio Pemotong Video
            </h2>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
              Potong durasi waktu (trim) dan aspek rasio (16:9, 9:16, 1:1, dll) dengan cepat
            </p>
          </div>
        </div>

        {/* Upload Zone jika belum ada video */}
        {!previewUrl ? (
          <label
            className={`dropzone ${isDraggingFile ? 'drag-active' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingFile(true);
            }}
            onDragLeave={() => setIsDraggingFile(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingFile(false);
              if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                processVideoFile(e.dataTransfer.files[0]);
              }
            }}
          >
            <input
              type="file"
              accept="video/*"
              style={{ display: 'none' }}
              onChange={(e) => e.target.files && processVideoFile(e.target.files[0])}
            />
            <Video size={42} style={{ color: 'var(--accent-primary)', marginBottom: '10px' }} />
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '4px' }}>
              Pilih Video untuk Dipotong
            </h3>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>
              Klik atau drag & drop file MP4, MOV, MKV, AVI, WEBM
            </p>
          </label>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* Metadata Info Ringkas */}
            {videoMeta && (
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '240px' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fff' }} title={videoMeta.name}>
                    📹 {videoMeta.name}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                    {videoMeta.width} × {videoMeta.height} px &bull; {videoMeta.durationFormatted} ({videoMeta.size})
                  </div>
                </div>
                <label
                  className="change-overlay"
                  style={{
                    position: 'static',
                    padding: '6px 10px',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'rgba(255,255,255,0.06)',
                    borderRadius: '6px',
                  }}
                >
                  <input
                    type="file"
                    accept="video/*"
                    style={{ display: 'none' }}
                    onChange={(e) => e.target.files && processVideoFile(e.target.files[0])}
                  />
                  <RefreshCw size={12} /> Ganti Video
                </label>
              </div>
            )}

            {/* ========================================= */}
            {/* BAGIAN 1: CROP DURASI (TRIM / RANGE)      */}
            {/* ========================================= */}
            <div className="control-group">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '10px',
                }}
              >
                <label className="control-label" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Scissors size={15} style={{ color: 'var(--accent-primary)' }} />
                  <span>1. Crop Durasi Waktu (Trim)</span>
                </label>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: '#60a5fa',
                    background: 'rgba(96, 165, 250, 0.1)',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    border: '1px solid rgba(96, 165, 250, 0.25)',
                  }}
                >
                  ⏱️ Terpilih: {formattedCutDuration} ({cutDuration.toFixed(1)}s)
                </span>
              </div>

              {/* Input Waktu Mulai & Selesai (Format mm:ss atau hh:mm:ss) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {/* Waktu Mulai */}
                <div
                  style={{
                    background: 'rgba(13, 18, 30, 0.6)',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontWeight: 700 }}>
                      Mulai Dari
                    </span>
                    <button
                      type="button"
                      onClick={setStartFromCurrentTime}
                      title="Gunakan posisi putar video saat ini sebagai titik mulai"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--accent-primary)',
                        fontSize: '0.7rem',
                        cursor: 'pointer',
                        padding: 0,
                        textDecoration: 'underline',
                      }}
                    >
                      Ambil Playhead
                    </button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Clock size={14} style={{ color: 'var(--text-dim)' }} />
                    <input
                      type="text"
                      value={startTimeInput}
                      onChange={(e) => handleStartTimeInputChange(e.target.value)}
                      placeholder="00:00"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#fff',
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: '1rem',
                        fontWeight: 700,
                        width: '100%',
                        outline: 'none',
                      }}
                    />
                  </div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                    Detik ke: {startSec.toFixed(1)}s
                  </div>
                </div>

                {/* Waktu Selesai */}
                <div
                  style={{
                    background: 'rgba(13, 18, 30, 0.6)',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontWeight: 700 }}>
                      Sampai (Selesai)
                    </span>
                    <button
                      type="button"
                      onClick={setEndFromCurrentTime}
                      title="Gunakan posisi putar video saat ini sebagai titik selesai"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--accent-primary)',
                        fontSize: '0.7rem',
                        cursor: 'pointer',
                        padding: 0,
                        textDecoration: 'underline',
                      }}
                    >
                      Ambil Playhead
                    </button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Clock size={14} style={{ color: 'var(--text-dim)' }} />
                    <input
                      type="text"
                      value={endTimeInput}
                      onChange={(e) => handleEndTimeInputChange(e.target.value)}
                      placeholder="00:00"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#fff',
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: '1rem',
                        fontWeight: 700,
                        width: '100%',
                        outline: 'none',
                      }}
                    />
                  </div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                    Detik ke: {endSec.toFixed(1)}s
                  </div>
                </div>
              </div>

              {/* Slider Garis Durasi Terpadu */}
              {videoMeta?.duration > 0 && (
                <div style={{ marginTop: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '4px' }}>
                    <span>00:00</span>
                    <span style={{ color: '#fff', fontWeight: 600 }}>
                      {formatSecondsToTime(startSec)} ➔ {formatSecondsToTime(endSec)}
                    </span>
                    <span>{videoMeta.durationFormatted}</span>
                  </div>
                  <div style={{ position: 'relative', height: '24px', display: 'flex', alignItems: 'center' }}>
                    {/* Track Background */}
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        height: '6px',
                        borderRadius: '3px',
                        background: 'rgba(255, 255, 255, 0.1)',
                      }}
                    />
                    {/* Active Trim Range Bar */}
                    <div
                      style={{
                        position: 'absolute',
                        left: `${(startSec / videoMeta.duration) * 100}%`,
                        width: `${Math.max(1, ((endSec - startSec) / videoMeta.duration) * 100)}%`,
                        height: '6px',
                        borderRadius: '3px',
                        background: 'var(--accent-gradient)',
                        boxShadow: 'var(--accent-glow)',
                      }}
                    />
                    {/* Dual Range Sliders */}
                    <input
                      type="range"
                      min={0}
                      max={videoMeta.duration}
                      step={0.1}
                      value={startSec}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (val < endSec) {
                          setStartSec(val);
                          setStartTimeInput(formatSecondsToTime(val));
                        }
                      }}
                      style={{
                        position: 'absolute',
                        width: '100%',
                        pointerEvents: 'auto',
                        background: 'transparent',
                        WebkitAppearance: 'none',
                        cursor: 'pointer',
                        zIndex: 2,
                      }}
                    />
                    <input
                      type="range"
                      min={0}
                      max={videoMeta.duration}
                      step={0.1}
                      value={endSec}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (val > startSec) {
                          setEndSec(val);
                          setEndTimeInput(formatSecondsToTime(val));
                        }
                      }}
                      style={{
                        position: 'absolute',
                        width: '100%',
                        pointerEvents: 'auto',
                        background: 'transparent',
                        WebkitAppearance: 'none',
                        cursor: 'pointer',
                        zIndex: 3,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Quick Presets & Play Snippet */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '10px',
                  flexWrap: 'wrap',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => applyDurationPreset(-1)}
                    style={{
                      fontSize: '0.68rem',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    Semua
                  </button>
                  <button
                    type="button"
                    onClick={() => applyDurationPreset(5)}
                    style={{
                      fontSize: '0.68rem',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    5 Detik
                  </button>
                  <button
                    type="button"
                    onClick={() => applyDurationPreset(15)}
                    style={{
                      fontSize: '0.68rem',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    15 Detik (Story)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyDurationPreset(30)}
                    style={{
                      fontSize: '0.68rem',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    30 Detik (Reels)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyDurationPreset(60)}
                    style={{
                      fontSize: '0.68rem',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    60 Detik (Shorts)
                  </button>
                </div>

                <button
                  type="button"
                  onClick={togglePlaySnippet}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '5px 10px',
                    borderRadius: '6px',
                    background: isPlayingSnippet ? 'rgba(239, 68, 68, 0.2)' : 'rgba(99, 102, 241, 0.2)',
                    border: isPlayingSnippet ? '1px solid #ef4444' : '1px solid var(--accent-primary)',
                    color: isPlayingSnippet ? '#f87171' : '#818cf8',
                    cursor: 'pointer',
                  }}
                >
                  {isPlayingSnippet ? <Pause size={12} /> : <Play size={12} />}
                  <span>{isPlayingSnippet ? 'Jeda Potongan' : 'Putar Potongan Saja'}</span>
                </button>
              </div>
            </div>

            {/* ========================================= */}
            {/* BAGIAN 2: CROP ASPEK RASIO (SPATIAL CROP) */}
            {/* ========================================= */}
            <div className="control-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label className="control-label" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Maximize2 size={15} style={{ color: 'var(--accent-secondary)' }} />
                  <span>2. Crop Rasio Aspek (Dimensi)</span>
                </label>
                {selectedRatio !== 'original' && cropBox.width > 0 && (
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: '#34d399',
                      background: 'rgba(16, 185, 129, 0.1)',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      border: '1px solid rgba(16, 185, 129, 0.25)',
                    }}
                  >
                    📐 {cropBox.width} × {cropBox.height} px ({selectedRatio})
                  </span>
                )}
              </div>

              {/* Grid Tombol Pilihan Aspek Rasio */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '8px',
                }}
              >
                {RATIO_PRESETS.map((preset) => {
                  const isActive = selectedRatio === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyRatioPreset(preset.id)}
                      style={{
                        padding: '8px 6px',
                        borderRadius: '8px',
                        border: isActive ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                        background: isActive ? 'rgba(99, 102, 241, 0.18)' : 'rgba(255, 255, 255, 0.03)',
                        color: isActive ? '#fff' : 'var(--text-muted)',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '2px',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <span style={{ fontSize: '1rem' }}>{preset.icon}</span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{preset.label}</span>
                      <span style={{ fontSize: '0.62rem', opacity: 0.7, textAlign: 'center' }}>
                        {preset.desc.split('/')[0]}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Posisi Penjajaran (Alignment Focus) jika rasio di-crop */}
              {selectedRatio !== 'original' && (
                <div style={{ marginTop: '12px' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '6px' }}>
                    🎯 Posisi Kotak Potong (Bisa juga digeser langsung di video):
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => applyAlignment('center')}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: alignMode === 'center' ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                        background: alignMode === 'center' ? 'var(--accent-gradient)' : 'rgba(255,255,255,0.05)',
                        color: '#fff',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      ⏹️ Tengah (Center)
                    </button>
                    <button
                      type="button"
                      onClick={() => applyAlignment('left')}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: alignMode === 'left' ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                        background: alignMode === 'left' ? 'var(--accent-gradient)' : 'rgba(255,255,255,0.05)',
                        color: '#fff',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      ⬅️ Kiri (Left)
                    </button>
                    <button
                      type="button"
                      onClick={() => applyAlignment('right')}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: alignMode === 'right' ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                        background: alignMode === 'right' ? 'var(--accent-gradient)' : 'rgba(255,255,255,0.05)',
                        color: '#fff',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      ➡️ Kanan (Right)
                    </button>
                    <button
                      type="button"
                      onClick={() => applyAlignment('top')}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: alignMode === 'top' ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                        background: alignMode === 'top' ? 'var(--accent-gradient)' : 'rgba(255,255,255,0.05)',
                        color: '#fff',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      ⬆️ Atas (Top)
                    </button>
                    <button
                      type="button"
                      onClick={() => applyAlignment('bottom')}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: alignMode === 'bottom' ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                        background: alignMode === 'bottom' ? 'var(--accent-gradient)' : 'rgba(255,255,255,0.05)',
                        color: '#fff',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      ⬇️ Bawah (Bottom)
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Error Message */}
            {error && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#fca5a5',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            {/* Tombol Utama Eksekusi Crop */}
            <button
              type="button"
              className="btn-primary-enhance"
              disabled={isProcessing}
              onClick={handleProcessCrop}
              style={{
                width: '100%',
                padding: '14px',
                fontSize: '0.98rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                marginTop: '4px',
              }}
            >
              {isProcessing ? (
                <>
                  <RefreshCw size={18} className="spinning" />
                  <span>Sedang Memotong Video ({progress}%)...</span>
                </>
              ) : (
                <>
                  <Scissors size={18} />
                  <span>✂️ Potong & Simpan Video</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Kolom Kanan: Pratinjau Interaktif dengan Kotak Crop Overlay & Hasil */}
      <div className="glass-card studio-panel">
        {!previewUrl ? (
          <div
            style={{
              height: '100%',
              minHeight: '380px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-dim)',
              gap: '12px',
              textAlign: 'center',
            }}
          >
            <Video size={56} style={{ opacity: 0.3 }} />
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                Belum Ada Video yang Dipilih
              </h3>
              <p style={{ fontSize: '0.82rem', maxWidth: '320px', marginTop: '4px' }}>
                Unggah video di panel sebelah kiri untuk mengatur potongan durasi dan rasio aspek secara visual.
              </p>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Header Video Preview */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>
                  📺 Pratinjau Interaktif Video
                </span>
                {selectedRatio !== 'original' && (
                  <span
                    style={{
                      fontSize: '0.7rem',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: 'rgba(99, 102, 241, 0.2)',
                      color: '#818cf8',
                      fontWeight: 700,
                    }}
                  >
                    Rasio {selectedRatio}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                {videoMeta ? `${videoMeta.width} × ${videoMeta.height}` : ''}
              </div>
            </div>

            {/* Video Player Container dengan Live Draggable Crop Box Overlay */}
            <div
              ref={videoContainerRef}
              style={{
                position: 'relative',
                width: '100%',
                maxHeight: '440px',
                borderRadius: '12px',
                overflow: 'hidden',
                background: '#000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                userSelect: 'none',
              }}
            >
              <video
                ref={videoRef}
                src={previewUrl}
                controls
                onLoadedMetadata={handleVideoMetadataLoaded}
                onTimeUpdate={handleTimeUpdate}
                style={{
                  width: '100%',
                  maxHeight: '440px',
                  display: 'block',
                  objectFit: 'contain',
                }}
              />

              {/* Crop Box Overlay Visual jika rasio di-crop */}
              {selectedRatio !== 'original' &&
                videoMeta?.width > 0 &&
                videoMeta?.height > 0 &&
                cropBox.width > 0 &&
                cropBox.height > 0 && (() => {
                  const pctX = (cropBox.x / videoMeta.width) * 100;
                  const pctY = (cropBox.y / videoMeta.height) * 100;
                  const pctW = (cropBox.width / videoMeta.width) * 100;
                  const pctH = (cropBox.height / videoMeta.height) * 100;

                  return (
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        pointerEvents: 'none',
                      }}
                    >
                      {/* Darkened Mask Area around Crop Box */}
                      <div
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: `${pctY}%`,
                          background: 'rgba(0, 0, 0, 0.6)',
                        }}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          bottom: 0,
                          left: 0,
                          width: '100%',
                          height: `${100 - (pctY + pctH)}%`,
                          background: 'rgba(0, 0, 0, 0.6)',
                        }}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          top: `${pctY}%`,
                          left: 0,
                          width: `${pctX}%`,
                          height: `${pctH}%`,
                          background: 'rgba(0, 0, 0, 0.6)',
                        }}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          top: `${pctY}%`,
                          right: 0,
                          width: `${100 - (pctX + pctW)}%`,
                          height: `${pctH}%`,
                          background: 'rgba(0, 0, 0, 0.6)',
                        }}
                      />

                      {/* Interactive Highlighted Crop Box */}
                      <div
                        onMouseDown={handleBoxMouseDown}
                        style={{
                          position: 'absolute',
                          left: `${pctX}%`,
                          top: `${pctY}%`,
                          width: `${pctW}%`,
                          height: `${pctH}%`,
                          border: '2px solid #6366f1',
                          boxShadow: '0 0 15px rgba(99, 102, 241, 0.5), inset 0 0 10px rgba(99, 102, 241, 0.2)',
                          pointerEvents: 'auto',
                          cursor: 'grab',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {/* Rule-of-thirds Grid Lines */}
                        <div
                          style={{
                            position: 'absolute',
                            left: '33.33%',
                            top: 0,
                            bottom: 0,
                            width: '1px',
                            background: 'rgba(255, 255, 255, 0.25)',
                          }}
                        />
                        <div
                          style={{
                            position: 'absolute',
                            left: '66.66%',
                            top: 0,
                            bottom: 0,
                            width: '1px',
                            background: 'rgba(255, 255, 255, 0.25)',
                          }}
                        />
                        <div
                          style={{
                            position: 'absolute',
                            top: '33.33%',
                            left: 0,
                            right: 0,
                            height: '1px',
                            background: 'rgba(255, 255, 255, 0.25)',
                          }}
                        />
                        <div
                          style={{
                            position: 'absolute',
                            top: '66.66%',
                            left: 0,
                            right: 0,
                            height: '1px',
                            background: 'rgba(255, 255, 255, 0.25)',
                          }}
                        />

                        {/* Drag Handle Label Badge */}
                        <div
                          style={{
                            background: 'rgba(15, 23, 42, 0.85)',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            border: '1px solid rgba(255,255,255,0.2)',
                            color: '#fff',
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
                          }}
                        >
                          <Move size={12} />
                          <span>
                            {cropBox.width} × {cropBox.height} ({selectedRatio})
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
            </div>

            {/* Progress Bar ketika proses sedang berjalan */}
            {isProcessing && (
              <div
                style={{
                  padding: '16px',
                  borderRadius: '10px',
                  background: 'rgba(99, 102, 241, 0.08)',
                  border: '1px solid rgba(99, 102, 241, 0.25)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff' }}>
                    {progressMsg || 'Memproses pemotongan video...'}
                  </span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--accent-primary)' }}>
                    {progress}%
                  </span>
                </div>
                <div
                  style={{
                    width: '100%',
                    height: '8px',
                    borderRadius: '4px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${progress}%`,
                      height: '100%',
                      background: 'var(--accent-gradient)',
                      boxShadow: 'var(--accent-glow)',
                      transition: 'width 0.2s ease',
                    }}
                  />
                </div>
              </div>
            )}

            {/* HASIL SELESAI (RESULT CARD) */}
            {result && (
              <div
                style={{
                  padding: '20px',
                  borderRadius: '12px',
                  background: 'rgba(16, 185, 129, 0.06)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CheckCircle2 size={20} style={{ color: '#10b981' }} />
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>
                      Video Berhasil Dipotong!
                    </h3>
                  </div>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: '#10b981',
                      background: 'rgba(16, 185, 129, 0.15)',
                      padding: '4px 10px',
                      borderRadius: '6px',
                    }}
                  >
                    ⚡ Selesai dalam {result.elapsed}s
                  </span>
                </div>

                {/* Video Player Hasil */}
                <video
                  ref={resultVideoRef}
                  src={result.video_url}
                  controls
                  style={{
                    width: '100%',
                    maxHeight: '320px',
                    borderRadius: '8px',
                    background: '#000',
                  }}
                />

                {/* Grid Metadata Hasil */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '8px',
                  }}
                >
                  <div className="video-meta-item highlight">
                    <span className="meta-lbl">Resolusi Baru</span>
                    <span className="meta-val">
                      {result.new_w} × {result.new_h}
                    </span>
                  </div>
                  <div className="video-meta-item highlight">
                    <span className="meta-lbl">Durasi Baru</span>
                    <span className="meta-val">{formatSecondsToTime(result.new_duration)}</span>
                  </div>
                  <div className="video-meta-item">
                    <span className="meta-lbl">Ukuran File</span>
                    <span className="meta-val">{result.size_formatted}</span>
                  </div>
                  <div className="video-meta-item">
                    <span className="meta-lbl">Rasio Aspek</span>
                    <span className="meta-val">{result.ratio_name.toUpperCase()}</span>
                  </div>
                </div>

                {/* Action Buttons: Unduh, Explorer, Open, Kirim ke Upscaler */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                  <a
                    href={result.video_url}
                    download={result.filename}
                    className="btn btn-primary"
                    style={{
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '10px 16px',
                      fontSize: '0.88rem',
                      fontWeight: 700,
                    }}
                  >
                    <Download size={16} /> Unduh Video (.mp4)
                  </a>

                  {onSendToUpscaler && (
                    <button
                      type="button"
                      onClick={() => onSendToUpscaler(result)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '10px 16px',
                        fontSize: '0.88rem',
                        fontWeight: 700,
                        background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                        color: '#fff',
                        borderRadius: '8px',
                        border: 'none',
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
                      }}
                    >
                      <Sparkles size={16} /> 🚀 Kirim ke Tab Video Upscale
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleOpenFolder(result.absolute_path, result.filename)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '10px 14px',
                      fontSize: '0.85rem',
                      background: 'rgba(255,255,255,0.06)',
                      color: '#fff',
                      borderRadius: '8px',
                      border: '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                    }}
                  >
                    <FolderOpen size={15} /> Buka Folder
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenFile(result.absolute_path, result.filename)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '10px 14px',
                      fontSize: '0.85rem',
                      background: 'rgba(255,255,255,0.06)',
                      color: '#fff',
                      borderRadius: '8px',
                      border: '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                    }}
                  >
                    <ExternalLink size={15} /> Buka File Langsung
                  </button>

                  <button
                    type="button"
                    onClick={() => copyPath(result.absolute_path)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '10px 14px',
                      fontSize: '0.85rem',
                      background: 'rgba(255,255,255,0.06)',
                      color: '#fff',
                      borderRadius: '8px',
                      border: '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                    }}
                  >
                    {copied ? <Check size={15} style={{ color: '#10b981' }} /> : <Copy size={15} />}
                    <span>{copied ? 'Tersalin' : 'Salin Path'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
