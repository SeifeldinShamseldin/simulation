// src/App.jsx - NO ControlsTheme.css import here
import React, { useRef, useState, useEffect } from 'react';
import URDFViewer from './components/ViewerOptions/URDFViewer';
import Controls from './components/controls/Controls';
import Environment from './components/Environment/Environment';
import Navbar from './components/Navbar/Navbar';
import { SceneProvider } from './contexts/SceneContext';
import { RobotProvider, useRobot } from './contexts/RobotContext';
import './App.css'; // Only App.css, NO ControlsTheme.css

const AppContent = () => {
  const [activePanel, setActivePanel] = useState(null);
  const viewerRef = useRef(null);
  const { setViewer } = useRobot();

  // Connect the viewer instance (not the ref) to the context when it's ready
  useEffect(() => {
    if (viewerRef.current) {
      setViewer(viewerRef.current); // Pass the actual instance, not the ref
    }
  }, [setViewer]);

  return (
    <div className="app-wrapper">
      <Navbar 
        activePanel={activePanel} 
        onPanelToggle={setActivePanel} 
      />
      
      <div className="app-container">
        <div className={`controls-panel ${activePanel === 'robot' ? 'panel-open' : 'panel-closed'}`}>
          <Controls 
            viewerRef={viewerRef}
            onClose={() => setActivePanel(null)}
          />
        </div>
        
        <div className={`environment-panel ${activePanel === 'environment' ? 'panel-open' : 'panel-closed'}`}>
          <Environment 
            viewerRef={viewerRef}
            isPanel={true}
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

// Wrap your app content with SceneProvider
const App = () => {
  return (
    <RobotProvider>
      <SceneProvider>
        <AppContent />
      </SceneProvider>
    </RobotProvider>
  );
};

export default App;