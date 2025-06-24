// src/components/robot/ViewerOptions/URDFViewer.jsx
import React, { useEffect, useRef, forwardRef } from 'react';
import { useViewer } from '../../../contexts/ViewerContext';
import EventBus from '../../../utils/EventBus';

const URDFViewer = forwardRef((props, ref) => {
  const viewerContainerRef = useRef(null);
  const { initializeViewer, isViewerReady } = useViewer();
  const initAttemptedRef = useRef(false);

  useEffect(() => {
    // Only initialize once when container is available
    if (viewerContainerRef.current && !initAttemptedRef.current && !isViewerReady) {
      initAttemptedRef.current = true;
      
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        if (viewerContainerRef.current) {
          initializeViewer(viewerContainerRef.current);
        }
      }, 0);
    }
  }, [initializeViewer, isViewerReady]);

  return (
    <div 
      ref={viewerContainerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden'
      }}
    />
  );
});

URDFViewer.displayName = 'URDFViewer';

export default URDFViewer;