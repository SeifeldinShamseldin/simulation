// src/components/controls/Environment.jsx - NO ControlsTheme.css import
import React from 'react';
import EnvironmentManager from './EnvironmentManager/EnvironmentManager';
// NO import for ControlsTheme.css here!

const Environment = ({ viewerRef, isPanel = false, onClose }) => {
  return (
    <div className="controls">
      <section className="controls-section-wrapper">
        <EnvironmentManager 
          viewerRef={viewerRef} 
          isPanel={isPanel}
          onClose={onClose}
        />
      </section>
    </div>
  );
};

export default Environment;