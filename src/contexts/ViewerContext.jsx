// src/contexts/ViewerContext.jsx
import React, { createContext, useContext, useRef, useState, useCallback, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import SceneSetup from '../core/Scene/SceneSetup';
import { PointerURDFDragControls } from '../core/Loader/URDFControls';
import EventBus from '../utils/EventBus';
import useCamera from './hooks/useCamera';
import * as DataTransfer from './dataTransfer';

const ViewerContext = createContext(null);

const DEFAULT_CONFIG = {
  backgroundColor: '#f5f5f5',
  enableShadows: true,
  ambientColor: '#8ea0a8',
  upAxis: '+Z',
  highlightColor: '#ff0000'
};

export const ViewerProvider = ({ children }) => {
  // ========== STATE ==========
  const [isViewerReady, setIsViewerReady] = useState(false);
  const [viewerConfig, setViewerConfig] = useState(DEFAULT_CONFIG);
  const [dragControlsEnabled, setDragControlsEnabled] = useState(false);
  const [tableState, setTableState] = useState({ loaded: false, visible: false });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
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
  
  // ========== SCENE REQUEST HANDLER WITH HANDSHAKE ==========
  
  const handleSceneRequest = useCallback(async (request) => {
    const { requestId } = request;
    
    console.log('[ViewerContext]', `Received scene request: ${requestId}`);
    
    // Check if already processing this request
    if (processingRequests.current.has(requestId)) {
      console.warn('[ViewerContext]', `Already processing request ${requestId}`);
      return;
    }
    
    // Mark as processing
    processingRequests.current.set(requestId, true);
    
    try {
      if (isViewerReady && sceneSetupRef.current) {
        console.log('[ViewerContext]', `Processing scene request ${requestId} - viewer is ready`);
        
        // Send scene reference immediately
        EventBus.emit(DataTransfer.EVENT_VIEWER_HERE_IS_SCENE, {
          success: true,
          requestId: requestId,
          payload: {
            getSceneSetup: () => sceneSetupRef.current
          }
        });
        
        // Wait 1 second then send completion status
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Send completion status
        EventBus.emit('viewer:scene:status', {
          requestId: requestId,
          status: 'Done',
          timestamp: Date.now()
        });
        
        console.log('[ViewerContext]', `Scene handshake complete for ${requestId}`);
      } else {
        console.warn('[ViewerContext]', `Viewer not ready for request ${requestId}`);
        // Send failure
        EventBus.emit(DataTransfer.EVENT_VIEWER_HERE_IS_SCENE, {
          success: false,
          requestId: requestId,
          error: 'Viewer not initialized'
        });
      }
    } catch (error) {
      console.error('[ViewerContext]', `Error processing scene request ${requestId}:`, error);
      EventBus.emit(DataTransfer.EVENT_VIEWER_HERE_IS_SCENE, {
        success: false,
        requestId: requestId,
        error: error.message
      });
    } finally {
      // Clear processing status
      processingRequests.current.delete(requestId);
    }
  }, [isViewerReady]);
  
  // Set up scene request listener
  useEffect(() => {
    if (!handshakeListenerSetup.current) {
      console.log('[ViewerContext]', 'Setting up scene request listener');
      EventBus.on(DataTransfer.EVENT_ROBOT_NEEDS_SCENE, handleSceneRequest);
      handshakeListenerSetup.current = true;
      
      return () => {
        EventBus.off(DataTransfer.EVENT_ROBOT_NEEDS_SCENE, handleSceneRequest);
        handshakeListenerSetup.current = false;
        processingRequests.current.clear();
      };
    }
  }, [handleSceneRequest]);
  
  // ========== MAINTAIN COMPATIBILITY WITH EXISTING API ==========
  
  const setViewerInstance = useCallback((viewer) => {
    if (!viewer) {
      console.error('[ViewerContext]', 'Attempted to set null viewer instance');
      return;
    }
    viewerInstanceRef.current = viewer;
    setIsViewerReady(true);
    EventBus.emit('viewer:ready', { viewer });
  }, []);
  
  const getSceneSetup = useCallback(() => {
    if (!viewerInstanceRef.current && !sceneSetupRef.current) {
      console.warn('[ViewerContext]', 'Attempted to get scene setup before viewer initialization');
      return null;
    }
    return sceneSetupRef.current || 
           viewerInstanceRef.current?.sceneRef?.current;
  }, []);
  
  const getRobotManager = useCallback(() => {
    console.warn('[ViewerContext]', 'getRobotManager is deprecated. Use useRobotManager hook instead.');
    if (!viewerInstanceRef.current) {
      console.warn('[ViewerContext]', 'Attempted to get robot manager before viewer initialization');
      return null;
    }
    return null;
  }, []);
  
  const focusOnRobot = useCallback((robotId, forceRefocus = false) => {
    if (!viewerInstanceRef.current && !sceneSetupRef.current) {
      console.warn('[ViewerContext]', 'Attempted to focus robot before viewer initialization');
      return;
    }
    
    if (viewerInstanceRef.current?.focusOnRobot) {
      viewerInstanceRef.current.focusOnRobot(robotId, forceRefocus);
    } else if (sceneSetupRef.current && forceRefocus) {
      const robot = robotId;
      if (robot && sceneSetupRef.current.focusOnObject) {
        sceneSetupRef.current.focusOnObject(robot, 0.8);
      }
    }
  }, []);
  
  const loadRobot = useCallback(async (robotId, urdfPath, options = {}) => {
    if (!viewerInstanceRef.current) {
      throw new Error('Viewer not initialized');
    }

    try {
      const result = await viewerInstanceRef.current.loadRobot(robotId, urdfPath, options);
      EventBus.emit('viewer:robot-loaded', { robotId, options });
      return result;
    } catch (error) {
      console.error('[ViewerContext]', 'Error loading robot:', error);
      EventBus.emit('viewer:robot-load-error', { robotId, error });
      throw error;
    }
  }, []);
  
  const resetJoints = useCallback((robotId) => {
    if (!viewerInstanceRef.current) {
      console.warn('[ViewerContext]', 'Attempted to reset joints before viewer initialization');
      return;
    }
    if (viewerInstanceRef.current.resetJoints) {
      viewerInstanceRef.current.resetJoints(robotId);
    }
    EventBus.emit('viewer:joints-reset', { robotId });
  }, []);
  
  // ========== ENHANCED SCENE INITIALIZATION ==========
  
  const initializeViewer = useCallback((container, config = {}) => {
    if (!container || containerRef.current === container) {
      return;
    }
    
    console.log('[ViewerContext]', 'Initializing viewer');
    containerRef.current = container;
    
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };
    setViewerConfig(mergedConfig);
    
    try {
      const sceneSetup = new SceneSetup(container, mergedConfig);
      sceneSetupRef.current = sceneSetup;
      
      if (!highlightMaterialRef.current) {
        highlightMaterialRef.current = new THREE.MeshPhongMaterial({
          shininess: 64,
          color: new THREE.Color(mergedConfig.highlightColor),
          emissive: new THREE.Color(mergedConfig.highlightColor),
          emissiveIntensity: 0.3
        });
      }
      
      setIsViewerReady(true);
      EventBus.emit('viewer:initialized', { sceneSetup });
      EventBus.emit('viewer:ready');
      
      console.log('[ViewerContext]', 'Viewer initialized successfully');
    } catch (error) {
      console.error('[ViewerContext]', 'Failed to initialize viewer:', error);
      setError(error.message);
      setIsViewerReady(false);
    }
  }, []);
  
  // ========== VIEWER CONFIGURATION ==========
  
  const updateViewerConfig = useCallback((updates) => {
    setViewerConfig(prev => {
      const newConfig = { ...prev, ...updates };
      
      if (sceneSetupRef.current) {
        const sceneSetup = sceneSetupRef.current;
        
        if (updates.backgroundColor) {
          sceneSetup.scene.background = new THREE.Color(updates.backgroundColor);
        }
        
        if (updates.ambientColor) {
          sceneSetup.ambientLight.color = new THREE.Color(updates.ambientColor);
        }
        
        if (updates.upAxis) {
          sceneSetup.setUpAxis(updates.upAxis);
        }
        
        if (updates.enableShadows !== undefined) {
          sceneSetup.renderer.shadowMap.enabled = updates.enableShadows;
        }
      }
      
      if (updates.highlightColor && highlightMaterialRef.current) {
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
    if (!sceneSetupRef.current || dragControlsRef.current) return;
    
    console.log('[ViewerContext]', 'Setting up drag controls');
    
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
    
    const dragControls = new PointerURDFDragControls(
      scene.scene,
      scene.camera,
      scene.renderer.domElement,
      scene.controls
    );
    
    dragControls.onDragStart = (joint) => {
      EventBus.emit('viewer:drag-start', { joint });
    };
    
    dragControls.onDragEnd = (joint) => {
      EventBus.emit('viewer:drag-end', { joint });
    };
    
    dragControls.updateJoint = (joint, angle) => {
      if (joint.setJointValue) {
        joint.setJointValue(angle);
      }
    };
    
    dragControls.onHover = (joint) => {
      if (joint && isJoint(joint)) {
        highlightLinkGeometry(joint.parent, false);
      }
    };
    
    dragControls.onUnhover = (joint) => {
      if (joint && isJoint(joint)) {
        highlightLinkGeometry(joint.parent, true);
      }
    };
    
    dragControlsRef.current = dragControls;
    setDragControlsEnabled(true);
  }, []);
  
  const toggleDragControls = useCallback((enabled) => {
    if (!dragControlsRef.current) {
      setupDragControls();
      return;
    }
    
    if (enabled !== undefined) {
      dragControlsRef.current.enabled = enabled;
      setDragControlsEnabled(enabled);
    } else {
      dragControlsRef.current.enabled = !dragControlsRef.current.enabled;
      setDragControlsEnabled(dragControlsRef.current.enabled);
    }
  }, [setupDragControls]);
  
  // ========== TABLE MANAGEMENT ==========
  
  const loadTable = useCallback(async () => {
    if (!sceneSetupRef.current || tableState.loaded) return;
    
    try {
      setIsLoading(true);
      const tableModel = await sceneSetupRef.current.loadTable();
      if (tableModel) {
        setTableState({ loaded: true, visible: true });
        EventBus.emit('viewer:table-loaded');
      }
    } catch (error) {
      console.error('[ViewerContext]', 'Failed to load table:', error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  }, [tableState.loaded]);
  
  const toggleTable = useCallback((visible) => {
    if (!sceneSetupRef.current || !tableState.loaded) return;
    
    const newVisibility = visible !== undefined ? visible : !tableState.visible;
    sceneSetupRef.current.toggleTable(newVisibility);
    setTableState(prev => ({ ...prev, visible: newVisibility }));
    EventBus.emit('viewer:table-toggled', { visible: newVisibility });
  }, [tableState]);
  
  // ========== CLEANUP ==========
  
  const dispose = useCallback(() => {
    console.log('[ViewerContext]', 'Disposing viewer');
    
    if (dragControlsRef.current) {
      dragControlsRef.current.dispose();
      dragControlsRef.current = null;
    }
    
    if (sceneSetupRef.current) {
      sceneSetupRef.current.dispose();
      sceneSetupRef.current = null;
    }
    
    if (viewerInstanceRef.current) {
      viewerInstanceRef.current = null;
    }
    
    setIsViewerReady(false);
    setTableState({ loaded: false, visible: false });
    EventBus.emit('viewer:disposed');
  }, []);
  
  // ========== CONTEXT VALUE ==========
  
  const value = useMemo(() => ({
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
  }), [
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