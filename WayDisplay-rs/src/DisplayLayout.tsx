import React, { useState, useRef, useEffect } from 'react';
import './DisplayLayout.css';

interface Display {
  name: string;
  make: string;
  model: string;
  physical_size: {
    width: number;
    height: number;
  };
  position?: {
    x: number;
    y: number;
  };
}

interface DisplayLayoutProps {
  displays: Display[];
  onPositionChange: (displayName: string, x: number, y: number) => void;
  selectedDisplayName?: string;
}

export function DisplayLayout({ displays, onPositionChange, selectedDisplayName }: DisplayLayoutProps) {
  const [draggingDisplay, setDraggingDisplay] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Scaling factor (1 Pixel = X mm)
  const SCALE = 0.15;

  const handleMouseDown = (e: React.MouseEvent, displayName: string) => {
    e.preventDefault();
    const display = displays.find(d => d.name === displayName);
    if (!display) return;

    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
    setDraggingDisplay(displayName);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingDisplay || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const newX = e.clientX - containerRect.left - dragOffset.x;
      const newY = e.clientY - containerRect.top - dragOffset.y;

      onPositionChange(draggingDisplay, newX, newY);
    };

    const handleMouseUp = () => {
      setDraggingDisplay(null);
    };

    if (draggingDisplay) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingDisplay, dragOffset, onPositionChange]);

  return (
    <div className="display-layout-container" ref={containerRef}>
      <div className="display-layout-canvas">
        {displays.map((display) => {
          const width = display.physical_size.width * SCALE;
          const height = display.physical_size.height * SCALE;
          const x = display.position?.x ?? 0;
          const y = display.position?.y ?? 0;

          return (
            <div
              key={display.name}
              className={`display-box ${selectedDisplayName === display.name ? 'selected' : ''} ${draggingDisplay === display.name ? 'dragging' : ''}`}
              style={{
                width: `${width}px`,
                height: `${height}px`,
                left: `${x}px`,
                top: `${y}px`,
              }}
              onMouseDown={(e) => handleMouseDown(e, display.name)}
            >
              <div className="display-label">
                <strong>{display.name}</strong>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
