import React, { useRef, useEffect } from 'react';
import URDFViewer from './components/ViewerOptions/URDFViewer';
import Controls from './components/controls/Controls';
import { RobotProvider, useRobot } from './contexts/RobotContext';
import './App.css';

// Main app content that uses the robot context
const AppContent = () => {
  const { setViewer, isLoading, error } = useRobot();
  const viewerRef = useRef(null);
  
  // Register the viewer ref with the context
  useEffect(() => {
    if (viewerRef.current) {
      setViewer(viewerRef.current);
    }
  }, [viewerRef, setViewer]);
  
  return (
    <div className="app-container" style={{ 
      display: 'flex', 
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      margin: 0,
      padding: 0,
      overflow: 'hidden'
    }}>
      {/* Controls panel - fixed narrow width */}
      <div className="controls-panel" style={{ 
        width: '280px',
        height: '100%', 
        overflowY: 'auto',
        overflowX: 'hidden',
        borderRight: '1px solid #ccc',
        padding: '0 10px',
        boxSizing: 'border-box',
        backgroundColor: '#f8f8f8'
      }}>
        <h2 style={{ padding: '1rem 0', margin: 0 }}>URDF Viewer</h2>
        
        <Controls 
          viewerRef={viewerRef}
          showJointControls={true}
          showOptions={true}
          showLoadOptions={true}
        />
      </div>
      
      {/* Viewer panel - takes all remaining space */}
      <div className="viewer-panel" style={{ 
        flex: 1,
        position: 'relative',
        height: '100%',
        backgroundColor: '#e6f2ff' // Light blue background
      }}>
        <URDFViewer
          ref={viewerRef}
          width="100%"
          height="100%"
          backgroundColor="#e6f2ff" // Match panel background
          enableShadows={true}
        />
        
        {/* Loading overlay */}
        {isLoading && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.5)',
            color: 'white',
            zIndex: 100
          }}>
            <div>Loading robot...</div>
          </div>
        )}
        
        {/* Error message */}
        {error && (
          <div style={{
            position: 'absolute',
            bottom: '20px',
            left: '20px',
            padding: '10px 20px',
            background: 'rgba(255, 0, 0, 0.7)',
            color: 'white',
            borderRadius: '4px',
            zIndex: 100
          }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

// Wrap the app with the robot provider
const App = () => {
  return (
    <RobotProvider>
      <AppContent />
    </RobotProvider>
  );
};

export default App;