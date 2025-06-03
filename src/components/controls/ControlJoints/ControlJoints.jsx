// src/components/controls/ControlJoints/ControlJoints.jsx
import React, { useState, useEffect } from 'react';
import { useRobot } from '../../../contexts/RobotContext';
import EventBus from '../../../utils/EventBus';

const ControlJoints = ({ viewerRef }) => {
  const { viewOptions } = useRobot();
  const [jointInfo, setJointInfo] = useState([]);
  const [jointValues, setJointValues] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  // Load joint information from robot
  useEffect(() => {
    if (!viewerRef?.current) return;

    const updateJointInfo = () => {
      try {
        const robot = viewerRef.current.getCurrentRobot();
        if (!robot || !robot.joints) return;

        const jointsList = [];
        const values = {};

        Object.entries(robot.joints).forEach(([name, joint]) => {
          if (joint && joint.jointType !== 'fixed') {
            jointsList.push({
              name,
              type: joint.jointType,
              jointType: joint.jointType,
              limit: joint.limit || { lower: -3.14, upper: 3.14 },
              value: joint.jointValue || [0]
            });

            values[name] = Array.isArray(joint.jointValue) ? 
              joint.jointValue[0] : 
              (typeof joint.jointValue === 'number' ? joint.jointValue : 0);
          }
        });

        setJointInfo(jointsList);
        setJointValues(values);
      } catch (error) {
        console.error('Error updating joint info:', error);
      }
    };

    // Initial update
    updateJointInfo();

    // Set up interval for updates
    const intervalId = setInterval(updateJointInfo, 1000);

    // Listen for joint updates via EventBus
    const unsubscribeJointChange = EventBus.on('joint:value-changed', (data) => {
      if (data.jointName && data.value !== undefined) {
        setJointValues(prev => ({
          ...prev,
          [data.jointName]: data.value
        }));
      }
    });

    // Listen for robot loaded events
    const unsubscribeRobotLoaded = EventBus.on('robot:loaded', () => {
      updateJointInfo();
    });

    return () => {
      clearInterval(intervalId);
      unsubscribeJointChange();
      unsubscribeRobotLoaded();
    };
  }, [viewerRef]);

  const handleJointChange = (name, value) => {
    if (!viewerRef?.current) return;

    const numValue = parseFloat(value);
    if (isNaN(numValue)) return;

    // Emit to EventBus
    EventBus.emit('joint:value-changed', {
      jointName: name,
      value: numValue,
      source: 'manual'
    });

    // Update robot directly
    try {
      viewerRef.current.setJointValue(name, numValue);
      
      // Update local state
      setJointValues(prev => ({
        ...prev,
        [name]: numValue
      }));
    } catch (error) {
      console.error('Error setting joint value:', error);
    }
  };

  const handleResetJoints = () => {
    if (!viewerRef?.current) return;

    setIsLoading(true);
    try {
      viewerRef.current.resetJoints();
      
      // Reset local state
      const resetValues = {};
      jointInfo.forEach(joint => {
        resetValues[joint.name] = 0;
      });
      setJointValues(resetValues);

      // Emit reset event
      EventBus.emit('joints:reset');
    } catch (error) {
      console.error('Error resetting joints:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Show message if no joints available
  if (!jointInfo || jointInfo.length === 0) {
    return (
      <div className="controls-section">
        <div className="controls-section-header">
          <h3 className="controls-h3 controls-mb-0">Joint Controls</h3>
          <button 
            onClick={handleResetJoints}
            className="controls-btn controls-btn-primary"
            disabled
          >
            Return to Zero
          </button>
        </div>
        <p className="controls-text-muted">Control robot joint positions</p>
        <div className="controls-alert controls-alert-info">
          No robot loaded. Please load a robot first.
        </div>
      </div>
    );
  }

  return (
    <div className="controls-section">
      <div className="controls-section-header">
        <h3 className="controls-h3 controls-mb-0">Joint Controls</h3>
        <button 
          onClick={handleResetJoints}
          className="controls-btn controls-btn-primary"
          disabled={isLoading}
        >
          {isLoading ? 'Resetting...' : 'Return to Zero'}
        </button>
      </div>
      
      <p className="controls-text-muted controls-mb-3">Control robot joint positions</p>
      
      <div className="joint-controls-container">
        {jointInfo.map((joint, index) => {
          const minLimit = viewOptions.ignoreLimits ? -3.14 : joint.limit.lower;
          const maxLimit = viewOptions.ignoreLimits ? 3.14 : joint.limit.upper;
          const currentValue = jointValues[joint.name] || 0;
          
          return (
            <div key={joint.name || index} className="controls-form-group">
              <label className="controls-form-label" htmlFor={`joint-${joint.name}`}>
                {joint.name} ({joint.type}):
              </label>
              <div className="controls-d-flex controls-align-items-center controls-gap-3">
                <input
                  id={`joint-${joint.name}`}
                  type="range"
                  min={minLimit}
                  max={maxLimit}
                  step={0.01}
                  value={currentValue}
                  onChange={(e) => handleJointChange(joint.name, e.target.value)}
                  className="joint-slider"
                />
                <span className="joint-value-display">
                  {currentValue.toFixed(2)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ControlJoints;