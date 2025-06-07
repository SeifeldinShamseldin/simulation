// src/components/controls/ControlJoints/ControlJoints.jsx
import React, { useState, useEffect } from 'react';
import { useRobotControl } from '../../../contexts/hooks/useRobotControl';
import EventBus from '../../../utils/EventBus';

const ControlJoints = () => {
  const { 
    activeRobotId, 
    robot, 
    setJointValue, 
    setJointValues: setRobotJointValues,
    resetJoints, 
    isReady 
  } = useRobotControl();
  
  const [jointValues, setJointValues] = useState({});
  const [jointInfo, setJointInfo] = useState([]);
  const [isIKAnimating, setIsIKAnimating] = useState(false);

  // Listen for IK calculated joint values
  useEffect(() => {
    const handleIKJointValues = async (data) => {
      if (data.robotId !== activeRobotId) return;
      
      console.log('[Joint Control] Received IK joint values:', data.jointValues);
      setIsIKAnimating(true);
      
      // Get CURRENT joint values as starting point
      const currentJointValues = {};
      if (robot && robot.joints) {
        Object.entries(robot.joints).forEach(([name, joint]) => {
          if (joint && joint.jointType !== 'fixed') {
            currentJointValues[name] = joint.angle || 0;
          }
        });
      }
      
      console.log('[Joint Control] Starting from current angles:', currentJointValues);
      
      if (data.animate) {
        // Animate from current position to target
        await animateToJointValues(data.jointValues, data.duration, currentJointValues);
      } else {
        // Apply immediately
        const success = setRobotJointValues(data.jointValues);
        if (success) {
          setJointValues(prev => ({ ...prev, ...data.jointValues }));
        }
      }
      
      setIsIKAnimating(false);
      
      // Notify IK that animation is complete
      EventBus.emit('ik:animation-complete', {
        robotId: activeRobotId,
        success: true
      });
    };

    const unsubscribe = EventBus.on('ik:joint-values-calculated', handleIKJointValues);
    return () => unsubscribe();
  }, [activeRobotId, setRobotJointValues, robot]);

  // Listen for IK animation completion in IK Context
  useEffect(() => {
    const handleAnimationComplete = (data) => {
      if (data.robotId === activeRobotId) {
        EventBus.emit('ik:set-animation-state', {
          robotId: activeRobotId,
          isAnimating: false,
          status: data.success ? 'Ready' : 'Error'
        });
      }
    };

    const unsubscribe = EventBus.on('ik:animation-complete', handleAnimationComplete);
    return () => unsubscribe();
  }, [activeRobotId]);

  // Animate to target joint values
  const animateToJointValues = async (targetValues, duration = 1000, startingAngles = {}) => {
    return new Promise((resolve) => {
      const startTime = Date.now();
      
      console.log('[Joint Control] Animating from:', startingAngles, 'to:', targetValues);
      
      // Animation loop
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Interpolate angles
        const currentValues = {};
        Object.keys(targetValues).forEach(jointName => {
          const start = startingAngles[jointName] || 0;
          const end = targetValues[jointName];
          const interpolatedAngle = start + (end - start) * progress;
          
          // Set joint value through robot control
          setJointValue(jointName, interpolatedAngle);
          currentValues[jointName] = interpolatedAngle;
        });
        
        // Update local state
        setJointValues(prev => ({ ...prev, ...currentValues }));
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          console.log('[Joint Control] Animation complete');
          resolve();
        }
      };
      
      animate();
    });
  };

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
      <h3 className="controls-section-title">
        Joint Control - {activeRobotId}
        {isIKAnimating && (
          <span className="controls-badge controls-badge-info controls-ml-2">
            IK Moving...
          </span>
        )}
      </h3>
      
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