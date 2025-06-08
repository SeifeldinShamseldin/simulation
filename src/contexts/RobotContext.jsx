// src/contexts/RobotContext.jsx - Manages loaded robots in the viewer with active robot tracking
import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { useViewer } from './ViewerContext';
import EventBus from '../utils/EventBus';

const RobotContext = createContext(null);

export const RobotProvider = ({ children }) => {
  const { viewerInstance } = useViewer();
  const [loadedRobots, setLoadedRobots] = useState(new Map());
  const [activeRobotId, setActiveRobotId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Debug logging for activeRobotId changes
  useEffect(() => {
    console.log('[RobotContext] Active robot ID changed to:', activeRobotId);
    console.log('[RobotContext] Current loaded robots:', Array.from(loadedRobots.keys()));
  }, [activeRobotId, loadedRobots]);

  // Listen for robot loading events
  useEffect(() => {
    const handleRobotLoadedInContext = (data) => {
      const { robotId, robotData } = data;
      console.log('[RobotContext] Robot loaded in context:', robotId, robotData);
      
      setLoadedRobots(prev => {
        const newMap = new Map(prev).set(robotId, robotData);
        console.log('[RobotContext] Updated loaded robots:', Array.from(newMap.keys()));
        return newMap;
      });
      
      // Set as active if it's the first robot or explicitly requested
      if (!activeRobotId || robotData.makeActive !== false) {
        console.log('[RobotContext] Setting active robot:', robotId);
        setActiveRobotId(robotId);
        EventBus.emit('robot:selected', { robotId });
      }
    };

    const handleRobotLoaded = (data) => {
      const { robotName, robot, makeActive } = data;
      console.log('[RobotContext] Robot loaded (legacy event):', robotName);
      
      // Handle legacy robot:loaded events
      const robotData = {
        id: robotName,
        robot,
        loadedAt: new Date().toISOString(),
        makeActive: makeActive !== false
      };
      
      setLoadedRobots(prev => {
        const newMap = new Map(prev).set(robotName, robotData);
        console.log('[RobotContext] Updated loaded robots (legacy):', Array.from(newMap.keys()));
        return newMap;
      });
      
      // Set as active if it's the first robot or explicitly requested
      if (!activeRobotId || makeActive !== false) {
        console.log('[RobotContext] Setting active robot (legacy):', robotName);
        setActiveRobotId(robotName);
        EventBus.emit('robot:selected', { robotId: robotName });
      }
    };

    const handleRobotRemoved = (data) => {
      const { robotName } = data;
      console.log('[RobotContext] Robot removed:', robotName);
      
      setLoadedRobots(prev => {
        const newMap = new Map(prev);
        newMap.delete(robotName);
        return newMap;
      });
      
      // Clear active robot if it was removed
      if (activeRobotId === robotName) {
        const remaining = Array.from(loadedRobots.keys()).filter(id => id !== robotName);
        const newActive = remaining.length > 0 ? remaining[0] : null;
        setActiveRobotId(newActive);
        
        if (newActive) {
          EventBus.emit('robot:selected', { robotId: newActive });
        }
      }
    };

    const unsubscribeLoadedInContext = EventBus.on('robot:loaded-in-context', handleRobotLoadedInContext);
    const unsubscribeLoaded = EventBus.on('robot:loaded', handleRobotLoaded);
    const unsubscribeRemoved = EventBus.on('robot:removed', handleRobotRemoved);
    
    return () => {
      unsubscribeLoadedInContext();
      unsubscribeLoaded();
      unsubscribeRemoved();
    };
  }, [activeRobotId, loadedRobots]);

  const loadRobot = useCallback(async (robotId, urdfPath, options = {}) => {
    if (!viewerInstance) {
      throw new Error('Viewer not initialized');
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const robot = await viewerInstance.loadRobot(robotId, urdfPath, options);
      
      const robotData = {
        id: robotId,
        urdfPath,
        robot,
        loadedAt: new Date().toISOString(),
        makeActive: options.makeActive !== false // Default to true
      };
      
      setLoadedRobots(prev => new Map(prev).set(robotId, robotData));
      
      // Set as active if requested or if it's the first robot
      if (options.makeActive !== false && (!activeRobotId || options.makeActive === true)) {
        setActiveRobotId(robotId);
        EventBus.emit('robot:selected', { robotId });
      }
      
      return robot;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [viewerInstance, activeRobotId]);

  const selectRobot = useCallback((robotId) => {
    if (loadedRobots.has(robotId)) {
      setActiveRobotId(robotId);
      EventBus.emit('robot:selected', { robotId });
      console.log('[RobotContext] Robot selected:', robotId);
    } else {
      console.warn('[RobotContext] Cannot select robot that is not loaded:', robotId);
    }
  }, [loadedRobots]);

  const removeRobot = useCallback((robotId) => {
    if (viewerInstance && viewerInstance.removeRobot) {
      viewerInstance.removeRobot(robotId);
    }
    
    setLoadedRobots(prev => {
      const newMap = new Map(prev);
      newMap.delete(robotId);
      return newMap;
    });
    
    // Handle active robot removal
    if (activeRobotId === robotId) {
      const remaining = Array.from(loadedRobots.keys()).filter(id => id !== robotId);
      const newActive = remaining.length > 0 ? remaining[0] : null;
      setActiveRobotId(newActive);
      
      if (newActive) {
        EventBus.emit('robot:selected', { robotId: newActive });
      }
    }
  }, [viewerInstance, activeRobotId, loadedRobots]);

  const isRobotLoaded = useCallback((robotId) => {
    return loadedRobots.has(robotId);
  }, [loadedRobots]);

  const getLoadedRobots = useCallback(() => {
    return loadedRobots;
  }, [loadedRobots]);

  const getRobot = useCallback((robotId = activeRobotId) => {
    if (!robotId) return null;
    const robotData = loadedRobots.get(robotId);
    return robotData?.robot || null;
  }, [loadedRobots, activeRobotId]);

  const getActiveRobot = useCallback(() => {
    return activeRobotId ? getRobot(activeRobotId) : null;
  }, [activeRobotId, getRobot]);

  const clearAllRobots = useCallback(() => {
    if (viewerInstance && viewerInstance.clearAllRobots) {
      viewerInstance.clearAllRobots();
    }
    
    setLoadedRobots(new Map());
    setActiveRobotId(null);
  }, [viewerInstance]);

  const value = {
    // State
    loadedRobots,
    activeRobotId,
    isLoading,
    error,
    
    // Methods
    loadRobot,
    selectRobot,
    removeRobot,
    isRobotLoaded,
    getLoadedRobots,
    getRobot,
    getActiveRobot,
    clearAllRobots,
    
    // Utils
    robotCount: loadedRobots.size,
    hasActiveRobot: !!activeRobotId,
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
    throw new Error('useRobot must be used within RobotProvider');
  }
  return context;
};

export default RobotContext;