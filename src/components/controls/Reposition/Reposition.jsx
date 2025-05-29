// components/controls/Reposition/Reposition.jsx
import React, { useState, useEffect } from 'react';

/**
 * Component for repositioning the robot in world space
 */
const Reposition = ({ viewerRef }) => {
  const [position, setPosition] = useState({ x: 0, y: 0, z: 0 });
  
  // Initialize position when the component mounts
  useEffect(() => {
    if (!viewerRef?.current) return;
    
    try {
      const robot = viewerRef.current.getCurrentRobot();
      if (robot) {
        setPosition({
          x: robot.position.x || 0,
          y: robot.position.y || 0,
          z: robot.position.z || 0
        });
      }
    } catch (error) {
      console.error('Error getting robot position:', error);
    }
  }, [viewerRef]);
  
  /**
   * Handle position input change
   * @param {string} axis - The axis to change (x, y, or z)
   * @param {string|number} value - The new value
   */
  const handlePositionChange = (axis, value) => {
    // Convert to number and validate
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return;
    
    // Update state
    setPosition(prev => ({
      ...prev,
      [axis]: numValue
    }));
  };
  
  /**
   * Apply the current position to the robot
   */
  const applyPosition = () => {
    if (!viewerRef?.current) return;
    
    try {
      const robot = viewerRef.current.getCurrentRobot();
      if (robot) {
        // Apply the position
        robot.position.set(position.x, position.y, position.z);
        
        // Update matrices
        robot.updateMatrix();
        robot.updateMatrixWorld(true);
        
        // Focus camera if needed
        if (viewerRef.current.focusOnRobot) {
          viewerRef.current.focusOnRobot();
        }
      }
    } catch (error) {
      console.error('Error setting robot position:', error);
    }
  };
  
  /**
   * Move relative to current position
   * @param {string} axis - The axis to move on (x, y, or z)
   * @param {number} delta - The amount to move
   */
  const moveRelative = (axis, delta) => {
    setPosition(prev => ({
      ...prev,
      // Round the result to a fixed number of decimal places to avoid floating-point issues
      [axis]: parseFloat((prev[axis] + delta).toFixed(10))
    }));
  };
  
  /**
   * Reset the position to origin
   */
  const resetPosition = () => {
    setPosition({ x: 0, y: 0, z: 0 });
    if (viewerRef?.current) {
      const robot = viewerRef.current.getCurrentRobot();
      if (robot) {
        robot.position.set(0, 0, 0);
        robot.updateMatrix();
        robot.updateMatrixWorld(true);
        
        if (viewerRef.current.focusOnRobot) {
          viewerRef.current.focusOnRobot();
        }
      }
    }
  };
  
  return (
    <div className="controls-section">
      <h3 className="controls-section-title">Robot Position</h3>
      <p className="controls-text">
        Reposition the robot in world space
      </p>
      
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
    </div>
  );
};

export default Reposition;