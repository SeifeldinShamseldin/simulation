// src/components/controls/ControlJoints/ControlJoints.jsx - Updated to use useJoints
import React from 'react';
import { useJoints } from '../../../contexts/hooks/useJoints';

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

  const handleJointChange = (jointName, value) => {
    const numValue = parseFloat(value);
    setJointValue(jointName, numValue);
  };

  const handleReset = () => {
    resetJoints();
  };

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

  return (
    <div className="controls-section">
      <h3 className="controls-section-title">
        Joint Control - {robotId}
        {isAnimating && (
          <span className="controls-badge controls-badge-info controls-ml-2">
            IK Moving... {Math.round(animationProgress * 100)}%
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
                  disabled={isAnimating}
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
        disabled={isAnimating}
      >
        Reset All Joints
      </button>
      
      {/* Joint summary */}
      <div className="controls-mt-3 controls-small controls-text-muted">
        {movableJoints.length} movable joints • Robot: {robotId}
        {isAnimating && (
          <div className="controls-mt-2">
            <div className="controls-progress">
              <div 
                className="controls-progress-bar" 
                style={{ width: `${animationProgress * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ControlJoints;