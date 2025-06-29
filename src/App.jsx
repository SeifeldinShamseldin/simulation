// src/App.jsx - Updated to use unified RobotContext
import React, { useState, useEffect, useRef } from 'react';
import URDFViewer from './components/robot/ViewerOptions/URDFViewer';
import Controls from './components/controls/Controls';
import Robot from './components/robot/Robot';
import Environment from './components/Environment/Environment';
import Navbar from './components/Navbar/Navbar';
import ResizablePanel from './components/common/ResizablePanel';
import { RobotProvider } from './contexts/RobotContext'; // Unified context
import { WorldProvider } from './contexts/WorldContext';
import { ViewerProvider, useViewer } from './contexts/ViewerContext';
import { EnvironmentProvider } from './contexts/EnvironmentContext';
import { EndEffectorProvider } from './contexts/EndEffectorContext';
import { TCPProvider } from './contexts/TCPContext';
import { useRobotSelection } from './contexts/hooks/useRobotManager';
import { CameraProvider } from './contexts/CameraContext';
import './App.css';

const RobotPanel = ({ onClose, viewerRef }) => {
  const [showControls, setShowControls] = useState(false);
  const [selectedRobotId, setSelectedRobotId] = useState(null);
  
  const { setActive: setActiveRobotId } = useRobotSelection();

  const handleRobotSelected = (robotId) => {
    console.log('[App] Robot selected for controls:', robotId);
    setActiveRobotId(robotId);
    setSelectedRobotId(robotId);
    setShowControls(true);
  };

  const handleBackToRobots = () => {
    console.log('[App] Going back to robot selection');
    setShowControls(false);
  };

  if (showControls && selectedRobotId) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
          paddingBottom: '1rem',
          borderBottom: '1px solid #dee2e6'
        }}>
          <button
            onClick={handleBackToRobots}
            className="controls-btn controls-btn-secondary controls-btn-sm"
          >
            ← Back to Robots
          </button>
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Controls</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.8rem',
              cursor: 'pointer',
              color: '#6c757d',
              padding: '0.25rem 0.5rem',
              borderRadius: '4px',
              transition: 'all 0.2s ease',
              lineHeight: 1
            }}
          >
            ×
          </button>
        </div>
        
        <div style={{ flex: '1', overflowY: 'auto' }}>
          <Controls viewerRef={viewerRef} />
        </div>
      </div>
    );
  }

  return (
    <Robot 
      onClose={onClose} 
      onRobotSelected={handleRobotSelected}
    />
  );
};

const AppContent = () => {
  const [activePanel, setActivePanel] = useState(null);
  const [panelWidth, setPanelWidth] = useState(400);
  const { initializeViewer } = useViewer();
  const viewerRef = useRef(null);

  useEffect(() => {
    console.log('[App] Active panel changed:', activePanel);
  }, [activePanel]);

  useEffect(() => {
    if (viewerRef.current) {
      console.log('[App] Initializing viewer');
      initializeViewer(viewerRef.current);
      window.viewerInstance = viewerRef.current;
    }
  }, [initializeViewer]);

  const handlePanelToggle = (panel) => {
    console.log('[App] Panel toggle requested:', panel);
    setActivePanel(activePanel === panel ? null : panel);
  };

  const handlePanelWidthChange = (width) => {
    setPanelWidth(width);
    // 🚨 FIX: Trigger immediate viewer resize
    requestAnimationFrame(() => {
      if (viewerRef.current && viewerRef.current.resize) {
        viewerRef.current.resize();
      }
    });
  };

  const hasPanel = activePanel && activePanel !== 'world';
  
  console.log('[App] Render state:', { activePanel, panelWidth, hasPanel });

  return (
    <div className="app-wrapper">
      <Navbar 
        activePanel={activePanel} 
        onPanelToggle={handlePanelToggle} 
      />
      
      {/* 🚨 FIX: Use flexbox instead of grid for better resize handling */}
      <div className="app-container">
        {/* Panel Container - Fixed width */}
        {hasPanel && (
          <div 
            className="panel-container"
            style={{ 
              width: `${panelWidth}px`,
              flexShrink: 0
            }}
          >
            {activePanel === 'robot' && (
              <ResizablePanel
                className="controls-panel"
                defaultWidth={400}
                minWidth={300}
                maxWidth={800}
                storageKey="robot-panel-width"
                onWidthChange={handlePanelWidthChange}
              >
                <RobotPanel 
                  onClose={() => setActivePanel(null)}
                  viewerRef={viewerRef}
                />
              </ResizablePanel>
            )}
            
            {activePanel === 'environment' && (
              <ResizablePanel
                className="environment-panel"
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
          </div>
        )}

        {/* Viewer Container - Flexible width */}
        <div className="viewer-container">
          <URDFViewer
            ref={viewerRef}
            width="100%"
            height="100%"
            backgroundColor="#e6f2ff"
            enableShadows={true}
          />
        </div>

        {/* World Panel - Overlay */}
        {activePanel === 'world' && (
          <div className="world-panel-overlay">
            {/* World panel removed - WorldManager component deleted */}
          </div>
        )}
      </div>
      {/* Mount the EndEffectorListenerTest for debugging (always visible) */}
      {/* <EndEffectorListenerTest robotId="crx10ial_1750587761103" /> */}
    </div>
  );
};

// Clean Provider Chain - REMOVED RobotManagerProvider
const App = () => {
  return (
    <CameraProvider>
      <ViewerProvider>
        <RobotProvider>
          <WorldProvider>
            <EnvironmentProvider>
              <EndEffectorProvider>
                <TCPProvider>
                  <AppContent />
                </TCPProvider>
              </EndEffectorProvider>
            </EnvironmentProvider>
          </WorldProvider>
        </RobotProvider>
      </ViewerProvider>
    </CameraProvider>
  );
};

export default App;