// src/components/controls/Controls.jsx - NO ControlsTheme.css import
import React from 'react';
import Robot from '../robot/Robot';
// NO import for ControlsTheme.css here!

const Controls = ({ viewerRef }) => {
  return (
    <Robot viewerRef={viewerRef} />
  );
};

export default Controls;