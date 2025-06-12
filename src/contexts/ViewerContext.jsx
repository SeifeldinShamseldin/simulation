// src/contexts/ViewerContext.jsx - ENHANCED VIEWER CONTEXT (Fixed exports)
import React, { createContext, useContext, useRef, useState, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import SceneSetup from '../core/Scene/SceneSetup';
import { PointerURDFDragControls } from '../core/Loader/URDFControls';
import EventBus from '../utils/EventBus';

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
  
  // ========== REFS ==========
  const viewerInstanceRef = useRef(null);
  const sceneSetupRef = useRef(null);
  const dragControlsRef = useRef(null);
  const containerRef = useRef(null);
  const highlightMaterialRef = useRef(null);
  
  // ========== MAINTAIN COMPATIBILITY WITH EXISTING API ==========
  
  // Store viewer instance (for compatibility)
  const setViewerInstance = useCallback((viewer) => {
    if (!viewer) {
      console.error('[ViewerContext] Attempted to set null viewer instance');
      return;
    }
    viewerInstanceRef.current = viewer;
    setIsViewerReady(true);
    EventBus.emit('viewer:ready', { viewer });
  }, []);
  
  // Get scene setup (existing API)
  const getSceneSetup = useCallback(() => {
    if (!viewerInstanceRef.current && !sceneSetupRef.current) {
      console.warn('[ViewerContext] Attempted to get scene setup before viewer initialization');
      return null;
    }
    return sceneSetupRef.current || 
           viewerInstanceRef.current?.getSceneSetup?.() || 
           viewerInstanceRef.current?.sceneRef?.current;
  }, []);
  
  // Get robot manager - DEPRECATED (existing API)
  const getRobotManager = useCallback(() => {
    console.warn('[ViewerContext] getRobotManager is deprecated. Use useRobotManager hook instead.');
    if (!viewerInstanceRef.current) {
      console.warn('[ViewerContext] Attempted to get robot manager before viewer initialization');
      return null;
    }
    return viewerInstanceRef.current?.robotLoaderRef?.current;
  }, []);
  
  // Focus on robot
  const focusOnRobot = useCallback((robotId, forceRefocus = false) => {
    if (!viewerInstanceRef.current && !sceneSetupRef.current) {
      console.warn('[ViewerContext] Attempted to focus robot before viewer initialization');
      return;
    }
    
    // Use viewer's focusOnRobot method if available
    if (viewerInstanceRef.current?.focusOnRobot) {
      viewerInstanceRef.current.focusOnRobot(robotId, forceRefocus);
    } else if (sceneSetupRef.current && forceRefocus) {
      // Use scene setup's focus method
      const robot = robotId; // Assuming robotId might be the robot object itself
      if (robot && sceneSetupRef.current.focusOnObject) {
        sceneSetupRef.current.focusOnObject(robot, 0.8);
      }
    }
  }, []);
  
  // Load robot (existing API)
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
  
  // Reset joints (existing API)
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
    if (!container || sceneSetupRef.current) return;
    
    console.log('[ViewerContext] Initializing viewer');
    containerRef.current = container;
    
    const mergedConfig = { ...DEFAULT_CONFIG, ...viewerConfig, ...config };
    
    // Create scene setup
    const sceneSetup = new SceneSetup({
      container,
      backgroundColor: mergedConfig.backgroundColor,
      enableShadows: mergedConfig.enableShadows,
      ambientColor: mergedConfig.ambientColor
    });
    
    // Configure camera
    if (sceneSetup.camera) {
      sceneSetup.camera.fov = 50;
      sceneSetup.camera.near = 0.01;
      sceneSetup.camera.far = 1000;
      sceneSetup.camera.updateProjectionMatrix();
    }
    
    // Set up axis
    sceneSetup.setUpAxis(mergedConfig.upAxis);
    
    sceneSetupRef.current = sceneSetup;
    setViewerConfig(mergedConfig);
    setIsViewerReady(true);
    
    // Create highlight material for drag controls
    highlightMaterialRef.current = new THREE.MeshPhongMaterial({
      shininess: 10,
      color: new THREE.Color(mergedConfig.highlightColor),
      emissive: new THREE.Color(mergedConfig.highlightColor),
      emissiveIntensity: 0.25,
    });
    
    EventBus.emit('viewer:initialized', { sceneSetup });
    
    return sceneSetup;
  }, [viewerConfig]);
  
  // ========== SCENE MANAGEMENT ==========
  const updateViewerConfig = useCallback((updates) => {
    const newConfig = { ...viewerConfig, ...updates };
    setViewerConfig(newConfig);
    
    if (sceneSetupRef.current) {
      // Apply updates to existing scene
      if (updates.backgroundColor !== undefined) {
        sceneSetupRef.current.setBackgroundColor(updates.backgroundColor);
      }
      if (updates.upAxis !== undefined) {
        sceneSetupRef.current.setUpAxis(updates.upAxis);
      }
      if (updates.enableShadows !== undefined) {
        sceneSetupRef.current.setShadows(updates.enableShadows);
      }
      if (updates.highlightColor !== undefined && highlightMaterialRef.current) {
        const color = new THREE.Color(updates.highlightColor);
        highlightMaterialRef.current.color = color;
        highlightMaterialRef.current.emissive = color;
      }
    }
    
    EventBus.emit('viewer:config-updated', newConfig);
  }, [viewerConfig]);
  
  // ========== DRAG CONTROLS ==========
  const setupDragControls = useCallback(() => {
    if (!sceneSetupRef.current || dragControlsRef.current) return;
    
    console.log('[ViewerContext] Setting up drag controls');
    
    const scene = sceneSetupRef.current;
    const highlightMaterial = highlightMaterialRef.current;
    
    // Helper functions
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
    
    // Create drag controls
    const dragControls = new PointerURDFDragControls(
      scene.scene,
      scene.camera,
      scene.renderer.domElement
    );
    
    // Set up event handlers
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
  
  // ========== CAMERA CONTROLS ==========
  const focusOnObject = useCallback((object, paddingMultiplier = 1.0) => {
    if (!sceneSetupRef.current || !object) return;
    
    sceneSetupRef.current.focusOnObject(object, paddingMultiplier);
    EventBus.emit('viewer:camera-focused', { object });
  }, []);
  
  const setCameraPosition = useCallback((position) => {
    if (!sceneSetupRef.current) return;
    
    sceneSetupRef.current.camera.position.set(position.x, position.y, position.z);
    if (sceneSetupRef.current.controls) {
      sceneSetupRef.current.controls.update();
    }
    EventBus.emit('viewer:camera-moved', { position });
  }, []);
  
  const setCameraTarget = useCallback((target) => {
    if (!sceneSetupRef.current?.controls) return;
    
    sceneSetupRef.current.controls.target.set(target.x, target.y, target.z);
    sceneSetupRef.current.controls.update();
    EventBus.emit('viewer:camera-target-changed', { target });
  }, []);
  
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
    // Set up resize listener
    if (isViewerReady) {
      window.addEventListener('resize', handleResize);
      
      // Initial resize
      handleResize();
      
      return () => {
        window.removeEventListener('resize', handleResize);
      };
    }
  }, [isViewerReady, handleResize]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      dispose();
    };
  }, [dispose]);
  
  const value = {
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
    
    // ========== SCENE MANAGEMENT ==========
    updateViewerConfig,
    render,
    handleResize,
    
    // ========== DRAG CONTROLS ==========
    setDragControls,
    setupDragControls,
    disposeDragControls,
    
    // ========== TABLE MANAGEMENT ==========
    loadTable,
    toggleTable,
    isTableLoaded: tableState.loaded,
    isTableVisible: tableState.visible,
    
    // ========== CAMERA CONTROLS ==========
    focusOnObject,
    setCameraPosition,
    setCameraTarget,
    
    // ========== GETTERS ==========
    getScene,
    getCamera,
    getRenderer,
    getControls,
    getRobotRoot,
    
    // ========== ERROR HANDLING ==========
    clearError
  };
  
  return (
    <ViewerContext.Provider value={value}>
      {children}
    </ViewerContext.Provider>
  );
};

// IMPORTANT: Export useViewer here to maintain compatibility
export const useViewer = () => {
  const context = useContext(ViewerContext);
  if (!context) {
    throw new Error('useViewer must be used within ViewerProvider');
  }
  return context;
};