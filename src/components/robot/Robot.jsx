import React, { useState } from 'react';
import RobotManager from './RobotManager';
import LoadedRobots from './LoadedRobots';
import ControlJoints from './ControlJoints';
import IKController from './IKController';
import TCPManager from './TCPManager';
import Reposition from './Reposition';
import TrajectoryViewer from './TrajectoryViewer';
import AddRobot from './AddRobot';

const Robot = ({ isPanel = false, onClose }) => {
  const [showRobotSelection, setShowRobotSelection] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [workspaceRobots, setWorkspaceRobots] = useState([]);
  const [activeRobotId, setActiveRobotId] = useState(null);

  const handleAddRobotSuccess = (newRobot) => {
    setWorkspaceRobots(prev => [...prev, newRobot]);
    setShowAddModal(false);
  };

  return (
    <div className="controls" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {showRobotSelection && (
        <section className="controls-section-wrapper">
          <RobotManager 
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
      
      {activeRobotId && !showRobotSelection && (
        <>
          <section className="controls-section-wrapper">
            <LoadedRobots
              workspaceRobots={workspaceRobots}
              activeRobotId={activeRobotId}
              setActiveRobotId={setActiveRobotId}
              setShowRobotSelection={setShowRobotSelection}
            />
          </section>
          
          <section className="controls-section-wrapper">
            <ControlJoints />
          </section>
          
          <section className="controls-section-wrapper">
            <IKController />
          </section>
          
          <section className="controls-section-wrapper">
            <TCPManager />
          </section>
          
          <section className="controls-section-wrapper">
            <Reposition />
          </section>
          
          <section className="controls-section-wrapper">
            <TrajectoryViewer />
          </section>
        </>
      )}
      
      <AddRobot
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={handleAddRobotSuccess}
      />
    </div>
  );
};

export default Robot; 