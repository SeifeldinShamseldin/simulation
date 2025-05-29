// components/controls/RecordMap/RecordMap.jsx
import React from 'react';

/**
 * Component for trajectory path visualization (3D graph removed)
 */
const RecordMap = ({ trajectoryName }) => {
  return (
    <div className="urdf-controls-section">
      <h3>End Effector Path Visualization</h3>
      <div className="record-map">
        <div className="record-map-empty">
          {trajectoryName ? 
            `Trajectory "${trajectoryName}" selected` : 
            "Select a trajectory to work with it"
          }
        </div>
      </div>
    </div>
  );
};

export default RecordMap;