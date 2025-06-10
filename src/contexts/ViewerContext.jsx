import React, { createContext, useContext, useRef, useState, useCallback } from 'react';
import EventBus from '../utils/EventBus';

/**
 * @typedef {Object} ViewerContextType
 * @property {boolean} isViewerReady - Whether the viewer is initialized and ready
 * @property {Function} setViewerInstance - Sets the viewer instance
 * @property {Function} getSceneSetup - Gets the scene setup
 * @property {Object} viewerInstance - Direct access to viewer instance (escape hatch)
 */

const ViewerContext = createContext(/** @type {ViewerContextType | null} */ (null));

/**
 * Provider component for the viewer context
 * ✅ Updated: Focuses on scene/viewer management only
 * ❌ Removed: Robot management (now handled by RobotContext)
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
  
  // ❌ Removed: getRobotManager (was RobotLoader)
  // ✅ Note: Use useRobot() hook instead for robot operations
  
  // Focus on specific object in scene
  const focusOnObject = useCallback((object) => {
    if (!viewerInstanceRef.current) {
      console.warn('[ViewerContext] Attempted to focus before viewer initialization');
      return;
    }
    
    const sceneSetup = getSceneSetup();
    if (sceneSetup && sceneSetup.focusOnObject) {
      sceneSetup.focusOnObject(object);
    }
  }, [getSceneSetup]);
  
  // Focus on robot by ID (delegates to robot context via events)
  const focusOnRobot = useCallback((robotId, forceRefocus = false) => {
    if (!viewerInstanceRef.current) {
      console.warn('[ViewerContext] Attempted to focus robot before viewer initialization');
      return;
    }
    
    // Emit event for RobotContext to handle
    EventBus.emit('viewer:focus-robot-requested', { robotId, forceRefocus });
  }, []);
  
  // Camera controls
  const resetCamera = useCallback(() => {
    const sceneSetup = getSceneSetup();
    if (sceneSetup && sceneSetup.resetCamera) {
      sceneSetup.resetCamera();
    }
  }, [getSceneSetup]);
  
  const setCameraPosition = useCallback((position) => {
    const sceneSetup = getSceneSetup();
    if (sceneSetup && sceneSetup.camera) {
      sceneSetup.camera.position.set(position.x, position.y, position.z);
      if (sceneSetup.controls) {
        sceneSetup.controls.update();
      }
    }
  }, [getSceneSetup]);
  
  const setCameraTarget = useCallback((target) => {
    const sceneSetup = getSceneSetup();
    if (sceneSetup && sceneSetup.controls) {
      sceneSetup.controls.target.set(target.x, target.y, target.z);
      sceneSetup.controls.update();
    }
  }, [getSceneSetup]);
  
  // Scene management
  const getScene = useCallback(() => {
    const sceneSetup = getSceneSetup();
    return sceneSetup?.scene;
  }, [getSceneSetup]);
  
  const getCamera = useCallback(() => {
    const sceneSetup = getSceneSetup();
    return sceneSetup?.camera;
  }, [getSceneSetup]);
  
  const getRenderer = useCallback(() => {
    const sceneSetup = getSceneSetup();
    return sceneSetup?.renderer;
  }, [getSceneSetup]);
  
  // ❌ Removed: Robot-specific methods (loadRobot, resetJoints)
  // ✅ Note: Use useRobot() hook for these operations:
  //   const { loadRobot, resetJoints } = useRobot();
  
  const value = {
    // Core viewer state
    isViewerReady,
    setViewerInstance,
    
    // Scene access
    getSceneSetup,
    getScene,
    getCamera, 
    getRenderer,
    
    // Camera controls
    focusOnObject,
    focusOnRobot, // Delegates to RobotContext via events
    resetCamera,
    setCameraPosition,
    setCameraTarget,
    
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