import React, { createContext, useContext, useRef, useState, useCallback } from 'react';
import EventBus from '../utils/EventBus';

const ViewerContext = createContext(null);

export const ViewerProvider = ({ children }) => {
  const viewerInstanceRef = useRef(null);
  const [isViewerReady, setIsViewerReady] = useState(false);
  
  // Store viewer instance
  const setViewerInstance = useCallback((viewer) => {
    viewerInstanceRef.current = viewer;
    setIsViewerReady(true);
    EventBus.emit('viewer:ready', { viewer });
  }, []);
  
  // Get scene setup
  const getSceneSetup = useCallback(() => {
    return viewerInstanceRef.current?.getSceneSetup?.() || 
           viewerInstanceRef.current?.sceneRef?.current;
  }, []);
  
  // Get robot manager
  const getRobotManager = useCallback(() => {
    return viewerInstanceRef.current?.robotLoaderRef?.current;
  }, []);
  
  // Focus on robot
  const focusOnRobot = useCallback((robotId, forceRefocus = false) => {
    if (!viewerInstanceRef.current) return;
    viewerInstanceRef.current.focusOnRobot?.(robotId, forceRefocus);
  }, []);
  
  // Load robot
  const loadRobot = useCallback(async (robotId, urdfPath, options = {}) => {
    if (!viewerInstanceRef.current) {
      throw new Error('Viewer not initialized');
    }
    return viewerInstanceRef.current.loadRobot(robotId, urdfPath, options);
  }, []);
  
  // Reset joints
  const resetJoints = useCallback((robotId) => {
    if (!viewerInstanceRef.current) return;
    viewerInstanceRef.current.resetJoints(robotId);
  }, []);
  
  const value = {
    isViewerReady,
    setViewerInstance,
    getSceneSetup,
    getRobotManager,
    focusOnRobot,
    loadRobot,
    resetJoints,
    // Direct access when needed (escape hatch)
    viewerInstance: viewerInstanceRef.current
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