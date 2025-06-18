// components/controls/IKController/IKController.jsx - Fixed infinite loop and input handling
import React, { useState, useEffect } from 'react';
import * as THREE from 'three';
import { useRobotControl } from '../../../contexts/hooks/useRobotControl';
import { useIK } from '../../../contexts/hooks/useIK';
import { debugIK } from '../../../utils/DebugSystem';
import useAnimate from '../../../contexts/hooks/useAnimate';

/**
 * Utility function to convert quaternion to Euler angles
 * @param {Object} quaternion - Quaternion object with x, y, z, w components
 * @returns {Object} Euler angles in radians { roll, pitch, yaw }
 */
const quaternionToEuler = (quaternion) => {
  if (!quaternion) {
    return { roll: 0, pitch: 0, yaw: 0 };
  }

  // Create THREE.js quaternion
  const q = new THREE.Quaternion(
    quaternion.x,
    quaternion.y,
    quaternion.z,
    quaternion.w
  );

  // Create Euler angles
  const euler = new THREE.Euler();
  euler.setFromQuaternion(q, 'XYZ');

  // Return in roll, pitch, yaw format
  return {
    roll: euler.x,
    pitch: euler.y,
    yaw: euler.z
  };
};

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
    isAnimating: useIKIsAnimating,
    solverStatus,
    currentSolver,
    availableSolvers,
    setTargetPosition,
    setCurrentSolver,
    executeIK,
    configureSolver,
    getSolverSettings
  } = useIK();
  const { isAnimating: useAnimateIsAnimating, stopAnimation: useAnimateStopAnimation } = useAnimate();

  const [showSettings, setShowSettings] = useState(false);
  const [solverSettings, setSolverSettings] = useState({});
  const [targetOrientation, setTargetOrientation] = useState({ roll: 0, pitch: 0, yaw: 0 });
  const [orientationInitialized, setOrientationInitialized] = useState(false);
  const [orientationMode, setOrientationMode] = useState(false);
  
  // NEW: Motion profile state
  const [motionProfile, setMotionProfile] = useState('trapezoidal');
  const [animationSpeed, setAnimationSpeed] = useState(1.0);
  const [useMotionProfile, setUseMotionProfile] = useState(true);

  // Update solver settings when solver changes
  useEffect(() => {
    const settings = getSolverSettings(currentSolver);
    if (settings) {
      setSolverSettings(settings);
    } else {
      // Set default settings if getSolverSettings returns null
      setSolverSettings({});
      debugIK(`No settings found for solver: ${currentSolver}`);
    }
  }, [currentSolver, getSolverSettings]);

  // FIXED: Only sync target orientation with current ONCE when robot first loads or changes
  useEffect(() => {
    if (!orientationInitialized && robot && isReady) {
      const euler = quaternionToEuler(currentOrientation);
      setTargetOrientation({
        roll: euler.roll * 180 / Math.PI,
        pitch: euler.pitch * 180 / Math.PI,
        yaw: euler.yaw * 180 / Math.PI
      });
      setOrientationInitialized(true);
    }
  }, [robot, isReady, currentOrientation, orientationInitialized]);

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
    debugIK(`Orientation change: ${axis} = ${value}`);
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
    debugIK(`Rotate relative: ${axis} += ${delta}`);
    setTargetOrientation(prev => ({
      ...prev,
      [axis]: (prev[axis] || 0) + delta
    }));
  };

  const moveToTarget = async (animate = true) => {
    if (!robot || !isReady || useAnimateIsAnimating.get(activeRobotId)) return;
    
    try {
      debugIK(`Moving to target position:`, targetPosition);
      debugIK(`Moving to target orientation:`, targetOrientation);
      debugIK(`Orientation mode:`, orientationMode);
      debugIK(`Current solver:`, currentSolver);
      debugIK(`Solver settings:`, solverSettings);
      
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
      
      // Execute IK with motion profile options
      await executeIK(targetPosition, {
        animate,
        targetOrientation: targetOrientationRad,
        motionProfile: useMotionProfile ? motionProfile : null,
        animationSpeed,
        duration: 2000 // Will be overridden by motion profile calculation
      });
    } catch (error) {
      debugIK(`Error executing IK:`, error);
    }
  };

  const syncTargetToCurrent = () => {
    debugIK('Syncing target to current');
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
      debugIK(`Syncing orientation to:`, newOrientation);
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
    debugIK(`Stop button clicked`);
    useAnimateStopAnimation(activeRobotId);
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
          disabled={useAnimateIsAnimating.get(activeRobotId)}
        >
          {availableSolvers.map(solver => (
            <option key={solver} value={solver}>{solver}</option>
          ))}
        </select>
        
        <button
          className="controls-btn controls-btn-sm controls-btn-secondary controls-mt-2"
          onClick={() => setShowSettings(!showSettings)}
          disabled={useAnimateIsAnimating.get(activeRobotId)}
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
                  disabled={useAnimateIsAnimating.get(activeRobotId)}
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
                    disabled={useAnimateIsAnimating.get(activeRobotId) || !solverSettings.orientationMode}
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
                  disabled={useAnimateIsAnimating.get(activeRobotId)}
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
                disabled={useAnimateIsAnimating.get(activeRobotId)}
              >
                -
              </button>
              <input
                type="number"
                className="controls-form-control"
                value={targetPosition.x}
                onChange={(e) => handlePositionChange('x', e.target.value)}
                step="0.001"
                disabled={useAnimateIsAnimating.get(activeRobotId)}
                style={{
                  WebkitAppearance: 'none',
                  MozAppearance: 'textfield'
                }}
              />
              <button
                className="controls-btn controls-btn-sm controls-btn-secondary"
                onClick={() => moveRelative('x', 0.01)}
                disabled={useAnimateIsAnimating.get(activeRobotId)}
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
                disabled={useAnimateIsAnimating.get(activeRobotId)}
              >
                -
              </button>
              <input
                type="number"
                className="controls-form-control"
                value={targetPosition.y}
                onChange={(e) => handlePositionChange('y', e.target.value)}
                step="0.001"
                disabled={useAnimateIsAnimating.get(activeRobotId)}
                style={{
                  WebkitAppearance: 'none',
                  MozAppearance: 'textfield'
                }}
              />
              <button
                className="controls-btn controls-btn-sm controls-btn-secondary"
                onClick={() => moveRelative('y', 0.01)}
                disabled={useAnimateIsAnimating.get(activeRobotId)}
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
                disabled={useAnimateIsAnimating.get(activeRobotId)}
              >
                -
              </button>
              <input
                type="number"
                className="controls-form-control"
                value={targetPosition.z}
                onChange={(e) => handlePositionChange('z', e.target.value)}
                step="0.001"
                disabled={useAnimateIsAnimating.get(activeRobotId)}
                style={{
                  WebkitAppearance: 'none',
                  MozAppearance: 'textfield'
                }}
              />
              <button
                className="controls-btn controls-btn-sm controls-btn-secondary"
                onClick={() => moveRelative('z', 0.01)}
                disabled={useAnimateIsAnimating.get(activeRobotId)}
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
                disabled={useAnimateIsAnimating.get(activeRobotId)}
              >
                -
              </button>
              <input
                type="number"
                className="controls-form-control"
                value={targetOrientation.roll}
                onChange={(e) => handleOrientationChange('roll', e.target.value)}
                step="1"
                disabled={useAnimateIsAnimating.get(activeRobotId)}
                style={{
                  WebkitAppearance: 'none',
                  MozAppearance: 'textfield'
                }}
              />
              <button
                className="controls-btn controls-btn-sm controls-btn-secondary"
                onClick={() => rotateRelative('roll', 5)}
                disabled={useAnimateIsAnimating.get(activeRobotId)}
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
                disabled={useAnimateIsAnimating.get(activeRobotId)}
              >
                -
              </button>
              <input
                type="number"
                className="controls-form-control"
                value={targetOrientation.pitch}
                onChange={(e) => handleOrientationChange('pitch', e.target.value)}
                step="1"
                disabled={useAnimateIsAnimating.get(activeRobotId)}
                style={{
                  WebkitAppearance: 'none',
                  MozAppearance: 'textfield'
                }}
              />
              <button
                className="controls-btn controls-btn-sm controls-btn-secondary"
                onClick={() => rotateRelative('pitch', 5)}
                disabled={useAnimateIsAnimating.get(activeRobotId)}
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
                disabled={useAnimateIsAnimating.get(activeRobotId)}
              >
                -
              </button>
              <input
                type="number"
                className="controls-form-control"
                value={targetOrientation.yaw}
                onChange={(e) => handleOrientationChange('yaw', e.target.value)}
                step="1"
                disabled={useAnimateIsAnimating.get(activeRobotId)}
                style={{
                  WebkitAppearance: 'none',
                  MozAppearance: 'textfield'
                }}
              />
              <button
                className="controls-btn controls-btn-sm controls-btn-secondary"
                onClick={() => rotateRelative('yaw', 5)}
                disabled={useAnimateIsAnimating.get(activeRobotId)}
              >
                +
              </button>
            </div>
          </div>
        </div>

        <button
          className="controls-btn controls-btn-sm controls-btn-info controls-w-100 controls-mt-3"
          onClick={syncTargetToCurrent}
          disabled={useAnimateIsAnimating.get(activeRobotId)}
        >
          Use Current Position & Orientation
        </button>

        {/* NEW: Motion Profile Controls */}
        <div className="controls-form-group">
          <h5 className="controls-h6 controls-mb-2">Motion Profile:</h5>
          <div className="controls-motion-profile-controls">
            <label>
              <input
                type="checkbox"
                checked={useMotionProfile}
                onChange={(e) => setUseMotionProfile(e.target.checked)}
              />
              Use Motion Profile
            </label>
            
            {useMotionProfile && (
              <>
                <label>
                  Profile Type:
                  <select
                    value={motionProfile}
                    onChange={(e) => setMotionProfile(e.target.value)}
                  >
                    <option value="trapezoidal">Trapezoidal (Standard)</option>
                    <option value="s-curve">S-Curve (Smooth)</option>
                  </select>
                </label>
                
                <label>
                  Speed:
                  <input
                    type="range"
                    min="0.1"
                    max="2.0"
                    step="0.1"
                    value={animationSpeed}
                    onChange={(e) => setAnimationSpeed(parseFloat(e.target.value))}
                  />
                  <span>{animationSpeed}x</span>
                </label>
              </>
            )}
          </div>
        </div>

        {/* Move/Stop buttons */}
        <div className="controls-btn-group controls-w-100 controls-mt-2">
          {!useAnimateIsAnimating.get(activeRobotId) ? (
            <button
              className="controls-btn controls-btn-primary controls-w-100"
              onClick={() => moveToTarget(true)}
              disabled={useAnimateIsAnimating.get(activeRobotId)}
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
        
        {useAnimateIsAnimating.get(activeRobotId) && (
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