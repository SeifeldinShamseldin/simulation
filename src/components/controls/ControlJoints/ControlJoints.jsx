// src/components/controls/ControlJoints/ControlJoints.jsx
import React, { useState, useEffect } from 'react';
import { useRobot } from '../../../contexts/RobotContext';
import EventBus from '../../../utils/EventBus';

const ControlJoints = ({ viewerRef }) => {
  const [jointValues, setJointValues] = useState({});
  const [jointInfo, setJointInfo] = useState([]);
  const [robot, setRobot] = useState(null);

  // Listen for robot loaded events and update when viewerRef changes
  useEffect(() => {
    const updateRobot = () => {
      if (viewerRef?.current) {
        const currentRobot = viewerRef.current.getCurrentRobot();
        if (currentRobot) {
          setRobot(currentRobot);
          
          // Extract joint information
          const joints = [];
          const values = {};
          
          currentRobot.traverse((child) => {
            if (child.isURDFJoint && child.jointType !== 'fixed') {
              joints.push({
                name: child.name,
                type: child.jointType,
                limits: child.limit
              });
              values[child.name] = child.angle || 0;
            }
          });
          
          setJointInfo(joints);
          setJointValues(values);
        }
      }
    };

    // Initial update
    updateRobot();

    // Listen for robot loaded events
    const unsubscribe = EventBus.on('robot:loaded', updateRobot);

    return () => {
      unsubscribe();
    };
  }, [viewerRef]);

  const handleJointChange = (jointName, value) => {
    if (!viewerRef?.current) return;
    
    const numValue = parseFloat(value);
    viewerRef.current.setJointValue(jointName, numValue);
    
    setJointValues(prev => ({
      ...prev,
      [jointName]: numValue
    }));
  };

  const handleReset = () => {
    if (!viewerRef?.current) return;
    
    viewerRef.current.resetJoints();
    
    // Reset local state
    const resetValues = {};
    jointInfo.forEach(joint => {
      resetValues[joint.name] = 0;
    });
    setJointValues(resetValues);
  };

  if (!robot || jointInfo.length === 0) {
    return (
      <div className="controls-section">
        <h3 className="controls-section-title">Joint Control</h3>
        <p className="controls-text-muted">No robot loaded or no movable joints found</p>
      </div>
    );
  }

  return (
    <div className="controls-section">
      <h3 className="controls-section-title">Joint Control</h3>
      
      <div className="joint-controls-container">
        {jointInfo.map((joint) => {
          const value = jointValues[joint.name] || 0;
          const limits = joint.limits || {};
          const min = limits.lower ?? -Math.PI;
          const max = limits.upper ?? Math.PI;
          const step = (max - min) / 100;

          return (
            <div key={joint.name} className="controls-form-group">
              <label className="controls-form-label">{joint.name}</label>
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
    </div>
  );
};

export default ControlJoints;