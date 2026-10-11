import React, { useEffect, useState } from 'react';
import {
  Image,
  Video,
  Crop,
  Layers,
  Zap,
  Cpu,
  HardDrive,
  ChevronRight,
  Sparkles,
  X,
} from 'lucide-react';

export const NAV_ITEMS = [
  {
    id: 'photo',
    title: 'Image Upscale',
    desc: 'Tunggal & Batch / Face AI',
    icon: Image,
    badge: null,
  },
  {
    id: 'video',
    title: 'Video Upscale',
    desc: '4K UHD / NVENC / 60 FPS',
    icon: Video,
    badge: null,
  },
  {
    id: 'crop',
    title: 'Crop Video',
    desc: 'Trim Durasi & Rasio Aspek',
    icon: Crop,
    badge: 'Baru',
  },
];

export default function Sidebar({ activeTab, setActiveTab, mobileOpen, setMobileOpen }) {
  const [system, setSystem] = useState({
    has_gpu: true,
    gpu_name: 'Mendeteksi GPU...',
    vram_gb: 0,
    cuda: true,
    free_disk: '...',
  });

  useEffect(() => {
    fetch('/api/system')
      .then((res) => res.json())
      .then((data) => setSystem(data))
      .catch((err) => console.error('Gagal mengambil status sistem:', err));
  }, []);

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside className={`app-sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        {/* Top: Brand Header */}
        <div className="sidebar-header">
          <div className="brand-section" style={{ gap: '12px' }}>
            <div className="brand-icon-box" style={{ width: '40px', height: '40px' }}>
              <Zap size={22} />
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="brand-title" style={{ fontSize: '1.08rem' }}>AI Upscaler</span>
                <span className="brand-version-badge">v2.2</span>
              </div>
              <p className="brand-subtitle" style={{ fontSize: '0.72rem' }}>
                100% Offline &bull; Privat Studio
              </p>
            </div>
          </div>

          {/* Close button for mobile */}
          <button
            type="button"
            className="sidebar-close-btn"
            onClick={() => setMobileOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        {/* Middle: Navigation Items */}
        <div className="sidebar-content">
          <div className="sidebar-section-label">
            <span>FITUR STUDIO</span>
          </div>

          <nav className="sidebar-nav">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab(item.id);
                    if (setMobileOpen) setMobileOpen(false);
                  }}
                >
                  <div className="nav-icon-wrapper">
                    <Icon size={19} />
                  </div>

                  <div className="nav-text-wrapper">
                    <div className="nav-title-row">
                      <span className="nav-title">{item.title}</span>
                      {item.badge && <span className="nav-badge">{item.badge}</span>}
                    </div>
                    <span className="nav-desc">{item.desc}</span>
                  </div>

                  <ChevronRight size={14} className="nav-arrow" />
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom: System Hardware Status */}
        <div className="sidebar-footer">
          <div className="sidebar-system-card">
            <div className="system-card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="status-dot"></span>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8' }}>
                  {system.has_gpu ? 'AKSELERASI GPU AKTIF' : 'CPU FALLBACK'}
                </span>
              </div>
              <Cpu size={14} style={{ color: 'var(--accent-secondary)' }} />
            </div>

            <div className="system-gpu-name" title={system.gpu_name}>
              {system.gpu_name}
            </div>

            <div className="system-specs-row">
              {system.has_gpu && (
                <span className="spec-pill">
                  ⚡ {system.vram_gb} GB VRAM
                </span>
              )}
              {system.free_disk && (
                <span className="spec-pill">
                  💾 {system.free_disk} Free
                </span>
              )}
            </div>
          </div>

          <div className="sidebar-footnote">
            Real-ESRGAN &bull; GFPGAN &bull; NVENC
          </div>
        </div>
      </aside>
    </>
  );
}
