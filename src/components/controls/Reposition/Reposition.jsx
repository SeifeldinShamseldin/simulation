import React, { useState, useEffect, useCallback } from 'react';
import { useRobotManager, useRobotSelection } from '../../../contexts/hooks/useRobotManager';
import EventBus from '../../../utils/EventBus';
import { RobotPoseEvents } from '../../../contexts/dataTransfer';

/**
 * Component for repositioning the robot in world space
 */
const Reposition = ({ viewerRef }) => {
  // Get active robot ID
  const { activeId: activeRobotId } = useRobotSelection();
  // Get robot manager functions
  const { getRobotPose, setRobotPose } = useRobotManager();
  const [position, setPosition] = useState({ x: 0, y: 0, z: 0 });
  const [isLoading, setIsLoading] = useState(false);
  
  // Initialize position when robot changes
  useEffect(() => {
    if (!activeRobotId) return;
    
    setIsLoading(true);
    
    // Get robot pose using event system
    getRobotPose(activeRobotId).then(pose => {
      setPosition(pose.position);
      setIsLoading(false);
    });
  }, [activeRobotId, getRobotPose]);
  
  /**
   * Handle position input change
   * @param {string} axis - The axis to change (x, y, or z)
   * @param {string|number} value - The new value
   */
  const handlePositionChange = (axis, value) => {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return;
    
    setPosition(prev => ({
      ...prev,
      [axis]: numValue
    }));
  };
  
  /**
   * Apply the current position to the robot
   */
  const applyPosition = useCallback(() => {
    if (!activeRobotId) {
      console.warn('[Reposition] No active robot to reposition');
      return;
    }

    // Use event-based system to set robot pose
    setRobotPose(activeRobotId, { position });
    
    console.log('[Reposition] Applied position:', position);

    if (viewerRef?.current?.focusOnRobot) {
      viewerRef.current.focusOnRobot(activeRobotId);
    }
  }, [activeRobotId, position, setRobotPose, viewerRef]);
  
  /**
   * Move relative to current position
   * @param {string} axis - The axis to move on (x, y, or z)
   * @param {number} delta - The amount to move
   */
  const moveRelative = (axis, delta) => {
    setPosition(prev => ({
      ...prev,
      [axis]: parseFloat((prev[axis] + delta).toFixed(10))
    }));
  };
  
  /**
   * Reset the position to origin
   */
  const resetPosition = useCallback(() => {
    if (!activeRobotId) return;
    
    const resetPos = { x: 0, y: 0, z: 0 };
    setPosition(resetPos);
    
    // Use event-based system to reset robot pose
    setRobotPose(activeRobotId, { position: resetPos });
    
    if (viewerRef?.current?.focusOnRobot) {
      viewerRef.current.focusOnRobot(activeRobotId);
    }
  }, [activeRobotId, setRobotPose, viewerRef]);
  
  if (!activeRobotId) {
    return (
      <div className="controls-section">
        <h3 className="controls-section-title">Robot Position</h3>
        <p className="controls-text-muted">No robot selected</p>
      </div>
    );
  }
  
  return (
    <div className="controls-section">
      <h3 className="controls-section-title">Robot Position - {activeRobotId}</h3>
      <p className="controls-text">
        Reposition the robot in world space
      </p>
      
      {isLoading ? (
        <p className="controls-text-muted">Loading position...</p>
      ) : (
        <>
          <div className="controls-form-group">
            <div className="controls-form-row">
              <div className="controls-form-group">
                <label className="controls-form-label" htmlFor="position-x">X Position:</label>
                <div className="controls-input-group">
                  <input
                    id="position-x"
                    type="number"
                    className="controls-form-control"
                    value={position.x}
                    onChange={(e) => handlePositionChange('x', e.target.value)}
                    step="0.1"
                  />
                  <div className="controls-btn-group">
                    <button 
                      className="controls-btn controls-btn-secondary controls-btn-sm"
                      onClick={() => moveRelative('x', -0.1)}
                    >
                      -
                    </button>
                    <button 
                      className="controls-btn controls-btn-secondary controls-btn-sm"
                      onClick={() => moveRelative('x', 0.1)}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="controls-form-group">
                <label className="controls-form-label" htmlFor="position-y">Y Position:</label>
                <div className="controls-input-group">
                  <input
                    id="position-y"
                    type="number"
                    className="controls-form-control"
                    value={position.y}
                    onChange={(e) => handlePositionChange('y', e.target.value)}
                    step="0.1"
                  />
                  <div className="controls-btn-group">
                    <button 
                      className="controls-btn controls-btn-secondary controls-btn-sm"
                      onClick={() => moveRelative('y', -0.1)}
                    >
                      -
                    </button>
                    <button 
                      className="controls-btn controls-btn-secondary controls-btn-sm"
                      onClick={() => moveRelative('y', 0.1)}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="controls-form-group">
                <label className="controls-form-label" htmlFor="position-z">Z Position:</label>
                <div className="controls-input-group">
                  <input
                    id="position-z"
                    type="number"
                    className="controls-form-control"
                    value={position.z}
                    onChange={(e) => handlePositionChange('z', e.target.value)}
                    step="0.1"
                  />
                  <div className="controls-btn-group">
                    <button 
                      className="controls-btn controls-btn-secondary controls-btn-sm"
                      onClick={() => moveRelative('z', -0.1)}
                    >
                      -
                    </button>
                    <button 
                      className="controls-btn controls-btn-secondary controls-btn-sm"
                      onClick={() => moveRelative('z', 0.1)}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="controls-btn-group">
            <button 
              onClick={applyPosition} 
              className="controls-btn controls-btn-primary"
            >
              Apply Position
            </button>
            <button 
              onClick={resetPosition} 
              className="controls-btn controls-btn-warning"
            >
              Reset to Origin
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default Reposition;