// src/components/robot/Robot.jsx - Pure presentation component
import React, { useState } from 'react';
import RobotManager from './RobotManager/RobotManager';
import AddRobot from './AddRobot/AddRobot';

const Robot = ({ isPanel = false, onClose, onRobotSelected }) => {
  const [showAddModal, setShowAddModal] = useState(false);

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
        onClose={() => setShowAddModal(false)}
        onSuccess={() => setShowAddModal(false)}
      />
    </div>
  );
};

export default Robot;