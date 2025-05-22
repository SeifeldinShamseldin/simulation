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
      <div className="urdf-controls-section">
        <h3>Joint Controls</h3>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <span>Control robot joint positions</span>
          <button 
            onClick={onResetJoints}
            style={{ 
              backgroundColor: '#3498db', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px',
              padding: '6px 12px',
              cursor: 'pointer'
            }}
          >
            Return to Zero
          </button>
        </div>
        <div style={{color: 'red', marginTop: '10px'}}>
          No joint information available. Please ensure a robot is loaded.
        </div>
      </div>
    );
  }

  return (
    <div className="urdf-controls-section">
      <h3>Joint Controls</h3>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <span>Control robot joint positions</span>
        <button 
          onClick={onResetJoints}
          style={{ 
            backgroundColor: '#3498db', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px',
            padding: '6px 12px',
            cursor: 'pointer'
          }}
        >
          Return to Zero
        </button>
      </div>
      
      <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
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
            <div key={joint.name || index} style={{ marginBottom: '0.5rem' }}>
              <label htmlFor={`joint-${joint.name}`}>
                {joint.name} ({jointType || 'unknown'}):
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  id={`joint-${joint.name}`}
                  type="range"
                  min={minLimit}
                  max={maxLimit}
                  step={0.01}
                  value={currentValue}
                  onChange={(e) => handleJointChange(joint.name, e.target.value)}
                  style={{ flex: 1 }}
                />
                <span style={{ minWidth: '60px', textAlign: 'right' }}>
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