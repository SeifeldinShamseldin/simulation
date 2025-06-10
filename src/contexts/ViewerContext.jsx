import React, { createContext, useContext, useRef, useState, useCallback } from 'react';
import EventBus from '../utils/EventBus';

/**
 * @typedef {Object} RobotLoadOptions
 * @property {Object} position - Initial position of the robot
 * @property {number} position.x - X coordinate
 * @property {number} position.y - Y coordinate
 * @property {number} position.z - Z coordinate
 * @property {boolean} makeActive - Whether to make this robot active
 * @property {boolean} clearOthers - Whether to clear other robots
 */

/**
 * @typedef {Object} ViewerContextType
 * @property {boolean} isViewerReady - Whether the viewer is initialized and ready
 * @property {Function} setViewerInstance - Sets the viewer instance
 * @property {Function} getSceneSetup - Gets the scene setup
 * @property {Function} getRobotManager - Gets the robot manager
 * @property {Function} focusOnRobot - Focuses the camera on a robot
 * @property {Function} loadRobot - Loads a robot into the scene
 * @property {Function} resetJoints - Resets the joints of a robot
 * @property {Object} viewerInstance - Direct access to viewer instance (escape hatch)
 */

const ViewerContext = createContext(/** @type {ViewerContextType | null} */ (null));

/**
 * Provider component for the viewer context
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components
 */
export const ViewerProvider = ({ children }) => {
  const viewerInstanceRef = useRef(null);
  const [isViewerReady, setIsViewerReady] = useState(false);
  
  // Store viewer instance
  const setViewerInstance = useCallback((viewer) => {
    if (!viewer) {
      console.error('[ViewerContext] Attempted to set null viewer instance');
      return;
    }
    viewerInstanceRef.current = viewer;
    setIsViewerReady(true);
    EventBus.emit('viewer:ready', { viewer });
  }, []);
  
  // Get scene setup
  const getSceneSetup = useCallback(() => {
    if (!viewerInstanceRef.current) {
      console.warn('[ViewerContext] Attempted to get scene setup before viewer initialization');
      return null;
    }
    return viewerInstanceRef.current?.getSceneSetup?.() || 
           viewerInstanceRef.current?.sceneRef?.current;
  }, []);
  
  // Get robot manager - DEPRECATED: Now using context
  const getRobotManager = useCallback(() => {
    console.warn('[ViewerContext] getRobotManager is deprecated. Use useRobotManager hook instead.');
    if (!viewerInstanceRef.current) {
      console.warn('[ViewerContext] Attempted to get robot manager before viewer initialization');
      return null;
    }
    // Return compatibility object
    return viewerInstanceRef.current?.robotLoaderRef?.current;
  }, []);
  
  // Focus on robot - basic implementation without robot manager dependency
  const focusOnRobot = useCallback((robotId, forceRefocus = false) => {
    if (!viewerInstanceRef.current) {
      console.warn('[ViewerContext] Attempted to focus robot before viewer initialization');
      return;
    }
    // Use viewer's focusOnRobot method directly
    if (viewerInstanceRef.current.focusOnRobot) {
      viewerInstanceRef.current.focusOnRobot(robotId, forceRefocus);
    }
  }, []);
  
  // Load robot - integrated with robot manager context
  const loadRobot = useCallback(async (robotId, urdfPath, options = {}) => {
    if (!viewerInstanceRef.current) {
      throw new Error('Viewer not initialized');
    }

    try {
      // Use viewer's loadRobot method which should integrate with robot manager context
      const result = await viewerInstanceRef.current.loadRobot(robotId, urdfPath, options);
      EventBus.emit('viewer:robot-loaded', { robotId, options });
      return result;
    } catch (error) {
      console.error('[ViewerContext] Error loading robot:', error);
      EventBus.emit('viewer:robot-load-error', { robotId, error });
      throw error;
    }
  }, []);
  
  // Reset joints - basic implementation
  const resetJoints = useCallback((robotId) => {
    if (!viewerInstanceRef.current) {
      console.warn('[ViewerContext] Attempted to reset joints before viewer initialization');
      return;
    }
    if (viewerInstanceRef.current.resetJoints) {
      viewerInstanceRef.current.resetJoints(robotId);
    }
    EventBus.emit('viewer:joints-reset', { robotId });
  }, []);
  
  const value = {
    isViewerReady,
    setViewerInstance,
    getSceneSetup,
    getRobotManager, // Keep for compatibility but deprecated
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

/**
 * Hook to use the viewer context
 * @returns {ViewerContextType}
 * @throws {Error} If used outside of ViewerProvider
 */
export const useViewer = () => {
  const context = useContext(ViewerContext);
  if (!context) {
    throw new Error('useViewer must be used within ViewerProvider');
  }
  return context;
};