import React, { useState, useEffect, useRef } from 'react';
import {
  Layers,
  Sparkles,
  Download,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  FolderOpen,
  ExternalLink,
  Copy,
  Check,
  Folder,
} from 'lucide-react';

export default function BatchStudio() {
  const [files, setFiles] = useState([]);
  const [model, setModel] = useState('general-x4');
  const [scale, setScale] = useState(4);
  const [targetRes, setTargetRes] = useState(null);
  const [useFace, setUseFace] = useState(false);
  const [faceModel, setFaceModel] = useState('codeformer');
  const [faceWeight, setFaceWeight] = useState(0.6);
  const [clarity, setClarity] = useState(20);
  const [format, setFormat] = useState('png');

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

  const processFiles = (fileList) => {
    if (!fileList || fileList.length === 0) return;
    const arrayFiles = Array.from(fileList);
    const validImages = arrayFiles.filter(isValidImage);
    if (validImages.length === 0) {
      setError('Format file tidak didukung. Harap pilih file gambar (JPG, PNG, WEBP, BMP).');
      return;
    }
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    localStorage.removeItem('upscaler_active_batch_task');
    setFiles(validImages);
    setResult(null);
    setError(null);
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
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
      processFiles(e.dataTransfer.files);
    }
  };

  const handleOpenFolder = async (path) => {
    try {
      await fetch('/api/open-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: path, media_type: 'photo' }),
      });
    } catch (e) {
      console.error('Gagal membuka folder:', e);
    }
  };

  const handleOpenFile = async (path) => {
    try {
      await fetch('/api/open-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: path, media_type: 'photo' }),
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
  const startPolling = (taskId) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    setIsProcessing(true);
    localStorage.setItem('upscaler_active_batch_task', taskId);

    pollTimerRef.current = setInterval(async () => {
      try {
        const tRes = await fetch(`/api/task/${taskId}`);
        if (!tRes.ok) return;
        const tData = await tRes.json();
        setProgress(tData.progress || 0);
        if (tData.message) setProgressMsg(tData.message);

        if (tData.status === 'completed') {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
          setResult(tData.result);
          setIsProcessing(false);
          setProgress(100);
          localStorage.removeItem('upscaler_active_batch_task');
        } else if (tData.status === 'failed') {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
          setError(tData.error || 'Terjadi kesalahan saat memproses batch.');
          setIsProcessing(false);
          localStorage.removeItem('upscaler_active_batch_task');
        }
      } catch (pollErr) {
        console.error('Polling error:', pollErr);
      }
    }, 400);
  };

  // Auto-recovery: Pulihkan progress batch jika halaman ter-refresh saat batch sedang berjalan
  useEffect(() => {
    const recoverTask = async () => {
      const savedTaskId = localStorage.getItem('upscaler_active_batch_task');
      let targetTaskId = savedTaskId;

      if (!targetTaskId) {
        try {
          const aRes = await fetch('/api/tasks/active');
          if (aRes.ok) {
            const aData = await aRes.json();
            const activeBatch = (aData.tasks || []).find((t) => t.media_type === 'batch');
            if (activeBatch) {
              targetTaskId = activeBatch.task_id;
            }
          }
        } catch (e) {
          console.debug('Gagal cek active batch tasks:', e);
        }
      }

      if (targetTaskId) {
        try {
          const res = await fetch(`/api/task/${targetTaskId}`);
          if (res.ok) {
            const data = await res.json();
            if (data.status === 'processing') {
              setProgress(data.progress || 0);
              setProgressMsg(data.message || 'Melanjutkan proses batch AI...');
              if (data.model) setModel(data.model);
              if (data.scale) setScale(data.scale);
              startPolling(targetTaskId);
            } else if (data.status === 'completed') {
              setResult(data.result);
              localStorage.removeItem('upscaler_active_batch_task');
            } else {
              localStorage.removeItem('upscaler_active_batch_task');
            }
          }
        } catch (err) {
          console.error('Gagal memulihkan task batch:', err);
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

  // Proteksi sebelum halaman ditutup / direfresh oleh user saat proses batch aktif
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isProcessing) {
        e.preventDefault();
        e.returnValue = 'Proses batch AI sedang berjalan di latar belakang. Yakin ingin meninggalkan halaman?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isProcessing]);

  const handleEnhance = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setError(null);
    setProgress(0);
    setProgressMsg('Menyiapkan batch foto...');

    const formData = new FormData();
    files.forEach((f) => formData.append('files', f));
    formData.append('model', model);
    formData.append('scale', scale);
    if (targetRes) {
      formData.append('target_res', targetRes);
    }
    formData.append('face', useFace);
    formData.append('face_model', faceModel);
    formData.append('face_weight', faceWeight);
    formData.append('clarity', (clarity / 100.0).toFixed(2));
    formData.append('format', format);

    try {
      const res = await fetch('/api/enhance/batch', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Gagal memproses batch (${res.status})`);
      }

      const initData = await res.json();
      const taskId = initData.task_id;

      if (!taskId) {
        setResult(initData);
        setIsProcessing(false);
        return;
      }

      startPolling(taskId);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Terjadi kesalahan saat memproses batch.');
      setIsProcessing(false);
      localStorage.removeItem('upscaler_active_batch_task');
    }
  };

  return (
    <div className="studio-grid">
      {/* Left Column: Upload & Options */}
      <div className="glass-card studio-panel">
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
            multiple
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <Layers size={44} style={{ color: 'var(--accent-primary)', marginBottom: '10px' }} />
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '4px' }}>
            Unggah Banyak Foto Sekaligus
          </h3>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>
            Drag & drop atau klik untuk memilih beberapa foto
          </p>
        </label>

        {files.length > 0 && (
          <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(99, 102, 241, 0.1)', border: '1px solid var(--border-accent)', fontSize: '0.85rem' }}>
            <strong>{files.length} foto</strong> dipilih dan siap diproses.
          </div>
        )}

        {/* Model Selector */}
        <div className="control-group">
          <label className="control-label">Model AI</label>
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
              <div className="desc">Cepat & efisien</div>
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

        {/* Scale & Target Resolution Preset */}
        <div className="control-group">
          <label className="control-label">Faktor Perbesaran & Target Resolusi</label>

          {/* Faktor Skala: 1x, 2x, 3x, 4x, 8x */}
          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '5px', fontWeight: 600 }}>
              FAKTOR SKALA (MULTIPLIER)
            </div>
            <div className="scale-buttons" style={{ gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
              {[
                { s: 1, label: '1x', desc: 'Tetap' },
                { s: 2, label: '2x', desc: 'Cepat' },
                { s: 3, label: '3x', desc: 'Sedang' },
                { s: 4, label: '4x', desc: 'Detail' },
                { s: 8, label: '8x 🔥', desc: 'Ultra' },
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

          {/* Info pill */}
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
            <span>📐 Target Batch:</span>
            <span style={{ fontWeight: 700, color: '#fff' }}>
              {targetRes ? `Preset ${targetRes.toUpperCase()} (Aspek Rasio Terjaga)` : `${scale === 1 ? '1x Tetap (Restorasi Saja)' : `${scale}x Perbesaran`}`}
            </span>
          </div>
        </div>

        {/* Face toggle & engine */}
        <div className="control-group">
          <div className="switch-row">
            <div className="switch-label">
              <span className="switch-title">Restorasi Wajah AI</span>
              <span className="switch-desc">Terapkan pada semua foto</span>
            </div>
            <input
              type="checkbox"
              checked={useFace}
              onChange={(e) => setUseFace(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
            />
          </div>

          {useFace && (
            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '6px' }}>
                {[
                  { id: 'codeformer', label: 'CodeFormer (Tajam)' },
                  { id: 'gfpgan', label: 'GFPGAN' },
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
              <span>Memproses {files.length} Foto ({progress}%)...</span>
            </>
          ) : (
            <>
              <Sparkles size={20} />
              <span>Mulai Proses Seluruh Foto</span>
            </>
          )}
        </button>

        {/* Real-time Progress Bar */}
        {isProcessing && (
          <div className="progress-card">
            <div className="progress-header">
              <div className="progress-title">
                <RefreshCw size={15} className="spinning" />
                <span>{progressMsg || 'Memproses batch foto...'}</span>
              </div>
              <div className="progress-percent">{progress}%</div>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="progress-footer">
              <span>{files.length} file terpilih</span>
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

      {/* Right Column: Batch Gallery & Actions */}
      <div className="glass-card studio-panel" style={{ justifyContent: 'center' }}>
        {result ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#34d399', fontWeight: 700 }}>
              <CheckCircle size={20} />
              <span>Selesai! {result.success_count} dari {result.total} foto berhasil diproses ({result.elapsed}s)</span>
            </div>

            {/* Path Info & Action Buttons */}
            <div className="result-actions-wrapper">
              {result.folder_path && (
                <div className="path-display-card">
                  <div className="path-text" title={result.folder_path}>
                    <Folder size={15} style={{ flexShrink: 0, color: 'var(--accent-primary)' }} />
                    <span>{result.folder_path}</span>
                  </div>
                  <button
                    type="button"
                    className="btn-copy-path"
                    onClick={() => copyPath(result.folder_path)}
                    title="Salin path folder ke clipboard"
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
                  onClick={() => handleOpenFolder(result.folder_path)}
                  title="Buka File Explorer ke folder output photo"
                >
                  <FolderOpen size={18} />
                  <span>Buka di Folder</span>
                </button>

                {result.absolute_path && (
                  <button
                    type="button"
                    className="btn-action-secondary"
                    onClick={() => handleOpenFile(result.absolute_path)}
                    title="Buka file ZIP hasil batch"
                  >
                    <ExternalLink size={16} />
                    <span>Buka Arsip ZIP</span>
                  </button>
                )}

                <a
                  href={result.zip_url}
                  download="batch_enhanced.zip"
                  className="btn-action-download"
                  title="Unduh seluruh foto dalam satu file ZIP"
                >
                  <Download size={15} />
                  <span>Unduh (.ZIP)</span>
                </a>
              </div>
            </div>

            {/* Gallery Grid */}
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
              {result.items.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    position: 'relative',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    background: '#000',
                    border: '1px solid var(--border-subtle)',
                    aspectRatio: '1',
                  }}
                >
                  <img
                    src={item.url}
                    alt={item.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      background: 'rgba(0,0,0,0.7)',
                      fontSize: '0.72rem',
                      padding: '4px 6px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {item.name}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-dim)' }}>
            <Layers size={48} style={{ color: 'rgba(255,255,255,0.1)', marginBottom: '16px' }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
              Galeri Batch
            </h3>
            <p style={{ fontSize: '0.85rem' }}>
              Unggah kumpulan foto di sisi kiri untuk memproses semuanya sekaligus dan mengunduh arsip ZIP.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
