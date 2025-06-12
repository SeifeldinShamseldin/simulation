import React, { useState, useEffect, useRef, useCallback } from 'react';

const ResizablePanel = ({ 
  children, 
  defaultWidth = 400, 
  minWidth = 300, 
  maxWidth = 800,
  storageKey = 'panel-width',
  className = '',
  onWidthChange 
}) => {
  const [width, setWidth] = useState(() => {
    // Load saved width from localStorage
    const saved = localStorage.getItem(storageKey);
    return saved ? parseInt(saved, 10) : defaultWidth;
  });
  
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  // Save width to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(storageKey, width.toString());
    if (onWidthChange) {
      onWidthChange(width);
    }
  }, [width, storageKey, onWidthChange]);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = width;
    
    // Add cursor style to body
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  }, [width]);

  const handleMouseMove = useCallback((e) => {
    if (!isResizing) return;
    
    const deltaX = e.clientX - startXRef.current;
    const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidthRef.current + deltaX));
    
    // 🚨 FIX: Update width immediately for smooth resize
    setWidth(newWidth);
  }, [isResizing, minWidth, maxWidth]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  // Add global mouse events when resizing
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

  return (
    <div
      ref={panelRef}
      className={`resizable-panel ${className}`}
    >
      {children}
      
      {/* Resize Handle */}
      <div
        className="resize-handle"
        onMouseDown={handleMouseDown}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '4px',
          height: '100%',
          cursor: 'ew-resize',
          background: 'transparent',
          zIndex: 1001,
        }}
      >
        {/* Visual indicator */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            right: '1px',
            transform: 'translateY(-50%)',
            width: '2px',
            height: '40px',
            background: isResizing ? '#00a99d' : 'rgba(0, 0, 0, 0.2)',
            borderRadius: '1px',
            transition: 'background-color 0.2s ease',
          }}
        />
      </div>
      
      {/* Hover area for better UX */}
      <div
        className="resize-hover-area"
        onMouseDown={handleMouseDown}
        style={{
          position: 'absolute',
          top: 0,
          right: '-2px',
          width: '8px',
          height: '100%',
          cursor: 'ew-resize',
          background: 'transparent',
          zIndex: 1000,
        }}
      />
    </div>
  );
};

export default ResizablePanel;