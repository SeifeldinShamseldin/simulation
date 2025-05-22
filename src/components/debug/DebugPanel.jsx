// components/debug/DebugPanel.jsx
import React, { useState, useEffect } from 'react';
import debugSystem from '../../utils/DebugSystem';

const DebugPanel = () => {
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState('');
  const [level, setLevel] = useState('');
  const [isVisible, setIsVisible] = useState(false);
  
  useEffect(() => {
    // Initial logs
    setLogs(debugSystem.getLogs());
    
    // Subscribe to new logs
    const unsubscribe = debugSystem.subscribe((log) => {
      setLogs(prevLogs => [...prevLogs, log]);
    });
    
    return unsubscribe;
  }, []);
  
  const toggleVisibility = () => setIsVisible(!isVisible);
  
  const filteredLogs = logs
    .filter(log => level ? log.level === level : true)
    .filter(log => filter ? log.message.toLowerCase().includes(filter.toLowerCase()) : true);
  
  const clearLogs = () => {
    debugSystem.clearLogs();
    setLogs([]);
  };
  
  if (!isVisible) {
    return (
      <button 
        onClick={toggleVisibility}
        style={{
          position: 'fixed',
          bottom: 10,
          right: 10,
          zIndex: 1000,
          padding: '5px 10px',
          background: '#333',
          color: 'white',
          border: 'none',
          borderRadius: 4
        }}
      >
        Show Debug
      </button>
    );
  }
  
  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      right: 0,
      width: '80%',
      height: '50%',
      background: '#222',
      color: 'white',
      zIndex: 1000,
      padding: 10,
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <h3>Debug Console</h3>
        <div>
          <button onClick={toggleVisibility} style={{ marginRight: 10 }}>Hide</button>
          <button onClick={clearLogs}>Clear</button>
        </div>
      </div>
      
      <div style={{ display: 'flex', marginBottom: 10 }}>
        <input
          type="text"
          placeholder="Filter logs..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ flex: 1, marginRight: 10, padding: 5 }}
        />
        
        <select 
          value={level} 
          onChange={(e) => setLevel(e.target.value)}
          style={{ padding: 5 }}
        >
          <option value="">All Levels</option>
          <option value="debug">Debug</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
        </select>
      </div>
      
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filteredLogs.length === 0 ? (
          <div style={{ padding: 10, textAlign: 'center' }}>No logs to display</div>
        ) : (
          filteredLogs.map((log, index) => (
            <div 
              key={index}
              style={{
                padding: '5px 10px',
                borderBottom: '1px solid #444',
                color: log.level === 'error' ? '#ff6b6b' : 
                      log.level === 'warn' ? '#feca57' : 
                      log.level === 'info' ? '#1dd1a1' : '#54a0ff'
              }}
            >
              <div style={{ fontSize: 12, color: '#999' }}>
                {log.timestamp.toLocaleTimeString()} - {log.level.toUpperCase()}
              </div>
              <div style={{ wordBreak: 'break-word' }}>{log.message}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default DebugPanel;