import React from 'react';
import { Menu, Sparkles, Image, Video, Crop, Layers } from 'lucide-react';
import { NAV_ITEMS } from './Sidebar';

export default function TopHeader({ activeTab, onToggleMobile }) {
  const currentItem = NAV_ITEMS.find((item) => item.id === activeTab) || NAV_ITEMS[0];

  return (
    <header className="main-topbar glass-card">
      <div className="topbar-left">
        <button
          type="button"
          className="mobile-hamburger-btn"
          onClick={onToggleMobile}
          aria-label="Toggle Navigation Sidebar"
        >
          <Menu size={20} />
        </button>

        <div className="topbar-title-group">
          <div className="topbar-active-title">
            <h2>{currentItem.title}</h2>
            {currentItem.badge && (
              <span className="nav-badge" style={{ fontSize: '0.68rem', padding: '2px 8px' }}>
                {currentItem.badge}
              </span>
            )}
          </div>
          <p className="topbar-active-subtitle">{currentItem.desc}</p>
        </div>
      </div>

      <div className="topbar-right">
        <div className="topbar-feature-tag">
          <Sparkles size={14} style={{ color: 'var(--accent-primary)' }} />
          <span>Local AI Inference</span>
        </div>
      </div>
    </header>
  );
}
