// src/contexts/RobotContext.jsx
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import robotService from '../core/services/RobotService';
import EventBus from '../utils/EventBus';
import { GLOBAL_CONFIG } from '../utils/GlobalVariables';

// Create context
const RobotContext = createContext(null);

export const RobotProvider = ({ children }) => {
  const [availableRobots, setAvailableRobots] = useState([]);
  const [categories, setCategories] = useState([]);
  const [currentRobot, setCurrentRobot] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const viewerRef = useRef(null);
  
  const [viewOptions, setViewOptions] = useState({
    ignoreLimits: false,
    showCollisions: false,
    enableDragging: true,
    upAxis: GLOBAL_CONFIG.upAxis || '+Z',
    highlightColor: GLOBAL_CONFIG.highlightColor || '#ff0000',
    showGrid: true,
    showAxes: true,
    enableShadows: GLOBAL_CONFIG.enableShadows !== undefined ? GLOBAL_CONFIG.enableShadows : true,
    backgroundColor: GLOBAL_CONFIG.backgroundColor || '#f5f5f5',
    ambientColor: GLOBAL_CONFIG.ambientColor || '#8ea0a8'
  });

  // Emit events when view options change
  useEffect(() => {
    EventBus.emit('view-options:changed', viewOptions);
  }, [viewOptions]);

  // Listen for external view option changes
  useEffect(() => {
    const unsubscribe = EventBus.on('view-options:update', (updates) => {
      setViewOptions(prev => ({ ...prev, ...updates }));
    });

    return unsubscribe;
  }, []);

  // Update view options function
  const updateViewOptions = (updates) => {
    setViewOptions(prev => ({ ...prev, ...updates }));
  };
  
  // Initialize - load available robots using unified service
  useEffect(() => {
    const loadRobots = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Use unified robot service for discovery
        const { robots, categories } = await robotService.discoverRobots();
        
        setAvailableRobots(robots);
        setCategories(categories);
        
        console.log(`RobotContext: Loaded ${robots.length} robots in ${categories.length} categories`);
        
      } catch (err) {
        console.error("Failed to discover robots:", err);
        setError(`Failed to discover robots: ${err.message}`);
        
        // Try to get any cached data
        const fallbackRobots = robotService.getAvailableRobots();
        const fallbackCategories = robotService.getCategories();
        
        if (fallbackRobots.length > 0) {
          setAvailableRobots(fallbackRobots);
          setCategories(fallbackCategories);
          console.log("Using cached robot data");
        }
      } finally {
        setIsLoading(false);
      }
    };
    
    loadRobots();
  }, []);
  
  // Load a robot model using unified service
  const loadRobot = async (robotId, category) => {
    try {
      setIsLoading(true);
      setError(null);
      
      if (!viewerRef.current) {
        throw new Error("Viewer not initialized");
      }
      
      console.log(`Loading robot: ${robotId} (category: ${category})`);
      
      // Use unified robot service for loading
      const robot = await robotService.loadRobot(robotId, category, viewerRef.current);
      
      setCurrentRobot(robot);
      console.log(`Successfully loaded robot: ${robotId}`);
      
      return robot;
      
    } catch (err) {
      console.error(`Failed to load robot ${robotId}:`, err);
      setError(`Failed to load robot: ${err.message}`);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };
  
  // Set viewer reference
  const setViewer = (ref) => {
    viewerRef.current = ref;
  };
  
  // Add new robot using unified service
  const addRobot = async (robotData, onProgress) => {
    try {
      setIsLoading(true);
      setError(null);
      
      console.log('RobotContext: Starting robot upload...');
      
      // Make request to the correct endpoint
      const response = await fetch('/api/robots/add', {
        method: 'POST',
        body: robotData // FormData object
      });
      
      console.log('RobotContext: Upload response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('RobotContext: Upload failed:', errorText);
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      console.log('RobotContext: Upload result:', result);
      
      if (result.success) {
        // Refresh available robots after adding
        const { robots, categories } = await robotService.discoverRobots();
        setAvailableRobots(robots);
        setCategories(categories);
        
        console.log(`Successfully added robot: ${result.robot.id}`);
        return { success: true, robot: result.robot };
      } else {
        throw new Error(result.message || 'Failed to add robot');
      }
    } catch (err) {
      const errorMessage = `Failed to add robot: ${err.message}`;
      setError(errorMessage);
      console.error('RobotContext:', errorMessage, err);
      return { success: false, error: err.message };
    } finally {
      setIsLoading(false);
    }
  };

  // Remove robot using unified service
  const removeRobot = async (robotId, category) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const result = await robotService.removeRobot(robotId, category);
      
      if (result.success) {
        // Refresh available robots after removal
        const { robots, categories } = await robotService.discoverRobots();
        setAvailableRobots(robots);
        setCategories(categories);
        
        // Clear current robot if it was the one removed
        if (currentRobot && currentRobot.robotName === robotId) {
          setCurrentRobot(null);
        }
        
        console.log(`Successfully removed robot: ${robotId}`);
        return result;
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      const errorMessage = `Failed to remove robot: ${err.message}`;
      setError(errorMessage);
      console.error(errorMessage, err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };
  
  // Get robots by category using unified service
  const getRobotsByCategory = (categoryId) => {
    return robotService.getRobotsByCategory(categoryId);
  };
  
  // Get robot configuration using unified service
  const getRobotConfig = (robotId) => {
    return robotService.getRobotConfig(robotId);
  };
  
  // Refresh robot data using unified service
  const refresh = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const { robots, categories } = await robotService.refresh();
      setAvailableRobots(robots);
      setCategories(categories);
      
      console.log(`Refreshed robot data: ${robots.length} robots found`);
      
    } catch (err) {
      console.error("Failed to refresh robot data:", err);
      setError(`Failed to refresh: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Get service status
  const getServiceStatus = () => {
    return robotService.getStatus();
  };
  
  // Value provided by context
  const value = {
    // Data
    availableRobots,
    categories,
    currentRobot,
    isLoading,
    error,
    
    // Refs
    viewerRef,
    
    // Core functions
    setViewer,
    loadRobot,
    
    // CRUD operations
    addRobot,
    removeRobot,
    
    // Utility functions
    getRobotsByCategory,
    getRobotConfig,
    refresh,
    getServiceStatus,
    
    // View options
    viewOptions,
    setViewOptions,
    updateViewOptions,
    
    // Direct access to service (for advanced usage)
    robotService
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