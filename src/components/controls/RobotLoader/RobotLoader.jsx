// components/controls/RobotLoader.jsx
import React, { useState, useEffect } from 'react';
import { useRobot } from '../../../contexts/RobotContext';

/**
 * Component for loading and selecting robot models
 */
const RobotLoader = () => {
  const { categories, availableRobots, loadRobot, isLoading } = useRobot();
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedRobot, setSelectedRobot] = useState('');
  const [categoryRobots, setCategoryRobots] = useState([]);
  
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
  };
  
  const handleRobotChange = (e) => {
    setSelectedRobot(e.target.value);
  };
  
  const handleLoadRobot = async () => {
    if (!selectedCategory || !selectedRobot) return;
    
    try {
      await loadRobot(selectedRobot, selectedCategory);
    } catch (error) {
      console.error("Failed to load robot:", error);
    }
  };
  
  return (
    <div className="urdf-controls-section">
      <h3>Load Robot</h3>
      
      <div style={{ marginBottom: '0.5rem' }}>
        <label htmlFor="category-select">Manufacturer:</label>
        <select
          id="category-select"
          value={selectedCategory}
          onChange={handleCategoryChange}
          style={{ width: '100%', padding: '8px', marginTop: '0.25rem' }}
        >
          <option value="" disabled>Select Manufacturer</option>
          {categories.map(category => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>
      
      <div style={{ marginBottom: '0.5rem' }}>
        <label htmlFor="robot-select">Robot Model:</label>
        <select
          id="robot-select"
          value={selectedRobot}
          onChange={handleRobotChange}
          style={{ width: '100%', padding: '8px', marginTop: '0.25rem' }}
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
        style={{ width: '100%' }}
        disabled={isLoading || !selectedCategory || !selectedRobot}
      >
        {isLoading ? 'Loading...' : 'Load Robot'}
      </button>
    </div>
  );
};

export default RobotLoader;