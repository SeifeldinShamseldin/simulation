// src/components/controls/Controls.jsx - NO ControlsTheme.css import
import React from 'react';
import RobotPanel from './RobotPanel/RobotPanel';
import ControlJoints from './ControlJoints/ControlJoints';
import IKController from './IKController/IKController';
import TCPManager from './TCPDisplay/TCPManager';
import Reposition from './Reposition/Reposition';
import TrajectoryViewer from './RecordMap/TrajectoryViewer';
// NO import for ControlsTheme.css here!

const Controls = ({ viewerRef }) => {
  return (
    <div className="controls">
      <section className="controls-section-wrapper">
        <RobotPanel viewerRef={viewerRef} />
      </section>
      <section className="controls-section-wrapper">
        <ControlJoints viewerRef={viewerRef} />
      </section>
      <section className="controls-section-wrapper">
        <IKController viewerRef={viewerRef} />
      </section>
      <section className="controls-section-wrapper">
        <TCPManager viewerRef={viewerRef} />
      </section>
      <section className="controls-section-wrapper">
        <Reposition viewerRef={viewerRef} />
      </section>
      <section className="controls-section-wrapper">
        <TrajectoryViewer viewerRef={viewerRef} />
      </section>
    </div>
  );
};

export default Controls;