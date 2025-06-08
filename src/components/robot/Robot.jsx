// src/components/robot/Robot.jsx - Robot management only
import React, { useState, useEffect } from 'react';
import RobotManager from './RobotManager/RobotManager';
import AddRobot from './AddRobot/AddRobot';
import { useViewer } from '../../contexts/ViewerContext';

const Robot = ({ isPanel = false, onClose, onRobotSelected }) => {
  const { viewerInstance } = useViewer();
  const [showAddModal, setShowAddModal] = useState(false);
  const [workspaceRobots, setWorkspaceRobots] = useState([]);

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

  const handleRobotLoad = (robotId) => {
    // When a robot is loaded and user wants to control it
    if (onRobotSelected) {
      onRobotSelected(robotId);
    }
  };

  return (
    <div className="controls" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <section className="controls-section-wrapper">
          <RobotManager 
            viewerRef={{ current: viewerInstance }}
            isPanel={isPanel}
            onClose={onClose}
            workspaceRobots={workspaceRobots}
            setWorkspaceRobots={setWorkspaceRobots}
            setShowAddModal={setShowAddModal}
            onRobotSelected={handleRobotLoad}
          />
        </section>
      </div>
      
      <AddRobot
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={handleAddRobotSuccess}
      />
    </div>
  );
};

export default Robot;