// src/contexts/hooks/useViewerEnhanced.js - ENHANCED VIEWER HOOKS
import { useCallback, useEffect, useRef } from 'react';
import { useViewer } from '../ViewerContext';
import { useRobotManager } from './useRobotManager';
import EventBus from '../../utils/EventBus';

// ========== ENHANCED VIEWER HOOKS ==========

export const useViewerScene = () => {
  const viewer = useViewer();
  
  return {
    isReady: viewer.isViewerReady,
    sceneSetup: viewer.getSceneSetup(),
    config: viewer.viewerConfig,
    initializeViewer: viewer.initializeViewer,
    dispose: viewer.dispose
  };
};

export const useViewerControl = () => {
  const viewer = useViewer();
  const robotManager = useRobotManager();
  const containerRef = useRef(null);
  
  // Initialize viewer when container is set
  const setContainer = useCallback((container) => {
    if (!container || containerRef.current === container) return;
    
    containerRef.current = container;
    
    // If initializeViewer exists (enhanced API), use it
    if (viewer.initializeViewer) {
      viewer.initializeViewer(container);
    }
  }, [viewer]);
  
  // Auto-focus on robot load
  useEffect(() => {
    const handleRobotLoaded = (data) => {
      if (data.robot && viewer.isViewerReady) {
        // Delay to ensure robot is fully loaded
        setTimeout(() => {
          viewer.focusOnRobot(data.robot, true);
        }, 100);
      }
    };
    
    const unsubscribe = EventBus.on('robot:loaded', handleRobotLoaded);
    return () => unsubscribe();
  }, [viewer]);
  
  return {
    // Container ref
    setContainer,
    
    // Viewer state
    isReady: viewer.isViewerReady,
    isLoading: viewer.isLoading || robotManager.isLoading,
    error: viewer.error || robotManager.error,
    
    // Combined methods
    loadRobot: robotManager.loadRobot,
    focusOnRobot: (robotName) => {
      const robot = robotName 
        ? robotManager.getRobot(robotName)
        : robotManager.getCurrentRobot();
      if (robot) viewer.focusOnRobot(robot, true);
    },
    
    // Direct access to both contexts
    viewer,
    robotManager
  };
};