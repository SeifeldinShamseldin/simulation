import React, { useState, useEffect } from 'react';
import { useRobot } from '../../../contexts/RobotContext';
import NewRobot from '../../NewRobot/NewRobot';

/**
 * Component for loading and selecting robot models
 */
const RobotLoader = () => {
  const { categories, availableRobots, loadRobot, isLoading } = useRobot();
  const [activeTab, setActiveTab] = useState('load');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedRobot, setSelectedRobot] = useState('');
  const [categoryRobots, setCategoryRobots] = useState([]);
  const [showAddRobot, setShowAddRobot] = useState(false);
  const [error, setError] = useState(null);
  
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
  
  const handleCategoryChange = (e) => {
    setSelectedCategory(e.target.value);
    setError(null);
  };
  
  const handleRobotChange = (e) => {
    setSelectedRobot(e.target.value);
    setError(null);
  };
  
  const handleLoadRobot = async () => {
    if (!selectedCategory || !selectedRobot) return;
    
    try {
      setError(null);
      await loadRobot(selectedRobot, selectedCategory);
    } catch (error) {
      console.error("Failed to load robot:", error);
      setError(error.message || "Failed to load robot");
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
      {error && (
        <div className="controls-alert controls-alert-danger controls-mb-3">
          {error}
        </div>
      )}
      
      <div className="controls-form-group">
        <label className="controls-form-label" htmlFor="category-select">Manufacturer:</label>
        <select
          id="category-select"
          value={selectedCategory}
          onChange={handleCategoryChange}
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
          onChange={handleRobotChange}
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