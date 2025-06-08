import React, { useState, useEffect } from 'react';
import RobotManager from './RobotManager/RobotManager';
import LoadedRobots from './LoadedRobots/LoadedRobots';
import ControlJoints from '../controls/ControlJoints/ControlJoints';
import IKController from '../controls/IKController/IKController';
import Reposition from '../controls/Reposition/Reposition';
import TrajectoryViewer from '../controls/RecordMap/TrajectoryViewer';
import AddRobot from './AddRobot/AddRobot';
import { useViewer } from '../../contexts/ViewerContext';
import TCPController from '../controls/tcp/TCPController';

const Robot = ({ isPanel = false, onClose }) => {
  const { viewerInstance } = useViewer();
  const [showRobotSelection, setShowRobotSelection] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [workspaceRobots, setWorkspaceRobots] = useState([]);
  const [activeRobotId, setActiveRobotId] = useState(null);

  // Load saved robots from localStorage on mount
  useEffect(() => {
    try {
      const savedRobots = localStorage.getItem('workspaceRobots');
      if (savedRobots) {
        setWorkspaceRobots(JSON.parse(savedRobots));
      }
    } catch (error) {
      console.error('Error loading saved robots:', error);
    }
  }, []);

  // Save robots to localStorage whenever workspaceRobots changes
  useEffect(() => {
    try {
      localStorage.setItem('workspaceRobots', JSON.stringify(workspaceRobots));
    } catch (error) {
      console.error('Error saving robots:', error);
    }
  }, [workspaceRobots]);

  const handleAddRobotSuccess = (newRobot) => {
    setWorkspaceRobots(prev => [...prev, newRobot]);
    setShowAddModal(false);
  };

  return (
    <div className="controls" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {showRobotSelection && (
        <section className="controls-section-wrapper">
          <RobotManager 
            viewerRef={{ current: viewerInstance }}
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
              viewerRef={{ current: viewerInstance }}
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
            <Reposition viewerRef={{ current: viewerInstance }} />
          </section>
          
          <section className="controls-section-wrapper">
            <TCPController viewerRef={{ current: viewerInstance }} />
          </section>
          
          <section className="controls-section-wrapper">
            <TrajectoryViewer viewerRef={{ current: viewerInstance }} />
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