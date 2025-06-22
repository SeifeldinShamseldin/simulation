// src/components/controls/Controls.jsx - Updated to remove unwanted sections
import React from 'react';
import ControlJoints from './ControlJoints/ControlJoints';
import TCPController from './tcp/TCPController';
import Reposition from './Reposition/Reposition';
import { useRobotSelection } from '../../contexts/hooks/useRobotManager';

const Controls = ({ viewerRef }) => {
  const { activeId: activeRobotId } = useRobotSelection();

  if (!activeRobotId) {
    return (
      <div className="controls-placeholder">
        <p>Please select a robot to view controls</p>
      </div>
    );
  }

  return (
    <div className="controls">
      {/* Joint Control */}
      <ControlJoints viewerRef={viewerRef} />
      
      {/* TCP Control */}
      <TCPController viewerRef={viewerRef} />
      
      {/* Reposition Control */}
      <Reposition viewerRef={viewerRef} />
      
    </div>
  );
};

export default Controls;