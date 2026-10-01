import React, { useState, useRef, useCallback } from 'react';
import { Columns, SplitSquareVertical } from 'lucide-react';

export default function ImageComparisonSlider({ originalUrl, enhancedUrl }) {
  const [sliderPos, setSliderPos] = useState(50); // percentage 0 to 100
  const [isDragging, setIsDragging] = useState(false);
  const [viewMode, setViewMode] = useState('slider'); // 'slider' | 'side-by-side'
  const containerRef = useRef(null);

  const handleMove = useCallback((clientX) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPos(percent);
  }, []);

  const onMouseDown = () => setIsDragging(true);
  const onMouseUp = () => setIsDragging(false);

  const onMouseMove = (e) => {
    if (!isDragging) return;
    handleMove(e.clientX);
  };

  const onTouchMove = (e) => {
    if (e.touches && e.touches[0]) {
      handleMove(e.touches[0].clientX);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Mode toggle */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
        <button
          type="button"
          onClick={() => setViewMode('slider')}
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: '1px solid var(--border-subtle)',
            background: viewMode === 'slider' ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
            color: viewMode === 'slider' ? '#fff' : 'var(--text-dim)',
            cursor: 'pointer',
            fontSize: '0.8rem',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <SplitSquareVertical size={14} /> Slider Perbandingan
        </button>

        <button
          type="button"
          onClick={() => setViewMode('side-by-side')}
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: '1px solid var(--border-subtle)',
            background: viewMode === 'side-by-side' ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
            color: viewMode === 'side-by-side' ? '#fff' : 'var(--text-dim)',
            cursor: 'pointer',
            fontSize: '0.8rem',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Columns size={14} /> Berdampingan
        </button>
      </div>

      {viewMode === 'slider' ? (
        <div
          ref={containerRef}
          className="slider-container"
          onMouseDown={onMouseDown}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onMouseMove={onMouseMove}
          onTouchMove={onTouchMove}
        >
          {/* Enhanced Image (Background) */}
          <img
            src={enhancedUrl}
            alt="AI Enhanced"
            className="slider-img"
            draggable={false}
          />
          <div className="tag-badge tag-after">✨ HASIL AI</div>

          {/* Original Image (Clipped Foreground) */}
          <div
            className="slider-clip"
            style={{ width: `${sliderPos}%` }}
          >
            <img
              src={originalUrl}
              alt="Original"
              className="slider-img"
              style={{
                width: containerRef.current ? `${containerRef.current.clientWidth}px` : '100%',
                maxWidth: 'none',
              }}
              draggable={false}
            />
            <div className="tag-badge tag-before">ASLI</div>
          </div>

          {/* Draggable Divider Handle */}
          <div
            className="slider-handle"
            style={{ left: `${sliderPos}%` }}
          >
            <div className="handle-pill">
              &#10094;&#10095;
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', background: '#000', height: '480px' }}>
            <img src={originalUrl} alt="Original" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            <div className="tag-badge tag-before">FOTO ASLI</div>
          </div>
          <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', background: '#000', height: '480px' }}>
            <img src={enhancedUrl} alt="AI Enhanced" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            <div className="tag-badge tag-after">✨ HASIL AI</div>
          </div>
        </div>
      )}
    </div>
  );
}
