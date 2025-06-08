// src/components/controls/Controls.jsx - Complete robot control interface
import React from 'react';
import { useRobot } from '../../contexts/RobotContext';
import { useViewer } from '../../contexts/ViewerContext';
import ControlJoints from './ControlJoints/ControlJoints';
import IKController from './IKController/IKController';
import TCPController from './tcp/TCPController';
import Reposition from './Reposition/Reposition';
import TrajectoryViewer from './RecordMap/TrajectoryViewer';
import LoadedRobots from '../robot/LoadedRobots/LoadedRobots';

const Controls = ({ onClose }) => {
  const { activeRobotId, getLoadedRobots } = useRobot();
  const { viewerInstance } = useViewer();
  
  const loadedRobots = getLoadedRobots();
  const workspaceRobots = loadedRobots.map(robotData => ({
    id: robotData.id,
    name: robotData.id,
    manufacturer: 'Robot',
    icon: '🤖'
  }));

  if (!activeRobotId) {
    return (
      <div className="controls-container">
        <div className="controls-section">
          <h3 className="controls-section-title">Robot Controls</h3>
          <p className="controls-text-muted">No robot loaded. Please load a robot first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="controls-container">
      {/* Active Robot Display */}
      <section className="controls-section-wrapper">
        <LoadedRobots
          viewerRef={{ current: viewerInstance }}
          workspaceRobots={workspaceRobots}
          activeRobotId={activeRobotId}
          setActiveRobotId={() => {}} // Handled by RobotContext
          setShowRobotSelection={() => {}} // Not needed in controls
        />
      </section>
      
      {/* Joint Control */}
      <section className="controls-section-wrapper">
        <ControlJoints />
      </section>
      
      {/* TCP Tool Control */}
      <section className="controls-section-wrapper">
        <TCPController viewerRef={{ current: viewerInstance }} />
      </section>
      
      {/* Inverse Kinematics */}
      <section className="controls-section-wrapper">
        <IKController />
      </section>
      
      {/* Robot Position */}
      <section className="controls-section-wrapper">
        <Reposition viewerRef={{ current: viewerInstance }} />
      </section>
      
      {/* Trajectory Recording & Playback */}
      <section className="controls-section-wrapper">
        <TrajectoryViewer viewerRef={{ current: viewerInstance }} />
      </section>
    </div>
  );
};