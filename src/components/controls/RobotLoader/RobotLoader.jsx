// components/controls/RobotLoader.jsx
import React, { useState, useEffect } from 'react';
import { useRobot } from '../../../contexts/RobotContext';
import NewRobot from '../../NewRobot/NewRobot'; // Import the NewRobot component
import './RobotLoader.css'; // Import the CSS file

/**
 * Component for loading and selecting robot models
 */
const RobotLoader = () => {
  const { categories, availableRobots, loadRobot, isLoading } = useRobot();
  const [activeTab, setActiveTab] = useState('load'); // 'load' or 'add'
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedRobot, setSelectedRobot] = useState('');
  const [categoryRobots, setCategoryRobots] = useState([]);
  const [showAddRobot, setShowAddRobot] = useState(false); // New state for modal
  const [error, setError] = useState(null); // Error state
  
  // Update available robots when category changes
  useEffect(() => {
    if (selectedCategory) {
      const robots = availableRobots.filter(robot => robot.category === selectedCategory);
      setCategoryRobots(robots);
      
      // Auto-select first robot in category if none selected
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
    setError(null); // Clear any previous errors
  };
  
  const handleRobotChange = (e) => {
    setSelectedRobot(e.target.value);
    setError(null); // Clear any previous errors
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

  // Handle successful robot addition
  const handleRobotAdded = (success) => {
    setShowAddRobot(false);
    if (success) {
      setActiveTab('load'); // Switch back to load tab after successful addition
      console.log('Robot added successfully');
    }
  };
  
  // Render the load robot form
  const renderLoadForm = () => (
    <>
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}
      
      <div className="form-group">
        <label htmlFor="category-select">Manufacturer:</label>
        <select
          id="category-select"
          value={selectedCategory}
          onChange={handleCategoryChange}
          className="select-input"
        >
          <option value="" disabled>Select Manufacturer</option>
          {categories.map(category => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>
      
      <div className="form-group">
        <label htmlFor="robot-select">Robot Model:</label>
        <select
          id="robot-select"
          value={selectedRobot}
          onChange={handleRobotChange}
          className="select-input"
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
        className="load-button"
        disabled={isLoading || !selectedCategory || !selectedRobot}
      >
        {isLoading ? 'Loading...' : 'Load Robot'}
      </button>
    </>
  );

  // Render the add robot form
  const renderAddForm = () => (
    <div className="add-robot-content">
      <p className="add-robot-description">
        Add a new robot to your collection by providing its URDF file and mesh files.
      </p>
      <button 
        onClick={() => setShowAddRobot(true)}
        className="add-button"
        disabled={isLoading}
      >
        + Add New Robot
      </button>
    </div>
  );
  
  return (
    <div className="urdf-controls-section">
      <div className="robot-loader-header">
        <h3>Robot Management</h3>
        <div className="tab-buttons">
          <button
            className={`tab-button ${activeTab === 'load' ? 'active' : ''}`}
            onClick={() => setActiveTab('load')}
          >
            Load
          </button>
          <button
            className={`tab-button ${activeTab === 'add' ? 'active' : ''}`}
            onClick={() => setActiveTab('add')}
          >
            Add New
          </button>
        </div>
      </div>

      <div className="tab-content">
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