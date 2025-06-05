import React from 'react';
import EventBus from '../../../utils/EventBus';

const LoadedRobots = ({ 
  viewerRef, 
  workspaceRobots,
  activeRobotId,
  setActiveRobotId,
  setShowRobotSelection
}) => {
  
  const goBackToSelection = () => {
    if (!viewerRef?.current) return;
    
    // Clear the robot from the scene
    const sceneSetup = viewerRef.current.getSceneSetup();
    if (sceneSetup) {
      sceneSetup.clearRobot();
    }
    
    setActiveRobotId(null);
    setShowRobotSelection(true);
    
    EventBus.emit('robot:unloaded', { robotId: activeRobotId });
  };

  const activeRobot = workspaceRobots.find(r => r.id === activeRobotId);
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
            <div className="controls-text-center controls-mb-3">
              <div style={{ fontSize: '2rem' }}>{activeRobot.icon}</div>
            </div>
            <h5 className="controls-h5">{activeRobot.name}</h5>
            <p className="controls-text-muted controls-mb-2">
              {activeRobot.manufacturer}
            </p>
            <div className="controls-d-flex controls-justify-content-between controls-align-items-center">
              <span className="controls-badge controls-badge-success">
                Active
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoadedRobots; 