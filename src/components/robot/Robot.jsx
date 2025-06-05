import React, { useState } from 'react';
import RobotManager from './RobotManager/RobotManager';
import LoadedRobots from './LoadedRobots/LoadedRobots';
import AddRobot from './AddRobot/AddRobot';
import ControlJoints from '../controls/ControlJoints/ControlJoints';
import IKController from '../controls/IKController/IKController';
import TCPManager from '../controls/TCPDisplay/TCPManager';
import Reposition from '../controls/Reposition/Reposition';
import TrajectoryViewer from '../controls/RecordMap/TrajectoryViewer';
import { useRobot } from '../../contexts/RobotContext';
import EventBus from '../../utils/EventBus';

const Robot = ({ viewerRef, isPanel = false, onClose }) => {
  // State for user's workspace robots (starts empty)
  const [workspaceRobots, setWorkspaceRobots] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeRobotId, setActiveRobotId] = useState(null);
  const [showRobotSelection, setShowRobotSelection] = useState(true);
  
  const { loadRobot } = useRobot();
  
  // Function to load robot into viewer
  const loadRobotIntoViewer = async (robot) => {
    console.log('Loading robot into viewer:', robot);
    if (!viewerRef?.current) {
      console.error('ViewerRef not available');
      return;
    }
    
    try {
      console.log('Calling loadRobot with:', robot.id, robot.urdfPath);
      await loadRobot(robot.id, robot.urdfPath);
      
      console.log('Robot loaded successfully, updating UI state');
      setActiveRobotId(robot.id);
      setShowRobotSelection(false);
      
      EventBus.emit('robot:loaded', {
        robotId: robot.id,
        name: robot.name
      });
      
    } catch (error) {
      console.error('Error loading robot:', error);
      alert(`Failed to load robot: ${error.message}\n\nPlease check the console for more details.`);
      // Reset state if loading fails
      setShowRobotSelection(true);
    }
  };
  
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
            onLoadRobot={loadRobotIntoViewer}
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
        onSuccess={async (robot) => {
          console.log('AddRobot onSuccess called with:', robot);
          
          // Add robot to workspace
          const newRobot = {
            id: `${robot.id}_${Date.now()}`,
            robotId: robot.id,
            name: robot.name,
            manufacturer: robot.manufacturer,
            urdfPath: robot.urdfPath,
            icon: '🤖'
          };
          
          console.log('Created newRobot object:', newRobot);
          setWorkspaceRobots(prev => [...prev, newRobot]);
          setShowAddModal(false);
          
          // AUTOMATICALLY LOAD THE ROBOT INTO THE VIEWER
          // Add small delay to ensure viewer is ready
          setTimeout(() => {
            loadRobotIntoViewer(newRobot);
          }, 100);
        }}
      />
    </div>
  );
};

export default Robot; 