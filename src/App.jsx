import React, { useRef, useEffect } from 'react';
import URDFViewer from './components/ViewerOptions/URDFViewer';
import Controls from './components/controls/Controls';
import Environment from './components/controls/Environment';
import Navbar from './components/Navbar/Navbar';
import { RobotProvider, useRobot } from './contexts/RobotContext';
import './App.css';

/**
 * Main app content component
 */
const AppContent = ({ activePanel, setActivePanel }) => {
  const { setViewer, isLoading, error } = useRobot();
  const viewerRef = useRef(null);
  
  // Register viewer with context
  useEffect(() => {
    if (viewerRef.current) {
      setViewer(viewerRef.current);
    }
  }, [viewerRef, setViewer]);
  
  return (
    <div className="app-container">
      {/* Controls Panel */}
      <div className={`controls-panel ${activePanel === 'robot' ? 'panel-open' : 'panel-closed'}`}>
        <Controls 
          viewerRef={viewerRef}
          onClose={() => setActivePanel(null)}
        />
      </div>
      
      {/* Environment Panel */}
      <div className={`environment-panel ${activePanel === 'environment' ? 'panel-open' : 'panel-closed'}`}>
        <Environment 
          viewerRef={viewerRef}
          isPanel={true}
          onClose={() => setActivePanel(null)}
        />
      </div>
      
      {/* 3D Viewer */}
      <div className={`viewer-panel ${activePanel ? 'viewer-shifted' : ''}`}>
        <URDFViewer
          ref={viewerRef}
          width="100%"
          height="100%"
          backgroundColor="#e6f2ff"
          enableShadows={true}
        />
        
        {/* Loading Overlay */}
        {isLoading && (
          <div className="controls-modal-overlay">
            <div className="controls-card controls-p-4 controls-text-center">
              <div className="controls-mb-3">Loading robot...</div>
              <div className="controls-progress">
                <div className="controls-progress-bar" style={{ width: '30%' }}></div>
              </div>
            </div>
          </div>
        )}
        
        {/* Error Display */}
        {error && (
          <div className="controls-alert controls-alert-danger controls-position-fixed" style={{ bottom: '20px', left: '20px', zIndex: 100 }}>
            <strong>Error:</strong> {error}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Root App component - Just displays components
 */
const App = () => {
  return (
    <RobotProvider>
      <div className="app-wrapper">
        <Navbar>
          <AppContent />
        </Navbar>
      </div>
    </RobotProvider>
  );
};

export default App;