// components/controls/IKController/IKController.jsx
import React, { useState, useEffect } from 'react';
import { useRobotControl } from '../../../contexts/hooks/useRobotControl';
import { useIK } from '../../../contexts/hooks/useIK';

/**
 * Component for controlling Inverse Kinematics
 * Uses direct end effector position tracking for robot movement
 */
const IKController = () => {
  const { activeRobotId, robot, isReady } = useRobotControl();
  const {
    currentPosition,
    targetPosition,
    isAnimating,
    solverStatus,
    currentSolver,
    availableSolvers,
    setTargetPosition,
    setCurrentSolver,
    executeIK,
    stopAnimation,
    configureSolver,
    getSolverSettings
  } = useIK();

  const [showSettings, setShowSettings] = useState(false);
  const [solverSettings, setSolverSettings] = useState({});

  // Update solver settings when solver changes
  useEffect(() => {
    const settings = getSolverSettings(currentSolver);
    if (settings) {
      setSolverSettings(settings);
    }
  }, [currentSolver, getSolverSettings]);

  const handleInputChange = (axis, value) => {
    setTargetPosition(prev => ({
      ...prev,
      [axis]: parseFloat(value) || 0
    }));
  };

  const moveRelative = (axis, delta) => {
    setTargetPosition(prev => ({
      ...prev,
      [axis]: (prev[axis] || 0) + delta
    }));
  };

  const moveToTarget = async (animate = true) => {
    if (!robot || !isReady || isAnimating) return;
    
    try {
      await executeIK(targetPosition, { animate });
    } catch (error) {
      console.error('IK execution failed:', error);
    }
  };

  const syncTargetToCurrent = () => {
    setTargetPosition({
      x: currentPosition.x,
      y: currentPosition.y,
      z: currentPosition.z
    });
  };

  const resetRobot = () => {
    if (!robot) return;
    // Reset all joints to 0
    Object.values(robot.joints).forEach(joint => {
      if (joint.jointType !== 'fixed') {
        robot.setJointValue(joint.name, 0);
      }
    });
  };

  const handleSolverChange = (solver) => {
    setCurrentSolver(solver);
  };

  const handleSettingChange = (setting, value) => {
    const newSettings = { ...solverSettings, [setting]: parseFloat(value) };
    setSolverSettings(newSettings);
    configureSolver(currentSolver, newSettings);
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
      
      {/* Solver Selection */}
      <div className="controls-form-group">
        <label className="controls-form-label">IK Solver:</label>
        <select 
          className="controls-form-select"
          value={currentSolver}
          onChange={(e) => handleSolverChange(e.target.value)}
          disabled={isAnimating}
        >
          {availableSolvers.map(solver => (
            <option key={solver} value={solver}>{solver}</option>
          ))}
        </select>
        
        <button
          className="controls-btn controls-btn-sm controls-btn-secondary controls-mt-2"
          onClick={() => setShowSettings(!showSettings)}
        >
          {showSettings ? 'Hide' : 'Show'} Settings
        </button>
      </div>

      {/* Solver Settings */}
      {showSettings && solverSettings && (
        <div className="controls-card controls-p-3 controls-mb-3">
          <h5 className="controls-h6">{currentSolver} Settings:</h5>
          
          {Object.entries(solverSettings).map(([key, value]) => (
            <div key={key} className="controls-form-group">
              <label className="controls-form-label">
                {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:
              </label>
              <input
                type="number"
                className="controls-form-control"
                value={value}
                onChange={(e) => handleSettingChange(key, e.target.value)}
                step={key.includes('Factor') || key.includes('Limit') ? 0.1 : 1}
                min={0}
                disabled={isAnimating}
              />
            </div>
          ))}
        </div>
      )}

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
          <div>
            <label className="controls-form-label">X Position:</label>
            <div className="controls-input-group">
              <button
                className="controls-btn controls-btn-sm controls-btn-secondary"
                onClick={() => moveRelative('x', -0.01)}
                disabled={isAnimating}
              >
                -
              </button>
              <input
                type="number"
                className="controls-form-control"
                value={targetPosition.x}
                onChange={(e) => handleInputChange('x', e.target.value)}
                step="0.001"
                disabled={isAnimating}
                style={{
                  WebkitAppearance: 'none',
                  MozAppearance: 'textfield'
                }}
              />
              <button
                className="controls-btn controls-btn-sm controls-btn-secondary"
                onClick={() => moveRelative('x', 0.01)}
                disabled={isAnimating}
              >
                +
              </button>
            </div>
          </div>

          <div>
            <label className="controls-form-label">Y Position:</label>
            <div className="controls-input-group">
              <button
                className="controls-btn controls-btn-sm controls-btn-secondary"
                onClick={() => moveRelative('y', -0.01)}
                disabled={isAnimating}
              >
                -
              </button>
              <input
                type="number"
                className="controls-form-control"
                value={targetPosition.y}
                onChange={(e) => handleInputChange('y', e.target.value)}
                step="0.001"
                disabled={isAnimating}
                style={{
                  WebkitAppearance: 'none',
                  MozAppearance: 'textfield'
                }}
              />
              <button
                className="controls-btn controls-btn-sm controls-btn-secondary"
                onClick={() => moveRelative('y', 0.01)}
                disabled={isAnimating}
              >
                +
              </button>
            </div>
          </div>

          <div>
            <label className="controls-form-label">Z Position:</label>
            <div className="controls-input-group">
              <button
                className="controls-btn controls-btn-sm controls-btn-secondary"
                onClick={() => moveRelative('z', -0.01)}
                disabled={isAnimating}
              >
                -
              </button>
              <input
                type="number"
                className="controls-form-control"
                value={targetPosition.z}
                onChange={(e) => handleInputChange('z', e.target.value)}
                step="0.001"
                disabled={isAnimating}
                style={{
                  WebkitAppearance: 'none',
                  MozAppearance: 'textfield'
                }}
              />
              <button
                className="controls-btn controls-btn-sm controls-btn-secondary"
                onClick={() => moveRelative('z', 0.01)}
                disabled={isAnimating}
              >
                +
              </button>
            </div>
          </div>
        </div>

        <button
          className="controls-btn controls-btn-sm controls-btn-info controls-w-100 controls-mt-3"
          onClick={syncTargetToCurrent}
          disabled={isAnimating}
        >
          Use Current Position
        </button>

        <button
          className="controls-btn controls-btn-primary controls-w-100 controls-mt-2"
          onClick={() => moveToTarget(true)}
          disabled={isAnimating}
        >
          {isAnimating ? 'Moving...' : 'Move Robot to Target'}
        </button>
      </div>

      {/* Status */}
      <div className="controls-mt-3">
        <strong>Status:</strong> 
        <span className={`controls-text-${solverStatus.includes('Error') ? 'danger' : 'muted'}`}>
          {' ' + solverStatus}
        </span>
      </div>
    </div>
  );
};

export default IKController;