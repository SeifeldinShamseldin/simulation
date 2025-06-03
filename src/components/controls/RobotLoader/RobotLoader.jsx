// src/components/controls/RobotLoader/RobotLoader.jsx
import React, { useState, useEffect } from 'react';
import { useRobot } from '../../../contexts/RobotContext';
import EventBus from '../../../utils/EventBus';
import NewRobot from '../../NewRobot/NewRobot';

const RobotLoader = ({ viewerRef }) => {
  const { categories, availableRobots, isLoading, error } = useRobot();
  const [activeTab, setActiveTab] = useState('load');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedRobot, setSelectedRobot] = useState('');
  const [categoryRobots, setCategoryRobots] = useState([]);
  const [showAddRobot, setShowAddRobot] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [currentRobotName, setCurrentRobotName] = useState('');

  // Update available robots when category changes
  useEffect(() => {
    if (selectedCategory) {
      const robots = availableRobots.filter(robot => robot.category === selectedCategory);
      setCategoryRobots(robots);
      
      if (robots.length > 0 && (!selectedRobot || !robots.find(r => r.id === selectedRobot))) {
        setSelectedRobot(robots[0].id);
      }
    } else {
      setCategoryRobots([]);
      setSelectedRobot('');
    }
  }, [selectedCategory, availableRobots, selectedRobot]);

  // Auto-select first category when data loads
  useEffect(() => {
    if (categories.length > 0 && !selectedCategory) {
      setSelectedCategory(categories[0].id);
    }
  }, [categories, selectedCategory]);

  // Listen for robot loaded events
  useEffect(() => {
    const unsubscribe = EventBus.on('robot:loaded', (data) => {
      setCurrentRobotName(data.robotName);
    });

    return unsubscribe;
  }, []);

  const handleLoadRobot = async () => {
    if (!selectedCategory || !selectedRobot || !viewerRef?.current) return;
    
    try {
      setLoadError(null);
      
      // Use the robot context to load
      const robot = availableRobots.find(r => r.id === selectedRobot);
      if (!robot) throw new Error('Robot not found');

      await viewerRef.current.loadRobot(selectedRobot, robot.urdfPath);
      
      // Emit robot loaded event
      EventBus.emit('robot:loaded', {
        robotName: selectedRobot,
        category: selectedCategory
      });
      
    } catch (error) {
      console.error("Failed to load robot:", error);
      setLoadError(error.message || "Failed to load robot");
    }
  };

  const handleRobotAdded = (success) => {
    setShowAddRobot(false);
    if (success) {
      setActiveTab('load');
      console.log('Robot added successfully');
    }
  };
  
  const renderLoadForm = () => (
    <>
      {(loadError || error) && (
        <div className="controls-alert controls-alert-danger controls-mb-3">
          {loadError || error}
        </div>
      )}
      
      <div className="controls-form-group">
        <label className="controls-form-label" htmlFor="category-select">Manufacturer:</label>
        <select
          id="category-select"
          value={selectedCategory}
          onChange={(e) => {
            setSelectedCategory(e.target.value);
            setLoadError(null);
          }}
          className="controls-form-select"
        >
          <option value="" disabled>Select Manufacturer</option>
          {categories.map(category => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>
      
      <div className="controls-form-group">
        <label className="controls-form-label" htmlFor="robot-select">Robot Model:</label>
        <select
          id="robot-select"
          value={selectedRobot}
          onChange={(e) => {
            setSelectedRobot(e.target.value);
            setLoadError(null);
          }}
          className="controls-form-select"
          disabled={!selectedCategory || categoryRobots.length === 0}
        >
          <option value="" disabled>Select Robot Model</option>
          {categoryRobots.map(robot => (
            <option key={robot.id} value={robot.id}>
              {robot.name}
            </option>
          ))}
        </select>
      </div>
      
      <button 
        onClick={handleLoadRobot} 
        className="controls-btn controls-btn-primary controls-btn-block"
        disabled={isLoading || !selectedCategory || !selectedRobot}
      >
        {isLoading ? 'Loading...' : 'Load Robot'}
      </button>
      
      {currentRobotName && (
        <div className="controls-info-block controls-mt-3">
          <small className="controls-text-muted">
            Current Robot: <strong>{currentRobotName}</strong>
          </small>
        </div>
      )}
    </>
  );

  const renderAddForm = () => (
    <div className="controls-text-center controls-p-4">
      <p className="controls-text-muted controls-mb-3">
        Add a new robot to your collection by providing its URDF file and mesh files.
      </p>
      <button 
        onClick={() => setShowAddRobot(true)}
        className="controls-btn controls-btn-success"
        disabled={isLoading}
      >
        + Add New Robot
      </button>
    </div>
  );
  
  return (
    <div className="controls-section">
      <div className="controls-section-header">
        <h3 className="controls-section-title">Robot Management</h3>
        <div className="controls-btn-group">
          <button
            className={`controls-btn controls-btn-sm ${activeTab === 'load' ? 'controls-btn-primary' : 'controls-btn-light'}`}
            onClick={() => setActiveTab('load')}
          >
            Load
          </button>
          <button
            className={`controls-btn controls-btn-sm ${activeTab === 'add' ? 'controls-btn-primary' : 'controls-btn-light'}`}
            onClick={() => setActiveTab('add')}
          >
            Add New
          </button>
        </div>
      </div>

      <div className="controls-card-body">
        {activeTab === 'load' ? renderLoadForm() : renderAddForm()}
      </div>

      <NewRobot 
        isOpen={showAddRobot}
        onClose={handleRobotAdded}
      />
    </div>
  );
};

export default RobotLoader;