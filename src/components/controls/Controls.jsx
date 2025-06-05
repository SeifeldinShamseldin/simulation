// src/components/controls/Controls.jsx - NO ControlsTheme.css import
import React from 'react';
import Robot from '../robot/Robot';
// NO import for ControlsTheme.css here!

const Controls = ({ onClose }) => {
  return (
    <Robot isPanel={true} onClose={onClose} />
  );
};

export default Controls;