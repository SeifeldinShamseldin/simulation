// src/components/robot/Robot.jsx - PURE UI ORCHESTRATOR
import React, { useState } from 'react';
import RobotManager from './RobotManager/RobotManager';
import AddRobot from './AddRobot/AddRobot';

const Robot = ({ isPanel = false, onClose, onRobotSelected }) => {
  // ========== UI-ONLY STATE ==========
  const [showAddModal, setShowAddModal] = useState(false);

  // ========== UI EVENT HANDLERS ==========
  const handleAddModalClose = () => {
    setShowAddModal(false);
  };

  const handleAddModalSuccess = () => {
    setShowAddModal(false);
  };

  // ========== PURE UI RENDER ==========
  return (
    <div className="controls" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <section className="controls-section-wrapper">
          <RobotManager 
            isPanel={isPanel}
            onClose={onClose}
            setShowAddModal={setShowAddModal}
            onRobotSelected={onRobotSelected}
          />
        </section>
      </div>
      
      <AddRobot
        isOpen={showAddModal}
        onClose={handleAddModalClose}
        onSuccess={handleAddModalSuccess}
      />
    </div>
  );
};

export default Robot;