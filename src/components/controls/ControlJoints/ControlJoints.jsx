// src/components/controls/ControlJoints/ControlJoints.jsx - Updated to use unified RobotContext
import React, { useCallback } from 'react';
import { useJoints } from '../../../contexts/hooks/useJoints';
import { useRobotContext } from '../../../contexts/RobotContext'; // Updated import
import { debugJoint } from '../../../utils/DebugSystem'; // Updated debug import
import useAnimate from '../../../contexts/hooks/useAnimate';

const ControlJoints = () => {
  const {
    robotId,
    jointInfo,
    jointValues,
    isAnimating,
    animationProgress,
    setJointValue,
    resetJoints,
    getJointLimits,
    getJointValue,
    hasJoints,
    hasMovableJoints,
    getMovableJoints
  } = useJoints();

  const { isRobotReady } = useRobotContext(); // Updated to use unified context
  const { isAnimating: useAnimateIsAnimating, animationProgress: useAnimateAnimationProgress } = useAnimate();

  const handleJointChange = useCallback((jointName, value) => {
    if (!isRobotReady(robotId)) {
      debugJoint('Robot not ready for joint updates');
      return;
    }
    
    const numValue = parseFloat(value);
    const success = setJointValue(jointName, numValue);
    
    if (!success) {
      debugJoint(`Failed to update joint ${jointName}`);
      // You could add a toast notification here
    }
  }, [robotId, isRobotReady, setJointValue]);

  const handleReset = useCallback(() => {
    if (!isRobotReady(robotId)) {
      debugJoint('Robot not ready for reset');
      return;
    }
    
    const success = resetJoints();
    if (!success) {
      debugJoint('Failed to reset joints');
      // You could add a toast notification here
    }
  }, [robotId, isRobotReady, resetJoints]);

  // Get movable joints for display
  const movableJoints = getMovableJoints();

  if (!robotId || !hasJoints) {
    return (
      <div className="controls-section">
        <h3 className="controls-section-title">Joint Control</h3>
        <p className="controls-text-muted">No robot loaded</p>
      </div>
    );
  }

  if (!hasMovableJoints) {
    return (
      <div className="controls-section">
        <h3 className="controls-section-title">Joint Control - {robotId}</h3>
        <p className="controls-text-muted">No movable joints found</p>
      </div>
    );
  }

  const isRobotReadyForControl = isRobotReady(robotId);

  return (
    <div className="controls-section">
      <h3 className="controls-section-title">
        Joint Control - {robotId}
        {useAnimateIsAnimating.get(robotId) && (
          <span className="controls-badge controls-badge-info controls-ml-2">
            IK Moving... {Math.round(useAnimateAnimationProgress.get(robotId) * 100)}%
          </span>
        )}
        {!isRobotReadyForControl && (
          <span className="controls-badge controls-badge-warning controls-ml-2">
            Robot Loading...
          </span>
        )}
      </h3>
      
      <div className="joint-controls-container">
        {movableJoints.map((joint) => {
          const value = getJointValue(joint.name);
          const limits = getJointLimits(joint.name);
          const min = limits.lower ?? -Math.PI;
          const max = limits.upper ?? Math.PI;
          const step = (max - min) / 100;

          return (
            <div key={joint.name} className="controls-form-group">
              <label className="controls-form-label">
                {joint.name}
                <small className="controls-text-muted controls-ml-2">
                  ({joint.type})
                </small>
              </label>
              <div className="controls-d-flex controls-align-items-center controls-gap-3">
                <input
                  type="range"
                  className="controls-form-range joint-slider"
                  min={min}
                  max={max}
                  step={step}
                  value={value}
                  onChange={(e) => handleJointChange(joint.name, e.target.value)}
                  disabled={useAnimateIsAnimating.get(robotId) || !isRobotReadyForControl}
                />
                <span className="joint-value-display">
                  {value.toFixed(2)} rad
                </span>
              </div>
              
              {/* Show limits info */}
              <div className="controls-small controls-text-muted">
                Range: {min.toFixed(2)} to {max.toFixed(2)} rad
              </div>
            </div>
          );
        })}
      </div>
      
      <button 
        onClick={handleReset} 
        className="controls-btn controls-btn-warning controls-btn-block controls-mt-3"
        disabled={useAnimateIsAnimating.get(robotId) || !isRobotReadyForControl}
      >
        Reset All Joints
      </button>
      
      {/* Joint summary */}
      <div className="controls-mt-3 controls-small controls-text-muted">
        {movableJoints.length} movable joints • Robot: {robotId}
        {useAnimateIsAnimating.get(robotId) && (
          <div className="controls-mt-2">
            <div className="controls-progress">
              <div 
                className="controls-progress-bar" 
                style={{ width: `${useAnimateAnimationProgress.get(robotId) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ControlJoints;