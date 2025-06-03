// src/components/controls/Controls.jsx
import React from 'react';
import RobotLoader from './RobotLoader/RobotLoader';
import ControlJoints from './ControlJoints/ControlJoints';
import IKController from './IKController/IKController';
import TCPManager from './TCPDisplay/TCPManager';
import Reposition from './Reposition/Reposition';
import TrajectoryViewer from './RecordMap/TrajectoryViewer';
import { useRobot } from '../../contexts/RobotContext';

/**
 * Controls container component
 * Displays all control sections in order
 */
const Controls = ({ viewerRef }) => {
  const { viewOptions, updateViewOptions } = useRobot();

  return (
    <div className="controls">
      {/* Robot Loading Section */}
      <section className="controls-section-wrapper">
        <RobotLoader viewerRef={viewerRef} />
      </section>

      {/* Joint Controls Section */}
      <section className="controls-section-wrapper">
        <ControlJoints viewerRef={viewerRef} />
      </section>

      {/* Inverse Kinematics Section */}
      <section className="controls-section-wrapper">
        <IKController viewerRef={viewerRef} />
      </section>

      {/* TCP Management Section */}
      <section className="controls-section-wrapper">
        <TCPManager viewerRef={viewerRef} />
      </section>

      {/* Robot Positioning Section */}
      <section className="controls-section-wrapper">
        <Reposition viewerRef={viewerRef} />
      </section>

      {/* Trajectory Recording Section */}
      <section className="controls-section-wrapper">
        <TrajectoryViewer viewerRef={viewerRef} />
      </section>



    </div>
  );
};

export default Controls;