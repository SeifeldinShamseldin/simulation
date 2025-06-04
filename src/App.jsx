// src/App.jsx - NO ControlsTheme.css import here
import React, { useRef, useState } from 'react';
import URDFViewer from './components/ViewerOptions/URDFViewer';
import Controls from './components/controls/Controls';
import Environment from './components/Environment/Environment';
import Navbar from './components/Navbar/Navbar';
import { RobotProvider, useRobot } from './contexts/RobotContext';
import './App.css'; // Only App.css, NO ControlsTheme.css

const App = () => {
  const [activePanel, setActivePanel] = useState(null);
  const viewerRef = useRef(null);

  return (
    <RobotProvider>
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
    </RobotProvider>
  );
};

export default App;