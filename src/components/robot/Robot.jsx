import React, { useState } from 'react';
import { useActiveRobot } from '../../contexts/ActiveRobotContext';
import RobotManager from './RobotManager/RobotManager';
import LoadedRobots from './LoadedRobots/LoadedRobots';
import AddRobot from './AddRobot/AddRobot';
import ControlJoints from '../controls/ControlJoints/ControlJoints';
import IKController from '../controls/IKController/IKController';
import TCPManager from '../controls/TCPDisplay/TCPManager';
import Reposition from '../controls/Reposition/Reposition';
import TrajectoryViewer from '../controls/RecordMap/TrajectoryViewer';

const Robot = ({ viewerRef, isPanel = false, onClose }) => {
  const { activeRobotId, setActiveRobotId } = useActiveRobot();
  const [workspaceRobots, setWorkspaceRobots] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRobotSelection, setShowRobotSelection] = useState(true);
  
  return (
    <div className="controls" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
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
      
      <AddRobot
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={async (robot) => {
          const newRobot = {
            id: `${robot.id}_${Date.now()}`,
            robotId: robot.id,
            name: robot.name,
            manufacturer: robot.manufacturer,
            urdfPath: robot.urdfPath,
            icon: '🤖'
          };
          
          // Add to workspace
          setWorkspaceRobots(prev => [...prev, newRobot]);
          setShowAddModal(false);
          
          // Load the robot using viewerRef directly
          if (viewerRef?.current) {
            try {
              await viewerRef.current.loadRobot(newRobot.id, robot.urdfPath, {
                position: { x: 0, y: 0, z: 0 },
                makeActive: true,
                clearOthers: false
              });
              
              // Set as active but stay on My Robots page
              setActiveRobotId(newRobot.id);
              // Keep showing robot selection
              // setShowRobotSelection(false); // Keep this commented out
              
            } catch (error) {
              console.error('Error auto-loading robot:', error);
            }
          }
        }}
      />
    </div>
  );
};

export default Robot; 