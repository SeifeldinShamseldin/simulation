// src/components/controls/ControlJoints/ControlJoints.jsx
import React, { useState, useEffect } from 'react';
import { useRobot } from '../../../contexts/RobotContext';
import EventBus from '../../../utils/EventBus';

const ControlJoints = ({ robot, onJointChange }) => {
  const [jointValues, setJointValues] = useState({});
  const [ignoreLimits, setIgnoreLimits] = useState(false);

  // Update joint values when robot changes
  useEffect(() => {
    if (robot) {
      const values = {};
      robot.traverse((child) => {
        if (child.isURDFJoint && child.jointType !== 'fixed') {
          values[child.name] = child.angle;
        }
      });
      setJointValues(values);
    }
  }, [robot]);

  const handleJointChange = (jointName, value) => {
    setJointValues(prev => ({
      ...prev,
      [jointName]: value
    }));
    onJointChange(jointName, value);
  };

  const handleReset = () => {
    if (robot) {
      const values = {};
      robot.traverse((child) => {
        if (child.isURDFJoint && child.jointType !== 'fixed') {
          values[child.name] = 0;
          child.angle = 0;
        }
      });
      setJointValues(values);
      onJointChange(null, values);
    }
  };

  if (!robot) return null;

  return (
    <section className="control-section">
      <h3>Joint Control</h3>
      <div className="control-options">
        <label>
          <input
            type="checkbox"
            checked={ignoreLimits}
            onChange={(e) => setIgnoreLimits(e.target.checked)}
          />
          Ignore Joint Limits
        </label>
        <button onClick={handleReset}>Reset All</button>
      </div>
      <div className="joint-controls">
        {Object.entries(jointValues).map(([name, value]) => {
          const joint = robot.joints[name];
          if (!joint) return null;

          const limits = joint.limit || {};
          const min = ignoreLimits ? -Math.PI : (limits.lower ?? -Math.PI);
          const max = ignoreLimits ? Math.PI : (limits.upper ?? Math.PI);
          const step = (max - min) / 100;

          return (
            <div key={name} className="joint-control">
              <label>{name}</label>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => handleJointChange(name, parseFloat(e.target.value))}
              />
              <span>{value.toFixed(2)} rad</span>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default ControlJoints;