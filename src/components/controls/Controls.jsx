// src/components/controls/Controls.jsx - NO ControlsTheme.css import
import React from 'react';
import Robot from '../robot/Robot';
import TCPController from './tcp/TCPController';
// NO import for ControlsTheme.css here!

const Controls = ({ viewerRef, onClose }) => {
  return (
    <div className="controls-container">
      <Robot isPanel={true} onClose={onClose} />
      <TCPController viewerRef={viewerRef} />
    </div>
  );
};

export default Controls;