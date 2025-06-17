import React, { useState, useEffect } from 'react';
import debugSystem from '../../utils/DebugSystem';

const DebugControl = () => {
  const [contextStatus, setContextStatus] = useState(debugSystem.getContextStatus());
  const [isVisible, setIsVisible] = useState(false);
  const [logLevel, setLogLevel] = useState(debugSystem.logLevel);

  useEffect(() => {
    // Update context status when it changes
    const updateStatus = () => {
      setContextStatus(debugSystem.getContextStatus());
    };

    // Subscribe to debug system changes
    const unsubscribe = debugSystem.subscribe(updateStatus);
    return unsubscribe;
  }, []);

  const handleContextToggle = (context) => {
    if (contextStatus[context]) {
      debugSystem.disableContext(context);
    } else {
      debugSystem.enableContext(context);
    }
    setContextStatus(debugSystem.getContextStatus());
  };

  const handleEnableAll = () => {
    debugSystem.enableAllContexts();
    setContextStatus(debugSystem.getContextStatus());
  };

  const handleDisableAll = () => {
    debugSystem.disableAllContexts();
    setContextStatus(debugSystem.getContextStatus());
  };

  const handleLogLevelChange = (level) => {
    debugSystem.setLogLevel(level);
    setLogLevel(level);
  };

  const handleClearLogs = () => {
    debugSystem.clearLogs();
  };

  const contextLabels = {
    TCP: 'TCP (Tool Center Point)',
    IK: 'IK (Inverse Kinematics)',
    JOINT: 'Joint Control',
    TRAJECTORY: 'Trajectory Recording',
    ROBOT: 'Robot Management',
    VIEWER: '3D Viewer',
    EVENT: 'Event Bus',
    ANIMATION: 'Animation System'
  };

  return (
    <div className="debug-control-container" style={{ position: 'fixed', top: '10px', right: '10px', zIndex: 9999 }}>
      {/* Toggle Button */}
      <button
        onClick={() => setIsVisible(!isVisible)}
        style={{
          background: '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          padding: '8px 12px',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 'bold'
        }}
      >
        🐛 Debug {isVisible ? '▼' : '▶'}
      </button>

      {/* Debug Panel */}
      {isVisible && (
        <div style={{
          background: 'white',
          border: '1px solid #ccc',
          borderRadius: '4px',
          padding: '15px',
          marginTop: '5px',
          minWidth: '300px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          fontSize: '14px'
        }}>
          <h4 style={{ margin: '0 0 15px 0', fontSize: '16px' }}>Debug Controls</h4>
          
          {/* Log Level Control */}
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Log Level:
            </label>
            <select
              value={logLevel}
              onChange={(e) => handleLogLevelChange(e.target.value)}
              style={{
                width: '100%',
                padding: '5px',
                border: '1px solid #ccc',
                borderRadius: '3px'
              }}
            >
              <option value="debug">Debug</option>
              <option value="info">Info</option>
              <option value="warn">Warning</option>
              <option value="error">Error</option>
            </select>
          </div>

          {/* Context Toggles */}
          <div style={{ marginBottom: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <label style={{ fontWeight: 'bold' }}>Debug Contexts:</label>
              <div>
                <button
                  onClick={handleEnableAll}
                  style={{
                    background: '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: '3px',
                    padding: '3px 8px',
                    marginRight: '5px',
                    fontSize: '11px',
                    cursor: 'pointer'
                  }}
                >
                  All On
                </button>
                <button
                  onClick={handleDisableAll}
                  style={{
                    background: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '3px',
                    padding: '3px 8px',
                    fontSize: '11px',
                    cursor: 'pointer'
                  }}
                >
                  All Off
                </button>
              </div>
            </div>
            
            {Object.entries(contextStatus).map(([context, enabled]) => (
              <div key={context} style={{ marginBottom: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={() => handleContextToggle(context)}
                    style={{ marginRight: '8px' }}
                  />
                  <span style={{ fontSize: '13px' }}>
                    {contextLabels[context] || context}
                  </span>
                </label>
              </div>
            ))}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={handleClearLogs}
              style={{
                background: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                padding: '5px 10px',
                fontSize: '12px',
                cursor: 'pointer',
                flex: 1
              }}
            >
              Clear Logs
            </button>
            <button
              onClick={() => debugSystem.enable()}
              style={{
                background: '#17a2b8',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                padding: '5px 10px',
                fontSize: '12px',
                cursor: 'pointer',
                flex: 1
              }}
            >
              Enable Debug
            </button>
            <button
              onClick={() => debugSystem.disable()}
              style={{
                background: '#ffc107',
                color: 'black',
                border: 'none',
                borderRadius: '3px',
                padding: '5px 10px',
                fontSize: '12px',
                cursor: 'pointer',
                flex: 1
              }}
            >
              Disable Debug
            </button>
          </div>

          {/* Status Info */}
          <div style={{ marginTop: '10px', padding: '8px', background: '#f8f9fa', borderRadius: '3px', fontSize: '12px' }}>
            <div>Debug System: {debugSystem.isEnabled ? '🟢 Enabled' : '🔴 Disabled'}</div>
            <div>Log Count: {debugSystem.getLogs().length}</div>
            <div>Active Contexts: {Object.values(contextStatus).filter(Boolean).length}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DebugControl; 