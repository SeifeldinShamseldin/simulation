// src/contexts/ViewerContext.jsx - Manages the URDF viewer instance and provides access to its components
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import EventBus from '../utils/EventBus';

const ViewerContext = createContext(null);

export const ViewerProvider = ({ children }) => {
  const [viewerInstance, setViewerInstanceState] = useState(null);
  const [isViewerReady, setIsViewerReady] = useState(false);
  const [robotManager, setRobotManager] = useState(null);
  const [sceneSetup, setSceneSetup] = useState(null);

  // Set viewer instance and extract its components
  const setViewerInstance = useCallback((viewer) => {
    console.log('[ViewerContext] Setting viewer instance:', !!viewer);
    
    if (viewer) {
      setViewerInstanceState(viewer);
      
      // Extract robot manager and scene setup from viewer
      if (viewer.robotManager) {
        setRobotManager(viewer.robotManager);
        console.log('[ViewerContext] Robot manager extracted');
      }
      
      if (viewer.sceneSetup) {
        setSceneSetup(viewer.sceneSetup);
        console.log('[ViewerContext] Scene setup extracted');
      }
      
      setIsViewerReady(true);
      
      // Emit ready event
      EventBus.emit('viewer:ready', { viewer });
      
    } else {
      setViewerInstanceState(null);
      setRobotManager(null);
      setSceneSetup(null);
      setIsViewerReady(false);
      
      EventBus.emit('viewer:disposed');
    }
  }, []);

  // Get robot manager
  const getRobotManager = useCallback(() => {
    if (!robotManager && viewerInstance?.robotManager) {
      setRobotManager(viewerInstance.robotManager);
      return viewerInstance.robotManager;
    }
    return robotManager;
  }, [robotManager, viewerInstance]);

  // Get scene setup
  const getSceneSetup = useCallback(() => {
    if (!sceneSetup && viewerInstance?.sceneSetup) {
      setSceneSetup(viewerInstance.sceneSetup);
      return viewerInstance.sceneSetup;
    }
    return sceneSetup;
  }, [sceneSetup, viewerInstance]);

  // Load robot method that delegates to viewer instance
  const loadRobot = useCallback(async (robotId, urdfPath, options = {}) => {
    if (!viewerInstance) {
      throw new Error('Viewer instance not available');
    }
    
    if (!viewerInstance.loadRobot) {
      throw new Error('Viewer instance does not support robot loading');
    }
    
    try {
      console.log('[ViewerContext] Loading robot:', robotId);
      const robot = await viewerInstance.loadRobot(robotId, urdfPath, options);
      
      // Create robot data
      const robotData = {
        id: robotId,
        urdfPath,
        robot,
        loadedAt: new Date().toISOString(),
        makeActive: options.makeActive !== false
      };
      
      console.log('[ViewerContext] Robot loaded, emitting events for:', robotId);
      
      // Emit event for RobotContext
      EventBus.emit('robot:loaded-in-context', {
        robotId,
        robotData
      });
      
      // Also emit the original robot:loaded event for compatibility
      EventBus.emit('robot:loaded', {
        robotName: robotId,
        robot,
        makeActive: options.makeActive !== false
      });
      
      return robot;
    } catch (error) {
      console.error('[ViewerContext] Error loading robot:', error);
      throw error;
    }
  }, [viewerInstance]);

  // Check if robot is loaded
  const isRobotLoaded = useCallback((robotId) => {
    if (!robotManager) return false;
    
    if (robotManager.getAllRobots) {
      const allRobots = robotManager.getAllRobots();
      return allRobots.has(robotId);
    }
    
    return false;
  }, [robotManager]);

  // Get robot
  const getRobot = useCallback((robotId) => {
    if (!robotManager) return null;
    
    if (robotManager.getRobot) {
      return robotManager.getRobot(robotId);
    }
    
    if (robotManager.getAllRobots) {
      const allRobots = robotManager.getAllRobots();
      const robotData = allRobots.get(robotId);
      return robotData?.model || null;
    }
    
    return null;
  }, [robotManager]);

  // Focus on robot
  const focusOnRobot = useCallback((robotId, force = false) => {
    if (!sceneSetup || !robotManager) return;
    
    const robot = getRobot(robotId);
    if (!robot) return;
    
    if (sceneSetup.focusOnObject) {
      sceneSetup.focusOnObject(robot);
    }
  }, [sceneSetup, robotManager, getRobot]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      setViewerInstanceState(null);
      setRobotManager(null);
      setSceneSetup(null);
      setIsViewerReady(false);
    };
  }, []);

  const value = {
    // Core state
    viewerInstance,
    isViewerReady,
    robotManager,
    sceneSetup,
    
    // Methods
    setViewerInstance,
    getRobotManager,
    getSceneSetup,
    loadRobot,
    isRobotLoaded,
    getRobot,
    focusOnRobot
  };

  return (
    <ViewerContext.Provider value={value}>
      {children}
    </ViewerContext.Provider>
  );
};

export const useViewer = () => {
  const context = useContext(ViewerContext);
  if (!context) {
    throw new Error('useViewer must be used within ViewerProvider');
  }
  return context;
};

export default ViewerContext;
