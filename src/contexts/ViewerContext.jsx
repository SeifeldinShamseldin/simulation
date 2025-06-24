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
  const [processingRequests] = useState(new Map()); // requestId -> processing
  const [requestTimeouts] = useState(new Map()); // requestId -> timeoutId
  
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
  
  // ========== MAINTAIN COMPATIBILITY WITH EXISTING API ==========
  
  const setViewerInstance = useCallback((viewer) => {
    if (!viewer) {
      console.error('[ViewerContext] Attempted to set null viewer instance');
      return;
    }
    viewerInstanceRef.current = viewer;
    setIsViewerReady(true);
    EventBus.emit('viewer:ready', { viewer });
  }, []);
  
  const getSceneSetup = useCallback(() => {
    if (!viewerInstanceRef.current && !sceneSetupRef.current) {
      console.warn('[ViewerContext] Attempted to get scene setup before viewer initialization');
      return null;
    }
    return sceneSetupRef.current || 
           viewerInstanceRef.current?.sceneRef?.current;
  }, []);
  
  const getRobotManager = useCallback(() => {
    console.warn('[ViewerContext] getRobotManager is deprecated. Use useRobotManager hook instead.');
    if (!viewerInstanceRef.current) {
      console.warn('[ViewerContext] Attempted to get robot manager before viewer initialization');
      return null;
    }
    return null;
  }, []);
  
  const focusOnRobot = useCallback((robotId, forceRefocus = false) => {
    if (!viewerInstanceRef.current && !sceneSetupRef.current) {
      console.warn('[ViewerContext] Attempted to focus robot before viewer initialization');
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
      console.error('[ViewerContext] Error loading robot:', error);
      EventBus.emit('viewer:robot-load-error', { robotId, error });
      throw error;
    }
  }, []);
  
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
  
  // ========== ENHANCED SCENE INITIALIZATION ==========
  
  const initializeViewer = useCallback((container, config = {}) => {
    if (!container || containerRef.current === container) {
      return;
    }
    
    console.log('[ViewerContext] Initializing viewer');
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
      
      console.log('[ViewerContext] Viewer initialized successfully');
    } catch (error) {
      console.error('[ViewerContext] Failed to initialize viewer:', error);
      setError(error.message);
      setIsViewerReady(false);
    }
  }, []);
  
  // ========== SCENE REQUEST HANDLER WITH HANDSHAKE ==========
  
  useEffect(() => {
    const handleSceneRequest = async (request) => {
      const { requestId } = request;
      
      // Check if already processing this request
      if (processingRequests.has(requestId)) {
        console.warn(`[ViewerContext] Already processing request ${requestId}`);
        return;
      }
      
      // Mark as processing
      processingRequests.set(requestId, true);
      
      try {
        if (isViewerReady && sceneSetupRef.current) {
          console.log(`[ViewerContext] Processing scene request ${requestId}`);
          
          // Send scene reference
          EventBus.emit(DataTransfer.EVENT_VIEWER_HERE_IS_SCENE, {
            success: true,
            requestId: requestId,
            payload: {
              getSceneSetup: () => sceneSetupRef.current
            }
          });
          
          // Wait 1 second (like TCP pattern)
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Send completion status
          EventBus.emit('viewer:scene:status', {
            requestId: requestId,
            status: 'Done',
            timestamp: Date.now()
          });
          
          console.log(`[ViewerContext] Scene handshake complete for ${requestId}`);
        } else {
          // Send failure
          EventBus.emit(DataTransfer.EVENT_VIEWER_HERE_IS_SCENE, {
            success: false,
            requestId: requestId,
            error: 'Viewer not initialized'
          });
        }
      } catch (error) {
        console.error(`[ViewerContext] Error processing scene request ${requestId}:`, error);
        EventBus.emit(DataTransfer.EVENT_VIEWER_HERE_IS_SCENE, {
          success: false,
          requestId: requestId,
          error: error.message
        });
      } finally {
        // Clear processing status
        processingRequests.delete(requestId);
      }
    };
    
    EventBus.on(DataTransfer.EVENT_ROBOT_NEEDS_SCENE, handleSceneRequest);
    
    return () => {
      EventBus.off(DataTransfer.EVENT_ROBOT_NEEDS_SCENE, handleSceneRequest);
      
      // Clear all pending requests
      processingRequests.clear();
      requestTimeouts.forEach(timeout => clearTimeout(timeout));
      requestTimeouts.clear();
    };
  }, [isViewerReady, processingRequests, requestTimeouts]);
  
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
    
    console.log('[ViewerContext] Setting up drag controls');
    
    const scene = sceneSetupRef.current;
    const highlightMaterial = highlightMaterialRef.current;
    
    const isJoint = (j) => j.isURDFJoint && j.jointType !== 'fixed';
    
    const highlightLinkGeometry = (joint, revert) => {
      if (!joint) return;
      
      const traverse = (obj) => {
        if (!obj) return;
        
        if (obj.type === 'Mesh') {
          if (revert) {
            if (obj.__origMaterial) {
              obj.material = obj.__origMaterial;
              delete obj.__origMaterial;
            }
          } else {
            obj.__origMaterial = obj.material;
            obj.material = highlightMaterial;
          }
        }
        
        if (!obj.children) return;
        
        if (obj === joint || !isJoint(obj)) {
          for (let i = 0; i < obj.children.length; i++) {
            const child = obj.children[i];
            if (child && !child.isURDFCollider) {
              traverse(child);
            }
          }
        }
      };
      
      traverse(joint);
    };
    
    const dragControls = new PointerURDFDragControls(
      scene.scene,
      scene.camera,
      scene.renderer.domElement
    );
    
    dragControls.onDragStart = (joint) => {
      console.log('[ViewerContext] Drag start:', joint.name);
      scene.controls.enabled = false;
      EventBus.emit('viewer:drag-start', { joint });
    };
    
    dragControls.onDragEnd = (joint) => {
      console.log('[ViewerContext] Drag end:', joint.name);
      scene.controls.enabled = true;
      EventBus.emit('viewer:drag-end', { joint });
    };
    
    dragControls.onHover = (joint) => {
      highlightLinkGeometry(joint, false);
      EventBus.emit('viewer:joint-hover', { joint });
    };
    
    dragControls.onUnhover = (joint) => {
      highlightLinkGeometry(joint, true);
      EventBus.emit('viewer:joint-unhover', { joint });
    };
    
    dragControlsRef.current = dragControls;
    setDragControlsEnabled(true);
  }, []);
  
  const disposeDragControls = useCallback(() => {
    if (dragControlsRef.current) {
      dragControlsRef.current.dispose();
      dragControlsRef.current = null;
      setDragControlsEnabled(false);
      console.log('[ViewerContext] Disposed drag controls');
    }
  }, []);
  
  const setDragControls = useCallback((enabled) => {
    if (enabled) {
      setupDragControls();
    } else {
      disposeDragControls();
    }
  }, [setupDragControls, disposeDragControls]);
  
  // ========== TABLE MANAGEMENT ==========
  
  const loadTable = useCallback(async () => {
    if (!sceneSetupRef.current || tableState.loaded) return false;
    
    try {
      setIsLoading(true);
      await sceneSetupRef.current.loadTable();
      setTableState({ loaded: true, visible: true });
      EventBus.emit('viewer:table-loaded');
      return true;
    } catch (error) {
      console.error('[ViewerContext] Error loading table:', error);
      setError('Failed to load table');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [tableState.loaded]);
  
  const toggleTable = useCallback((visible) => {
    if (!sceneSetupRef.current || !tableState.loaded) return;
    
    sceneSetupRef.current.setTableVisible(visible);
    setTableState(prev => ({ ...prev, visible }));
    EventBus.emit('viewer:table-toggled', { visible });
  }, [tableState.loaded]);
  
  // ========== RESIZE HANDLING ==========
  
  const handleResize = useCallback(() => {
    if (!containerRef.current || !sceneSetupRef.current) return;
    
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    
    if (sceneSetupRef.current.camera) {
      sceneSetupRef.current.camera.aspect = width / height;
      sceneSetupRef.current.camera.updateProjectionMatrix();
    }
    
    if (sceneSetupRef.current.renderer) {
      sceneSetupRef.current.renderer.setSize(width, height);
    }
    
    EventBus.emit('viewer:resized', { width, height });
  }, []);
  
  // ========== UTILITY METHODS ==========
  
  const getScene = useCallback(() => sceneSetupRef.current?.scene, []);
  const getCamera = useCallback(() => sceneSetupRef.current?.camera, []);
  const getRenderer = useCallback(() => sceneSetupRef.current?.renderer, []);
  const getControls = useCallback(() => sceneSetupRef.current?.controls, []);
  const getRobotRoot = useCallback(() => sceneSetupRef.current?.robotRoot, []);
  
  const render = useCallback(() => {
    if (!sceneSetupRef.current) return;
    
    const { renderer, scene, camera } = sceneSetupRef.current;
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  }, []);
  
  // ========== CLEANUP ==========
  
  const dispose = useCallback(() => {
    console.log('[ViewerContext] Disposing viewer');
    
    disposeDragControls();
    
    if (sceneSetupRef.current) {
      sceneSetupRef.current.dispose();
      sceneSetupRef.current = null;
    }
    
    containerRef.current = null;
    viewerInstanceRef.current = null;
    setIsViewerReady(false);
    setTableState({ loaded: false, visible: false });
    
    EventBus.emit('viewer:disposed');
  }, [disposeDragControls]);
  
  // ========== ERROR HANDLING ==========
  
  const clearError = useCallback(() => setError(null), []);
  
  // ========== EFFECTS ==========
  
  useEffect(() => {
    if (isViewerReady) {
      window.addEventListener('resize', handleResize);
      handleResize();
      
      return () => {
        window.removeEventListener('resize', handleResize);
      };
    }
  }, [isViewerReady, handleResize]);
  
  useEffect(() => {
    return () => {
      dispose();
    };
  }, [dispose]);
  
  // ========== CONTEXT VALUE ==========
  
  const value = useMemo(() => ({
    // Existing API (for compatibility)
    isViewerReady,
    setViewerInstance,
    getSceneSetup,
    getRobotManager,
    focusOnRobot,
    loadRobot,
    resetJoints,
    viewerInstance: viewerInstanceRef.current,
    
    // Enhanced API
    viewerConfig,
    dragControlsEnabled,
    tableState,
    isLoading,
    error,
    initializeViewer,
    dispose,
    
    // Scene Management
    updateViewerConfig,
    render,
    handleResize,
    
    // Drag Controls
    setDragControls,
    setupDragControls,
    disposeDragControls,
    
    // Table Management
    loadTable,
    toggleTable,
    isTableLoaded: tableState.loaded,
    isTableVisible: tableState.visible,
    
    // Camera Controls
    focusOn,
    setCameraPosition,
    setCameraTarget,
    resetCamera,
    
    // Getters
    getScene,
    getCamera,
    getRenderer,
    getControls,
    getRobotRoot,
    
    // Error Handling
    clearError
  }), [
    isViewerReady,
    setViewerInstance,
    getSceneSetup,
    getRobotManager,
    focusOnRobot,
    loadRobot,
    resetJoints,
    viewerConfig,
    dragControlsEnabled,
    tableState,
    isLoading,
    error,
    initializeViewer,
    dispose,
    updateViewerConfig,
    render,
    handleResize,
    setDragControls,
    setupDragControls,
    disposeDragControls,
    loadTable,
    toggleTable,
    focusOn,
    setCameraPosition,
    setCameraTarget,
    resetCamera,
    getScene,
    getCamera,
    getRenderer,
    getControls,
    getRobotRoot,
    clearError
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