import React, { useState } from 'react';
import EventBus from '../../../utils/EventBus';

const LoadedRobots = ({ 
  viewerRef, 
  workspaceRobots,
  activeRobotId,
  setActiveRobotId,
  setShowRobotSelection
}) => {
  const [imageError, setImageError] = useState(false);
  const activeRobot = workspaceRobots.find(r => r.id === activeRobotId);
  
  const goBackToSelection = () => {
    // Don't clear the robot - just go back to selection
    setShowRobotSelection(true);
    
    EventBus.emit('robot:controls-hidden', { robotId: activeRobotId });
  };

  if (!activeRobot) return null;

  return (
    <div className="controls-section">
      <div className="controls-section-header">
        <h3 className="controls-section-title">Active Robot</h3>
        <button
          onClick={goBackToSelection}
          className="controls-btn controls-btn-secondary controls-btn-sm"
        >
          ← Back to Robots
        </button>
      </div>
      
      <div className="controls-card-body">
        <div className="controls-card">
          <div className="controls-card-body">
            {/* Robot Preview - Image or Placeholder */}
            <div 
              style={{
                width: '100%',
                height: '180px',
                marginBottom: '1rem',
                borderRadius: '4px',
                overflow: 'hidden',
                backgroundColor: '#f8f9fa',
                border: '1px solid #dee2e6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {activeRobot.imagePath && !imageError ? (
                <img
                  src={activeRobot.imagePath}
                  alt={activeRobot.name}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain'
                  }}
                  onError={() => setImageError(true)}
                />
              ) : (
                <div style={{
                  width: '100px',
                  height: '100px',
                  backgroundColor: '#e9ecef',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#28a745',
                  fontSize: '2.5rem'
                }}>
                  ✓
                </div>
              )}
            </div>
            
            <h5 className="controls-h5">{activeRobot.name}</h5>
            <p className="controls-text-muted controls-mb-2">
              {activeRobot.manufacturer}
            </p>
            <div className="controls-d-flex controls-justify-content-between controls-align-items-center">
              <span className="controls-badge controls-badge-success">
                Active
              </span>
              <button
                onClick={() => {
                  if (viewerRef?.current?.focusOnRobot) {
                    viewerRef.current.focusOnRobot(activeRobotId, true); // true = force refocus
                  }
                }}
                className="controls-btn controls-btn-primary controls-btn-sm"
              >
                Center Camera
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoadedRobots;