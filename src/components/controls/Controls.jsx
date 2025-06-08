// src/components/controls/Controls.jsx - Clean controls without duplicate TCP
import React from 'react';
import Robot from '../robot/Robot';

const Controls = ({ viewerRef, onClose }) => {
  return (
    <div className="controls-container">
      <Robot isPanel={true} onClose={onClose} />
    </div>
  );
};

export default Controls;