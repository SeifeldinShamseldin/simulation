// src/contexts/WorldContext.jsx
import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useViewer } from './ViewerContext';
import EventBus from '../utils/EventBus';
import * as DataTransfer from './dataTransfer';

const WorldContext = createContext(null);

// Default world configuration
const DEFAULT_WORLD_CONFIG = {
  gridSize: 100,
  gridDivisions: 100,
  gridColor: '#888888',
  gridCenterColor: '#dddddd',
  groundSize: 10000,
  groundColor: '#eeeeee',
  groundOpacity: 1,
  groundRoughness: 0.7,
  groundMetalness: 0.1,
  showGrid: true,
  showGround: true,
  gridHeight: 0.002
};

export const WorldProvider = ({ children }) => {
  const viewerContext = useViewer();
  
  // ========== STATE ==========
  const [worldConfig, setWorldConfig] = useState(DEFAULT_WORLD_CONFIG);
  const [isWorldReady, setIsWorldReady] = useState(false);
  
  // ========== REFS ==========
  const groundRef = useRef(null);
  const gridHelperRef = useRef(null);
  const worldInitializedRef = useRef(false);
  
  // ========== WORLD INITIALIZATION ==========
  
  const initializeWorld = useCallback(() => {
    if (!viewerContext.isViewerReady) {
      console.log('[WorldContext] Viewer not ready, skipping world initialization');
      return false;
    }
    
    const sceneSetup = viewerContext.getSceneSetup();
    if (!sceneSetup || !sceneSetup.scene || worldInitializedRef.current) {
      return false;
    }
    const scene = sceneSetup.scene;

    console.log('[WorldContext] Initializing world');

    try {
      // 1. Background & Fog
      scene.background = new THREE.Color('#eaf4fb');
      scene.fog = new THREE.FogExp2('#eaf4fb', 0.02);

      // 2. Lighting
      scene.children.filter(obj => obj.isLight).forEach(light => scene.remove(light));
      const hemiLight = new THREE.HemisphereLight('#eaf4fb', '#000000', 0.5);
      hemiLight.groundColor.lerp(hemiLight.color, 0.3);
      hemiLight.position.set(0, 1, 0);
      scene.add(hemiLight);
      const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
      dirLight.position.set(3, 8, 3);
      dirLight.castShadow = true;
      dirLight.shadow.mapSize.width = 2048;
      dirLight.shadow.mapSize.height = 2048;
      scene.add(dirLight);

      // 3. Ground
      const groundSize = 40;
      const planeGeometry = new THREE.PlaneGeometry(groundSize, groundSize);
      const planeMaterial = new THREE.MeshStandardMaterial({
        color: 0xeeeeee,
        roughness: 0.7,
        metalness: 0.1,
        transparent: true,
        opacity: 0.8
      });
      const ground = new THREE.Mesh(planeGeometry, planeMaterial);
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = 0;
      ground.receiveShadow = true;
      ground.castShadow = false;
      ground.name = 'world-ground';
      scene.add(ground);
      groundRef.current = ground;

      // 4. Grid
      const gridHelper = new THREE.GridHelper(
        worldConfig.gridSize,
        worldConfig.gridDivisions,
        worldConfig.gridCenterColor,
        worldConfig.gridColor
      );
      gridHelper.position.y = worldConfig.gridHeight;
      gridHelper.name = 'world-grid';
      scene.add(gridHelper);
      gridHelperRef.current = gridHelper;

      worldInitializedRef.current = true;
      console.log('[WorldContext] World initialized successfully');
      
      EventBus.emit(DataTransfer.EVENT_WORLD_INITIALIZED);
      return true;
    } catch (error) {
      console.error('[WorldContext] Error initializing world:', error);
      return false;
    }
  }, [viewerContext, worldConfig]);

  // ========== INITIALIZE WHEN VIEWER IS READY ==========
  useEffect(() => {
    if (viewerContext.isViewerReady && !worldInitializedRef.current) {
      const initialized = initializeWorld();
      if (initialized) {
        setIsWorldReady(true);
      }
    }
  }, [viewerContext.isViewerReady, initializeWorld]);

  // ========== WORLD OPERATIONS ==========
  
  const updateGroundColor = useCallback((color) => {
    if (groundRef.current) {
      groundRef.current.material.color.set(color);
      setWorldConfig(prev => ({ ...prev, groundColor: color }));
    }
  }, []);

  const updateGroundOpacity = useCallback((opacity) => {
    if (groundRef.current) {
      groundRef.current.material.opacity = opacity;
      groundRef.current.material.transparent = opacity < 1;
      setWorldConfig(prev => ({ ...prev, groundOpacity: opacity }));
    }
  }, []);

  const updateGroundMaterial = useCallback((roughness, metalness) => {
    if (groundRef.current) {
      groundRef.current.material.roughness = roughness;
      groundRef.current.material.metalness = metalness;
      setWorldConfig(prev => ({ 
        ...prev, 
        groundRoughness: roughness,
        groundMetalness: metalness 
      }));
    }
  }, []);

  const toggleGrid = useCallback((show) => {
    if (gridHelperRef.current) {
      gridHelperRef.current.visible = show;
      setWorldConfig(prev => ({ ...prev, showGrid: show }));
    }
  }, []);

  const toggleGround = useCallback((show) => {
    if (groundRef.current) {
      groundRef.current.visible = show;
      setWorldConfig(prev => ({ ...prev, showGround: show }));
    }
  }, []);

  const updateGridAppearance = useCallback((updates) => {
    if (!viewerContext.isViewerReady) return;
    
    const sceneSetup = viewerContext.getSceneSetup();
    if (!sceneSetup || !sceneSetup.scene) return;
    
    setWorldConfig(prev => ({ ...prev, ...updates }));
    
    if (gridHelperRef.current && (updates.gridSize || updates.gridDivisions || updates.gridColor || updates.gridCenterColor)) {
      sceneSetup.scene.remove(gridHelperRef.current);
      gridHelperRef.current.geometry.dispose();
      gridHelperRef.current.material.dispose();
      
      const gridHelper = new THREE.GridHelper(
        updates.gridSize || worldConfig.gridSize,
        updates.gridDivisions || worldConfig.gridDivisions,
        updates.gridCenterColor || worldConfig.gridCenterColor,
        updates.gridColor || worldConfig.gridColor
      );
      gridHelper.position.y = updates.gridHeight || worldConfig.gridHeight;
      gridHelper.name = 'world-grid';
      gridHelper.visible = worldConfig.showGrid;
      sceneSetup.scene.add(gridHelper);
      gridHelperRef.current = gridHelper;
    }
  }, [viewerContext, worldConfig]);

  // ========== STATE MANAGEMENT ==========
  
  const getWorldState = useCallback(() => {
    return {
      config: { ...worldConfig },
      isReady: isWorldReady,
      hasGround: !!groundRef.current,
      hasGrid: !!gridHelperRef.current
    };
  }, [worldConfig, isWorldReady]);

  const setWorldState = useCallback((newState) => {
    if (newState.config) {
      setWorldConfig(newState.config);
    }
  }, []);

  const resetWorld = useCallback(() => {
    setWorldConfig(DEFAULT_WORLD_CONFIG);
    if (groundRef.current) {
      updateGroundColor(DEFAULT_WORLD_CONFIG.groundColor);
      updateGroundOpacity(DEFAULT_WORLD_CONFIG.groundOpacity);
      updateGroundMaterial(DEFAULT_WORLD_CONFIG.groundRoughness, DEFAULT_WORLD_CONFIG.groundMetalness);
    }
    if (gridHelperRef.current) {
      toggleGrid(DEFAULT_WORLD_CONFIG.showGrid);
    }
  }, [updateGroundColor, updateGroundOpacity, updateGroundMaterial, toggleGrid]);

  // ========== CLEANUP ==========
  
  const cleanupWorld = useCallback(() => {
    if (!viewerContext.isViewerReady) return;
    
    const sceneSetup = viewerContext.getSceneSetup();
    if (!sceneSetup || !sceneSetup.scene) return;
    
    if (groundRef.current) {
      sceneSetup.scene.remove(groundRef.current);
      groundRef.current.geometry.dispose();
      groundRef.current.material.dispose();
      groundRef.current = null;
    }
    
    if (gridHelperRef.current) {
      sceneSetup.scene.remove(gridHelperRef.current);
      gridHelperRef.current.geometry.dispose();
      gridHelperRef.current.material.dispose();
      gridHelperRef.current = null;
    }
    
    worldInitializedRef.current = false;
    setIsWorldReady(false);
  }, [viewerContext]);

  // ========== EFFECT: Update existing world when config changes ==========
  
  useEffect(() => {
    if (!isWorldReady || !viewerContext.isViewerReady) return;
    
    const sceneSetup = viewerContext.getSceneSetup();
    if (!sceneSetup || !sceneSetup.scene) return;
    
    // Update ground if it exists
    if (groundRef.current) {
      groundRef.current.material.color.set(worldConfig.groundColor);
      groundRef.current.material.opacity = worldConfig.groundOpacity;
      groundRef.current.material.roughness = worldConfig.groundRoughness;
      groundRef.current.material.metalness = worldConfig.groundMetalness;
      groundRef.current.visible = worldConfig.showGround;
    }
    
    // Update grid if it exists
    if (gridHelperRef.current) {
      gridHelperRef.current.visible = worldConfig.showGrid;
    }
  }, [worldConfig, isWorldReady, viewerContext]);

  // ========== CLEANUP ON UNMOUNT ==========
  
  useEffect(() => {
    return () => {
      cleanupWorld();
    };
  }, [cleanupWorld]);

  // ========== CONTEXT VALUE ==========
  
  const contextValue = {
    // State
    worldConfig,
    isWorldReady,
    
    // World operations
    initializeWorld,
    updateGroundColor,
    updateGroundOpacity,
    updateGroundMaterial,
    toggleGrid,
    toggleGround,
    updateGridAppearance,
    
    // State management
    getWorldState,
    setWorldState,
    resetWorld,
    
    // Cleanup
    cleanupWorld,
    
    // Direct references (for advanced usage)
    getGround: () => groundRef.current,
    getGrid: () => gridHelperRef.current
  };
  
  return (
    <WorldContext.Provider value={contextValue}>
      {children}
    </WorldContext.Provider>
  );
};

// Hook to use world context
export const useWorldContext = () => {
  const context = useContext(WorldContext);
  if (!context) {
    throw new Error('useWorldContext must be used within a WorldProvider');
  }
  return context;
};

export default WorldContext;