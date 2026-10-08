import React, { useState, useEffect, useRef } from 'react';
import {
  UploadCloud,
  Sparkles,
  Download,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  FolderOpen,
  ExternalLink,
  Copy,
  Check,
  Folder,
} from 'lucide-react';
import ImageComparisonSlider from './ImageComparisonSlider';

export default function PhotoStudio() {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [imageMeta, setImageMeta] = useState(null);

  // Settings
  const [model, setModel] = useState('general-x4');
  const [scale, setScale] = useState(4);
  const [targetRes, setTargetRes] = useState(null);
  const [useFace, setUseFace] = useState(false);
  const [faceModel, setFaceModel] = useState('codeformer');
  const [faceWeight, setFaceWeight] = useState(0.6);
  const [clarity, setClarity] = useState(20);
  const [tile, setTile] = useState(400);
  const [format, setFormat] = useState('png');
  const [quality, setQuality] = useState(95);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const [isDragging, setIsDragging] = useState(false);
  const pollTimerRef = useRef(null);

  const isValidImage = (f) => {
    if (!f) return false;
    if (f.type && f.type.startsWith('image/')) return true;
    return /\.(jpe?g|png|webp|bmp|tiff?|gif|avif)$/i.test(f.name || '');
  };

  const processImageFile = (selected) => {
    if (!selected) return;
    if (!isValidImage(selected)) {
      setError('Format file tidak didukung. Harap pilih gambar JPG, PNG, atau WEBP.');
      return;
    }
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    localStorage.removeItem('upscaler_active_photo_task');
    setFile(selected);
    const objUrl = URL.createObjectURL(selected);
    setPreviewUrl(objUrl);
    setResult(null);
    setError(null);
    const imgObj = new Image();
    imgObj.onload = () => {
      setImageMeta({ width: imgObj.naturalWidth, height: imgObj.naturalHeight });
    };
    imgObj.src = objUrl;
  };

  const handleFileChange = (e) => {
    const selected = e.target.files && e.target.files[0];
    if (selected) {
      processImageFile(selected);
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
      processImageFile(e.dataTransfer.files[0]);
    }
  };

  const handleOpenFolder = async (path, filename) => {
    try {
      await fetch('/api/open-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, filename, media_type: 'photo' }),
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
        body: JSON.stringify({ path, filename, media_type: 'photo' }),
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
    localStorage.setItem('upscaler_active_photo_task', taskId);
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
          localStorage.removeItem('upscaler_active_photo_task');
        } else if (tData.status === 'failed') {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
          setError(tData.error || 'Terjadi kesalahan saat memproses foto.');
          setIsProcessing(false);
          localStorage.removeItem('upscaler_active_photo_task');
        }
      } catch (pollErr) {
        console.error('Polling error:', pollErr);
      }
    }, 400);
  };

  // Auto-recovery: Jika halaman ter-refresh saat AI sedang bekerja, pulihkan otomatis
  useEffect(() => {
    const recoverTask = async () => {
      const savedTaskId = localStorage.getItem('upscaler_active_photo_task');
      let targetTaskId = savedTaskId;

      if (!targetTaskId) {
        try {
          const aRes = await fetch('/api/tasks/active');
          if (aRes.ok) {
            const aData = await aRes.json();
            const activePhoto = (aData.tasks || []).find((t) => t.media_type === 'photo');
            if (activePhoto) {
              targetTaskId = activePhoto.task_id;
            }
          }
        } catch (e) {
          console.debug('Gagal cek active tasks:', e);
        }
      }

      if (targetTaskId) {
        try {
          const res = await fetch(`/api/task/${targetTaskId}`);
          if (res.ok) {
            const data = await res.json();
            if (data.status === 'processing') {
              setProgress(data.progress || 0);
              setProgressMsg(data.message || 'Melanjutkan proses upscaling AI...');
              if (data.preview_url) setPreviewUrl(data.preview_url);
              if (data.model) setModel(data.model);
              if (data.scale) setScale(data.scale);
              startPolling(targetTaskId, data.preview_url);
            } else if (data.status === 'completed') {
              setResult(data.result);
              if (data.preview_url) setPreviewUrl(data.preview_url);
              localStorage.removeItem('upscaler_active_photo_task');
            } else {
              localStorage.removeItem('upscaler_active_photo_task');
            }
          }
        } catch (err) {
          console.error('Gagal memulihkan task:', err);
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

  // Proteksi sebelum halaman ditutup / direfresh oleh user saat proses AI aktif
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isProcessing) {
        e.preventDefault();
        e.returnValue = 'Proses AI sedang berjalan di latar belakang. Yakin ingin meninggalkan halaman?';
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
    setProgressMsg('Menyiapkan unggahan foto...');

    const formData = new FormData();
    if (file) {
      formData.append('image', file);
    }
    formData.append('model', model);
    formData.append('scale', scale);
    if (targetRes) {
      formData.append('target_res', targetRes);
    }
    formData.append('face', useFace);
    formData.append('face_model', faceModel);
    formData.append('face_weight', faceWeight);
    formData.append('clarity', (clarity / 100.0).toFixed(2));
    formData.append('tile', tile);
    formData.append('format', format);
    formData.append('quality', quality);

    try {
      const res = await fetch('/api/enhance/photo', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Gagal memproses gambar (${res.status})`);
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
      setError(err.message || 'Terjadi kesalahan saat memproses foto.');
      setIsProcessing(false);
      localStorage.removeItem('upscaler_active_photo_task');
    }
  };

  return (
    <div className="studio-grid">
      {/* Left Column: Upload & Controls */}
      <div className="glass-card studio-panel">
        {/* Dropzone */}
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
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            <UploadCloud size={44} style={{ color: 'var(--accent-primary)', marginBottom: '10px' }} />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '4px' }}>
              Unggah Foto Anda
            </h3>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>
              Drag & drop file JPG, PNG, atau WEBP di sini
            </p>
          </label>
        ) : (
          <div
            className={`dropzone-preview ${isDragging ? 'drag-active' : ''}`}
            onDragOver={handleDragOver}
            onDragEnter={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <img src={previewUrl} alt="Preview input" />
            <label className="change-overlay">
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <RefreshCw size={12} /> Ganti Foto
            </label>
          </div>
        )}

        {/* Model Selector */}
        <div className="control-group">
          <label className="control-label">Pilihan Model AI</label>
          <div className="model-selector" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <div
              className={`model-card ${model === 'general-x4' ? 'active' : ''}`}
              onClick={() => setModel('general-x4')}
            >
              <div className="title">💎 Ultra</div>
              <div className="desc">Real-ESRGAN x4plus</div>
            </div>

            <div
              className={`model-card ${model === 'swinir-x4' ? 'active' : ''}`}
              onClick={() => setModel('swinir-x4')}
            >
              <div className="title">🔮 SwinIR</div>
              <div className="desc">SOTA Transformer</div>
            </div>

            <div
              className={`model-card ${model === 'general-fast' ? 'active' : ''}`}
              onClick={() => setModel('general-fast')}
            >
              <div className="title">⚡ Fast</div>
              <div className="desc">Cepat & ringan</div>
            </div>

            <div
              className={`model-card ${model === 'anime' ? 'active' : ''}`}
              onClick={() => setModel('anime')}
            >
              <div className="title">🎨 Anime</div>
              <div className="desc">Kartun / 2D</div>
            </div>
          </div>
        </div>

        {/* Scale & Target Resolution Selector */}
        <div className="control-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label className="control-label" style={{ marginBottom: 0 }}>Faktor Perbesaran & Target Resolusi</label>
            <span style={{ fontSize: '0.73rem', color: 'var(--accent-primary)', fontWeight: 700 }}>
              {targetRes ? `Target: ${targetRes.toUpperCase()}` : `${scale}x (${scale === 1 ? 'Tetap' : 'Perbesar'})`}
            </span>
          </div>

          {/* Pengali Skala: 1x, 2x, 3x, 4x, 8x */}
          <div style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '5px', fontWeight: 600 }}>
              PENGALI RESOLUSI (SCALE FACTOR)
            </div>
            <div className="scale-buttons" style={{ gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
              {[
                { s: 1, label: '1x', desc: 'Tetap' },
                { s: 2, label: '2x', desc: '2x Lipat' },
                { s: 3, label: '3x', desc: '3x Lipat' },
                { s: 4, label: '4x', desc: '4x Lipat' },
                { s: 8, label: '8x 🔥', desc: 'Ultra-HD' },
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
            <span>📐 Estimasi Dimensi Hasil:</span>
            <span style={{ fontWeight: 700, color: '#fff' }}>
              {imageMeta?.width && imageMeta?.height ? (
                targetRes ? (() => {
                  const resMap = { '1080p': 1080, '1440p': 1440, '4k': 2160, '8k': 4320 };
                  const base = resMap[targetRes] || 1080;
                  const w = imageMeta.width;
                  const h = imageMeta.height;
                  const tw = w >= h ? Math.round(w * (base / h)) : base;
                  const th = w >= h ? base : Math.round(h * (base / w));
                  const rat = (tw / w).toFixed(2);
                  return `${tw} × ${th} (${targetRes.toUpperCase()} · ~${rat}x)`;
                })() : (
                  `${Math.round(imageMeta.width * scale)} × ${Math.round(imageMeta.height * scale)} (${scale === 1 ? '1x Tetap' : `${scale}x`})`
                )
              ) : (
                targetRes ? `Preset ${targetRes.toUpperCase()} (Aspek Rasio Terjaga)` : `${scale}x Perbesaran`
              )}
            </span>
          </div>
        </div>

        {/* Face Restoration Toggle & Engine */}
        <div className="control-group">
          <div className="switch-row">
            <div className="switch-label">
              <span className="switch-title">✨ Restorasi Wajah AI</span>
              <span className="switch-desc">Pertajam mata, kulit, dan helai rambut</span>
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
                  { id: 'codeformer', label: 'CodeFormer (Tajam)', desc: 'Natural & detail' },
                  { id: 'gfpgan', label: 'GFPGAN v1.4', desc: 'Smooth aesthetic' },
                  { id: 'restoreformer', label: 'RestoreFormer', desc: 'Transformer' },
                ].map((fm) => (
                  <button
                    key={fm.id}
                    type="button"
                    onClick={() => setFaceModel(fm.id)}
                    style={{
                      flex: 1,
                      padding: '6px 4px',
                      borderRadius: '6px',
                      border: faceModel === fm.id ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                      background: faceModel === fm.id ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255,255,255,0.03)',
                      color: faceModel === fm.id ? '#fff' : 'var(--text-dim)',
                      fontSize: '0.72rem',
                      fontWeight: faceModel === fm.id ? 700 : 500,
                      cursor: 'pointer',
                      textAlign: 'center',
                    }}
                  >
                    <div>{fm.label}</div>
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
            </div>
          )}
        </div>

        {/* Clarity & Micro-Contrast Post-Processing */}
        <div className="control-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span>🔍 Ketajaman / Clarity</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>(Unsharp Mask)</span>
            </span>
            <span style={{ fontWeight: 700, color: clarity > 0 ? 'var(--accent-primary)' : '#fff' }}>
              {clarity}% {clarity === 0 ? '(Off)' : clarity > 50 ? '(Ultra Crisp)' : '(Subtle)'}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={clarity}
            onChange={(e) => setClarity(parseInt(e.target.value))}
            className="custom-range"
          />
        </div>

        {/* Advanced Accordion */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }}>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-dim)',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              width: '100%',
              justifyContent: 'space-between',
            }}
          >
            <span>⚙️ Opsi Lanjutan (Format & VRAM)</span>
            {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showAdvanced && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
              <div>
                <label className="control-label" style={{ marginBottom: '4px' }}>Format Output</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {['png', 'jpg', 'webp'].map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFormat(f)}
                      style={{
                        flex: 1,
                        padding: '6px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-subtle)',
                        background: format === f ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                        color: format === f ? '#fff' : 'var(--text-dim)',
                        textTransform: 'uppercase',
                        fontWeight: 700,
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                      }}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  <span>Tile Size (0 = Otomatis)</span>
                  <span style={{ fontWeight: 700, color: '#fff' }}>{tile}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="800"
                  step="64"
                  value={tile}
                  onChange={(e) => setTile(parseInt(e.target.value))}
                  className="custom-range"
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
              <span>Memproses dengan AI ({progress}%)...</span>
            </>
          ) : (
            <>
              <Sparkles size={20} />
              <span>Tingkatkan Kualitas Foto</span>
            </>
          )}
        </button>

        {/* Real-time Progress Bar */}
        {isProcessing && (
          <div className="progress-card">
            <div className="progress-header">
              <div className="progress-title">
                <RefreshCw size={15} className="spinning" />
                <span>{progressMsg || 'Memproses AI...'}</span>
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

      {/* Right Column: Preview & Slider */}
      <div className="glass-card studio-panel" style={{ justifyContent: 'center' }}>
        {result ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <ImageComparisonSlider
              originalUrl={result.original_url}
              enhancedUrl={result.enhanced_url}
            />

            {/* Stat Cards */}
            <div className="stat-cards-grid">
              <div className="stat-item">
                <div className="label">Resolusi Asli</div>
                <div className="val">{result.orig_w}x{result.orig_h}</div>
              </div>
              <div className="stat-item highlight">
                <div className="label">Hasil AI ({result.scale}x)</div>
                <div className="val">{result.new_w}x{result.new_h}</div>
              </div>
              <div className="stat-item success">
                <div className="label">Waktu</div>
                <div className="val">{result.elapsed}s</div>
              </div>
              <div className="stat-item">
                <div className="label">Ukuran</div>
                <div className="val">{result.size_formatted}</div>
              </div>
            </div>

            {/* Result Actions: Path Info & Action Buttons */}
            <div className="result-actions-wrapper">
              {result.absolute_path && (
                <div className="path-display-card">
                  <div className="path-text" title={result.absolute_path}>
                    <Folder size={15} style={{ flexShrink: 0, color: 'var(--accent-primary)' }} />
                    <span>{result.absolute_path}</span>
                  </div>
                  <button
                    type="button"
                    className="btn-copy-path"
                    onClick={() => copyPath(result.absolute_path)}
                    title="Salin path file ke clipboard"
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
                  title="Buka File Explorer dan sorot file ini"
                >
                  <FolderOpen size={18} />
                  <span>Buka di Folder</span>
                </button>

                <button
                  type="button"
                  className="btn-action-secondary"
                  onClick={() => handleOpenFile(result.absolute_path, result.filename)}
                  title="Buka file dengan aplikasi default OS"
                >
                  <ExternalLink size={16} />
                  <span>Buka File</span>
                </button>

                <a
                  href={result.enhanced_url}
                  download={result.filename}
                  className="btn-action-download"
                  title="Unduh file melalui browser"
                >
                  <Download size={15} />
                  <span>Unduh File</span>
                </a>
              </div>
            </div>
          </div>
        ) : previewUrl ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-dim)' }}>
            <img
              src={previewUrl}
              alt="Uploaded"
              style={{ maxHeight: '380px', maxWidth: '100%', borderRadius: '12px', marginBottom: '16px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}
            />
            <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)' }}>
              Foto siap! Klik tombol <strong>"Tingkatkan Kualitas Foto"</strong> di sisi kiri untuk memproses.
            </p>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-dim)' }}>
            <Sparkles size={48} style={{ color: 'rgba(255,255,255,0.1)', marginBottom: '16px' }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
              Pratinjau Studio
            </h3>
            <p style={{ fontSize: '0.85rem' }}>
              Unggah foto di sebelah kiri untuk melihat slider perbandingan Before & After.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
