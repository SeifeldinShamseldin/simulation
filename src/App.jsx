// src/App.jsx - UPDATED Provider Chain with TrajectoryProvider
import React, { useState, useEffect, useRef } from 'react';
import URDFViewer from './components/ViewerOptions/URDFViewer';
import Controls from './components/controls/Controls';
import Robot from './components/robot/Robot';
import Environment from './components/Environment/Environment';
import Navbar from './components/Navbar/Navbar';
import ResizablePanel from './components/common/ResizablePanel';
import { RobotProvider } from './contexts/RobotContext';
import { WorldProvider } from './contexts/WorldContext';
import { ViewerProvider, useViewer } from './contexts/ViewerContext';
import { IKProvider } from './contexts/IKContext';
import { TCPProvider } from './contexts/TCPContext';
import { JointProvider } from './contexts/JointContext';
import { TrajectoryProvider } from './contexts/TrajectoryContext'; // NEW
import { EnvironmentProvider } from './contexts/EnvironmentContext';
import { useRobotSelection } from './contexts/hooks/useRobot';
import { RobotManagerProvider } from './contexts/RobotManagerContext';
import WorldManager from './components/World/WorldManager';
import './App.css';

const RobotPanel = ({ onClose, viewerRef }) => {
  const [showControls, setShowControls] = useState(false);
  const [selectedRobotId, setSelectedRobotId] = useState(null);
  
  // Add this line to get setActive from context
  const { setActive: setActiveRobotId } = useRobotSelection();

  // Handle when a robot is selected for controls
  const handleRobotSelected = (robotId) => {
    console.log('[App] Robot selected for controls:', robotId);
    
    // FIXED: Update the context's active robot, not just local state
    setActiveRobotId(robotId);
    setSelectedRobotId(robotId);
    setShowControls(true);
  };

  // Handle going back to robot selection
  const handleBackToRobots = () => {
    console.log('[App] Going back to robot selection');
    setShowControls(false);
    // Don't clear selectedRobotId - keep it for potential return
  };

  if (showControls && selectedRobotId) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Controls header with back button */}
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
        
        {/* Robot controls */}
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
  const { setViewerInstance } = useViewer();
  const viewerRef = useRef(null);

  useEffect(() => {
    console.log('[App] Active panel changed:', activePanel);
  }, [activePanel]);

  useEffect(() => {
    if (viewerRef.current) {
      console.log('[App] Setting viewer instance');
      setViewerInstance(viewerRef.current);
      window.viewerInstance = viewerRef.current;
    }
  }, [setViewerInstance]);

  const handlePanelToggle = (panel) => {
    console.log('[App] Panel toggle requested:', panel);
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
        {/* Robot Panel (includes both robot management and controls) */}
        {activePanel === 'robot' && (
          <ResizablePanel
            className="controls-panel panel-open"
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
        
        {/* Viewer Panel */}
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

// 🚨 UPDATED: Clean Provider Chain with TrajectoryProvider Added
const App = () => {
  return (
    <ViewerProvider>
      <RobotManagerProvider>
        <RobotProvider>
          <EnvironmentProvider>
            <TCPProvider>
              <JointProvider>
                <TrajectoryProvider>
                  <IKProvider>
                    <WorldProvider>
                      <AppContent />
                    </WorldProvider>
                  </IKProvider>
                </TrajectoryProvider>
              </JointProvider>
            </TCPProvider>
          </EnvironmentProvider>
        </RobotProvider>
      </RobotManagerProvider>
    </ViewerProvider>
  );
};

export default App;