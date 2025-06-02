import React, { useRef, useEffect, useState } from 'react';
import URDFViewer from './components/ViewerOptions/URDFViewer';
import Controls from './components/controls/Controls';
import Navbar from './components/Navbar/Navbar';
import EnvironmentManager from './components/Environment/EnvironmentManager/EnvironmentManager';
import { RobotProvider, useRobot } from './contexts/RobotContext';
import './App.css';

// Main app content that uses the robot context
const AppContent = () => {
  const { setViewer, isLoading, error } = useRobot();
  const viewerRef = useRef(null);
  const [showControls, setShowControls] = useState(false);
  const [showEnvironment, setShowEnvironment] = useState(false);
  
  // Register the viewer ref with the context
  useEffect(() => {
    if (viewerRef.current) {
      setViewer(viewerRef.current);
    }
  }, [viewerRef, setViewer]);
  
  return (
    <div style={{ 
      display: 'flex',
      flexDirection: 'column',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      margin: 0,
      padding: 0,
      overflow: 'hidden'
    }}>
      {/* Navbar with toggle functions */}
      <Navbar 
        onToggleControls={() => setShowControls(!showControls)} 
        isOpen={showControls}
        onToggleEnvironment={() => setShowEnvironment(!showEnvironment)}
      />
      
      {/* Main content area */}
      <div className="app-container" style={{ 
        display: 'flex', 
        flex: 1,
        overflow: 'hidden',
        position: 'relative'
      }}>
        {/* Controls panel - robot controls */}
        <div className="controls-panel" style={{ 
          position: 'absolute',
          left: showControls ? 0 : '-500px',
          top: 0,
          bottom: 0,
          width: '500px',
          height: '100%', 
          overflowY: 'auto',
          overflowX: 'hidden',
          borderRight: '1px solid #ccc',
          padding: '20px 10px',
          boxSizing: 'border-box',
          backgroundColor: '#f8f8f8',
          transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          zIndex: 100,
          boxShadow: showControls ? '4px 0 20px rgba(0,0,0,0.15)' : 'none'
        }}>
          {/* Header inside controls */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
            paddingBottom: '1rem',
            borderBottom: '1px solid #dee2e6'
          }}>
            <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Robot Management</h2>
            <button
              onClick={() => setShowControls(false)}
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
              onMouseEnter={(e) => {
                e.target.style.background = '#e9ecef';
                e.target.style.color = '#495057';
              }}
              onMouseLeave={(e) => {
                e.target.style.background = 'none';
                e.target.style.color = '#6c757d';
              }}
            >
              ×
            </button>
          </div>
          
          <Controls 
            viewerRef={viewerRef}
            showJointControls={true}
            showOptions={true}
            showLoadOptions={true}
          />
        </div>
        
        {/* Environment panel */}
        <div className="environment-panel" style={{ 
          position: 'absolute',
          left: showEnvironment ? 0 : '-500px',
          top: 0,
          bottom: 0,
          width: '500px',
          height: '100%', 
          overflowY: 'auto',
          overflowX: 'hidden',
          borderRight: '1px solid #ccc',
          padding: '20px 10px',
          boxSizing: 'border-box',
          backgroundColor: '#f8f8f8',
          transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          zIndex: 100,
          boxShadow: showEnvironment ? '4px 0 20px rgba(0,0,0,0.15)' : 'none'
        }}>
          <EnvironmentManager 
            viewerRef={viewerRef}
            isPanel={true}
            onClose={() => setShowEnvironment(false)}
          />
        </div>
        
        {/* Viewer panel - adjusted to handle both panels */}
        <div className="viewer-panel" style={{ 
          flex: 1,
          position: 'relative',
          height: '100%',
          backgroundColor: '#e6f2ff',
          marginLeft: showControls || showEnvironment ? '500px' : 0,
          transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}>
          <URDFViewer
            ref={viewerRef}
            width="100%"
            height="100%"
            backgroundColor="#e6f2ff"
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
              <div style={{
                background: 'rgba(0,0,0,0.8)',
                padding: '2rem 3rem',
                borderRadius: '8px',
                textAlign: 'center'
              }}>
                <div style={{ marginBottom: '1rem' }}>Loading robot...</div>
                <div style={{
                  width: '50px',
                  height: '4px',
                  background: 'rgba(255,255,255,0.3)',
                  borderRadius: '2px',
                  overflow: 'hidden',
                  margin: '0 auto'
                }}>
                  <div style={{
                    width: '30%',
                    height: '100%',
                    background: 'white',
                    borderRadius: '2px',
                    animation: 'slide 1.5s ease-in-out infinite'
                  }}></div>
                </div>
              </div>
            </div>
          )}
          
          {/* Error message */}
          {error && (
            <div style={{
              position: 'absolute',
              bottom: '20px',
              left: '20px',
              padding: '15px 20px',
              background: 'rgba(220, 53, 69, 0.9)',
              color: 'white',
              borderRadius: '6px',
              zIndex: 100,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              maxWidth: '400px'
            }}>
              <strong>Error:</strong> {error}
            </div>
          )}
        </div>
      </div>
      
      {/* Add loading animation */}
      <style jsx>{`
        @keyframes slide {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(200%); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
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