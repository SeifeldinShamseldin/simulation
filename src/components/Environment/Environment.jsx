// src/components/Environment/Environment.jsx
import React from 'react';
import EnvironmentManager from './EnvironmentManager/EnvironmentManager';

const Environment = ({ viewerRef, isPanel = false, onClose }) => {
  return (
    <div className="controls" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <section className="controls-section-wrapper" style={{ flex: 1, overflow: 'hidden' }}>
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