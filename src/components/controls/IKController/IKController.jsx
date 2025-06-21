// src/components/controls/IKController/IKController.jsx
// Refactored to only import from useIK hook with exact original UI

import React, { useState, useEffect } from 'react';
import useIK from '../../../contexts/hooks/useIK';
import useTrajectory from '../../../contexts/hooks/useTrajectory';

/**
 * Component for controlling Inverse Kinematics with position and orientation
 * Now only imports from useIK hook for cleaner architecture
 */
const IKController = () => {
  // Get all IK functionality from single hook
  const ik = useIK();
  
  // Get trajectory playback state to prevent IK updates during playback
  const { playback: { isPlaying: isTrajectoryPlaying } } = useTrajectory();
  
  // Destructure what we need
  const {
    robotId,
    isReady,
    current,
    target,
    movement,
    solver,
    animation,
    ui
  } = ik;
  
  // Local UI state
  const [showSettings, setShowSettings] = useState(false);
  const [solverSettings, setSolverSettings] = useState({});
  const [targetOrientation, setTargetOrientation] = useState({ roll: 0, pitch: 0, yaw: 0 });
  const [orientationInitialized, setOrientationInitialized] = useState(false);
  const [orientationMode, setOrientationMode] = useState(false);
  
  // Motion profile state
  const [motionProfile, setMotionProfile] = useState('trapezoidal');
  const [animationSpeed, setAnimationSpeed] = useState(1.0);
  const [useMotionProfile, setUseMotionProfile] = useState(true);
  
  // Update solver settings when solver changes
  useEffect(() => {
    const settings = solver.getConfig();
    setSolverSettings(settings);
  }, [solver.current]);
  
  // FIXED: Only sync target orientation with current ONCE when robot first loads or changes
  // PREVENTED: Sync during trajectory playback to avoid interference
  useEffect(() => {
    if (!orientationInitialized && ik.robot && isReady && !isTrajectoryPlaying) {
      setTargetOrientation({
        roll: current.eulerAngles.roll,
        pitch: current.eulerAngles.pitch,
        yaw: current.eulerAngles.yaw
      });
      setOrientationInitialized(true);
    }
  }, [ik.robot, isReady, current.eulerAngles, orientationInitialized, isTrajectoryPlaying]);
  
  // Reset initialization when robot changes
  useEffect(() => {
    setOrientationInitialized(false);
    setTargetOrientation({ roll: 0, pitch: 0, yaw: 0 });
  }, [robotId]);
  
  const handlePositionChange = (axis, value) => {
    target.setPosition(prev => ({
      ...prev,
      [axis]: parseFloat(value) || 0
    }));
  };
  
  const handleOrientationChange = (axis, value) => {
    setTargetOrientation(prev => ({
      ...prev,
      [axis]: parseFloat(value) || 0
    }));
  };
  
  const moveRelative = (axis, delta) => {
    movement.moveRelative(axis, delta);
  };
  
  const rotateRelative = (axis, delta) => {
    setTargetOrientation(prev => ({
      ...prev,
      [axis]: (prev[axis] || 0) + delta
    }));
  };
  
  const moveToTarget = async (animate = true) => {
    // PREVENTED: IK execution during trajectory playback
    if (!ik.robot || !isReady || animation.isAnimating || isTrajectoryPlaying) return;
    
    // Convert target orientation from degrees to radians for the solver
    const targetOrientationRad = {
      roll: targetOrientation.roll * Math.PI / 180,
      pitch: targetOrientation.pitch * Math.PI / 180,
      yaw: targetOrientation.yaw * Math.PI / 180
    };
    
    // Configure solver based on type and settings
    if (solver.current === 'HalimIK') {
      solver.updateConfig({
        ...solverSettings,
        orientationMode: solverSettings.orientationMode || (orientationMode ? 'all' : null),
        noPosition: solverSettings.noPosition || false,
        learningRate: solverSettings.orientationMode ? 0.05 : 0.1,
        regularizationParameter: solverSettings.orientationMode ? 0.0005 : 0.001
      });
    } else if (solver.current === 'CCD') {
      solver.updateConfig({
        ...solverSettings,
        orientationWeight: orientationMode ? 0.8 : 0.1,
        maxIterations: orientationMode ? 20 : 10,
        tolerance: orientationMode ? 0.02 : 0.01,
        dampingFactor: orientationMode ? 0.5 : 0.7,
        angleLimit: orientationMode ? 0.15 : 0.2
      });
    }
    
    // Convert Euler to quaternion for execution
    const orientationQuat = eulerToQuaternion(targetOrientationRad);
    
    // Execute IK with motion profile options
    await movement.executeIK(target.position, orientationQuat, {
      animate,
      motionProfile: useMotionProfile ? motionProfile : null,
      animationSpeed,
      duration: 2000
    });
  };
  
  const syncTargetToCurrent = () => {
    // PREVENTED: Sync during trajectory playback
    if (isTrajectoryPlaying) return;
    
    movement.syncTargetToCurrent();
    setTargetOrientation({
      roll: current.eulerAngles.roll,
      pitch: current.eulerAngles.pitch,
      yaw: current.eulerAngles.yaw
    });
  };
  
  const handleSolverChange = (solverName) => {
    solver.setSolver(solverName);
  };
  
  const handleSettingChange = (setting, value) => {
    const newSettings = { ...solverSettings, [setting]: value };
    setSolverSettings(newSettings);
    solver.updateConfig(newSettings);
  };
  
  const handleStopMovement = () => {
    movement.stopAnimation();
  };
  
  // Helper function to convert Euler to quaternion
  const eulerToQuaternion = (euler) => {
    // This should be provided by the hook, but as a fallback:
    const cy = Math.cos(euler.yaw * 0.5);
    const sy = Math.sin(euler.yaw * 0.5);
    const cp = Math.cos(euler.pitch * 0.5);
    const sp = Math.sin(euler.pitch * 0.5);
    const cr = Math.cos(euler.roll * 0.5);
    const sr = Math.sin(euler.roll * 0.5);
    
    return {
      w: cr * cp * cy + sr * sp * sy,
      x: sr * cp * cy - cr * sp * sy,
      y: cr * sp * cy + sr * cp * sy,
      z: cr * cp * sy - sr * sp * cy
    };
  };
  
  if (!isReady) {
    return (
      <div className="controls-section">
        <h3 className="controls-section-title">Inverse Kinematics</h3>
        <p className="controls-text-muted">No robot loaded</p>
      </div>
    );
  }
  
  // Helper variable for disabled state during trajectory playback
  const isDisabled = animation.isAnimating || isTrajectoryPlaying;
  
  return (
    <div className="controls-section">
      <h3 className="controls-section-title">
        Inverse Kinematics - {robotId}
        {isTrajectoryPlaying && (
          <span className="controls-text-muted controls-ml-2" style={{ fontSize: '0.8rem' }}>
            (Disabled during trajectory playback)
          </span>
        )}
      </h3>
      
      {/* Solver Selection */}
      <div className="controls-form-group">
        <label className="controls-form-label">IK Solver:</label>
        <select 
          className="controls-form-select"
          value={solver.current}
          onChange={(e) => handleSolverChange(e.target.value)}
          disabled={isDisabled}
        >
          {solver.available.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        
        <button
          className="controls-btn controls-btn-sm controls-btn-secondary controls-mt-2"
          onClick={() => setShowSettings(!showSettings)}
          disabled={isDisabled}
        >
          {showSettings ? 'Hide' : 'Show'} Settings
        </button>
      </div>
      
      {/* Solver Settings */}
      {showSettings && solverSettings && (
        <div className="controls-card controls-p-3 controls-mb-3">
          <h5 className="controls-h6">{solver.current} Settings:</h5>
          
          {solver.current === 'HalimIK' && (
            <>
              <div className="controls-form-group">
                <label className="controls-form-label">Orientation Mode:</label>
                <select
                  className="controls-form-select"
                  value={solverSettings.orientationMode || ''}
                  onChange={(e) => handleSettingChange('orientationMode', e.target.value || null)}
                  disabled={isDisabled}
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
                    disabled={isDisabled || !solverSettings.orientationMode}
                  />
                  Orientation Only (No Position)
                </label>
                <small className="controls-text-muted">
                  Only optimize for orientation, ignore position
                </small>
              </div>
            </>
          )}
          
          {solver.current === 'CCD' && (
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
            if (solver.current === 'CCD' && key === 'orientationWeight' && !orientationMode) return null;
            
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
                  disabled={isDisabled}
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
            <div className="controls-form-control-static">{current.position.x.toFixed(4)}</div>
          </div>
          <div>
            <label className="controls-form-label">Y</label>
            <div className="controls-form-control-static">{current.position.y.toFixed(4)}</div>
          </div>
          <div>
            <label className="controls-form-label">Z</label>
            <div className="controls-form-control-static">{current.position.z.toFixed(4)}</div>
          </div>
        </div>
      </div>
      
      {/* Current End Effector Orientation */}
      {current.eulerAngles && (
        <div className="controls-form-group">
          <h4 className="controls-h6">Current End Effector Orientation:</h4>
          <div className="controls-grid controls-grid-cols-3 controls-gap-2">
            <div>
              <label className="controls-form-label">Roll (°)</label>
              <div className="controls-form-control-static">{current.eulerAngles.roll.toFixed(2)}</div>
            </div>
            <div>
              <label className="controls-form-label">Pitch (°)</label>
              <div className="controls-form-control-static">{current.eulerAngles.pitch.toFixed(2)}</div>
            </div>
            <div>
              <label className="controls-form-label">Yaw (°)</label>
              <div className="controls-form-control-static">{current.eulerAngles.yaw.toFixed(2)}</div>
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
                disabled={isDisabled}
              >
                -
              </button>
              <input
                type="number"
                className="controls-form-control"
                value={target.position.x}
                onChange={(e) => handlePositionChange('x', e.target.value)}
                step="0.001"
                disabled={isDisabled}
                style={{
                  WebkitAppearance: 'none',
                  MozAppearance: 'textfield'
                }}
              />
              <button
                className="controls-btn controls-btn-sm controls-btn-secondary"
                onClick={() => moveRelative('x', 0.01)}
                disabled={isDisabled}
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
                disabled={isDisabled}
              >
                -
              </button>
              <input
                type="number"
                className="controls-form-control"
                value={target.position.y}
                onChange={(e) => handlePositionChange('y', e.target.value)}
                step="0.001"
                disabled={isDisabled}
                style={{
                  WebkitAppearance: 'none',
                  MozAppearance: 'textfield'
                }}
              />
              <button
                className="controls-btn controls-btn-sm controls-btn-secondary"
                onClick={() => moveRelative('y', 0.01)}
                disabled={isDisabled}
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
                disabled={isDisabled}
              >
                -
              </button>
              <input
                type="number"
                className="controls-form-control"
                value={target.position.z}
                onChange={(e) => handlePositionChange('z', e.target.value)}
                step="0.001"
                disabled={isDisabled}
                style={{
                  WebkitAppearance: 'none',
                  MozAppearance: 'textfield'
                }}
              />
              <button
                className="controls-btn controls-btn-sm controls-btn-secondary"
                onClick={() => moveRelative('z', 0.01)}
                disabled={isDisabled}
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
                disabled={isDisabled}
              >
                -
              </button>
              <input
                type="number"
                className="controls-form-control"
                value={targetOrientation.roll}
                onChange={(e) => handleOrientationChange('roll', e.target.value)}
                step="1"
                disabled={isDisabled}
                style={{
                  WebkitAppearance: 'none',
                  MozAppearance: 'textfield'
                }}
              />
              <button
                className="controls-btn controls-btn-sm controls-btn-secondary"
                onClick={() => rotateRelative('roll', 5)}
                disabled={isDisabled}
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
                disabled={isDisabled}
              >
                -
              </button>
              <input
                type="number"
                className="controls-form-control"
                value={targetOrientation.pitch}
                onChange={(e) => handleOrientationChange('pitch', e.target.value)}
                step="1"
                disabled={isDisabled}
                style={{
                  WebkitAppearance: 'none',
                  MozAppearance: 'textfield'
                }}
              />
              <button
                className="controls-btn controls-btn-sm controls-btn-secondary"
                onClick={() => rotateRelative('pitch', 5)}
                disabled={isDisabled}
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
                disabled={isDisabled}
              >
                -
              </button>
              <input
                type="number"
                className="controls-form-control"
                value={targetOrientation.yaw}
                onChange={(e) => handleOrientationChange('yaw', e.target.value)}
                step="1"
                disabled={isDisabled}
                style={{
                  WebkitAppearance: 'none',
                  MozAppearance: 'textfield'
                }}
              />
              <button
                className="controls-btn controls-btn-sm controls-btn-secondary"
                onClick={() => rotateRelative('yaw', 5)}
                disabled={isDisabled}
              >
                +
              </button>
            </div>
          </div>
        </div>
        
        <button
          className="controls-btn controls-btn-sm controls-btn-info controls-w-100 controls-mt-3"
          onClick={syncTargetToCurrent}
          disabled={isDisabled}
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
                disabled={isDisabled}
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
                    disabled={isDisabled}
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
                    disabled={isDisabled}
                  />
                  <span>{animationSpeed}x</span>
                </label>
              </>
            )}
          </div>
        </div>
        
        {/* Move/Stop buttons */}
        <div className="controls-btn-group controls-w-100 controls-mt-2">
          {!animation.isAnimating ? (
            <button
              className="controls-btn controls-btn-primary controls-w-100"
              onClick={() => moveToTarget(true)}
              disabled={isDisabled}
            >
              Move Robot to Target
            </button>
          ) : (
            <button
              className="controls-btn controls-btn-danger controls-w-100"
              onClick={handleStopMovement}
              disabled={isTrajectoryPlaying}
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
          isTrajectoryPlaying ? 'warning' :
          solver.status?.includes('Error') || solver.status?.includes('Failed') ? 'danger' : 
          solver.status?.includes('Moving') || solver.status?.includes('Solving') ? 'warning' :
          solver.status?.includes('Complete') ? 'success' : 'muted'
        }`}>
          {' ' + (isTrajectoryPlaying ? 'Trajectory playback active' : (solver.status || 'Ready'))}
        </span>
        
        {animation.isAnimating && !isTrajectoryPlaying && (
          <div className="controls-mt-2">
            <small className="controls-text-muted">
              Animation in progress... Click "Stop Movement" to cancel.
            </small>
          </div>
        )}
        
        {isTrajectoryPlaying && (
          <div className="controls-mt-2">
            <small className="controls-text-muted">
              IK controls disabled during trajectory playback. Wait for playback to complete.
            </small>
          </div>
        )}
      </div>
    </div>
  );
};

export default IKController