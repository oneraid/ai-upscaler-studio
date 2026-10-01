import React, { useEffect, useState } from 'react';
import { Zap, Cpu, HardDrive } from 'lucide-react';

export default function Navbar() {
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
    <header className="navbar glass-card">
      <div className="brand-section">
        <div className="brand-icon-box">
          <Zap size={24} />
        </div>
        <div>
          <h1 className="brand-title">AI Upscaler Studio</h1>
          <p className="brand-subtitle">Super-Resolution &bull; 100% Offline &bull; Privat</p>
        </div>
      </div>

      <div className="system-badges">
        <div className={`gpu-badge ${system.has_gpu ? '' : 'cpu'}`}>
          <span className="status-dot"></span>
          <Cpu size={15} />
          <span>
            {system.has_gpu
              ? `${system.gpu_name} • ${system.vram_gb} GB VRAM`
              : 'CPU Mode'}
          </span>
        </div>

        {system.free_disk && (
          <div
            className="gpu-badge"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              borderColor: 'rgba(255, 255, 255, 0.1)',
              color: '#94a3b8',
            }}
          >
            <HardDrive size={14} />
            <span>Disk: {system.free_disk}</span>
          </div>
        )}
      </div>
    </header>
  );
}
