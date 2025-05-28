// components/controls/ViewerOptions.jsx
import React from 'react';
import { useRobot } from '../../contexts/RobotContext';

/**
 * Component for controlling viewer display options
 */
const ViewerOptions = ({ onOptionChange }) => {
  const { viewOptions } = useRobot();
  
  return (
    <div className="urdf-controls-section">
      <h3>Options</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <label>
          <input
            type="checkbox"
            checked={viewOptions.ignoreLimits}
            onChange={(e) => onOptionChange('ignoreLimits', e.target.checked)}
          />
          Ignore Joint Limits
        </label>
        
        <label>
          <input
            type="checkbox"
            checked={viewOptions.showCollisions}
            onChange={(e) => onOptionChange('showCollisions', e.target.checked)}
          />
          Show Collision Geometry
        </label>
        
        <label>
          <input
            type="checkbox"
            checked={viewOptions.enableDragging}
            onChange={(e) => onOptionChange('enableDragging', e.target.checked)}
          />
          Enable Dragging
        </label>
        
        <div>
          <label htmlFor="up-axis">Up Axis:</label>
          <select
            id="up-axis"
            value={viewOptions.upAxis}
            onChange={(e) => onOptionChange('upAxis', e.target.value)}
            style={{ marginLeft: '0.5rem' }}
          >
            <option value="+X">+X</option>
            <option value="-X">-X</option>
            <option value="+Y">+Y</option>
            <option value="-Y">-Y</option>
            <option value="+Z">+Z</option>
            <option value="-Z">-Z</option>
          </select>
        </div>
      </div>
    </div>
  );
};

export default ViewerOptions;