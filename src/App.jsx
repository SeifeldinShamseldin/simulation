// src/App.jsx - Updated to use TCP-based end effector system
import React, { useState, useEffect, useRef } from 'react';
import URDFViewer from './components/ViewerOptions/URDFViewer';
import Controls from './components/controls/Controls';
import Environment from './components/Environment/Environment';
import Navbar from './components/Navbar/Navbar';
import { SceneProvider } from './contexts/SceneContext';
import { RobotProvider } from './contexts/RobotContext';
import { WorldProvider } from './contexts/WorldContext';
import { ViewerProvider, useViewer } from './contexts/ViewerContext';
import { IKProvider } from './contexts/IKContext';
import { TCPProvider } from './contexts/TCPContext';
import WorldManager from './components/World/WorldManager';
import './App.css'; // Only App.css, NO ControlsTheme.css

const AppContent = () => {
  // Explicitly set to null to ensure no panel is open by default
  const [activePanel, setActivePanel] = useState(null);
  const { setViewerInstance } = useViewer();
  const viewerRef = useRef(null);

  // Debug log to check panel state
  useEffect(() => {
    console.log('Active panel:', activePanel);
  }, [activePanel]);

  // Register viewer instance when ready
  useEffect(() => {
    if (viewerRef.current) {
      setViewerInstance(viewerRef.current);
      // Temporary global reference for context
      window.viewerInstance = viewerRef.current;
    }
  }, [setViewerInstance]);

  // Handle panel toggle with explicit null check
  const handlePanelToggle = (panel) => {
    setActivePanel(prevPanel => prevPanel === panel ? null : panel);
  };

  return (
    <div className="app-wrapper">
      <Navbar 
        activePanel={activePanel} 
        onPanelToggle={handlePanelToggle} 
      />
      
      <div className="app-container">
        <div className={`controls-panel ${activePanel === 'robot' ? 'panel-open' : 'panel-closed'}`}>
          <Controls onClose={() => setActivePanel(null)} />
        </div>
        
        <div className={`environment-panel ${activePanel === 'environment' ? 'panel-open' : 'panel-closed'}`}>
          {activePanel === 'environment' && (
            <Environment 
              viewerRef={viewerRef}
              isPanel={true}
              onClose={() => setActivePanel(null)}
            />
          )}
        </div>

        <div className={`world-panel ${activePanel === 'world' ? 'panel-open' : 'panel-closed'}`}>
          <WorldManager 
            viewerRef={viewerRef}
            isOpen={activePanel === 'world'}
            onClose={() => setActivePanel(null)}
          />
        </div>
        
        <div className={`viewer-panel ${activePanel ? 'viewer-shifted' : ''}`}>
          <URDFViewer
            ref={viewerRef}
            width="100%"
            height="100%"
            backgroundColor="#e6f2ff"
            enableShadows={true}
          />
        </div>
      </div>
    </div>
  );
};

// Updated provider order - TCPProvider provides end effector functionality
const App = () => {
  return (
    <SceneProvider>
      <ViewerProvider>
        <RobotProvider>
          <TCPProvider>
            <IKProvider>
              <WorldProvider>
                <AppContent />
              </WorldProvider>
            </IKProvider>
          </TCPProvider>
        </RobotProvider>
      </ViewerProvider>
    </SceneProvider>
  );
};

export default App;