import React, { useState } from 'react';
import { Video, Sparkles, Download, RefreshCw, AlertCircle, Scissors } from 'lucide-react';

export default function VideoStudio() {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  // Settings
  const [model, setModel] = useState('general-fast');
  const [scale, setScale] = useState(2);
  const [useFace, setUseFace] = useState(false);
  const [faceWeight, setFaceWeight] = useState(0.5);
  const [isTrim, setIsTrim] = useState(false);
  const [startSec, setStartSec] = useState(0);
  const [endSec, setEndSec] = useState(5);

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

  const handleEnhance = async () => {
    if (!file) return;
    setIsProcessing(true);
    setError(null);

    const formData = new FormData();
    formData.append('video', file);
    formData.append('model', model);
    formData.append('scale', scale);
    formData.append('face', useFace);
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

      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Terjadi kesalahan saat memproses video.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="studio-grid">
      {/* Left Column: Upload & Controls */}
      <div className="glass-card studio-panel">
        {!previewUrl ? (
          <label className="dropzone">
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
              Mendukung MP4, MKV, MOV, atau AVI
            </p>
          </label>
        ) : (
          <div className="dropzone-preview">
            <video src={previewUrl} controls style={{ width: '100%', maxHeight: '280px' }} />
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

        {/* Scale Buttons */}
        <div className="control-group">
          <label className="control-label">Perbesaran Video</label>
          <div className="scale-buttons" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <button
              type="button"
              className={`scale-btn ${scale === 2 ? 'active' : ''}`}
              onClick={() => setScale(2)}
            >
              2x (Cepat & Stabil)
            </button>
            <button
              type="button"
              className={`scale-btn ${scale === 4 ? 'active' : ''}`}
              onClick={() => setScale(4)}
            >
              4x (Detail Maksimal)
            </button>
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
              <span>Memproses Frame Video (NVIDIA NVENC)...</span>
            </>
          ) : (
            <>
              <Sparkles size={20} />
              <span>Tingkatkan Kualitas Video</span>
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

            {/* Download Button */}
            <a
              href={result.video_url}
              download={result.filename}
              className="btn-download"
            >
              <Download size={18} /> Unduh Video Hasil AI (Audio Asli)
            </a>
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
