// components/controls/Reposition/Reposition.jsx
import React, { useState, useEffect } from 'react';
import './Reposition.css';

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
      [axis]: prev[axis] + delta
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
    <div className="urdf-controls-section reposition-container">
      <h3>Robot Position</h3>
      <div className="reposition-description">
        Reposition the robot in world space
      </div>
      
      <div className="position-inputs">
        <div className="position-input-group">
          <label htmlFor="position-x">X Position:</label>
          <div className="position-input-row">
            <input
              id="position-x"
              type="number"
              value={position.x}
              onChange={(e) => handlePositionChange('x', e.target.value)}
              step="0.1"
            />
            <div className="position-buttons">
              <button onClick={() => moveRelative('x', -0.1)}>-</button>
              <button onClick={() => moveRelative('x', 0.1)}>+</button>
            </div>
          </div>
        </div>
        
        <div className="position-input-group">
          <label htmlFor="position-y">Y Position:</label>
          <div className="position-input-row">
            <input
              id="position-y"
              type="number"
              value={position.y}
              onChange={(e) => handlePositionChange('y', e.target.value)}
              step="0.1"
            />
            <div className="position-buttons">
              <button onClick={() => moveRelative('y', -0.1)}>-</button>
              <button onClick={() => moveRelative('y', 0.1)}>+</button>
            </div>
          </div>
        </div>
        
        <div className="position-input-group">
          <label htmlFor="position-z">Z Position:</label>
          <div className="position-input-row">
            <input
              id="position-z"
              type="number"
              value={position.z}
              onChange={(e) => handlePositionChange('z', e.target.value)}
              step="0.1"
            />
            <div className="position-buttons">
              <button onClick={() => moveRelative('z', -0.1)}>-</button>
              <button onClick={() => moveRelative('z', 0.1)}>+</button>
            </div>
          </div>
        </div>
      </div>
      
      <div className="reposition-actions">
        <button onClick={applyPosition} className="apply-button">
          Apply Position
        </button>
        <button onClick={resetPosition} className="reset-button">
          Reset to Origin
        </button>
      </div>
    </div>
  );
};

export default Reposition;