// src/contexts/ViewerContext.jsx
import React, { createContext, useContext, useRef, useState, useCallback, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import SceneSetup from '../core/Scene/SceneSetup';
import { PointerURDFDragControls } from '../core/Loader/URDFControls';
import EventBus from '../utils/EventBus';
import useCamera from './hooks/useCamera';
import * as DataTransfer from './dataTransfer';
import DebugSystem from '../utils/DebugSystem';

const ViewerContext = createContext(null);

const DEFAULT_CONFIG = {
  backgroundColor: '#f5f5f5',
  enableShadows: true,
  ambientColor: '#8ea0a8',
  upAxis: '+Z',
  highlightColor: '#ff0000'
};

export const ViewerProvider = ({ children }) => {
  console.log('[ViewerContext] ViewerProvider initialized');
  
  // ========== STATE ==========
  const [isViewerReady, setIsViewerReady] = useState(false);
  const [viewerConfig, setViewerConfig] = useState(DEFAULT_CONFIG);
  const [dragControlsEnabled, setDragControlsEnabled] = useState(false);
  const [tableState, setTableState] = useState({ loaded: false, visible: false });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  console.log('[ViewerContext] Initial state:', {
    isViewerReady,
    viewerConfig,
    dragControlsEnabled,
    tableState,
    isLoading,
    error
  });
  
  // ========== HANDSHAKE STATE ==========
  const processingRequests = useRef(new Map()); // requestId -> processing
  const handshakeListenerSetup = useRef(false);
  
  // ========== REFS ==========
  const viewerInstanceRef = useRef(null);
  const sceneSetupRef = useRef(null);
  const dragControlsRef = useRef(null);
  const containerRef = useRef(null);
  const highlightMaterialRef = useRef(null);
  
  // ========== CAMERA HOOKS ==========
  const {
    camera,
    setCameraPosition,
    setCameraTarget,
    resetCamera,
    focusOn
  } = useCamera();
  
  console.log('[ViewerContext] Camera hooks initialized:', { camera: !!camera });
  
  // ========== SCENE REQUEST HANDLER WITH HANDSHAKE ==========
  
  const handleSceneRequest = useCallback(async (request) => {
    const { requestId } = request;
    
    console.log('[ViewerContext] Received scene request:', requestId);
    DebugSystem.debug('[ViewerContext]', `Received scene request: ${requestId}`);
    
    // Check if already processing this request
    if (processingRequests.current.has(requestId)) {
      console.warn('[ViewerContext] Already processing request:', requestId);
      DebugSystem.warn('[ViewerContext]', `Already processing request ${requestId}`);
      return;
    }
    
    // Mark as processing
    processingRequests.current.set(requestId, true);
    console.log('[ViewerContext] Marked request as processing:', requestId);
    
    try {
      if (isViewerReady && sceneSetupRef.current) {
        console.log('[ViewerContext] Processing scene request - viewer is ready:', requestId);
        DebugSystem.debug('[ViewerContext]', `Processing scene request ${requestId} - viewer is ready`);
        
        // Send scene reference immediately
        EventBus.emit(DataTransfer.EVENT_VIEWER_HERE_IS_SCENE, {
          success: true,
          requestId: requestId,
          payload: {
            getSceneSetup: () => sceneSetupRef.current
          }
        });
        console.log('[ViewerContext] Sent scene reference for request:', requestId);
        
        // Wait 1 second then send completion status
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Send completion status
        EventBus.emit('viewer:scene:status', {
          requestId: requestId,
          status: 'Done',
          timestamp: Date.now()
        });
        console.log('[ViewerContext] Sent completion status for request:', requestId);
        
        DebugSystem.debug('[ViewerContext]', `Scene handshake complete for ${requestId}`);
      } else {
        console.warn('[ViewerContext] Viewer not ready for request:', requestId, { isViewerReady, hasSceneSetup: !!sceneSetupRef.current });
        DebugSystem.warn('[ViewerContext]', `Viewer not ready for request ${requestId}`);
        // Send failure
        EventBus.emit(DataTransfer.EVENT_VIEWER_HERE_IS_SCENE, {
          success: false,
          requestId: requestId,
          error: 'Viewer not initialized'
        });
      }
    } catch (error) {
      console.error('[ViewerContext] Error processing scene request:', requestId, error);
      DebugSystem.error('[ViewerContext]', `Error processing scene request ${requestId}:`, error);
      EventBus.emit(DataTransfer.EVENT_VIEWER_HERE_IS_SCENE, {
        success: false,
        requestId: requestId,
        error: error.message
      });
    } finally {
      // Clear processing status
      processingRequests.current.delete(requestId);
      console.log('[ViewerContext] Cleared processing status for request:', requestId);
    }
  }, [isViewerReady]);
  
  // Set up scene request listener
  useEffect(() => {
    if (!handshakeListenerSetup.current) {
      console.log('[ViewerContext] Setting up scene request listener');
      DebugSystem.debug('[ViewerContext]', 'Setting up scene request listener');
      EventBus.on(DataTransfer.EVENT_ROBOT_NEEDS_SCENE, handleSceneRequest);
      handshakeListenerSetup.current = true;
      
      return () => {
        console.log('[ViewerContext] Cleaning up scene request listener');
        EventBus.off(DataTransfer.EVENT_ROBOT_NEEDS_SCENE, handleSceneRequest);
        handshakeListenerSetup.current = false;
        processingRequests.current.clear();
      };
    }
  }, [handleSceneRequest]);
  
  // ========== MAINTAIN COMPATIBILITY WITH EXISTING API ==========
  
  const setViewerInstance = useCallback((viewer) => {
    console.log('[ViewerContext] setViewerInstance called with:', viewer);
    if (!viewer) {
      console.error('[ViewerContext] Attempted to set null viewer instance');
      DebugSystem.error('[ViewerContext]', 'Attempted to set null viewer instance');
      return;
    }
    viewerInstanceRef.current = viewer;
    setIsViewerReady(true);
    console.log('[ViewerContext] Viewer instance set, isViewerReady set to true');
    EventBus.emit('viewer:ready', { viewer });
  }, []);
  
  const getSceneSetup = useCallback(() => {
    console.log('[ViewerContext] getSceneSetup called');
    if (!viewerInstanceRef.current && !sceneSetupRef.current) {
      console.warn('[ViewerContext] Attempted to get scene setup before viewer initialization');
      DebugSystem.warn('[ViewerContext]', 'Attempted to get scene setup before viewer initialization');
      return null;
    }
    const sceneSetup = sceneSetupRef.current || 
           viewerInstanceRef.current?.sceneRef?.current;
    console.log('[ViewerContext] getSceneSetup returning:', !!sceneSetup);
    return sceneSetup;
  }, []);
  
  const getRobotManager = useCallback(() => {
    console.warn('[ViewerContext] getRobotManager is deprecated. Use useRobotManager hook instead.');
    DebugSystem.warn('[ViewerContext]', 'getRobotManager is deprecated. Use useRobotManager hook instead.');
    if (!viewerInstanceRef.current) {
      console.warn('[ViewerContext] Attempted to get robot manager before viewer initialization');
      DebugSystem.warn('[ViewerContext]', 'Attempted to get robot manager before viewer initialization');
      return null;
    }
    return null;
  }, []);
  
  const focusOnRobot = useCallback((robotId, forceRefocus = false) => {
    console.log('[ViewerContext] focusOnRobot called:', { robotId, forceRefocus });
    if (!viewerInstanceRef.current && !sceneSetupRef.current) {
      console.warn('[ViewerContext] Attempted to focus robot before viewer initialization');
      DebugSystem.warn('[ViewerContext]', 'Attempted to focus robot before viewer initialization');
      return;
    }
    
    if (viewerInstanceRef.current?.focusOnRobot) {
      console.log('[ViewerContext] Using viewer instance focusOnRobot');
      viewerInstanceRef.current.focusOnRobot(robotId, forceRefocus);
    } else if (sceneSetupRef.current && forceRefocus) {
      console.log('[ViewerContext] Using scene setup focusOnObject');
      const robot = robotId;
      if (robot && sceneSetupRef.current.focusOnObject) {
        sceneSetupRef.current.focusOnObject(robot, 0.8);
      }
    }
  }, []);
  
  const loadRobot = useCallback(async (robotId, urdfPath, options = {}) => {
    console.log('[ViewerContext] loadRobot called:', { robotId, urdfPath, options });
    if (!viewerInstanceRef.current) {
      console.error('[ViewerContext] Viewer not initialized for robot loading');
      throw new Error('Viewer not initialized');
    }

    try {
      console.log('[ViewerContext] Loading robot via viewer instance');
      const result = await viewerInstanceRef.current.loadRobot(robotId, urdfPath, options);
      console.log('[ViewerContext] Robot loaded successfully:', robotId);
      EventBus.emit('viewer:robot-loaded', { robotId, options });
      return result;
    } catch (error) {
      console.error('[ViewerContext] Error loading robot:', robotId, error);
      DebugSystem.error('[ViewerContext]', 'Error loading robot:', error);
      EventBus.emit('viewer:robot-load-error', { robotId, error });
      throw error;
    }
  }, []);
  
  const resetJoints = useCallback((robotId) => {
    console.log('[ViewerContext] resetJoints called:', robotId);
    if (!viewerInstanceRef.current) {
      console.warn('[ViewerContext] Attempted to reset joints before viewer initialization');
      DebugSystem.warn('[ViewerContext]', 'Attempted to reset joints before viewer initialization');
      return;
    }
    if (viewerInstanceRef.current.resetJoints) {
      console.log('[ViewerContext] Resetting joints via viewer instance');
      viewerInstanceRef.current.resetJoints(robotId);
    }
    EventBus.emit('viewer:joints-reset', { robotId });
  }, []);
  
  // ========== ENHANCED SCENE INITIALIZATION ==========
  
  const initializeViewer = useCallback((container, config = {}) => {
    console.log('[ViewerContext] initializeViewer called:', { container: !!container, config });
    if (!container || containerRef.current === container) {
      console.log('[ViewerContext] Skipping initialization - no container or same container');
      return;
    }
    
    console.log('[ViewerContext] Initializing viewer');
    DebugSystem.debug('[ViewerContext]', 'Initializing viewer');
    containerRef.current = container;
    
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };
    console.log('[ViewerContext] Merged config:', mergedConfig);
    setViewerConfig(mergedConfig);
    
    try {
      console.log('[ViewerContext] Creating SceneSetup instance');
      const sceneSetup = new SceneSetup(container, {
        backgroundColor: mergedConfig.backgroundColor,
        enableShadows: mergedConfig.enableShadows,
        ambientColor: mergedConfig.ambientColor,
        upAxis: mergedConfig.upAxis // Ensure upAxis is passed to SceneSetup
      });
      sceneSetupRef.current = sceneSetup;
      console.log('[ViewerContext] SceneSetup created successfully');
      
      // CRITICAL: Set up axis to ensure robots align properly
      if (sceneSetup.setUpAxis) {
        console.log('[ViewerContext] Setting up axis to:', mergedConfig.upAxis);
        sceneSetup.setUpAxis(mergedConfig.upAxis);
        DebugSystem.debug('[ViewerContext]', `Set up axis to: ${mergedConfig.upAxis}`);
      }
      
      if (!highlightMaterialRef.current) {
        console.log('[ViewerContext] Creating highlight material');
        highlightMaterialRef.current = new THREE.MeshPhongMaterial({
          shininess: 64,
          color: new THREE.Color(mergedConfig.highlightColor),
          emissive: new THREE.Color(mergedConfig.highlightColor),
          emissiveIntensity: 0.3
        });
      }
      
      setIsViewerReady(true);
      console.log('[ViewerContext] Viewer ready state set to true');
      EventBus.emit('viewer:initialized', { sceneSetup });
      EventBus.emit('viewer:ready');
      
      console.log('[ViewerContext] Viewer initialized successfully');
      DebugSystem.debug('[ViewerContext]', 'Viewer initialized successfully');
    } catch (error) {
      console.error('[ViewerContext] Failed to initialize viewer:', error);
      DebugSystem.error('[ViewerContext]', 'Failed to initialize viewer:', error);
      setError(error.message);
      setIsViewerReady(false);
    }
  }, []);
  
  // ========== VIEWER CONFIGURATION ==========
  
  const updateViewerConfig = useCallback((updates) => {
    console.log('[ViewerContext] updateViewerConfig called:', updates);
    setViewerConfig(prev => {
      const newConfig = { ...prev, ...updates };
      console.log('[ViewerContext] Updated config:', newConfig);
      
      if (sceneSetupRef.current) {
        const sceneSetup = sceneSetupRef.current;
        
        if (updates.backgroundColor) {
          console.log('[ViewerContext] Updating background color:', updates.backgroundColor);
          sceneSetup.scene.background = new THREE.Color(updates.backgroundColor);
        }
        
        if (updates.ambientColor) {
          console.log('[ViewerContext] Updating ambient color:', updates.ambientColor);
          sceneSetup.ambientLight.color = new THREE.Color(updates.ambientColor);
        }
        
        if (updates.upAxis) {
          console.log('[ViewerContext] Updating up axis:', updates.upAxis);
          sceneSetup.setUpAxis(updates.upAxis);
        }
        
        if (updates.enableShadows !== undefined) {
          console.log('[ViewerContext] Updating shadow settings:', updates.enableShadows);
          sceneSetup.renderer.shadowMap.enabled = updates.enableShadows;
        }
      }
      
      if (updates.highlightColor && highlightMaterialRef.current) {
        console.log('[ViewerContext] Updating highlight color:', updates.highlightColor);
        const color = new THREE.Color(updates.highlightColor);
        highlightMaterialRef.current.color = color;
        highlightMaterialRef.current.emissive = color;
      }
      
      return newConfig;
    });
    
    EventBus.emit('viewer:config-updated', updates);
  }, []);
  
  // ========== DRAG CONTROLS ==========
  
  const setupDragControls = useCallback(() => {
    console.log('[ViewerContext] setupDragControls called');
    if (!sceneSetupRef.current || dragControlsRef.current) {
      console.log('[ViewerContext] Drag controls setup skipped - no scene or already exists');
      return;
    }
    
    console.log('[ViewerContext] Setting up drag controls');
    DebugSystem.debug('[ViewerContext]', 'Setting up drag controls');
    
    const scene = sceneSetupRef.current;
    const highlightMaterial = highlightMaterialRef.current;
    
    const isJoint = (j) => j.isURDFJoint && j.jointType !== 'fixed';
    
    const highlightLinkGeometry = (joint, revert) => {
      if (!joint) return;
      
      const traverse = (obj) => {
        if (!obj) return;
        
        if (obj.type === 'Mesh') {
          if (revert) {
            if (obj.originalMaterial) {
              obj.material = obj.originalMaterial;
              delete obj.originalMaterial;
            }
          } else {
            if (!obj.originalMaterial) {
              obj.originalMaterial = obj.material;
            }
            obj.material = highlightMaterial;
          }
        }
        
        if (obj === joint) return;
        
        obj.children?.forEach(traverse);
      };
      
      traverse(joint);
    };
    
    console.log('[ViewerContext] Creating PointerURDFDragControls');
    const dragControls = new PointerURDFDragControls(
      scene.scene,
      scene.camera,
      scene.renderer.domElement,
      scene.controls
    );
    
    dragControls.onDragStart = (joint) => {
      console.log('[ViewerContext] Drag start:', joint);
      EventBus.emit('viewer:drag-start', { joint });
    };
    
    dragControls.onDragEnd = (joint) => {
      console.log('[ViewerContext] Drag end:', joint);
      EventBus.emit('viewer:drag-end', { joint });
    };
    
    dragControls.updateJoint = (joint, angle) => {
      console.log('[ViewerContext] Updating joint:', joint, 'angle:', angle);
      if (joint.setJointValue) {
        joint.setJointValue(angle);
      }
    };
    
    dragControls.onHover = (joint) => {
      console.log('[ViewerContext] Joint hover:', joint);
      if (joint && isJoint(joint)) {
        highlightLinkGeometry(joint.parent, false);
      }
    };
    
    dragControls.onUnhover = (joint) => {
      console.log('[ViewerContext] Joint unhover:', joint);
      if (joint && isJoint(joint)) {
        highlightLinkGeometry(joint.parent, true);
      }
    };
    
    dragControlsRef.current = dragControls;
    setDragControlsEnabled(true);
    console.log('[ViewerContext] Drag controls setup complete');
  }, []);
  
  const toggleDragControls = useCallback((enabled) => {
    console.log('[ViewerContext] toggleDragControls called:', enabled);
    if (!dragControlsRef.current) {
      console.log('[ViewerContext] No drag controls, setting up first');
      setupDragControls();
      return;
    }
    
    if (enabled !== undefined) {
      console.log('[ViewerContext] Setting drag controls enabled to:', enabled);
      dragControlsRef.current.enabled = enabled;
      setDragControlsEnabled(enabled);
    } else {
      const newState = !dragControlsRef.current.enabled;
      console.log('[ViewerContext] Toggling drag controls to:', newState);
      dragControlsRef.current.enabled = newState;
      setDragControlsEnabled(newState);
    }
  }, [setupDragControls]);
  
  // ========== TABLE MANAGEMENT ==========
  
  const loadTable = useCallback(async () => {
    console.log('[ViewerContext] loadTable called');
    if (!sceneSetupRef.current || tableState.loaded) {
      console.log('[ViewerContext] Table load skipped - no scene or already loaded');
      return;
    }
    
    try {
      console.log('[ViewerContext] Loading table...');
      setIsLoading(true);
      const tableModel = await sceneSetupRef.current.loadTable();
      if (tableModel) {
        console.log('[ViewerContext] Table loaded successfully');
        setTableState({ loaded: true, visible: true });
        EventBus.emit('viewer:table-loaded');
      }
    } catch (error) {
      console.error('[ViewerContext] Failed to load table:', error);
      DebugSystem.error('[ViewerContext]', 'Failed to load table:', error);
      setError(error.message);
    } finally {
      setIsLoading(false);
      console.log('[ViewerContext] Table loading finished');
    }
  }, [tableState.loaded]);
  
  const toggleTable = useCallback((visible) => {
    console.log('[ViewerContext] toggleTable called:', visible);
    if (!sceneSetupRef.current || !tableState.loaded) {
      console.log('[ViewerContext] Table toggle skipped - no scene or not loaded');
      return;
    }
    
    const newVisibility = visible !== undefined ? visible : !tableState.visible;
    console.log('[ViewerContext] Setting table visibility to:', newVisibility);
    sceneSetupRef.current.toggleTable(newVisibility);
    setTableState(prev => ({ ...prev, visible: newVisibility }));
    EventBus.emit('viewer:table-toggled', { visible: newVisibility });
  }, [tableState]);
  
  // ========== CLEANUP ==========
  
  const dispose = useCallback(() => {
    console.log('[ViewerContext] dispose called');
    DebugSystem.debug('[ViewerContext]', 'Disposing viewer');
    
    if (dragControlsRef.current) {
      console.log('[ViewerContext] Disposing drag controls');
      dragControlsRef.current.dispose();
      dragControlsRef.current = null;
    }
    
    if (sceneSetupRef.current) {
      console.log('[ViewerContext] Disposing scene setup');
      sceneSetupRef.current.dispose();
      sceneSetupRef.current = null;
    }
    
    if (viewerInstanceRef.current) {
      console.log('[ViewerContext] Clearing viewer instance');
      viewerInstanceRef.current = null;
    }
    
    setIsViewerReady(false);
    setTableState({ loaded: false, visible: false });
    console.log('[ViewerContext] Viewer disposed successfully');
    EventBus.emit('viewer:disposed');
  }, []);
  
  // ========== CONTEXT VALUE ==========
  
  const value = useMemo(() => {
    console.log('[ViewerContext] Creating context value');
    return {
      // State
      isViewerReady,
      viewerConfig,
      dragControlsEnabled,
      tableState,
      isLoading,
      error,
      
      // Refs
      getSceneSetup,
      getRobotManager,
      
      // Core methods
      setViewerInstance,
      initializeViewer,
      dispose,
      
      // Robot methods
      loadRobot,
      focusOnRobot,
      resetJoints,
      
      // Configuration
      updateViewerConfig,
      
      // Controls
      setupDragControls,
      toggleDragControls,
      
      // Table
      loadTable,
      toggleTable,
      
      // Camera
      camera,
      setCameraPosition,
      setCameraTarget,
      resetCamera,
      focusOn
    };
  }, [
    isViewerReady,
    viewerConfig,
    dragControlsEnabled,
    tableState,
    isLoading,
    error,
    getSceneSetup,
    getRobotManager,
    setViewerInstance,
    initializeViewer,
    dispose,
    loadRobot,
    focusOnRobot,
    resetJoints,
    updateViewerConfig,
    setupDragControls,
    toggleDragControls,
    loadTable,
    toggleTable,
    camera,
    setCameraPosition,
    setCameraTarget,
    resetCamera,
    focusOn
  ]);
  
  console.log('[ViewerContext] Rendering ViewerProvider');
  return (
    <ViewerContext.Provider value={value}>
      {children}
    </ViewerContext.Provider>
  );
};

export const useViewer = () => {
  console.log('[ViewerContext] useViewer hook called');
  const context = useContext(ViewerContext);
  if (!context) {
    console.error('[ViewerContext] useViewer must be used within ViewerProvider');
    throw new Error('useViewer must be used within ViewerProvider');
  }
  console.log('[ViewerContext] useViewer returning context');
  return context;
};

export default ViewerContext;