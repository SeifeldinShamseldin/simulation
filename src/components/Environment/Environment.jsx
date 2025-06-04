// src/components/Environment/Environment.jsx - NO ControlsTheme.css import
import React from 'react';
import EnvironmentCategories from './EnvironmentCategories/EnvironmentCategories';
import EnvironmentObjects from './EnvironmentObjects/EnvironmentObjects';
import EnvironmentSpawned from './EnvironmentSpawned/EnvironmentSpawned';
import HumanControls from './HumanControls/HumanControls';
// NO import for ControlsTheme.css here!

const Environment = ({ viewerRef, isPanel = false, onClose }) => {
  return (
    <div className="controls">
      <section className="controls-section-wrapper">
        <EnvironmentCategories viewerRef={viewerRef} />
      </section>
      <section className="controls-section-wrapper">
        <EnvironmentObjects viewerRef={viewerRef} />
      </section>
      <section className="controls-section-wrapper">
        <EnvironmentSpawned viewerRef={viewerRef} />
      </section>
      <section className="controls-section-wrapper">
        <HumanControls viewerRef={viewerRef} />
      </section>
    </div>
  );
};

export default Environment;