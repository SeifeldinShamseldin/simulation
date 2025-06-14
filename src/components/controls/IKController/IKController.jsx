// components/controls/IKController/IKController.jsx - Fixed infinite loop and input handling
import React, { useState, useEffect } from 'react';
import { useRobotControl } from '../../../contexts/hooks/useRobotControl';
import { useIK } from '../../../contexts/hooks/useIK';

/**
 * Component for controlling Inverse Kinematics with position and orientation
 * Uses direct end effector position and orientation tracking for robot movement
 */
const IKController = () => {
  const { activeRobotId, robot, isReady } = useRobotControl();
  const {
    currentPosition,
    currentOrientation,
    currentEulerAngles,
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
  const [targetOrientation, setTargetOrientation] = useState({ roll: 0, pitch: 0, yaw: 0 });
  const [orientationInitialized, setOrientationInitialized] = useState(false);
  const [orientationMode, setOrientationMode] = useState(false);

  // Update solver settings when solver changes
  useEffect(() => {
    const settings = getSolverSettings(currentSolver);
    if (settings) {
      setSolverSettings(settings);
    }
  }, [currentSolver, getSolverSettings]);

  // FIXED: Only sync target orientation with current ONCE when robot first loads or changes
  useEffect(() => {
    if (currentEulerAngles && !orientationInitialized && activeRobotId) {
      console.log('[IKController] Initializing target orientation from current:', currentEulerAngles);
      setTargetOrientation({
        roll: currentEulerAngles.roll * 180 / Math.PI,
        pitch: currentEulerAngles.pitch * 180 / Math.PI,
        yaw: currentEulerAngles.yaw * 180 / Math.PI
      });
      setOrientationInitialized(true);
    }
  }, [currentEulerAngles, orientationInitialized, activeRobotId]);

  // Reset initialization when robot changes
  useEffect(() => {
    setOrientationInitialized(false);
    setTargetOrientation({ roll: 0, pitch: 0, yaw: 0 });
  }, [activeRobotId]);

  const handlePositionChange = (axis, value) => {
    setTargetPosition(prev => ({
      ...prev,
      [axis]: parseFloat(value) || 0
    }));
  };

  const handleOrientationChange = (axis, value) => {
    console.log(`[IKController] Orientation change: ${axis} = ${value}`);
    setTargetOrientation(prev => ({
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

  const rotateRelative = (axis, delta) => {
    console.log(`[IKController] Rotate relative: ${axis} += ${delta}`);
    setTargetOrientation(prev => ({
      ...prev,
      [axis]: (prev[axis] || 0) + delta
    }));
  };

  const moveToTarget = async (animate = true) => {
    if (!robot || !isReady || isAnimating) return;
    
    try {
      console.log(`[IKController] Moving to target position:`, targetPosition);
      console.log(`[IKController] Moving to target orientation:`, targetOrientation);
      console.log(`[IKController] Orientation mode:`, orientationMode);
      console.log(`[IKController] Current solver:`, currentSolver);
      console.log(`[IKController] Solver settings:`, solverSettings);
      
      // Convert target orientation from degrees to radians for the solver
      const targetOrientationRad = {
        roll: targetOrientation.roll * Math.PI / 180,
        pitch: targetOrientation.pitch * Math.PI / 180,
        yaw: targetOrientation.yaw * Math.PI / 180
      };
      
      // Configure solver based on type and settings
      if (currentSolver === 'HalimIK') {
        // Pass HalimIK-specific settings
        configureSolver(currentSolver, {
          ...solverSettings,
          orientationMode: solverSettings.orientationMode || (orientationMode ? 'all' : null),
          noPosition: solverSettings.noPosition || false,
          // Adjust learning rate based on orientation mode
          learningRate: solverSettings.orientationMode ? 0.05 : 0.1,
          // Adjust regularization based on orientation mode
          regularizationParameter: solverSettings.orientationMode ? 0.0005 : 0.001
        });
      } else if (currentSolver === 'CCD') {
        // CCD solver configuration
        configureSolver(currentSolver, {
          ...solverSettings,
          // Adjust parameters based on orientation mode
          orientationWeight: orientationMode ? 0.8 : 0.1,
          maxIterations: orientationMode ? 20 : 10,
          tolerance: orientationMode ? 0.02 : 0.01,
          dampingFactor: orientationMode ? 0.5 : 0.7,
          angleLimit: orientationMode ? 0.15 : 0.2
        });
      }
      
      await executeIK(targetPosition, { 
        animate,
        targetOrientation: targetOrientationRad,
        orientationMode: currentSolver === 'HalimIK' ? solverSettings.orientationMode : orientationMode
      });
      
    } catch (error) {
      console.error('[IKController] IK execution failed:', error);
    }
  };

  const syncTargetToCurrent = () => {
    console.log('[IKController] Syncing target to current');
    setTargetPosition({
      x: currentPosition.x,
      y: currentPosition.y,
      z: currentPosition.z
    });
    
    if (currentEulerAngles) {
      const newOrientation = {
        roll: currentEulerAngles.roll * 180 / Math.PI,
        pitch: currentEulerAngles.pitch * 180 / Math.PI,
        yaw: currentEulerAngles.yaw * 180 / Math.PI
      };
      console.log('[IKController] Syncing orientation to:', newOrientation);
      setTargetOrientation(newOrientation);
    }
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

  const handleStopMovement = () => {
    console.log(`[IKController] Stop button clicked`);
    stopAnimation();
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
          disabled={isAnimating}
        >
          {showSettings ? 'Hide' : 'Show'} Settings
        </button>
      </div>

      {/* Solver Settings */}
      {showSettings && solverSettings && (
        <div className="controls-card controls-p-3 controls-mb-3">
          <h5 className="controls-h6">{currentSolver} Settings:</h5>
          
          {currentSolver === 'HalimIK' && (
            <>
              <div className="controls-form-group">
                <label className="controls-form-label">Orientation Mode:</label>
                <select
                  className="controls-form-select"
                  value={solverSettings.orientationMode || ''}
                  onChange={(e) => handleSettingChange('orientationMode', e.target.value || null)}
                  disabled={isAnimating}
                >
                  <option value="">None (Position Only)</option>
                  <option value="X">Target X Axis</option>
                  <option value="Y">Target Y Axis</option>
                  <option value="Z">Target Z Axis</option>
                  <option value="all">Target All Axes</option>
                </select>
              </div>
              
              <div className="controls-form-group">
                <label className="controls-form-label">
                  <input
                    type="checkbox"
                    checked={solverSettings.noPosition || false}
                    onChange={(e) => handleSettingChange('noPosition', e.target.checked)}
                    style={{ marginRight: '0.5rem' }}
                    disabled={isAnimating || !solverSettings.orientationMode}
                  />
                  Orientation Only (No Position)
                </label>
                <small className="controls-text-muted">
                  Only optimize for orientation, ignore position
                </small>
              </div>
            </>
          )}
          
          {currentSolver === 'CCD' && (
            <div className="controls-form-group">
              <label className="controls-form-label">
                <input
                  type="checkbox"
                  checked={orientationMode}
                  onChange={(e) => setOrientationMode(e.target.checked)}
                  style={{ marginRight: '0.5rem' }}
                />
                Orientation Priority Mode
              </label>
              <small className="controls-text-muted">
                Prioritizes reaching target orientation over exact position
              </small>
            </div>
          )}
          
          {Object.entries(solverSettings).map(([key, value]) => {
            // Skip special settings we already handled
            if (key === 'orientationMode' || key === 'noPosition') return null;
            
            // Skip orientationWeight for CCD if not in orientation mode
            if (currentSolver === 'CCD' && key === 'orientationWeight' && !orientationMode) return null;
            
            return (
              <div key={key} className="controls-form-group">
                <label className="controls-form-label">
                  {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:
                </label>
                <input
                  type="number"
                  className="controls-form-control"
                  value={value}
                  onChange={(e) => handleSettingChange(key, e.target.value)}
                  step={key.includes('Factor') || key.includes('Limit') || key.includes('Coeff') || key.includes('Rate') ? 0.1 : 1}
                  min={0}
                  max={key === 'learningRate' ? 1 : undefined}
                  disabled={isAnimating}
                />
                {key === 'learningRate' && (
                  <small className="controls-text-muted">
                    Step size for gradient descent (0-1)
                  </small>
                )}
                {key === 'regularizationParameter' && (
                  <small className="controls-text-muted">
                    Controls joint movement penalties
                  </small>
                )}
                {key === 'orientationCoeff' && (
                  <small className="controls-text-muted">
                    Weight for orientation vs position
                  </small>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Current End Effector State */}
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

      {/* Current End Effector Orientation */}
      {currentEulerAngles && (
        <div className="controls-form-group">
          <h4 className="controls-h6">Current End Effector Orientation:</h4>
          <div className="controls-grid controls-grid-cols-3 controls-gap-2">
            <div>
              <label className="controls-form-label">Roll (°)</label>
              <div className="controls-form-control-static">{(currentEulerAngles.roll * 180 / Math.PI).toFixed(2)}</div>
            </div>
            <div>
              <label className="controls-form-label">Pitch (°)</label>
              <div className="controls-form-control-static">{(currentEulerAngles.pitch * 180 / Math.PI).toFixed(2)}</div>
            </div>
            <div>
              <label className="controls-form-label">Yaw (°)</label>
              <div className="controls-form-control-static">{(currentEulerAngles.yaw * 180 / Math.PI).toFixed(2)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Move Robot To Section */}
      <div className="controls-card controls-p-3 controls-mb-3">
        <h4 className="controls-h5 controls-mb-3">MOVE ROBOT TO:</h4>
        
        {/* Position Controls */}
        <h5 className="controls-h6 controls-mb-2">Target Position:</h5>
        <div className="controls-grid controls-grid-cols-3 controls-gap-3 controls-mb-3">
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
                onChange={(e) => handlePositionChange('x', e.target.value)}
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
                onChange={(e) => handlePositionChange('y', e.target.value)}
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
                onChange={(e) => handlePositionChange('z', e.target.value)}
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

        {/* Orientation Controls */}
        <h5 className="controls-h6 controls-mb-2">Target Orientation:</h5>
        <div className="controls-grid controls-grid-cols-3 controls-gap-3 controls-mb-3">
          <div>
            <label className="controls-form-label">Roll (°):</label>
            <div className="controls-input-group">
              <button
                className="controls-btn controls-btn-sm controls-btn-secondary"
                onClick={() => rotateRelative('roll', -5)}
                disabled={isAnimating}
              >
                -
              </button>
              <input
                type="number"
                className="controls-form-control"
                value={targetOrientation.roll}
                onChange={(e) => handleOrientationChange('roll', e.target.value)}
                step="1"
                disabled={isAnimating}
                style={{
                  WebkitAppearance: 'none',
                  MozAppearance: 'textfield'
                }}
              />
              <button
                className="controls-btn controls-btn-sm controls-btn-secondary"
                onClick={() => rotateRelative('roll', 5)}
                disabled={isAnimating}
              >
                +
              </button>
            </div>
          </div>

          <div>
            <label className="controls-form-label">Pitch (°):</label>
            <div className="controls-input-group">
              <button
                className="controls-btn controls-btn-sm controls-btn-secondary"
                onClick={() => rotateRelative('pitch', -5)}
                disabled={isAnimating}
              >
                -
              </button>
              <input
                type="number"
                className="controls-form-control"
                value={targetOrientation.pitch}
                onChange={(e) => handleOrientationChange('pitch', e.target.value)}
                step="1"
                disabled={isAnimating}
                style={{
                  WebkitAppearance: 'none',
                  MozAppearance: 'textfield'
                }}
              />
              <button
                className="controls-btn controls-btn-sm controls-btn-secondary"
                onClick={() => rotateRelative('pitch', 5)}
                disabled={isAnimating}
              >
                +
              </button>
            </div>
          </div>

          <div>
            <label className="controls-form-label">Yaw (°):</label>
            <div className="controls-input-group">
              <button
                className="controls-btn controls-btn-sm controls-btn-secondary"
                onClick={() => rotateRelative('yaw', -5)}
                disabled={isAnimating}
              >
                -
              </button>
              <input
                type="number"
                className="controls-form-control"
                value={targetOrientation.yaw}
                onChange={(e) => handleOrientationChange('yaw', e.target.value)}
                step="1"
                disabled={isAnimating}
                style={{
                  WebkitAppearance: 'none',
                  MozAppearance: 'textfield'
                }}
              />
              <button
                className="controls-btn controls-btn-sm controls-btn-secondary"
                onClick={() => rotateRelative('yaw', 5)}
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
          Use Current Position & Orientation
        </button>

        {/* Move/Stop buttons */}
        <div className="controls-btn-group controls-w-100 controls-mt-2">
          {!isAnimating ? (
            <button
              className="controls-btn controls-btn-primary controls-w-100"
              onClick={() => moveToTarget(true)}
              disabled={isAnimating}
            >
              Move Robot to Target
            </button>
          ) : (
            <button
              className="controls-btn controls-btn-danger controls-w-100"
              onClick={handleStopMovement}
            >
              Stop Movement
            </button>
          )}
        </div>
      </div>

      {/* Status */}
      <div className="controls-mt-3">
        <strong>Status:</strong> 
        <span className={`controls-text-${
          solverStatus.includes('Error') || solverStatus.includes('Failed') ? 'danger' : 
          solverStatus.includes('Moving') || solverStatus.includes('Solving') ? 'warning' :
          solverStatus.includes('Complete') ? 'success' : 'muted'
        }`}>
          {' ' + solverStatus}
        </span>
        
        {isAnimating && (
          <div className="controls-mt-2">
            <small className="controls-text-muted">
              Animation in progress... Click "Stop Movement" to cancel.
            </small>
          </div>
        )}
      </div>
    </div>
  );
};

export default IKController;