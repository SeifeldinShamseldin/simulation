// components/controls/IKController/IKController.jsx
import React, { useState, useEffect } from 'react';
import { useRobotControl } from '../../../contexts/hooks/useRobotControl';
import ikAPI from '../../../core/IK/API/IKAPI';

/**
 * Component for controlling Inverse Kinematics
 * Uses direct end effector position tracking for robot movement
 */
const IKController = () => {
  const { activeRobotId, robot, isReady } = useRobotControl();
  
  const [targetPosition, setTargetPosition] = useState({ x: 0, y: 0, z: 0 });
  const [currentPosition, setCurrentPosition] = useState({ x: 0, y: 0, z: 0 });
  const [solverStatus, setSolverStatus] = useState('Ready to move robot');
  const [isAnimating, setIsAnimating] = useState(false);
  const [isSolving, setIsSolving] = useState(false);
  const [error, setError] = useState(null);
  
  // Update current position periodically
  useEffect(() => {
    if (!robot || !isReady) return;

    const updatePosition = () => {
      const position = ikAPI.getEndEffectorPosition(robot);
      setCurrentPosition(position);
    };

    const intervalId = setInterval(updatePosition, 100);
    updatePosition(); // Initial update

    return () => clearInterval(intervalId);
  }, [robot, isReady]);
  
  // Initialize target from current position
  useEffect(() => {
    if (currentPosition && !isAnimating) {
      setTargetPosition({
        x: parseFloat(currentPosition.x) || 0,
        y: parseFloat(currentPosition.y) || 0,
        z: parseFloat(currentPosition.z) || 0
      });
    }
  }, [currentPosition.x, currentPosition.y, currentPosition.z]);

  const useCurrentPosition = () => {
    setTargetPosition({
      x: parseFloat(currentPosition.x) || 0,
      y: parseFloat(currentPosition.y) || 0,
      z: parseFloat(currentPosition.z) || 0
    });
    setSolverStatus('Target set to current position');
  };

  const adjustPosition = (axis, delta) => {
    setTargetPosition(prev => ({
      ...prev,
      [axis]: prev[axis] + delta
    }));
  };

  const handleInputChange = (axis, value) => {
    const numValue = parseFloat(value);
    setTargetPosition(prev => ({
      ...prev,
      [axis]: isNaN(numValue) ? 0 : numValue
    }));
  };

  const moveRobotToTarget = async () => {
    if (!isReady || isAnimating) return;
    
    try {
      setIsAnimating(true);
      setSolverStatus('Moving to target...');
      
      // Use executeIK with animation instead of solve + direct setJointValues
      const success = await ikAPI.executeIK(robot, targetPosition, {
        animate: true,
        duration: 1000  // 1 second smooth animation
      });
      
      if (success) {
        setSolverStatus('Target reached!');
      } else {
        setSolverStatus('Target position unreachable');
      }
      
    } catch (error) {
      console.error("Error moving to target:", error);
      setSolverStatus("Error: " + error.message);
    } finally {
      setIsAnimating(false);
    }
  };

  const moveIncrementally = async () => {
    if (!isReady || isAnimating) return;
    
    try {
      setIsAnimating(true);
      setSolverStatus('Moving incrementally...');
      
      const success = await ikAPI.executeIK(robot, targetPosition, {
        animate: true,
        duration: 2000
      });
      
      if (success) {
        setSolverStatus('Movement complete!');
      } else {
        setSolverStatus('Could not reach target');
      }
      
    } catch (error) {
      console.error("Error:", error);
      setSolverStatus("Error: " + error.message);
    } finally {
      setIsAnimating(false);
    }
  };

  const stopMovement = () => {
    ikAPI.stopAnimation();
    setIsAnimating(false);
    setSolverStatus('Movement stopped');
  };

  const resetRobot = () => {
    if (!robot) return;
    robot.resetJoints();
    setSolverStatus('Robot reset');
  };

  if (!isReady) {
    return (
      <div className="controls-section">
        <h3 className="controls-section-title">Inverse Kinematics</h3>
        <p className="controls-text-muted">No robot loaded</p>
      </div>
    );
  }

  return (
    <div className="controls-section">
      <h3 className="controls-section-title">Inverse Kinematics - {activeRobotId}</h3>
      
      {/* Current End Effector Position */}
      <div className="controls-form-group">
        <h4 className="controls-h6">Current End Effector Position:</h4>
        <div className="controls-grid controls-grid-cols-3 controls-gap-2">
          <div>
            <label className="controls-form-label">X</label>
            <div className="controls-form-control-static">{currentPosition.x.toFixed(4)}</div>
          </div>
          <div>
            <label className="controls-form-label">Y</label>
            <div className="controls-form-control-static">{currentPosition.y.toFixed(4)}</div>
          </div>
          <div>
            <label className="controls-form-label">Z</label>
            <div className="controls-form-control-static">{currentPosition.z.toFixed(4)}</div>
          </div>
        </div>
      </div>

      {/* Move Robot To Section */}
      <div className="controls-card controls-p-3 controls-mb-3">
        <h4 className="controls-h5 controls-mb-3">MOVE ROBOT TO:</h4>
        
        <div className="controls-grid controls-grid-cols-3 controls-gap-3">
          {['x', 'y', 'z'].map((axis) => (
            <div key={axis}>
              <label className="controls-form-label">{axis.toUpperCase()} Position:</label>
              <div className="controls-input-group">
                <button
                  className="controls-btn controls-btn-sm controls-btn-secondary"
                  onClick={() => adjustPosition(axis, -0.01)}
                  style={{ width: '30px', padding: '0.25rem' }}
                >
                  -
                </button>
                <input
                  type="number"
                  className="controls-form-control controls-text-center"
                  value={targetPosition[axis].toFixed(4)}
                  onChange={(e) => handleInputChange(axis, e.target.value)}
                  step="0.0001"
                  style={{ padding: '0.375rem 0.5rem' }}
                />
                <button
                  className="controls-btn controls-btn-sm controls-btn-secondary"
                  onClick={() => adjustPosition(axis, 0.01)}
                  style={{ width: '30px', padding: '0.25rem' }}
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          className="controls-btn controls-btn-sm controls-btn-info controls-w-100 controls-mt-3"
          onClick={useCurrentPosition}
        >
          Use Current Position
        </button>

        <button
          className="controls-btn controls-btn-primary controls-w-100 controls-mt-2"
          onClick={moveRobotToTarget}
          disabled={isAnimating}
        >
          Move Robot to Target
        </button>
      </div>

      {/* Target Position Display */}
      <div className="controls-form-group">
        <h4 className="controls-h6">Target Position:</h4>
        <div className="controls-grid controls-grid-cols-3 controls-gap-2">
          <div>
            <label className="controls-form-label">X</label>
            <div className="controls-text-muted">{targetPosition.x.toFixed(6)}</div>
          </div>
          <div>
            <label className="controls-form-label">Y</label>
            <div className="controls-text-muted">{targetPosition.y.toFixed(6)}</div>
          </div>
          <div>
            <label className="controls-form-label">Z</label>
            <div className="controls-text-muted">{targetPosition.z.toFixed(6)}</div>
          </div>
        </div>
      </div>

      {/* Relative Movement */}
      <div className="controls-form-group">
        <h4 className="controls-h6">Relative Movement:</h4>
        <div className="controls-grid controls-grid-cols-6 controls-gap-1">
          <button
            className="controls-btn controls-btn-sm controls-btn-outline-secondary"
            onClick={() => adjustPosition('x', -0.01)}
          >
            -1cm
          </button>
          <button
            className="controls-btn controls-btn-sm controls-btn-outline-secondary"
            onClick={() => adjustPosition('x', 0.01)}
          >
            +1cm
          </button>
          <button
            className="controls-btn controls-btn-sm controls-btn-outline-secondary"
            onClick={() => adjustPosition('y', -0.01)}
          >
            -1cm
          </button>
          <button
            className="controls-btn controls-btn-sm controls-btn-outline-secondary"
            onClick={() => adjustPosition('y', 0.01)}
          >
            +1cm
          </button>
          <button
            className="controls-btn controls-btn-sm controls-btn-outline-secondary"
            onClick={() => adjustPosition('z', -0.01)}
          >
            -1cm
          </button>
          <button
            className="controls-btn controls-btn-sm controls-btn-outline-secondary"
            onClick={() => adjustPosition('z', 0.01)}
          >
            +1cm
          </button>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="controls-btn-group controls-w-100">
        <button
          className="controls-btn controls-btn-sm controls-btn-primary"
          onClick={moveRobotToTarget}
          disabled={isAnimating}
          title="Move to Target"
        >
          Move...
        </button>
        <button
          className="controls-btn controls-btn-sm controls-btn-info"
          onClick={moveIncrementally}
          disabled={isAnimating}
          title="Move Incrementally"
        >
          Move In...
        </button>
        <button
          className="controls-btn controls-btn-sm controls-btn-warning"
          onClick={stopMovement}
          disabled={!isAnimating}
          title="Stop"
        >
          S...
        </button>
        <button
          className="controls-btn controls-btn-sm controls-btn-secondary"
          onClick={useCurrentPosition}
          title="Use Current Position"
        >
          Use...
        </button>
        <button
          className="controls-btn controls-btn-sm controls-btn-danger"
          onClick={resetRobot}
          title="Reset"
        >
          R...
        </button>
      </div>

      {/* Status */}
      <div className="controls-mt-3">
        <strong>Status:</strong> <span className="controls-text-muted">{solverStatus}</span>
      </div>
    </div>
  );
};

export default IKController;