// src/contexts/RobotContext.jsx - MERGED VERSION
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import EventBus from '../utils/EventBus';

const RobotContext = createContext(null);

export const RobotProvider = ({ children }) => {
  // Available robots from server
  const [availableRobots, setAvailableRobots] = useState([]);
  const [categories, setCategories] = useState([]);
  
  // Active robot management (merged from ActiveRobotContext)
  const [activeRobotId, setActiveRobotId] = useState(null);
  const [activeRobot, setActiveRobot] = useState(null);
  const [loadedRobots, setLoadedRobots] = useState(new Map());
  
  // Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Viewer reference
  const [viewer, setViewer] = useState(null);
  
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
  const loadRobot = async (robotId, urdfPath, options = {}) => {
    // Try to get viewer from context or from the global viewer if available
    const currentViewer = viewer || window.viewerInstance;
    
    if (!currentViewer) {
      throw new Error('Viewer not initialized');
    }
    
    try {
      setIsLoading(true);
      setError(null);
      
      const robot = await currentViewer.loadRobot(robotId, urdfPath, options);
      
      // Update loaded robots map
      setLoadedRobots(prev => {
        const newMap = new Map(prev);
        newMap.set(robotId, {
          id: robotId,
          robot: robot,
          isActive: options.makeActive !== false
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
  };
  
  // Add new robot
  const addRobot = async (formData) => {
    try {
      setIsLoading(true);
      
      const response = await fetch('/api/robots/add', {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json();
      
      if (result.success) {
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
    
    const handleRobotActiveChanged = (data) => {
      if (data.robotName === activeRobotId && !data.isActive) {
        setActiveRobotId(null);
        setActiveRobot(null);
      } else if (data.isActive) {
        setActiveRobotId(data.robotName);
        // Get robot from loaded robots
        const robotData = loadedRobots.get(data.robotName);
        if (robotData) {
          setActiveRobot(robotData.robot);
        }
      }
    };
    
    const unsubscribeRemoved = EventBus.on('robot:removed', handleRobotRemoved);
    const unsubscribeActiveChanged = EventBus.on('robot:active-changed', handleRobotActiveChanged);
    
    return () => {
      unsubscribeRemoved();
      unsubscribeActiveChanged();
    };
  }, [activeRobotId, loadedRobots]);
  
  // Initialize on mount
  useEffect(() => {
    discoverRobots();
  }, []);

  const unloadRobot = useCallback((robotId) => {
    if (!viewer) return;
    
    try {
      viewer.unloadRobot(robotId);
      
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
  }, [viewer, activeRobotId]);

  const getRobot = useCallback((robotId) => {
    return loadedRobots.get(robotId)?.robot;
  }, [loadedRobots]);

  const getActiveRobot = useCallback(() => {
    return activeRobot;
  }, [activeRobot]);

  const getActiveRobotId = useCallback(() => {
    return activeRobotId;
  }, [activeRobotId]);

  const getLoadedRobots = useCallback(() => {
    return Array.from(loadedRobots.values());
  }, [loadedRobots]);

  const isRobotLoaded = useCallback((robotId) => {
    return loadedRobots.has(robotId);
  }, [loadedRobots]);

  const isRobotActive = useCallback((robotId) => {
    return activeRobotId === robotId;
  }, [activeRobotId]);

  const clearAllRobots = useCallback(() => {
    if (!viewer) return;
    
    try {
      loadedRobots.forEach(({ id }) => {
        viewer.unloadRobot(id);
      });
      
      setLoadedRobots(new Map());
      setActiveRobotId(null);
      setActiveRobot(null);
      
      EventBus.emit('robots:cleared');
    } catch (err) {
      setError(err.message);
    }
  }, [viewer, loadedRobots]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearAllRobots();
    };
  }, [clearAllRobots]);

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
    addRobot,
    setActiveRobotId,
    setActiveRobot,
    refresh: discoverRobots,
    unloadRobot,
    getRobot,
    getActiveRobot,
    getActiveRobotId,
    getLoadedRobots,
    isRobotLoaded,
    isRobotActive,
    clearAllRobots,
    
    // Viewer access
    viewerRef: viewer,
    setViewer
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