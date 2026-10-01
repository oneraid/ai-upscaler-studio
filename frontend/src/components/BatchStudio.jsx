import React, { useState } from 'react';
import { Layers, Sparkles, Download, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';

export default function BatchStudio() {
  const [files, setFiles] = useState([]);
  const [model, setModel] = useState('general-x4');
  const [scale, setScale] = useState(4);
  const [useFace, setUseFace] = useState(false);
  const [format, setFormat] = useState('png');

  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleFileChange = (e) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
      setResult(null);
      setError(null);
    }
  };

  const handleEnhance = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setError(null);

    const formData = new FormData();
    files.forEach((f) => formData.append('files', f));
    formData.append('model', model);
    formData.append('scale', scale);
    formData.append('face', useFace);
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

      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Terjadi kesalahan saat memproses batch.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="studio-grid">
      {/* Left Column: Upload & Options */}
      <div className="glass-card studio-panel">
        <label className="dropzone">
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
            Pilih beberapa file foto untuk diproses bertahap
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
          <div className="model-selector">
            <div
              className={`model-card ${model === 'general-x4' ? 'active' : ''}`}
              onClick={() => setModel('general-x4')}
            >
              <div className="title">💎 Ultra</div>
              <div className="desc">Kualitas tinggi</div>
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

        {/* Scale */}
        <div className="control-group">
          <label className="control-label">Perbesaran</label>
          <div className="scale-buttons">
            {[2, 3, 4].map((s) => (
              <button
                key={s}
                type="button"
                className={`scale-btn ${scale === s ? 'active' : ''}`}
                onClick={() => setScale(s)}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        {/* Face toggle */}
        <div className="control-group">
          <div className="switch-row">
            <div className="switch-label">
              <span className="switch-title">Restorasi Wajah GFPGAN</span>
              <span className="switch-desc">Terapkan pada semua foto</span>
            </div>
            <input
              type="checkbox"
              checked={useFace}
              onChange={(e) => setUseFace(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
            />
          </div>
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
              <span>Memproses {files.length} Foto...</span>
            </>
          ) : (
            <>
              <Sparkles size={20} />
              <span>Mulai Proses Seluruh Foto</span>
            </>
          )}
        </button>

        {error && (
          <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', fontSize: '0.85rem', display: 'flex', gap: '8px' }}>
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Right Column: Batch Gallery & Download */}
      <div className="glass-card studio-panel" style={{ justifyContent: 'center' }}>
        {result ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#34d399', fontWeight: 700 }}>
                <CheckCircle size={20} />
                <span>Selesai! {result.success_count} dari {result.total} foto berhasil ({result.elapsed}s)</span>
              </div>
              <a
                href={result.zip_url}
                download="batch_enhanced.zip"
                className="btn-download"
                style={{ padding: '10px 18px', fontSize: '0.85rem' }}
              >
                <Download size={16} /> Unduh Semua (.ZIP)
              </a>
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
