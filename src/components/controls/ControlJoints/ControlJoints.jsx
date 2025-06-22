// src/components/controls/ControlJoints/ControlJoints.jsx
// UI displays commanded joint positions (where joints are going)
// Sliders update when joint commands are sent from any source

import React, { useCallback, useEffect } from 'react';
import useJoints from '../../../contexts/hooks/useJoints';
import EventBus from '../../../utils/EventBus';
import { JointEvents } from '../../../contexts/dataTransfer';

const ControlJoints = () => {
  // Get all joint functionality from single hook
  const joints = useJoints();
  
  // Destructure what we need
  const {
    robotId,
    setJointValue,
    resetJoints,
    getJointLimits,
    getJointValue,
    hasJoints,
    hasMovableJoints,
    getMovableJoints,
    debugJoint
  } = joints;
  
  // Handle joint change
  const handleJointChange = useCallback((jointName, value) => {
    const numValue = parseFloat(value);
    const success = setJointValue(jointName, numValue);
    
    if (!success) {
      debugJoint(`Failed to update joint ${jointName}`);
    }
  }, [setJointValue, debugJoint]);
  
  // Handle reset
  const handleReset = useCallback(() => {
    const success = resetJoints();
    if (!success) {
      debugJoint('Failed to reset joints');
    }
  }, [resetJoints, debugJoint]);
  
  // Get movable joints for display
  const movableJoints = getMovableJoints();
  
  // Poll for joint values via GET_VALUES event every 200ms
  useEffect(() => {
    if (!robotId) return;
    let isMounted = true;
    let interval;
    let requestId = 'getvals_' + Date.now();

    const handleResponse = (data) => {
      if (isMounted && data.robotId === robotId && data.requestId === requestId) {
        setJointValues(data.values);
      }
    };
    const unsub = EventBus.on(JointEvents.Responses.GET_VALUES, handleResponse);

    // Poll every 200ms
    interval = setInterval(() => {
      requestId = 'getvals_' + Date.now();
      EventBus.emit(JointEvents.Commands.GET_VALUES, { robotId, requestId });
    }, 200);

    // Initial fetch
    EventBus.emit(JointEvents.Commands.GET_VALUES, { robotId, requestId });

    return () => {
      isMounted = false;
      clearInterval(interval);
      unsub();
    };
  }, [robotId]);
  
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
      </h3>
      
      <div className="joint-controls-container">
        {movableJoints.map((joint) => {
          // Get commanded value (where joint is going)
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
      >
        Reset All Joints
      </button>
      
      {/* Joint summary */}
      <div className="controls-mt-3 controls-small controls-text-muted">
        {movableJoints.length} movable joints • Robot: {robotId}
      </div>
    </div>
  );
};

export default ControlJoints;