// src/contexts/hooks/useViewer.js - FIXED IMPORTS
import { useCallback, useEffect, useRef, useState } from 'react';
import { useViewer as useViewerBase } from '../ViewerContext'; // Import useViewer, not useViewerContext
import { useRobot } from './useRobot';
import EventBus from '../../utils/EventBus';

// ========== MAIN HOOK (re-export the base hook) ==========
export const useViewer = () => {
  return useViewerBase();
};

// ========== SPECIALIZED HOOKS ==========

export const useViewerScene = () => {
  const viewer = useViewerBase();
  
  return {
    isReady: viewer.isViewerReady,
    sceneSetup: viewer.getSceneSetup(),
    config: viewer.viewerConfig || {},
    initializeViewer: viewer.initializeViewer,
    dispose: viewer.dispose
  };
};

export const useViewerCamera = () => {
  const viewer = useViewerBase();
  
  const focusOnObject = useCallback((object, paddingMultiplier = 1.0) => {
    const sceneSetup = viewer.getSceneSetup();
    if (sceneSetup && object) {
      sceneSetup.focusOnObject(object, paddingMultiplier);
      EventBus.emit('viewer:camera-focused', { object });
    }
  }, [viewer]);
  
  const setCameraPosition = useCallback((position) => {
    const sceneSetup = viewer.getSceneSetup();
    if (sceneSetup && sceneSetup.camera) {
      sceneSetup.camera.position.set(position.x, position.y, position.z);
      if (sceneSetup.controls) {
        sceneSetup.controls.update();
      }
      EventBus.emit('viewer:camera-moved', { position });
    }
  }, [viewer]);
  
  const setCameraTarget = useCallback((target) => {
    const sceneSetup = viewer.getSceneSetup();
    if (sceneSetup && sceneSetup.controls) {
      sceneSetup.controls.target.set(target.x, target.y, target.z);
      sceneSetup.controls.update();
      EventBus.emit('viewer:camera-target-changed', { target });
    }
  }, [viewer]);
  
  return {
    focusOn: focusOnObject,
    setPosition: setCameraPosition,
    setTarget: setCameraTarget
  };
};

export const useViewerDragControls = () => {
  const viewer = useViewerBase();
  const { 
    getJointValues,
    activeRobotId
  } = useRobot();
  const [enabled, setEnabled] = useState(false);
  
  // Listen for drag events and update joint values
  useEffect(() => {
    const handleDragEnd = (data) => {
      const { joint } = data;
      if (joint && activeRobotId) {
        const jointValues = getJointValues(activeRobotId);
        
        EventBus.emit('viewer:joint-values-updated', {
          robotId: activeRobotId,
          jointName: joint.name,
          values: jointValues
        });
      }
    };
    
    const unsubscribe = EventBus.on('viewer:drag-end', handleDragEnd);
    return () => unsubscribe();
  }, [activeRobotId, getJointValues]);
  
  return {
    enabled,
    setEnabled,
    toggle: () => setEnabled(!enabled)
  };
};

export const useViewerTable = () => {
  const viewer = useViewerBase();
  const [tableState, setTableState] = useState({ loaded: false, visible: false });
  
  const loadTable = useCallback(async () => {
    const sceneSetup = viewer.getSceneSetup();
    if (!sceneSetup || tableState.loaded) return false;
    
    try {
      // TODO: Implement table loading in SceneSetup
      if (sceneSetup.loadTable) {
        await sceneSetup.loadTable();
        setTableState({ loaded: true, visible: true });
        EventBus.emit('viewer:table-loaded');
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error loading table:', error);
      return false;
    }
  }, [viewer, tableState.loaded]);
  
  const toggleTable = useCallback((visible) => {
    const sceneSetup = viewer.getSceneSetup();
    if (!sceneSetup || !tableState.loaded) return;
    
    if (sceneSetup.setTableVisible) {
      sceneSetup.setTableVisible(visible);
      setTableState(prev => ({ ...prev, visible }));
      EventBus.emit('viewer:table-toggled', { visible });
    }
  }, [viewer, tableState.loaded]);
  
  return {
    isLoaded: tableState.loaded,
    isVisible: tableState.visible,
    load: loadTable,
    toggle: () => toggleTable(!tableState.visible),
    show: () => toggleTable(true),
    hide: () => toggleTable(false)
  };
};

export const useViewerConfig = () => {
  const viewer = useViewerBase();
  const [config, setConfig] = useState({
    backgroundColor: '#f5f5f5',
    enableShadows: true,
    ambientColor: '#8ea0a8',
    upAxis: '+Z',
    highlightColor: '#ff0000'
  });
  
  const updateConfig = useCallback((updates) => {
    setConfig(prev => ({ ...prev, ...updates }));
    
    const sceneSetup = viewer.getSceneSetup();
    if (sceneSetup) {
      // Apply updates to scene
      if (updates.backgroundColor !== undefined && sceneSetup.setBackgroundColor) {
        sceneSetup.setBackgroundColor(updates.backgroundColor);
      }
      if (updates.upAxis !== undefined && sceneSetup.setUpAxis) {
        sceneSetup.setUpAxis(updates.upAxis);
      }
      if (updates.enableShadows !== undefined && sceneSetup.setShadows) {
        sceneSetup.setShadows(updates.enableShadows);
      }
    }
    
    EventBus.emit('viewer:config-updated', { ...config, ...updates });
  }, [viewer, config]);
  
  return {
    ...config,
    update: updateConfig,
    setBackgroundColor: (color) => updateConfig({ backgroundColor: color }),
    setUpAxis: (axis) => updateConfig({ upAxis: axis }),
    setShadows: (enabled) => updateConfig({ enableShadows: enabled }),
    setHighlightColor: (color) => updateConfig({ highlightColor: color })
  };
};

// ========== COMBINED VIEWER CONTROL HOOK ==========
export const useViewerControl = () => {
  const viewer = useViewerBase();
  const { 
    loadRobot,
    getRobot,
    isLoading,
    error,
    activeRobotId,
    activeRobot
  } = useRobot();
  const camera = useViewerCamera();
  const containerRef = useRef(null);
  
  // Initialize viewer when container is set
  const setContainer = useCallback((container) => {
    if (!container || containerRef.current === container) return;
    
    containerRef.current = container;
    
    // The original ViewerContext doesn't have initializeViewer
    // It expects the URDFViewer component to be set as the instance
    console.log('[useViewerControl] Container set:', container);
  }, []);
  
  // Auto-focus on robot load
  useEffect(() => {
    const handleRobotLoaded = (data) => {
      if (data.robot && viewer.isViewerReady) {
        // Delay to ensure robot is fully loaded
        setTimeout(() => {
          camera.focusOn(data.robot, 0.8);
        }, 100);
      }
    };
    
    const unsubscribe = EventBus.on('robot:loaded', handleRobotLoaded);
    return () => unsubscribe();
  }, [viewer, camera]);
  
  return {
    // Container ref
    setContainer,
    
    // Viewer state
    isReady: viewer.isViewerReady,
    isLoading,
    error,
    
    // Combined methods
    loadRobot,
    focusOnRobot: (robotId) => {
      const robot = robotId ? getRobot(robotId) : activeRobot;
      if (robot) {
        camera.focusOn(robot, 0.8);
      }
    },
    
    // Direct access to contexts
    viewer,
    camera
  };
};

export default useViewer;