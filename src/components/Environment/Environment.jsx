// src/components/Environment/Environment.jsx
import React from 'react';
import EnvironmentManager from './EnvironmentManager/EnvironmentManager';

const Environment = ({ viewerRef, isPanel = false, onClose }) => {
  return (
    <div className="controls">
      <EnvironmentManager 
        viewerRef={viewerRef} 
        isPanel={isPanel} 
        onClose={onClose} 
      />
    </div>
  );
};

export default Environment;