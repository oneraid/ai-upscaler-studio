import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import PhotoStudio from './components/PhotoStudio';
import VideoStudio from './components/VideoStudio';
import BatchStudio from './components/BatchStudio';
import { Image, Video, Layers } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('photo'); // 'photo' | 'video' | 'batch'

  useEffect(() => {
    const preventDefaults = (e) => {
      e.preventDefault();
    };
    window.addEventListener('dragover', preventDefaults);
    window.addEventListener('drop', preventDefaults);
    return () => {
      window.removeEventListener('dragover', preventDefaults);
      window.removeEventListener('drop', preventDefaults);
    };
  }, []);

  return (
    <div className="app-container">
      {/* Top Navbar */}
      <Navbar />

      {/* Main Tabs Navigation */}
      <nav className="tabs-nav">
        <button
          type="button"
          className={`tab-btn ${activeTab === 'photo' ? 'active' : ''}`}
          onClick={() => setActiveTab('photo')}
        >
          <Image size={18} />
          <span>Foto Studio</span>
        </button>

        <button
          type="button"
          className={`tab-btn ${activeTab === 'video' ? 'active' : ''}`}
          onClick={() => setActiveTab('video')}
        >
          <Video size={18} />
          <span>Video Upscale</span>
        </button>

        <button
          type="button"
          className={`tab-btn ${activeTab === 'batch' ? 'active' : ''}`}
          onClick={() => setActiveTab('batch')}
        >
          <Layers size={18} />
          <span>Batch Processing</span>
        </button>
      </nav>

      {/* Tab Panels: dijaga tetap ter-mount agar proses upscaling di background tidak hilang saat ganti tab */}
      <main>
        <div style={{ display: activeTab === 'photo' ? 'block' : 'none' }}>
          <PhotoStudio />
        </div>
        <div style={{ display: activeTab === 'video' ? 'block' : 'none' }}>
          <VideoStudio />
        </div>
        <div style={{ display: activeTab === 'batch' ? 'block' : 'none' }}>
          <BatchStudio />
        </div>
      </main>

      {/* Minimal Footer */}
      <footer style={{ textAlign: 'center', marginTop: '48px', color: 'var(--text-dim)', fontSize: '0.8rem' }}>
        AI Upscaler Studio &bull; Real-ESRGAN &bull; GFPGAN &bull; NVIDIA NVENC &bull; React + Vite + FastAPI
      </footer>
    </div>
  );
}
