import React, { useState } from 'react';
import { UploadCloud, Sparkles, Download, RefreshCw, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import ImageComparisonSlider from './ImageComparisonSlider';

export default function PhotoStudio() {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  // Settings
  const [model, setModel] = useState('general-x4');
  const [scale, setScale] = useState(4);
  const [useFace, setUseFace] = useState(false);
  const [faceWeight, setFaceWeight] = useState(0.6);
  const [tile, setTile] = useState(400);
  const [format, setFormat] = useState('png');
  const [quality, setQuality] = useState(95);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleFileChange = (e) => {
    const selected = e.target.files && e.target.files[0];
    if (selected) {
      setFile(selected);
      setPreviewUrl(URL.createObjectURL(selected));
      setResult(null);
      setError(null);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const dropped = e.dataTransfer.files[0];
      if (dropped.type.startsWith('image/')) {
        setFile(dropped);
        setPreviewUrl(URL.createObjectURL(dropped));
        setResult(null);
        setError(null);
      }
    }
  };

  const handleEnhance = async () => {
    if (!file) return;
    setIsProcessing(true);
    setError(null);

    const formData = new FormData();
    formData.append('image', file);
    formData.append('model', model);
    formData.append('scale', scale);
    formData.append('face', useFace);
    formData.append('face_weight', faceWeight);
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

      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Terjadi kesalahan saat memproses foto.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="studio-grid">
      {/* Left Column: Upload & Controls */}
      <div className="glass-card studio-panel">
        {/* Dropzone */}
        {!previewUrl ? (
          <label
            className="dropzone"
            onDragOver={(e) => e.preventDefault()}
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
          <div className="dropzone-preview">
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
          <div className="model-selector">
            <div
              className={`model-card ${model === 'general-x4' ? 'active' : ''}`}
              onClick={() => setModel('general-x4')}
            >
              <div className="title">💎 Ultra</div>
              <div className="desc">Detail tertinggi</div>
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

        {/* Scale Buttons */}
        <div className="control-group">
          <label className="control-label">Faktor Perbesaran</label>
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

        {/* Face Restoration Toggle */}
        <div className="control-group">
          <div className="switch-row">
            <div className="switch-label">
              <span className="switch-title">✨ Restorasi Wajah (GFPGAN)</span>
              <span className="switch-desc">Pertajam mata, bibir, dan kulit wajah</span>
            </div>
            <input
              type="checkbox"
              checked={useFace}
              onChange={(e) => setUseFace(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
            />
          </div>

          {useFace && (
            <div style={{ marginTop: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                <span>Kekuatan Wajah</span>
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
          )}
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
              <span>Memproses dengan AI...</span>
            </>
          ) : (
            <>
              <Sparkles size={20} />
              <span>Tingkatkan Kualitas Foto</span>
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

            {/* Download Button */}
            <a
              href={result.enhanced_url}
              download={result.filename}
              className="btn-download"
            >
              <Download size={18} /> Unduh Hasil Resolusi Penuh
            </a>
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
