import React, { useState, useEffect, useRef } from 'react';
import {
  Video,
  Sparkles,
  Download,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  Scissors,
  FolderOpen,
  ExternalLink,
  Copy,
  Check,
  Folder,
  Info,
} from 'lucide-react';

const formatDuration = (sec) => {
  if (!sec || isNaN(sec)) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const getResLabel = (w, h) => {
  if (!w || !h) return '';
  const maxDim = Math.max(w, h);
  if (maxDim >= 7000) return '8K UHD';
  if (maxDim >= 3500) return '4K UHD';
  if (maxDim >= 2400) return '2K QHD';
  if (maxDim >= 1800) return '1080p FHD';
  if (maxDim >= 1200) return '720p HD';
  if (maxDim >= 800) return '480p SD';
  return 'SD';
};

export default function VideoStudio() {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [videoMeta, setVideoMeta] = useState(null);

  // Settings
  const [model, setModel] = useState('general-fast');
  const [scale, setScale] = useState(2);
  const [targetRes, setTargetRes] = useState(null);
  const [targetFps, setTargetFps] = useState(0);
  const [useFace, setUseFace] = useState(false);
  const [faceModel, setFaceModel] = useState('codeformer');
  const [faceWeight, setFaceWeight] = useState(0.5);
  const [isTrim, setIsTrim] = useState(false);
  const [startSec, setStartSec] = useState(0);
  const [endSec, setEndSec] = useState(5);

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const [isDragging, setIsDragging] = useState(false);
  const pollTimerRef = useRef(null);

  const isValidVideo = (f) => {
    if (!f) return false;
    if (f.type && f.type.startsWith('video/')) return true;
    return /\.(mp4|mkv|mov|avi|webm|m4v|flv|wmv|ts)$/i.test(f.name || '');
  };

  const processVideoFile = (selected) => {
    if (!selected) return;
    if (!isValidVideo(selected)) {
      setError('Format file tidak didukung. Harap pilih video (MP4, MKV, MOV, AVI, WEBM).');
      return;
    }
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    localStorage.removeItem('upscaler_active_video_task');
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
    setResult(null);
    setError(null);
    setVideoMeta({
      name: selected.name,
      size: (selected.size / (1024 * 1024)).toFixed(1) + ' MB',
      width: null,
      height: null,
      duration: null,
      durationFormatted: '...',
    });
  };

  const handleFileChange = (e) => {
    const selected = e.target.files && e.target.files[0];
    if (selected) {
      processVideoFile(selected);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processVideoFile(e.dataTransfer.files[0]);
    }
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

  const copyPath = (path) => {
    if (!path) return;
    navigator.clipboard.writeText(path);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Fungsi polling task terpusat dan aman dari unmount / reload
  const startPolling = (taskId, initialPreviewUrl = null) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    setIsProcessing(true);
    localStorage.setItem('upscaler_active_video_task', taskId);
    if (initialPreviewUrl) setPreviewUrl(initialPreviewUrl);

    pollTimerRef.current = setInterval(async () => {
      try {
        const tRes = await fetch(`/api/task/${taskId}`);
        if (!tRes.ok) return;
        const tData = await tRes.json();
        setProgress(tData.progress || 0);
        if (tData.message) setProgressMsg(tData.message);
        if (tData.preview_url && !previewUrl) setPreviewUrl(tData.preview_url);

        if (tData.status === 'completed') {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
          setResult(tData.result);
          setIsProcessing(false);
          setProgress(100);
          localStorage.removeItem('upscaler_active_video_task');
        } else if (tData.status === 'failed') {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
          setError(tData.error || 'Terjadi kesalahan saat memproses video.');
          setIsProcessing(false);
          localStorage.removeItem('upscaler_active_video_task');
        }
      } catch (pollErr) {
        console.error('Polling error:', pollErr);
      }
    }, 400);
  };

  // Auto-recovery: Pulihkan progress video jika halaman ter-refresh saat video sedang diproses
  useEffect(() => {
    const recoverTask = async () => {
      const savedTaskId = localStorage.getItem('upscaler_active_video_task');
      let targetTaskId = savedTaskId;

      if (!targetTaskId) {
        try {
          const aRes = await fetch('/api/tasks/active');
          if (aRes.ok) {
            const aData = await aRes.json();
            const activeVideo = (aData.tasks || []).find((t) => t.media_type === 'video');
            if (activeVideo) {
              targetTaskId = activeVideo.task_id;
            }
          }
        } catch (e) {
          console.debug('Gagal cek active video tasks:', e);
        }
      }

      if (targetTaskId) {
        try {
          const res = await fetch(`/api/task/${targetTaskId}`);
          if (res.ok) {
            const data = await res.json();
            if (data.status === 'processing') {
              setProgress(data.progress || 0);
              setProgressMsg(data.message || 'Melanjutkan proses video AI...');
              if (data.preview_url) setPreviewUrl(data.preview_url);
              if (data.model) setModel(data.model);
              if (data.scale) setScale(data.scale);
              startPolling(targetTaskId, data.preview_url);
            } else if (data.status === 'completed') {
              setResult(data.result);
              if (data.preview_url) setPreviewUrl(data.preview_url);
              localStorage.removeItem('upscaler_active_video_task');
            } else {
              localStorage.removeItem('upscaler_active_video_task');
            }
          }
        } catch (err) {
          console.error('Gagal memulihkan task video:', err);
        }
      }
    };

    recoverTask();

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, []);

  // Proteksi sebelum halaman ditutup / direfresh oleh user saat proses video aktif
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isProcessing) {
        e.preventDefault();
        e.returnValue = 'Proses video AI sedang berjalan di latar belakang. Yakin ingin meninggalkan halaman?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isProcessing]);

  const handleEnhance = async () => {
    if (!file && !previewUrl) return;
    setIsProcessing(true);
    setError(null);
    setProgress(0);
    setProgressMsg('Menyiapkan unggahan video...');

    const formData = new FormData();
    if (file) {
      formData.append('video', file);
    }
    formData.append('model', model);
    formData.append('scale', scale);
    if (targetRes) {
      formData.append('target_res', targetRes);
    }
    formData.append('target_fps', targetFps);
    formData.append('face', useFace);
    formData.append('face_model', faceModel);
    formData.append('face_weight', faceWeight);
    formData.append('is_trim', isTrim);
    formData.append('start_sec', startSec);
    formData.append('end_sec', endSec);

    try {
      const res = await fetch('/api/enhance/video', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Gagal memproses video (${res.status})`);
      }

      const initData = await res.json();
      const taskId = initData.task_id;

      if (!taskId) {
        setResult(initData);
        setIsProcessing(false);
        return;
      }

      startPolling(taskId, previewUrl);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Terjadi kesalahan saat memproses video.');
      setIsProcessing(false);
      localStorage.removeItem('upscaler_active_video_task');
    }
  };

  return (
    <div className="studio-grid">
      {/* Left Column: Upload & Controls */}
      <div className="glass-card studio-panel">
        {!previewUrl ? (
          <label
            className={`dropzone ${isDragging ? 'drag-active' : ''}`}
            onDragOver={handleDragOver}
            onDragEnter={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              type="file"
              accept="video/*"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            <Video size={44} style={{ color: 'var(--accent-secondary)', marginBottom: '10px' }} />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '4px' }}>
              Unggah File Video
            </h3>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>
              Drag & drop atau klik untuk memilih file MP4, MKV, MOV, atau AVI
            </p>
          </label>
        ) : (
          <div>
            <div
              className={`dropzone-preview ${isDragging ? 'drag-active' : ''}`}
              onDragOver={handleDragOver}
              onDragEnter={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <video
                src={previewUrl}
                controls
                style={{ width: '100%', maxHeight: '280px' }}
                onLoadedMetadata={(e) => {
                  const v = e.target;
                  if (v.videoWidth && v.videoHeight) {
                    setVideoMeta((prev) => ({
                      name: file ? file.name : (prev?.name || 'video_input.mp4'),
                      size: file ? (file.size / (1024 * 1024)).toFixed(1) + ' MB' : (prev?.size || '-'),
                      width: v.videoWidth,
                      height: v.videoHeight,
                      duration: v.duration,
                      durationFormatted: formatDuration(v.duration),
                    }));
                  }
                }}
              />
              <label className="change-overlay">
                <input
                  type="file"
                  accept="video/*"
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />
                <RefreshCw size={12} /> Ganti Video
              </label>
            </div>

            {/* Video Input Metadata Card */}
            {videoMeta && videoMeta.width && (() => {
              const resMap = { '1080p': 1080, '1440p': 1440, '4k': 2160, '8k': 4320 };
              const w = videoMeta.width;
              const h = videoMeta.height;
              let tw, th, effScale;
              if (targetRes) {
                const base = resMap[targetRes] || 1080;
                tw = w >= h ? Math.round(w * (base / h)) : base;
                th = w >= h ? base : Math.round(h * (base / w));
                tw = Math.max(16, tw - (tw % 2));
                th = Math.max(16, th - (th % 2));
                effScale = (tw / w).toFixed(2);
              } else {
                tw = Math.max(16, Math.round(w * scale));
                th = Math.max(16, Math.round(h * scale));
                tw = tw - (tw % 2);
                th = th - (th % 2);
                effScale = scale;
              }

              return (
                <div className="video-meta-card">
                  <div className="video-meta-header">
                    <div className="video-meta-name" title={videoMeta.name}>
                      📹 {videoMeta.name}
                    </div>
                    <span className="video-meta-badge">
                      {getResLabel(videoMeta.width, videoMeta.height)}
                    </span>
                  </div>

                  <div className="video-meta-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                    <div className="video-meta-item">
                      <span className="meta-lbl">Resolusi Asli</span>
                      <span className="meta-val">{videoMeta.width} × {videoMeta.height}</span>
                    </div>
                    <div className="video-meta-item highlight">
                      <span className="meta-lbl">
                        Target Resolusi {targetRes ? `(${targetRes.toUpperCase()})` : `(${scale}x)`}
                      </span>
                      <span className="meta-val">
                        {tw} × {th}
                      </span>
                    </div>
                    <div className="video-meta-item highlight">
                      <span className="meta-lbl">Target FPS</span>
                      <span className="meta-val">
                        {targetFps === 0 ? 'Asli' : targetFps === 60 ? '60 FPS' : '2x FPS'}
                      </span>
                    </div>
                    <div className="video-meta-item">
                      <span className="meta-lbl">Durasi</span>
                      <span className="meta-val">{videoMeta.durationFormatted}</span>
                    </div>
                    <div className="video-meta-item">
                      <span className="meta-lbl">Ukuran File</span>
                      <span className="meta-val">{videoMeta.size}</span>
                    </div>
                    <div className="video-meta-item">
                      <span className="meta-lbl">Model AI</span>
                      <span className="meta-val">
                        {model === 'general-fast' ? '⚡ Fast' : model === 'general-x4' ? '💎 Ultra' : '🎨 Anime'}
                      </span>
                    </div>
                  </div>

                  {tw * th > 3840 * 2160 && (
                    <div className="video-meta-warning">
                      <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px', color: '#f97316' }} />
                      <div>
                        <strong>Perhatian Resolusi Tinggi:</strong> Target resolusi{' '}
                        <strong>
                          {tw}×{th} ({getResLabel(tw, th)})
                        </strong>{' '}
                        sangat besar. Disarankan memilih skala{' '}
                        <strong>2x</strong> atau <strong>1080p FHD</strong> agar render GPU berjalan cepat, stabil, dan hemat VRAM.
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* Model Selector */}
        <div className="control-group">
          <label className="control-label">Model AI Video</label>
          <div className="model-selector">
            <div
              className={`model-card ${model === 'general-fast' ? 'active' : ''}`}
              onClick={() => setModel('general-fast')}
            >
              <div className="title">⚡ Fast Mode</div>
              <div className="desc">Sangat direkomendasikan</div>
            </div>

            <div
              className={`model-card ${model === 'general-x4' ? 'active' : ''}`}
              onClick={() => setModel('general-x4')}
            >
              <div className="title">💎 Ultra</div>
              <div className="desc">Kualitas tinggi</div>
            </div>

            <div
              className={`model-card ${model === 'anime' ? 'active' : ''}`}
              onClick={() => setModel('anime')}
            >
              <div className="title">🎨 Anime</div>
              <div className="desc">Kartun 2D</div>
            </div>
          </div>
        </div>

        {/* Scale & Preset Target Resolution Selector */}
        <div className="control-group">
          <label className="control-label">Perbesaran & Target Resolusi Video</label>

          {/* Faktor Skala: 1x, 2x, 3x, 4x */}
          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '5px', fontWeight: 600 }}>
              FAKTOR SKALA (MULTIPLIER)
            </div>
            <div className="scale-buttons" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
              {[
                { s: 1, label: '1x', desc: 'Tetap (Restorasi Saja)' },
                { s: 2, label: '2x', desc: 'Perbesar 2 Kali (Cepat)' },
                { s: 3, label: '3x', desc: 'Perbesar 3 Kali' },
                { s: 4, label: '4x', desc: 'Perbesar 4 Kali (Maks)' },
              ].map(({ s, label, desc }) => (
                <button
                  key={s}
                  type="button"
                  className={`scale-btn ${!targetRes && scale === s ? 'active' : ''}`}
                  onClick={() => {
                    setScale(s);
                    setTargetRes(null);
                  }}
                  style={{ padding: '8px 4px', textAlign: 'center', minHeight: '48px' }}
                >
                  <div style={{ fontSize: '0.86rem', fontWeight: 700 }}>{label}</div>
                  <div style={{ fontSize: '0.62rem', opacity: 0.75, fontWeight: 500, marginTop: '1px' }}>{desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Preset Resolusi Standar: 1080p, 1440p, 4K, 8K */}
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '5px', fontWeight: 600 }}>
              TARGET RESOLUSI STANDAR (PRESET)
            </div>
            <div className="scale-buttons" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
              {[
                { id: '1080p', label: '1080p', sub: 'Full HD', spec: '1920×1080' },
                { id: '1440p', label: '1440p', sub: '2K QHD', spec: '2560×1440' },
                { id: '4k', label: '2160p', sub: '4K UHD', spec: '3840×2160' },
                { id: '8k', label: '4320p', sub: '8K UHD', spec: '7680×4320' },
              ].map((res) => (
                <button
                  key={res.id}
                  type="button"
                  className={`scale-btn ${targetRes === res.id ? 'active' : ''}`}
                  onClick={() => {
                    setTargetRes(res.id);
                  }}
                  style={{ padding: '8px 4px', textAlign: 'center', minHeight: '52px' }}
                >
                  <div style={{ fontSize: '0.84rem', fontWeight: 700 }}>{res.label}</div>
                  <div style={{ fontSize: '0.66rem', color: targetRes === res.id ? '#fff' : 'var(--accent-primary)', fontWeight: 600, marginTop: '1px' }}>
                    {res.sub}
                  </div>
                  <div style={{ fontSize: '0.58rem', opacity: 0.65, marginTop: '1px' }}>{res.spec}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Live Resolution Estimate Pill */}
          <div style={{
            marginTop: '8px',
            padding: '7px 10px',
            borderRadius: '6px',
            background: 'rgba(99, 102, 241, 0.08)',
            border: '1px solid rgba(99, 102, 241, 0.22)',
            fontSize: '0.74rem',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span>📐 Estimasi Dimensi Video:</span>
            <span style={{ fontWeight: 700, color: '#fff' }}>
              {videoMeta?.width && videoMeta?.height ? (
                targetRes ? (() => {
                  const resMap = { '1080p': 1080, '1440p': 1440, '4k': 2160, '8k': 4320 };
                  const base = resMap[targetRes] || 1080;
                  const w = videoMeta.width;
                  const h = videoMeta.height;
                  let tw = w >= h ? Math.round(w * (base / h)) : base;
                  let th = w >= h ? base : Math.round(h * (base / w));
                  tw = Math.max(16, tw - (tw % 2));
                  th = Math.max(16, th - (th % 2));
                  const rat = (tw / w).toFixed(2);
                  return `${tw} × ${th} (${targetRes.toUpperCase()} · ~${rat}x)`;
                })() : (() => {
                  let tw = Math.max(16, Math.round(videoMeta.width * scale));
                  let th = Math.max(16, Math.round(videoMeta.height * scale));
                  tw = tw - (tw % 2);
                  th = th - (th % 2);
                  return `${tw} × ${th} (${scale === 1 ? '1x Tetap' : `${scale}x`})`;
                })()
              ) : (
                targetRes ? `Preset ${targetRes.toUpperCase()} (Aspek Rasio Terjaga)` : `${scale}x Perbesaran`
              )}
            </span>
          </div>
        </div>

        {/* Frame Rate (FPS) Selector */}
        <div className="control-group">
          <label className="control-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>⚡ Target Frame Rate (FPS)</span>
          </label>
          <div className="scale-buttons" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            <button
              type="button"
              className={`scale-btn ${targetFps === 0 ? 'active' : ''}`}
              onClick={() => setTargetFps(0)}
            >
              Asli (Bawaan)
            </button>
            <button
              type="button"
              className={`scale-btn ${targetFps === 60 ? 'active' : ''}`}
              onClick={() => setTargetFps(60)}
            >
              60 FPS (Ultra Mulus)
            </button>
            <button
              type="button"
              className={`scale-btn ${targetFps === -2 ? 'active' : ''}`}
              onClick={() => setTargetFps(-2)}
            >
              2x FPS (Double)
            </button>
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginTop: '6px' }}>
            {targetFps === 0
              ? 'ℹ️ Pertahankan frame rate bawaan video asli tanpa interpolasi gerak.'
              : targetFps === 60
              ? '✨ Interpolasi gerakan (motion interpolation) ke 60 FPS untuk video yang jauh lebih mulus.'
              : '🚀 Menggandakan jumlah frame per detik (misal 24 FPS menjadi 48 FPS, 30 FPS menjadi 60 FPS).'}
          </div>
        </div>

        {/* Face Restoration Toggle */}
        <div className="control-group">
          <div className="switch-row">
            <div className="switch-label">
              <span className="switch-title">✨ Restorasi Wajah Video</span>
              <span className="switch-desc">Deteksi dan pertajam wajah per frame</span>
            </div>
            <input
              type="checkbox"
              checked={useFace}
              onChange={(e) => setUseFace(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
            />
          </div>

          {useFace && (
            <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '6px' }}>
                {[
                  { id: 'codeformer', label: 'CodeFormer (Tajam)' },
                  { id: 'gfpgan', label: 'GFPGAN v1.4' },
                ].map((fm) => (
                  <button
                    key={fm.id}
                    type="button"
                    onClick={() => setFaceModel(fm.id)}
                    style={{
                      flex: 1,
                      padding: '5px 4px',
                      borderRadius: '6px',
                      border: faceModel === fm.id ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                      background: faceModel === fm.id ? 'rgba(99, 102, 241, 0.25)' : 'transparent',
                      color: faceModel === fm.id ? '#fff' : 'var(--text-dim)',
                      fontSize: '0.72rem',
                      fontWeight: faceModel === fm.id ? 700 : 500,
                      cursor: 'pointer',
                    }}
                  >
                    {fm.label}
                  </button>
                ))}
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  <span>Kekuatan Wajah ({faceModel})</span>
                  <span style={{ fontWeight: 700, color: '#fff' }}>{faceWeight}</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={faceWeight}
                  onChange={(e) => setFaceWeight(parseFloat(e.target.value))}
                  className="custom-range"
                />
              </div>

              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                {faceModel === 'codeformer'
                  ? '🎯 CodeFormer: Restorasi detail mata, rambut, dan tekstur wajah sangat tajam.'
                  : '🌸 GFPGAN v1.4: Restorasi wajah natural dan mulus antar frame video.'}
              </div>
            </div>
          )}
        </div>

        {/* Trim Test Option */}
        <div className="control-group">
          <div className="switch-row">
            <div className="switch-label">
              <span className="switch-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Scissors size={14} /> Uji Potongan Singkat (Preview)
              </span>
              <span className="switch-desc">Uji coba beberapa detik pertama sebelum render penuh</span>
            </div>
            <input
              type="checkbox"
              checked={isTrim}
              onChange={(e) => setIsTrim(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
            />
          </div>

          {isTrim && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '8px' }}>
              <div>
                <label className="control-label" style={{ fontSize: '0.75rem' }}>Detik Mulai</label>
                <input
                  type="number"
                  min="0"
                  value={startSec}
                  onChange={(e) => setStartSec(parseFloat(e.target.value) || 0)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-subtle)',
                    background: 'rgba(0,0,0,0.4)',
                    color: '#fff',
                  }}
                />
              </div>
              <div>
                <label className="control-label" style={{ fontSize: '0.75rem' }}>Detik Selesai</label>
                <input
                  type="number"
                  min="1"
                  value={endSec}
                  onChange={(e) => setEndSec(parseFloat(e.target.value) || 5)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-subtle)',
                    background: 'rgba(0,0,0,0.4)',
                    color: '#fff',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Primary Action Button */}
        <button
          type="button"
          className="btn-primary-enhance"
          disabled={!file || isProcessing}
          onClick={handleEnhance}
        >
          {isProcessing ? (
            <>
              <RefreshCw size={20} className="spinning" />
              <span>Memproses Video ({progress}%)...</span>
            </>
          ) : (
            <>
              <Sparkles size={20} />
              <span>Tingkatkan Kualitas Video</span>
            </>
          )}
        </button>

        {/* Real-time Progress Bar */}
        {isProcessing && (
          <div className="progress-card">
            <div className="progress-header">
              <div className="progress-title">
                <RefreshCw size={15} className="spinning" />
                <span>{progressMsg || 'Memproses video...'}</span>
              </div>
              <div className="progress-percent">{progress}%</div>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="progress-footer">
              <span>Model: {model} ({scale}x)</span>
              <span>{progress}% selesai</span>
            </div>
          </div>
        )}

        {error && (
          <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', fontSize: '0.85rem', display: 'flex', gap: '8px' }}>
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Right Column: Output Video Player */}
      <div className="glass-card studio-panel" style={{ justifyContent: 'center' }}>
        {result ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ borderRadius: '12px', overflow: 'hidden', background: '#000', boxShadow: '0 8px 30px rgba(0,0,0,0.5)' }}>
              <video
                src={result.video_url}
                controls
                autoPlay
                style={{ width: '100%', maxHeight: '460px', objectFit: 'contain' }}
              />
            </div>

            {/* Stat Cards */}
            <div className="stat-cards-grid">
              <div className="stat-item highlight">
                <div className="label">Resolusi</div>
                <div className="val">{result.orig_w}x{result.orig_h} ➔ {result.new_w}x{result.new_h}</div>
              </div>
              <div className="stat-item">
                <div className="label">Frame Rate</div>
                <div className="val">{result.fps} FPS</div>
              </div>
              <div className="stat-item success">
                <div className="label">Waktu Render</div>
                <div className="val">{result.elapsed}s</div>
              </div>
              <div className="stat-item">
                <div className="label">Ukuran File</div>
                <div className="val">{result.size_formatted}</div>
              </div>
            </div>

            {/* Result Actions: Path Info & Action Buttons */}
            <div className="result-actions-wrapper">
              {result.absolute_path && (
                <div className="path-display-card">
                  <div className="path-text" title={result.absolute_path}>
                    <Folder size={15} style={{ flexShrink: 0, color: 'var(--accent-secondary)' }} />
                    <span>{result.absolute_path}</span>
                  </div>
                  <button
                    type="button"
                    className="btn-copy-path"
                    onClick={() => copyPath(result.absolute_path)}
                    title="Salin path video ke clipboard"
                  >
                    {copied ? <Check size={13} style={{ color: '#34d399' }} /> : <Copy size={13} />}
                    <span>{copied ? 'Tersalin' : 'Salin Path'}</span>
                  </button>
                </div>
              )}

              <div className="action-buttons-row">
                <button
                  type="button"
                  className="btn-action-primary"
                  onClick={() => handleOpenFolder(result.absolute_path, result.filename)}
                  title="Buka File Explorer dan sorot video ini"
                >
                  <FolderOpen size={18} />
                  <span>Buka di Folder</span>
                </button>

                <button
                  type="button"
                  className="btn-action-secondary"
                  onClick={() => handleOpenFile(result.absolute_path, result.filename)}
                  title="Putar video langsung di aplikasi bawaan Windows"
                >
                  <ExternalLink size={16} />
                  <span>Putar Video</span>
                </button>

                <a
                  href={result.video_url}
                  download={result.filename}
                  className="btn-action-download"
                  title="Unduh video via browser"
                >
                  <Download size={15} />
                  <span>Unduh Video</span>
                </a>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-dim)' }}>
            <Video size={48} style={{ color: 'rgba(255,255,255,0.1)', marginBottom: '16px' }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
              Pemutar Video AI
            </h3>
            <p style={{ fontSize: '0.85rem' }}>
              Unggah video di sebelah kiri. Video yang ditingkatkan beserta audio asli akan siap diputar di sini.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
