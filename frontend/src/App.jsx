import React, { useState } from 'react';
import Navbar from './components/Navbar';
import PhotoStudio from './components/PhotoStudio';
import VideoStudio from './components/VideoStudio';
import BatchStudio from './components/BatchStudio';
import { Image, Video, Layers } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('photo'); // 'photo' | 'video' | 'batch'

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

      {/* Tab Panels */}
      <main>
        {activeTab === 'photo' && <PhotoStudio />}
        {activeTab === 'video' && <VideoStudio />}
        {activeTab === 'batch' && <BatchStudio />}
      </main>

      {/* Minimal Footer */}
      <footer style={{ textAlign: 'center', marginTop: '48px', color: 'var(--text-dim)', fontSize: '0.8rem' }}>
        AI Upscaler Studio &bull; Real-ESRGAN &bull; GFPGAN &bull; NVIDIA NVENC &bull; React + Vite + FastAPI
      </footer>
    </div>
  );
}
