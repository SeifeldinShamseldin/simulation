import React, { useState } from 'react';
import RobotManager from './RobotManager/RobotManager';
import LoadedRobots from './LoadedRobots/LoadedRobots';
import AddRobot from './AddRobot/AddRobot';
import ControlJoints from '../controls/ControlJoints/ControlJoints';
import IKController from '../controls/IKController/IKController';
import TCPManager from '../controls/TCPDisplay/TCPManager';
import Reposition from '../controls/Reposition/Reposition';
import TrajectoryViewer from '../controls/RecordMap/TrajectoryViewer';

const Robot = ({ viewerRef, isPanel = false, onClose }) => {
  // State for user's workspace robots (starts empty)
  const [workspaceRobots, setWorkspaceRobots] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeRobotId, setActiveRobotId] = useState(null);
  const [showRobotSelection, setShowRobotSelection] = useState(true);
  
  return (
    <div className="controls" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Robot Selection Grid - Always visible unless a robot is active */}
      {showRobotSelection && (
        <section className="controls-section-wrapper">
          <RobotManager 
            viewerRef={viewerRef}
            isPanel={isPanel}
            onClose={onClose}
            workspaceRobots={workspaceRobots}
            setWorkspaceRobots={setWorkspaceRobots}
            setShowAddModal={setShowAddModal}
            activeRobotId={activeRobotId}
            setActiveRobotId={setActiveRobotId}
            setShowRobotSelection={setShowRobotSelection}
          />
        </section>
      )}
      
      {/* Robot Controls - Only show when robot is active */}
      {activeRobotId && !showRobotSelection && (
        <>
          <section className="controls-section-wrapper">
            <LoadedRobots
              viewerRef={viewerRef}
              workspaceRobots={workspaceRobots}
              activeRobotId={activeRobotId}
              setActiveRobotId={setActiveRobotId}
              setShowRobotSelection={setShowRobotSelection}
            />
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
        </>
      )}
      
      {/* Add Robot Modal */}
      <AddRobot
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={(robot) => {
          // Add robot to workspace
          const newRobot = {
            id: `${robot.id}_${Date.now()}`,
            robotId: robot.id,
            name: robot.name,
            manufacturer: robot.manufacturer,
            urdfPath: robot.urdfPath,
            icon: '🤖'
          };
          setWorkspaceRobots(prev => [...prev, newRobot]);
          setShowAddModal(false);
        }}
      />
    </div>
  );
};

export default Robot; 