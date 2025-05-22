// components/controls/ActionButtons.jsx
import React from 'react';

/**
 * Component for robot control action buttons
 */
const ActionButtons = ({ onUndo, onRedo, onReset, onFocus }) => {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
      <button onClick={onUndo}>Undo</button>
      <button onClick={onRedo}>Redo</button>
      <button onClick={onReset}>Reset Joints</button>
      <button onClick={onFocus}>Focus</button>
    </div>
  );
};

export default ActionButtons;