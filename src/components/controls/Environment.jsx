// src/components/controls/Environment.jsx
import React from 'react';
import EnvironmentManager from '../Environment/EnvironmentManager/EnvironmentManager';

/**
 * Environment container component
 * Displays the environment manager section
 */
const Environment = ({ viewerRef, isPanel = false, onClose }) => {
  return (
    <div className="controls">
      {/* Environment Management Section */}
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