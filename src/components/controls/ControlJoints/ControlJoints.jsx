// components/controls/ControlJoints/ControlJoints.jsx
import React, { useEffect } from 'react';

/**
 * Component for controlling robot joint values
 */
const ControlJoints = ({ 
  jointInfo = [], 
  jointValues = {}, 
  ignoreLimits = false, 
  onJointChange,
  onResetJoints
}) => {
  // Log received data for debugging
  useEffect(() => {
    console.log('ControlJoints received jointInfo:', jointInfo);
    console.log('ControlJoints received jointValues:', jointValues);
  }, [jointInfo, jointValues]);

  /**
   * Handle joint value change
   * @param {string} name - The name of the joint
   * @param {number|string} value - The new value
   */
  const handleJointChange = (name, value) => {
    if (onJointChange) {
      onJointChange(name, value);
    }
  };

  // Show message if no joints to display
  if (!jointInfo || jointInfo.length === 0) {
    return (
      <div className="controls-section">
        <div className="controls-section-header">
          <h3 className="controls-h3 controls-mb-0">Joint Controls</h3>
          <button 
            onClick={onResetJoints}
            className="controls-btn controls-btn-primary"
          >
            Return to Zero
          </button>
        </div>
        <p className="controls-text-muted">Control robot joint positions</p>
        <div className="controls-alert controls-alert-danger">
          No joint information available. Please ensure a robot is loaded.
        </div>
      </div>
    );
  }

  return (
    <div className="controls-section">
      <div className="controls-section-header">
        <h3 className="controls-h3 controls-mb-0">Joint Controls</h3>
        <button 
          onClick={onResetJoints}
          className="controls-btn controls-btn-primary"
        >
          Return to Zero
        </button>
      </div>
      
      <p className="controls-text-muted controls-mb-3">Control robot joint positions</p>
      
      <div className="joint-controls-container">
        {(jointInfo || []).map((joint, index) => {
          if (!joint || !joint.name) return null;
          
          // Skip fixed joints
          const jointType = joint.type || joint.jointType;
          if (jointType === 'fixed') return null;
          
          // Get limits with fallbacks
          const minLimit = ignoreLimits ? -3.14 : 
                         (joint.limit && typeof joint.limit.lower === 'number' ? 
                          joint.limit.lower : -3.14);
          
          const maxLimit = ignoreLimits ? 3.14 : 
                         (joint.limit && typeof joint.limit.upper === 'number' ? 
                          joint.limit.upper : 3.14);
          
          // Get value with fallback
          const currentValue = jointValues && jointValues[joint.name] !== undefined ? 
                             jointValues[joint.name] : 0;
          
          return (
            <div key={joint.name || index} className="controls-form-group">
              <label className="controls-form-label" htmlFor={`joint-${joint.name}`}>
                {joint.name} ({jointType || 'unknown'}):
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