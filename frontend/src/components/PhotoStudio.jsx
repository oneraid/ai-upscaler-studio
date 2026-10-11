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
  Layers,
  Image as ImageIcon,
  Plus,
  Trash2,
  CheckCircle,
  ArrowLeft,
  Eye,
} from 'lucide-react';
import ImageComparisonSlider from './ImageComparisonSlider';

export default function PhotoStudio() {
  // File states: supports single or multiple files
  const [files, setFiles] = useState([]);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [imageMeta, setImageMeta] = useState(null);

  // Settings
  const [model, setModel] = useState('general-x4');
  const [scale, setScale] = useState(4);
  const [targetRes, setTargetRes] = useState(null);
  const [useFace, setUseFace] = useState(false);
  const [faceModel, setFaceModel] = useState('codeformer');
  const [faceWeight, setFaceWeight] = useState(0.45);
  const [clarity, setClarity] = useState(20);
  const [tile, setTile] = useState(400);
  const [format, setFormat] = useState('png');
  const [quality, setQuality] = useState(95);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const [copied, setCopied] = useState(false);

  // Results: single result or batch result
  const [singleResult, setSingleResult] = useState(null);
  const [batchResult, setBatchResult] = useState(null);
  const [activeCompareItem, setActiveCompareItem] = useState(null);
  const [error, setError] = useState(null);

  const [isDragging, setIsDragging] = useState(false);
  const pollTimerRef = useRef(null);
  const appendInputRef = useRef(null);

  const isValidImage = (f) => {
    if (!f) return false;
    if (f.type && f.type.startsWith('image/')) return true;
    return /\.(jpe?g|png|webp|bmp|tiff?|gif|avif)$/i.test(f.name || '');
  };

  // Helper to handle newly selected files (either replacing or appending)
  const addFiles = (selectedFiles, append = false) => {
    if (!selectedFiles || selectedFiles.length === 0) return;
    const arrayFiles = Array.from(selectedFiles);
    const validImages = arrayFiles.filter(isValidImage);

    if (validImages.length === 0) {
      setError('Format file tidak didukung. Harap pilih gambar JPG, PNG, atau WEBP.');
      return;
    }

    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    localStorage.removeItem('upscaler_active_photo_task');
    localStorage.removeItem('upscaler_active_batch_task');

    let newFilesList;
    if (append) {
      newFilesList = [...files, ...validImages];
    } else {
      newFilesList = validImages;
    }

    setFiles(newFilesList);
    setSingleResult(null);
    setBatchResult(null);
    setActiveCompareItem(null);
    setError(null);

    // If only 1 file is present, prepare single-image preview & metadata
    if (newFilesList.length === 1) {
      const objUrl = URL.createObjectURL(newFilesList[0]);
      setPreviewUrl(objUrl);
      const imgObj = new Image();
      imgObj.onload = () => {
        setImageMeta({ width: imgObj.naturalWidth, height: imgObj.naturalHeight });
      };
      imgObj.src = objUrl;
    } else {
      setPreviewUrl(null);
      setImageMeta(null);
    }
  };

  const removeFileAtIndex = (indexToRemove) => {
    const updated = files.filter((_, idx) => idx !== indexToRemove);
    setFiles(updated);
    if (updated.length === 1) {
      const objUrl = URL.createObjectURL(updated[0]);
      setPreviewUrl(objUrl);
      const imgObj = new Image();
      imgObj.onload = () => {
        setImageMeta({ width: imgObj.naturalWidth, height: imgObj.naturalHeight });
      };
      imgObj.src = objUrl;
    } else if (updated.length === 0) {
      setPreviewUrl(null);
      setImageMeta(null);
      setSingleResult(null);
      setBatchResult(null);
    }
  };

  const clearAllFiles = () => {
    setFiles([]);
    setPreviewUrl(null);
    setImageMeta(null);
    setSingleResult(null);
    setBatchResult(null);
    setActiveCompareItem(null);
    setError(null);
  };

  const handleFileChange = (e, append = false) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files, append);
      e.target.value = '';
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
      addFiles(e.dataTransfer.files, files.length > 0);
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

  // Central Polling Function
  const startPolling = (taskId, isBatchMode = false, initialPreviewUrl = null) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    setIsProcessing(true);
    const storageKey = isBatchMode ? 'upscaler_active_batch_task' : 'upscaler_active_photo_task';
    localStorage.setItem(storageKey, taskId);

    if (initialPreviewUrl && !isBatchMode) {
      setPreviewUrl(initialPreviewUrl);
    }

    pollTimerRef.current = setInterval(async () => {
      try {
        const tRes = await fetch(`/api/task/${taskId}`);
        if (!tRes.ok) return;
        const tData = await tRes.json();
        setProgress(tData.progress || 0);
        if (tData.message) setProgressMsg(tData.message);

        if (!isBatchMode && tData.preview_url && !previewUrl) {
          setPreviewUrl(tData.preview_url);
        }

        if (tData.status === 'completed') {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
          if (isBatchMode) {
            setBatchResult(tData.result);
          } else {
            setSingleResult(tData.result);
          }
          setIsProcessing(false);
          setProgress(100);
          localStorage.removeItem(storageKey);
        } else if (tData.status === 'failed') {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
          setError(tData.error || 'Terjadi kesalahan saat memproses gambar.');
          setIsProcessing(false);
          localStorage.removeItem(storageKey);
        }
      } catch (pollErr) {
        console.error('Polling error:', pollErr);
      }
    }, 400);
  };

  // Auto-recovery jika browser refresh saat proses berjalan
  useEffect(() => {
    const recoverTask = async () => {
      const savedPhotoTask = localStorage.getItem('upscaler_active_photo_task');
      const savedBatchTask = localStorage.getItem('upscaler_active_batch_task');

      if (savedPhotoTask) {
        startPolling(savedPhotoTask, false);
      } else if (savedBatchTask) {
        startPolling(savedBatchTask, true);
      }
    };
    recoverTask();

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  // Submit Handler: Automatically detects Single vs Batch
  const handleEnhance = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setError(null);
    setProgress(0);
    setSingleResult(null);
    setBatchResult(null);
    setActiveCompareItem(null);

    const isBatch = files.length > 1;

    try {
      if (!isBatch) {
        // Mode 1 Foto Tunggal
        setProgressMsg('Menyiapkan unggahan foto...');
        const formData = new FormData();
        formData.append('image', files[0]);
        formData.append('model', model);
        formData.append('scale', scale);
        if (targetRes) formData.append('target_res', targetRes);
        formData.append('face', useFace);
        formData.append('face_model', faceModel);
        formData.append('face_weight', faceWeight);
        formData.append('clarity', (clarity / 100.0).toFixed(2));
        formData.append('tile', tile);
        formData.append('format', format);
        formData.append('quality', quality);

        const res = await fetch('/api/enhance/photo', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || `Gagal memproses foto (${res.status})`);
        }

        const initData = await res.json();
        if (initData.task_id) {
          startPolling(initData.task_id, false, previewUrl);
        }
      } else {
        // Mode Batch (2 atau lebih foto)
        setProgressMsg(`Mengunggah ${files.length} foto untuk batch processing...`);
        const formData = new FormData();
        files.forEach((f) => formData.append('files', f));
        formData.append('model', model);
        formData.append('scale', scale);
        if (targetRes) formData.append('target_res', targetRes);
        formData.append('face', useFace);
        formData.append('face_model', faceModel);
        formData.append('face_weight', faceWeight);
        formData.append('clarity', (clarity / 100.0).toFixed(2));
        formData.append('tile', tile);
        formData.append('format', format);

        const res = await fetch('/api/enhance/batch', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || `Gagal memproses batch foto (${res.status})`);
        }

        const initData = await res.json();
        if (initData.task_id) {
          startPolling(initData.task_id, true);
        }
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Terjadi kesalahan saat memproses foto.');
      setIsProcessing(false);
      localStorage.removeItem('upscaler_active_photo_task');
      localStorage.removeItem('upscaler_active_batch_task');
    }
  };

  const isBatchMode = files.length > 1;

  return (
    <div className="studio-grid">
      {/* Hidden input to append more photos */}
      <input
        ref={appendInputRef}
        type="file"
        multiple
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => handleFileChange(e, true)}
      />

      {/* Kolom Kiri: Upload & Pengaturan */}
      <div className="glass-card studio-panel">
        {/* Dropzone jika belum ada file */}
        {files.length === 0 ? (
          <label
            className={`dropzone ${isDragging ? 'drag-active' : ''}`}
            onDragOver={handleDragOver}
            onDragEnter={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              type="file"
              multiple
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => handleFileChange(e, false)}
            />
            <UploadCloud size={44} style={{ color: 'var(--accent-primary)', marginBottom: '10px' }} />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '4px' }}>
              Unggah Foto (Tunggal / Banyak Sekaligus)
            </h3>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>
              Drag & drop atau pilih 1 foto maupun banyak foto JPG, PNG, atau WEBP
            </p>
          </label>
        ) : files.length === 1 ? (
          /* Mode 1 Foto Tunggal */
          <div>
            <div
              className={`dropzone-preview ${isDragging ? 'drag-active' : ''}`}
              onDragOver={handleDragOver}
              onDragEnter={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              style={{ position: 'relative' }}
            >
              <img src={previewUrl} alt="Preview input" />
              <label className="change-overlay">
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => handleFileChange(e, false)}
                />
                <RefreshCw size={12} /> Ganti Foto
              </label>
            </div>

            {/* Toolbar Info & Opsi Tambah Foto Batch */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '10px',
                padding: '8px 12px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {imageMeta ? `${imageMeta.width} × ${imageMeta.height} px` : '1 Foto Terpilih'}
              </div>
              <button
                type="button"
                onClick={() => appendInputRef.current?.click()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'rgba(99, 102, 241, 0.15)',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  borderRadius: '6px',
                  color: '#818cf8',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  padding: '4px 10px',
                  cursor: 'pointer',
                }}
              >
                <Plus size={13} />
                <span>+ Tambah Foto (Mode Batch)</span>
              </button>
            </div>
          </div>
        ) : (
          /* Mode Batch (2 atau lebih foto) */
          <div
            style={{
              padding: '14px',
              borderRadius: '12px',
              background: 'rgba(15, 23, 42, 0.7)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Layers size={16} style={{ color: 'var(--accent-primary)' }} />
                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#fff' }}>
                  Antrean Batch: {files.length} Foto
                </span>
              </div>
              <button
                type="button"
                onClick={clearAllFiles}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-dim)',
                  fontSize: '0.72rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                }}
              >
                <Trash2 size={12} /> Hapus Semua
              </button>
            </div>

            {/* Strip Thumbnail Foto */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))',
                gap: '8px',
                maxHeight: '160px',
                overflowY: 'auto',
                padding: '4px',
              }}
            >
              {files.map((f, idx) => (
                <div
                  key={idx}
                  style={{
                    position: 'relative',
                    aspectRatio: '1',
                    borderRadius: '6px',
                    overflow: 'hidden',
                    border: '1px solid var(--border-subtle)',
                    background: '#000',
                  }}
                  title={f.name}
                >
                  <img
                    src={URL.createObjectURL(f)}
                    alt={f.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <button
                    type="button"
                    onClick={() => removeFileAtIndex(idx)}
                    style={{
                      position: 'absolute',
                      top: '2px',
                      right: '2px',
                      background: 'rgba(0,0,0,0.7)',
                      border: 'none',
                      borderRadius: '50%',
                      width: '18px',
                      height: '18px',
                      color: '#fff',
                      fontSize: '10px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => appendInputRef.current?.click()}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '6px',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px dashed var(--border-subtle)',
                color: 'var(--text-muted)',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <Plus size={14} /> + Tambah Foto Lainnya
            </button>
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
        </div>

        {/* Restorasi Wajah (Face Restoration) */}
        <div className="control-group">
          <div className="switch-row">
            <div className="switch-label">
              <span className="switch-title">✨ Restorasi Wajah AI</span>
              <span className="switch-desc">Deteksi dan pertajam mata, bibir, serta kulit potret</span>
            </div>
            <input
              type="checkbox"
              checked={useFace}
              onChange={(e) => setUseFace(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
            />
          </div>

          {useFace && (
            <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="scale-buttons" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                {[
                  { id: 'codeformer', label: '🎯 CodeFormer (Detail Tajam)' },
                  { id: 'gfpgan', label: '🌸 GFPGAN v1.4 (Natural)' },
                ].map((fm) => (
                  <button
                    key={fm.id}
                    type="button"
                    className={`scale-btn ${faceModel === fm.id ? 'active' : ''}`}
                    onClick={() => setFaceModel(fm.id)}
                    style={{ padding: '8px 6px', fontSize: '0.78rem', textAlign: 'center' }}
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
                <div style={{ fontSize: '0.71rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                  💡 Rekomendasi bobot <strong>0.3 – 0.5</strong> agar tekstur wajah menyatu natural dengan foto asli tanpa efek plastik.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Clarity Slider */}
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

        {/* Opsi Lanjutan (Format & Tile) */}
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
                        border: format === f ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                        background: format === f ? 'var(--accent-gradient)' : 'rgba(255, 255, 255, 0.05)',
                        color: '#fff',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        textTransform: 'uppercase',
                      }}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Primary Action Button */}
        <button
          type="button"
          className="btn-primary-enhance"
          disabled={files.length === 0 || isProcessing}
          onClick={handleEnhance}
        >
          {isProcessing ? (
            <>
              <RefreshCw size={20} className="spinning" />
              <span>Memproses {files.length > 1 ? `${files.length} Foto` : 'Foto'} ({progress}%)...</span>
            </>
          ) : (
            <>
              <Sparkles size={20} />
              <span>
                {files.length === 0
                  ? 'Pilih Foto Terlebih Dahulu'
                  : files.length === 1
                  ? 'Tingkatkan Kualitas Foto'
                  : `Tingkatkan Kualitas ${files.length} Foto (Batch)`}
              </span>
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
              <span>{isBatchMode ? `${files.length} file batch` : `Model: ${model} (${scale}x)`}</span>
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

      {/* Kolom Kanan: Pratinjau / Slider / Galeri Batch */}
      <div className="glass-card studio-panel" style={{ justifyContent: 'center' }}>
        {/* KASUS A: Hasil Batch Processing */}
        {batchResult ? (
          activeCompareItem ? (
            /* Mode Periksa Slider dari salah satu item batch */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => setActiveCompareItem(null)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid var(--border-subtle)',
                    color: '#fff',
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                  }}
                >
                  <ArrowLeft size={14} /> Kembali ke Galeri Batch
                </button>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                  {activeCompareItem.name}
                </span>
              </div>

              <ImageComparisonSlider
                originalUrl={activeCompareItem.url}
                enhancedUrl={activeCompareItem.url}
              />

              <div style={{ display: 'flex', gap: '8px' }}>
                <a
                  href={activeCompareItem.url}
                  download={activeCompareItem.name}
                  className="btn-action-download"
                  style={{ flex: 1 }}
                >
                  <Download size={15} /> Unduh Foto Ini
                </a>
                <button
                  type="button"
                  className="btn-action-secondary"
                  onClick={() => handleOpenFile(activeCompareItem.absolute_path, activeCompareItem.name)}
                >
                  <ExternalLink size={15} /> Buka File
                </button>
              </div>
            </div>
          ) : (
            /* Galeri Ringkasan Hasil Batch */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#34d399', fontWeight: 700 }}>
                <CheckCircle size={20} />
                <span>Selesai! {batchResult.success_count} dari {batchResult.total} foto berhasil diproses ({batchResult.elapsed}s)</span>
              </div>

              {/* Action Buttons: Unduh ZIP & Buka Folder */}
              <div className="result-actions-wrapper">
                <div className="action-buttons-row">
                  <a
                    href={batchResult.zip_url}
                    download="batch_enhanced.zip"
                    className="btn-action-primary"
                    style={{ textDecoration: 'none' }}
                  >
                    <Download size={18} />
                    <span>Unduh Seluruh Foto (.ZIP)</span>
                  </a>

                  {batchResult.folder_path && (
                    <button
                      type="button"
                      className="btn-action-secondary"
                      onClick={() => handleOpenFolder(batchResult.folder_path)}
                    >
                      <FolderOpen size={16} />
                      <span>Buka di Folder Explorer</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Grid Galeri Hasil Batch */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                  gap: '12px',
                  maxHeight: '520px',
                  overflowY: 'auto',
                  padding: '4px',
                }}
              >
                {batchResult.items.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      position: 'relative',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      background: '#000',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <div style={{ position: 'relative', aspectRatio: '1', overflow: 'hidden' }}>
                      <img
                        src={item.url}
                        alt={item.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </div>
                    <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div
                        style={{
                          fontSize: '0.74rem',
                          fontWeight: 600,
                          color: '#fff',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        title={item.name}
                      >
                        {item.name}
                      </div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <a
                          href={item.url}
                          download={item.name}
                          style={{
                            flex: 1,
                            padding: '4px',
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '4px',
                            color: '#fff',
                            fontSize: '0.7rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px',
                            textDecoration: 'none',
                          }}
                        >
                          <Download size={11} /> Unduh
                        </a>
                        <button
                          type="button"
                          onClick={() => handleOpenFile(item.absolute_path, item.name)}
                          style={{
                            padding: '4px 6px',
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '4px',
                            color: '#fff',
                            fontSize: '0.7rem',
                            cursor: 'pointer',
                          }}
                          title="Buka file langsung"
                        >
                          <ExternalLink size={11} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        ) : singleResult ? (
          /* KASUS B: Hasil 1 Foto Tunggal (Interactive Slider) */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <ImageComparisonSlider
              originalUrl={singleResult.original_url}
              enhancedUrl={singleResult.enhanced_url}
            />

            {/* Stat Cards */}
            <div className="stat-cards-grid">
              <div className="stat-item">
                <div className="label">Resolusi Asli</div>
                <div className="val">{singleResult.orig_w}x{singleResult.orig_h}</div>
              </div>
              <div className="stat-item highlight">
                <div className="label">Hasil AI ({singleResult.scale}x)</div>
                <div className="val">{singleResult.new_w}x{singleResult.new_h}</div>
              </div>
              <div className="stat-item success">
                <div className="label">Waktu</div>
                <div className="val">{singleResult.elapsed}s</div>
              </div>
              <div className="stat-item">
                <div className="label">Ukuran</div>
                <div className="val">{singleResult.size_formatted}</div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="result-actions-wrapper">
              {singleResult.absolute_path && (
                <div className="path-display-card">
                  <div className="path-text" title={singleResult.absolute_path}>
                    <Folder size={15} style={{ flexShrink: 0, color: 'var(--accent-primary)' }} />
                    <span>{singleResult.absolute_path}</span>
                  </div>
                  <button
                    type="button"
                    className="btn-copy-path"
                    onClick={() => copyPath(singleResult.absolute_path)}
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
                  onClick={() => handleOpenFolder(singleResult.absolute_path, singleResult.filename)}
                >
                  <FolderOpen size={18} />
                  <span>Buka di Folder</span>
                </button>

                <button
                  type="button"
                  className="btn-action-secondary"
                  onClick={() => handleOpenFile(singleResult.absolute_path, singleResult.filename)}
                >
                  <ExternalLink size={16} />
                  <span>Buka File</span>
                </button>

                <a
                  href={singleResult.enhanced_url}
                  download={singleResult.filename}
                  className="btn-action-download"
                >
                  <Download size={15} />
                  <span>Unduh File</span>
                </a>
              </div>
            </div>
          </div>
        ) : files.length > 1 ? (
          /* Pratinjau Siap Proses Batch */
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-dim)' }}>
            <Layers size={48} style={{ color: 'var(--accent-primary)', marginBottom: '14px' }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', marginBottom: '6px' }}>
              {files.length} Foto Siap Ditingkatkan
            </h3>
            <p style={{ fontSize: '0.85rem', maxWidth: '360px', margin: '0 auto' }}>
              Klik tombol <strong>"Tingkatkan Kualitas {files.length} Foto (Batch)"</strong> di sisi kiri untuk memproses seluruh antrean sekaligus.
            </p>
          </div>
        ) : previewUrl ? (
          /* Pratinjau Siap Proses 1 Foto */
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
          /* Belum Ada File */
          <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-dim)' }}>
            <Sparkles size={48} style={{ color: 'rgba(255,255,255,0.1)', marginBottom: '16px' }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
              Pratinjau Studio
            </h3>
            <p style={{ fontSize: '0.85rem' }}>
              Unggah 1 foto atau pilih banyak foto sekaligus di sebelah kiri.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
