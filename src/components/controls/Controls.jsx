// src/components/controls/Controls.jsx - Updated to remove unwanted sections
import React from 'react';
import ControlJoints from './ControlJoints/ControlJoints';
import TCPController from './tcp/TCPController';
import IKController from './IKController/IKController';
import TrajectoryViewer from './RecordMap/TrajectoryViewer';
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
      
      {/* IK Control */}
      <IKController />
      
      {/* Trajectory Control */}
      <TrajectoryViewer viewerRef={viewerRef} />
    </div>
  );
};

export default Controls;