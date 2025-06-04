// src/contexts/RobotContext.jsx
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import EventBus from '../utils/EventBus';

const RobotContext = createContext(null);

export const RobotProvider = ({ children }) => {
  const [availableRobots, setAvailableRobots] = useState([]);
  const [categories, setCategories] = useState([]);
  const [currentRobot, setCurrentRobot] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const viewerRef = useRef(null);
  
  // Discover robots from server
  const discoverRobots = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Server tells us what robots exist
      const response = await fetch('/robots/list');
      const data = await response.json();
      
      if (response.ok) {
        setCategories(data);
        
        // Flatten robots for easy access
        const allRobots = [];
        data.forEach(category => {
          category.robots.forEach(robot => {
            allRobots.push({
              ...robot,
              category: category.id,
              categoryName: category.name
            });
          });
        });
        
        setAvailableRobots(allRobots);
      } else {
        throw new Error('Failed to load robots');
      }
    } catch (err) {
      console.error('Failed to discover robots:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Load robot using viewer
  const loadRobot = async (robotId, urdfPath) => {
    if (!viewerRef.current) {
      throw new Error('Viewer not initialized');
    }
    
    try {
      setIsLoading(true);
      setError(null);
      
      const robot = await viewerRef.current.loadRobot(robotId, urdfPath);
      setCurrentRobot(robot);
      
      EventBus.emit('robot:loaded', { robotId, robot });
      
      return robot;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };
  
  // Add new robot
  const addRobot = async (formData, onProgress) => {
    try {
      setIsLoading(true);
      
      const response = await fetch('/api/robots/add', {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Refresh list from server
        await discoverRobots();
        return result;
      } else {
        throw new Error(result.message);
      }
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setIsLoading(false);
    }
  };
  
  // Initialize on mount
  useEffect(() => {
    discoverRobots();
  }, []);
  
  const value = {
    // Data
    availableRobots,
    categories,
    currentRobot,
    isLoading,
    error,
    
    // Functions
    loadRobot,
    addRobot,
    refresh: discoverRobots,
    
    // Refs
    viewerRef,
    setViewer: (ref) => { viewerRef.current = ref; }
  };
  
  return (
    <RobotContext.Provider value={value}>
      {children}
    </RobotContext.Provider>
  );
};

export const useRobot = () => {
  const context = useContext(RobotContext);
  if (!context) {
    throw new Error('useRobot must be used within RobotProvider');
  }
  return context;
};

export default RobotContext;