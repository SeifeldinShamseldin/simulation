// src/contexts/RobotContext.jsx - Manages loaded robots in the viewer
import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import { useViewer } from './ViewerContext';

const RobotContext = createContext(null);

export const RobotProvider = ({ children }) => {
  const { viewerInstance } = useViewer();
  const [loadedRobots, setLoadedRobots] = useState(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadRobot = useCallback(async (robotId, urdfPath, options = {}) => {
    if (!viewerInstance) {
      throw new Error('Viewer not initialized');
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const robot = await viewerInstance.loadRobot(robotId, urdfPath, options);
      
      setLoadedRobots(prev => new Map(prev).set(robotId, {
        id: robotId,
        urdfPath,
        robot,
        loadedAt: new Date().toISOString()
      }));
      
      return robot;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [viewerInstance]);

  const isRobotLoaded = useCallback((robotId) => {
    return loadedRobots.has(robotId);
  }, [loadedRobots]);

  const getLoadedRobots = useCallback(() => {
    return loadedRobots;
  }, [loadedRobots]);

  const value = {
    loadedRobots,
    isLoading,
    error,
    loadRobot,
    isRobotLoaded,
    getLoadedRobots
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