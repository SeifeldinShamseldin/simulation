// components/controls/IKController/IKController.jsx
import React from 'react';
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
    setTargetPosition,
    moveToTarget,
    moveRelative,
    syncTargetToCurrent,
    stopAnimation
  } = useIK();

  const handleInputChange = (axis, value) => {
    const numValue = parseFloat(value);
    setTargetPosition(prev => ({
      ...prev,
      [axis]: isNaN(numValue) ? 0 : numValue
    }));
  };

  const resetRobot = () => {
    if (!robot) return;
    robot.resetJoints();
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
                  onClick={() => moveRelative(axis, -0.01)}
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
                  onClick={() => moveRelative(axis, 0.01)}
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
          onClick={syncTargetToCurrent}
        >
          Use Current Position
        </button>

        <button
          className="controls-btn controls-btn-primary controls-w-100 controls-mt-2"
          onClick={() => moveToTarget(true)}
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
            onClick={() => moveRelative('x', -0.01)}
          >
            -1cm
          </button>
          <button
            className="controls-btn controls-btn-sm controls-btn-outline-secondary"
            onClick={() => moveRelative('x', 0.01)}
          >
            +1cm
          </button>
          <button
            className="controls-btn controls-btn-sm controls-btn-outline-secondary"
            onClick={() => moveRelative('y', -0.01)}
          >
            -1cm
          </button>
          <button
            className="controls-btn controls-btn-sm controls-btn-outline-secondary"
            onClick={() => moveRelative('y', 0.01)}
          >
            +1cm
          </button>
          <button
            className="controls-btn controls-btn-sm controls-btn-outline-secondary"
            onClick={() => moveRelative('z', -0.01)}
          >
            -1cm
          </button>
          <button
            className="controls-btn controls-btn-sm controls-btn-outline-secondary"
            onClick={() => moveRelative('z', 0.01)}
          >
            +1cm
          </button>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="controls-btn-group controls-w-100">
        <button
          className="controls-btn controls-btn-sm controls-btn-primary"
          onClick={() => moveToTarget(true)}
          disabled={isAnimating}
          title="Move to Target"
        >
          Move...
        </button>
        <button
          className="controls-btn controls-btn-sm controls-btn-info"
          onClick={() => moveToTarget(true)}
          disabled={isAnimating}
          title="Move Incrementally"
        >
          Move In...
        </button>
        <button
          className="controls-btn controls-btn-sm controls-btn-warning"
          onClick={stopAnimation}
          disabled={!isAnimating}
          title="Stop"
        >
          S...
        </button>
        <button
          className="controls-btn controls-btn-sm controls-btn-secondary"
          onClick={syncTargetToCurrent}
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