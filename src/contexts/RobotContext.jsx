// src/contexts/RobotContext.jsx - Fixed active robot synchronization
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
  const [activeRobotId, setActiveRobotIdState] = useState(null);
  const [activeRobot, setActiveRobot] = useState(null);
  const [loadedRobots, setLoadedRobots] = useState(new Map());
  
  // Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // 🚨 FIX: Synchronized setActiveRobotId that also updates activeRobot
  const setActiveRobotId = useCallback((robotId) => {
    console.log(`[RobotContext] Setting active robot ID to: ${robotId}`);
    setActiveRobotIdState(robotId);
    
    if (robotId) {
      const robotData = loadedRobots.get(robotId);
      if (robotData) {
        console.log(`[RobotContext] Setting active robot object for: ${robotId}`);
        setActiveRobot(robotData.robot);
        
        // Emit event for other components
        EventBus.emit('robot:active-changed', { 
          robotId, 
          robot: robotData.robot 
        });
      } else {
        console.warn(`[RobotContext] Robot ${robotId} not found in loaded robots`);
        setActiveRobot(null);
      }
    } else {
      setActiveRobot(null);
    }
  }, [loadedRobots]);
  
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
      
      // Set as active if requested (use the new synchronized method)
      if (options.makeActive !== false) {
        // Use setTimeout to ensure loadedRobots state is updated first
        setTimeout(() => {
          setActiveRobotId(robotId);
        }, 0);
      }
      
      EventBus.emit('robot:loaded', { robotId, robot });
      
      return robot;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [viewerInstance, setActiveRobotId]);
  
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
      }
      
      EventBus.emit('robot:unloaded', { robotId });
    } catch (err) {
      setError(err.message);
    }
  }, [viewerInstance, activeRobotId, setActiveRobotId]);
  
  // Listen for robot events
  useEffect(() => {
    const handleRobotRemoved = (data) => {
      if (data.robotName === activeRobotId) {
        setActiveRobotId(null);
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
  }, [activeRobotId, setActiveRobotId]);
  
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
    setActiveRobotId, // Now synchronized with activeRobot
    setActiveRobot,   // Keep for backward compatibility
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