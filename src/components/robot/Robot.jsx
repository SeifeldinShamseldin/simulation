import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import EventBus from '../../utils/EventBus';
import RobotManager from './RobotManager/RobotManager';
import LoadedRobots from './LoadedRobots/LoadedRobots';
import AddRobot from './AddRobot/AddRobot';
import ControlJoints from '../controls/ControlJoints/ControlJoints';
import IKController from '../controls/IKController/IKController';
import TCPManager from '../controls/TCPDisplay/TCPManager';
import Reposition from '../controls/Reposition/Reposition';
import TrajectoryViewer from '../controls/RecordMap/TrajectoryViewer';

const Robot = ({ viewerRef, isPanel = false, onClose }) => {
  // Helper function for calculating robot positions
  const calculateRobotPositions = (count) => {
    const positions = [];
    const spacing = 2.5; // Space between robots
    
    for (let i = 0; i < count; i++) {
      positions.push({
        x: (i - (count - 1) / 2) * spacing,
        y: 0,
        z: 0
      });
    }
    
    return positions;
  };

  // State for user's workspace robots (starts empty)
  const [workspaceRobots, setWorkspaceRobots] = useState([]);
  const [loadedRobots, setLoadedRobots] = useState([]); // Track all loaded robots
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeRobotId, setActiveRobotId] = useState(null);
  const [showRobotSelection, setShowRobotSelection] = useState(true);
  
  // Add effect to listen for robot loaded events
  useEffect(() => {
    const handleRobotLoaded = (data) => {
      setLoadedRobots(prev => {
        const exists = prev.find(r => r.id === data.robotId);
        if (!exists) {
          return [...prev, { id: data.robotId, name: data.name }];
        }
        return prev;
      });
    };
    
    const unsubscribe = EventBus.on('robot:loaded', handleRobotLoaded);
    return () => unsubscribe();
  }, []);

  // Auto-load workspace robots when component mounts
  useEffect(() => {
    const loadExistingRobots = async () => {
      if (!viewerRef?.current || workspaceRobots.length === 0) return;
      
      const positions = calculateRobotPositions(workspaceRobots.length);
      
      for (let i = 0; i < workspaceRobots.length; i++) {
        const robot = workspaceRobots[i];
        try {
          await loadRobot(robot.id, robot.urdfPath, {
            position: positions[i],
            makeActive: i === workspaceRobots.length - 1, // Make last one active
            clearOthers: false
          });
        } catch (error) {
          console.error(`Failed to load robot ${robot.name}:`, error);
        }
      }
    };
    
    // Small delay to ensure viewer is ready
    setTimeout(loadExistingRobots, 500);
  }, [viewerRef]); // Only run once when viewerRef is available

  return (
    <div className="controls" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Always show robot selection if no active robot */}
      {!activeRobotId && (
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
      
      {/* Show controls when robot is active */}
      {activeRobotId && (
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