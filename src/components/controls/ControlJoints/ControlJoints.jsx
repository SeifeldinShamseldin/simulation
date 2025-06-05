// src/components/controls/ControlJoints/ControlJoints.jsx
import React, { useState, useEffect } from 'react';
import { useRobotControl } from '../../../contexts/hooks/useRobotControl';

const ControlJoints = () => {
  const { 
    activeRobotId, 
    robot, 
    setJointValue, 
    resetJoints, 
    isReady 
  } = useRobotControl();
  
  const [jointValues, setJointValues] = useState({});
  const [jointInfo, setJointInfo] = useState([]);

  useEffect(() => {
    if (!robot) {
      setJointInfo([]);
      setJointValues({});
      return;
    }

    const joints = [];
    const values = {};
    
    robot.traverse((child) => {
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
  }, [robot]);

  const handleJointChange = (jointName, value) => {
    if (!isReady) return;
    
    const numValue = parseFloat(value);
    setJointValue(jointName, numValue);
    
    setJointValues(prev => ({
      ...prev,
      [jointName]: numValue
    }));
  };

  const handleReset = () => {
    if (!isReady) return;
    
    resetJoints();
    
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
      <h3 className="controls-section-title">Joint Control - {activeRobotId}</h3>
      
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