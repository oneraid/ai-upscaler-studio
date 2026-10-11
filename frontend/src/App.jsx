import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import TopHeader from './components/TopHeader';
import PhotoStudio from './components/PhotoStudio';
import VideoStudio from './components/VideoStudio';
import CropStudio from './components/CropStudio';

export default function App() {
  const [activeTab, setActiveTab] = useState('photo'); // 'photo' | 'video' | 'crop'
  const [videoForUpscale, setVideoForUpscale] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSendToUpscaler = (videoData) => {
    setVideoForUpscale(videoData);
    setActiveTab('video');
  };

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
    <div className="app-layout">
      {/* Modern Collapsible & Extensible Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />

      {/* Main Content Area */}
      <div className="main-content-wrapper">
        <TopHeader
          activeTab={activeTab}
          onToggleMobile={() => setMobileOpen(!mobileOpen)}
        />

        {/* Tab Panels: dijaga tetap ter-mount agar proses di background tidak hilang saat ganti tab */}
        <main className="main-content-panels">
          <div style={{ display: activeTab === 'photo' ? 'block' : 'none' }}>
            <PhotoStudio />
          </div>
          <div style={{ display: activeTab === 'video' ? 'block' : 'none' }}>
            <VideoStudio
              externalVideo={videoForUpscale}
              onClearExternalVideo={() => setVideoForUpscale(null)}
            />
          </div>
          <div style={{ display: activeTab === 'crop' ? 'block' : 'none' }}>
            <CropStudio onSendToUpscaler={handleSendToUpscaler} />
          </div>
        </main>

        {/* Minimal Footer */}
        <footer className="app-footer">
          AI Upscaler Studio &bull; Real-ESRGAN &bull; GFPGAN &bull; NVIDIA NVENC &bull; React 19 + Vite + FastAPI
        </footer>
      </div>
    </div>
  );
}
