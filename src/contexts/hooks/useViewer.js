// src/contexts/hooks/useViewer.js - FIXED IMPORTS
import { useCallback, useEffect, useRef, useState } from 'react';
import { useViewer as useViewerBase } from '../ViewerContext'; // Import useViewer, not useViewerContext
import { useRobotManager } from './useRobotManager';
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

export const useViewerDragControls = () => {
  const viewer = useViewerBase();
  const robotManager = useRobotManager();
  const [enabled, setEnabled] = useState(false);
  
  // Listen for drag events and update joint values
  useEffect(() => {
    const handleDragEnd = (data) => {
      const { joint } = data;
      if (joint && robotManager.getCurrentRobotName) {
        const robotName = robotManager.getCurrentRobotName();
        const jointValues = robotManager.getJointValues(robotName);
        
        EventBus.emit('viewer:joint-values-updated', {
          robotName,
          jointName: joint.name,
          values: jointValues
        });
      }
    };
    
    const unsubscribe = EventBus.on('viewer:drag-end', handleDragEnd);
    return () => unsubscribe();
  }, [robotManager]);
  
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
  const robotManager = useRobotManager();
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
          viewer.cameraController?.focusOn(data.robot, 0.8);
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
    isLoading: robotManager.isLoading,
    error: robotManager.error,
    
    // Combined methods
    loadRobot: robotManager.loadRobot,
    focusOnRobot: (robotName) => {
      const robot = robotName 
        ? robotManager.getRobot(robotName)
        : robotManager.getCurrentRobot();
      if (robot) {
        viewer.cameraController?.focusOn(robot, 0.8);
      }
    },
    
    // Direct access to contexts
    viewer,
    robotManager
  };
};

export default useViewer;