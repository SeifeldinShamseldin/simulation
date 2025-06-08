// src/App.jsx - Updated with JointProvider in the architecture
import React, { useState, useEffect, useRef } from 'react';
import URDFViewer from './components/ViewerOptions/URDFViewer';
import Controls from './components/controls/Controls';
import Environment from './components/Environment/Environment';
import Navbar from './components/Navbar/Navbar';
import ResizablePanel from './components/common/ResizablePanel';
import { SceneProvider } from './contexts/SceneContext';
import { RobotProvider } from './contexts/RobotContext';
import { WorldProvider } from './contexts/WorldContext';
import { ViewerProvider, useViewer } from './contexts/ViewerContext';
import { IKProvider } from './contexts/IKContext';
import { TCPProvider } from './contexts/TCPContext';
import { JointProvider } from './contexts/JointContext'; // New JointProvider
import WorldManager from './components/World/WorldManager';
import './App.css';

const AppContent = () => {
  const [activePanel, setActivePanel] = useState(null);
  const [panelWidth, setPanelWidth] = useState(400); // Track current panel width
  const { setViewerInstance } = useViewer();
  const viewerRef = useRef(null);

  useEffect(() => {
    console.log('Active panel:', activePanel);
  }, [activePanel]);

  useEffect(() => {
    if (viewerRef.current) {
      setViewerInstance(viewerRef.current);
      window.viewerInstance = viewerRef.current;
    }
  }, [setViewerInstance]);

  const handlePanelToggle = (panel) => {
    setActivePanel(prevPanel => prevPanel === panel ? null : panel);
  };

  const handlePanelWidthChange = (width) => {
    setPanelWidth(width);
  };

  return (
    <div className="app-wrapper">
      <Navbar 
        activePanel={activePanel} 
        onPanelToggle={handlePanelToggle} 
      />
      
      <div className="app-container">
        {/* Controls Panel */}
        {activePanel === 'robot' && (
          <ResizablePanel
            className="controls-panel panel-open"
            defaultWidth={400}
            minWidth={300}
            maxWidth={800}
            storageKey="controls-panel-width"
            onWidthChange={handlePanelWidthChange}
          >
            <Controls onClose={() => setActivePanel(null)} />
          </ResizablePanel>
        )}
        
        {/* Environment Panel */}
        {activePanel === 'environment' && (
          <ResizablePanel
            className="environment-panel panel-open"
            defaultWidth={400}
            minWidth={300}
            maxWidth={800}
            storageKey="environment-panel-width"
            onWidthChange={handlePanelWidthChange}
          >
            <Environment 
              viewerRef={viewerRef}
              isPanel={true}
              onClose={() => setActivePanel(null)}
            />
          </ResizablePanel>
        )}

        {/* World Panel */}
        <div className={`world-panel ${activePanel === 'world' ? 'panel-open' : 'panel-closed'}`}>
          <WorldManager 
            viewerRef={viewerRef}
            isOpen={activePanel === 'world'}
            onClose={() => setActivePanel(null)}
          />
        </div>
        
        {/* Viewer Panel - dynamically adjust margin based on panel width */}
        <div 
          className={`viewer-panel ${activePanel && activePanel !== 'world' ? 'viewer-shifted' : ''}`}
          style={{
            marginLeft: activePanel && activePanel !== 'world' ? `${panelWidth}px` : '0'
          }}
        >
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

// Updated provider architecture with proper flow:
// SceneProvider (3D scene)
// ViewerProvider (viewer instance)
// RobotProvider (robot loading/management)
// TCPProvider (end effector calculation logic)
// JointProvider (joint management logic)
// IKProvider (IK calculation logic)
// WorldProvider (world saving/loading)
const App = () => {
  return (
    <SceneProvider>
      <ViewerProvider>
        <RobotProvider>
          <TCPProvider>
            <JointProvider>
              <IKProvider>
                <WorldProvider>
                  <AppContent />
                </WorldProvider>
              </IKProvider>
            </JointProvider>
          </TCPProvider>
        </RobotProvider>
      </ViewerProvider>
    </SceneProvider>
  );
};

export default App;