// src/contexts/RobotContext.jsx
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import RobotAPI from './services/RobotAPI';

// Create context
const RobotContext = createContext(null);

export const RobotProvider = ({ children }) => {
  const [availableRobots, setAvailableRobots] = useState([]);
  const [categories, setCategories] = useState([]);
  const [currentRobot, setCurrentRobot] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const viewerRef = useRef(null);
  
  // Initialize - load available robots
  useEffect(() => {
    const loadRobots = async () => {
      try {
        setIsLoading(true);
        const { robots, categories } = await RobotAPI.discoverRobots();
        setAvailableRobots(robots);
        setCategories(categories);
        setIsLoading(false);
      } catch (err) {
        console.error("Failed to load robots:", err);
        setError("Failed to discover robots");
        setIsLoading(false);
      }
    };
    
    loadRobots();
  }, []);
  
  // Load a robot model
  const loadRobot = async (robotId, category) => {
    try {
      setIsLoading(true);
      setError(null);
      
      if (!viewerRef.current) {
        throw new Error("Viewer not initialized");
      }
      
      const robot = await RobotAPI.loadRobot(robotId, category, viewerRef.current);
      setCurrentRobot(robot);
      setIsLoading(false);
      return robot;
    } catch (err) {
      console.error(`Failed to load robot ${robotId}:`, err);
      setError(`Failed to load robot: ${err.message}`);
      setIsLoading(false);
      throw err;
    }
  };
  
  // Set viewer reference
  const setViewer = (ref) => {
    viewerRef.current = ref;
  };
  
  // Add new methods to the context value:
  const addRobot = async (robotData, onProgress) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const result = await RobotAPI.addRobot(robotData);
      if (result.success) {
        // Refresh available robots
        const { robots, categories } = await RobotAPI.discoverRobots();
        setAvailableRobots(robots);
        setCategories(categories);
        setIsLoading(false);
        return result;
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      setError(`Failed to add robot: ${err.message}`);
      setIsLoading(false);
      throw err;
    }
  };

  const removeRobot = async (robotId, category) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const result = await RobotAPI.removeRobot(robotId, category);
      if (result.success) {
        // Refresh available robots
        const { robots, categories } = await RobotAPI.discoverRobots();
        setAvailableRobots(robots);
        setCategories(categories);
        setIsLoading(false);
        return result;
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      setError(`Failed to remove robot: ${err.message}`);
      setIsLoading(false);
      throw err;
    }
  };
  
  // Value provided by context
  const value = {
    availableRobots,
    categories,
    currentRobot,
    isLoading,
    error,
    viewerRef,
    setViewer,
    loadRobot,
    addRobot,
    removeRobot
  };
  
  return (
    <RobotContext.Provider value={value}>
      {children}
    </RobotContext.Provider>
  );
};

// Custom hook for using robot context
export const useRobot = () => {
  const context = useContext(RobotContext);
  if (!context) {
    throw new Error("useRobot must be used within a RobotProvider");
  }
  return context;
};

export default RobotContext;