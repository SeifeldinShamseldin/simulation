// src/contexts/RobotContext.jsx - Complete implementation
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useViewer } from './ViewerContext';
import EventBus from '../utils/EventBus';

const RobotContext = createContext(null);

export const RobotProvider = ({ children }) => {
  const { isViewerReady, viewerInstance } = useViewer();
  
  // Available robots from server
  const [availableRobots, setAvailableRobots] = useState([]);
  const [categories, setCategories] = useState([]);
  
  // Active robot management
  const [activeRobotId, setActiveRobotId] = useState(null);
  const [activeRobot, setActiveRobot] = useState(null);
  const [loadedRobots, setLoadedRobots] = useState(new Map());
  
  // Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Discover robots from server
  const discoverRobots = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('/robots/list');
      const data = await response.json();
      
      if (response.ok) {
        setCategories(data);
        
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
  const loadRobot = useCallback(async (robotId, urdfPath, options = {}) => {
    if (!viewerInstance) {
      throw new Error('Viewer not initialized');
    }
    
    try {
      setIsLoading(true);
      setError(null);
      
      console.log(`[RobotContext] Loading robot ${robotId} from ${urdfPath}`);
      
      const robot = await viewerInstance.loadRobot(robotId, urdfPath, options);
      
      // Update loaded robots map
      setLoadedRobots(prev => {
        const newMap = new Map(prev);
        newMap.set(robotId, {
          id: robotId,
          robot: robot,
          urdfPath,
          isActive: options.makeActive !== false,
          loadedAt: new Date().toISOString()
        });
        return newMap;
      });
      
      // Set as active if requested
      if (options.makeActive !== false) {
        setActiveRobotId(robotId);
        setActiveRobot(robot);
      }
      
      EventBus.emit('robot:loaded', { robotId, robot });
      
      return robot;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [viewerInstance]);
  
  // Check if robot is loaded
  const isRobotLoaded = useCallback((robotId) => {
    return loadedRobots.has(robotId);
  }, [loadedRobots]);
  
  // Get robot by ID
  const getRobot = useCallback((robotId) => {
    const robotData = loadedRobots.get(robotId);
    return robotData?.robot;
  }, [loadedRobots]);
  
  // Unload robot
  const unloadRobot = useCallback((robotId) => {
    if (!viewerInstance) return;
    
    try {
      // Remove from viewer if it has unloadRobot method
      if (viewerInstance.unloadRobot) {
        viewerInstance.unloadRobot(robotId);
      }
      
      setLoadedRobots(prev => {
        const newMap = new Map(prev);
        newMap.delete(robotId);
        return newMap;
      });
      
      if (activeRobotId === robotId) {
        setActiveRobotId(null);
        setActiveRobot(null);
      }
      
      EventBus.emit('robot:unloaded', { robotId });
    } catch (err) {
      setError(err.message);
    }
  }, [viewerInstance, activeRobotId]);
  
  // Listen for robot events
  useEffect(() => {
    const handleRobotRemoved = (data) => {
      if (data.robotName === activeRobotId) {
        setActiveRobotId(null);
        setActiveRobot(null);
      }
      
      setLoadedRobots(prev => {
        const newMap = new Map(prev);
        newMap.delete(data.robotName);
        return newMap;
      });
    };
    
    const unsubscribeRemoved = EventBus.on('robot:removed', handleRobotRemoved);
    
    return () => {
      unsubscribeRemoved();
    };
  }, [activeRobotId]);
  
  // Initialize on mount
  useEffect(() => {
    if (isViewerReady) {
      discoverRobots();
    }
  }, [isViewerReady]);

  const value = {
    // Data
    availableRobots,
    categories,
    activeRobotId,
    activeRobot,
    loadedRobots,
    isLoading,
    error,
    
    // Functions
    loadRobot,
    unloadRobot,
    setActiveRobotId,
    setActiveRobot,
    refresh: discoverRobots,
    getRobot,
    isRobotLoaded,
    getLoadedRobots: () => loadedRobots,
    clearError: () => setError(null)
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
    throw new Error('useRobot must be used within a RobotProvider');
  }
  return context;
};

export default RobotContext;  