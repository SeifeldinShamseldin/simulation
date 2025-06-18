// src/contexts/WorldContext.jsx - WORLD VISUALIZATION CONTEXT
import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useViewer } from './ViewerContext';
import EventBus from '../utils/EventBus';

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
  gridHeight: 0.02
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
    const sceneSetup = viewerContext.getSceneSetup();
    if (!sceneSetup || !sceneSetup.scene || worldInitializedRef.current) {
      return false;
    }
    
    console.log('[WorldContext] Initializing world visualization...');
    
    try {
      // Use DEFAULT_WORLD_CONFIG for initial creation
      const planeGeometry = new THREE.PlaneGeometry(
        DEFAULT_WORLD_CONFIG.groundSize,
        DEFAULT_WORLD_CONFIG.groundSize
      );
      const planeMaterial = new THREE.MeshStandardMaterial({
        color: DEFAULT_WORLD_CONFIG.groundColor,
        roughness: DEFAULT_WORLD_CONFIG.groundRoughness,
        metalness: DEFAULT_WORLD_CONFIG.groundMetalness,
        transparent: true,
        opacity: DEFAULT_WORLD_CONFIG.groundOpacity
      });
      const ground = new THREE.Mesh(planeGeometry, planeMaterial);
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = 0;
      ground.receiveShadow = true;
      ground.castShadow = false;
      ground.name = 'world-ground';
      ground.userData.defaultOpacity = DEFAULT_WORLD_CONFIG.groundOpacity;
      sceneSetup.scene.add(ground);
      groundRef.current = ground;
      
      // Create grid helper
      const gridHelper = new THREE.GridHelper(
        DEFAULT_WORLD_CONFIG.gridSize,
        DEFAULT_WORLD_CONFIG.gridDivisions,
        DEFAULT_WORLD_CONFIG.gridCenterColor,
        DEFAULT_WORLD_CONFIG.gridColor
      );
      gridHelper.position.y = DEFAULT_WORLD_CONFIG.gridHeight;
      gridHelper.name = 'world-grid';
      gridHelper.visible = DEFAULT_WORLD_CONFIG.showGrid;
      sceneSetup.scene.add(gridHelper);
      gridHelperRef.current = gridHelper;
      
      worldInitializedRef.current = true;
      setIsWorldReady(true);
      EventBus.emit('world:ready', { ground, gridHelper });
      return true;
    } catch (error) {
      console.error('[WorldContext] Failed to initialize world:', error);
      return false;
    }
  }, [viewerContext]);
  
  // ========== WORLD UPDATES ==========
  
  const updateGroundColor = useCallback((color) => {
    if (groundRef.current?.material) {
      groundRef.current.material.color.set(color);
      setWorldConfig(prev => ({ ...prev, groundColor: color }));
      EventBus.emit('world:ground-color-changed', { color });
    }
  }, []);
  
  const updateGroundOpacity = useCallback((opacity) => {
    if (groundRef.current?.material) {
      const clampedOpacity = Math.max(0, Math.min(1, opacity));
      groundRef.current.material.opacity = clampedOpacity;
      groundRef.current.material.transparent = clampedOpacity < 1;
      
      // Update grid visibility based on ground opacity
      if (gridHelperRef.current) {
        gridHelperRef.current.visible = clampedOpacity > 0.1 && worldConfig.showGrid;
      }
      
      setWorldConfig(prev => ({ ...prev, groundOpacity: clampedOpacity }));
      EventBus.emit('world:ground-opacity-changed', { opacity: clampedOpacity });
    }
  }, [worldConfig.showGrid]);
  
  const updateGroundMaterial = useCallback((updates) => {
    if (groundRef.current?.material) {
      Object.entries(updates).forEach(([key, value]) => {
        if (key in groundRef.current.material) {
          groundRef.current.material[key] = value;
        }
      });
      
      setWorldConfig(prev => ({ ...prev, ...updates }));
      EventBus.emit('world:ground-material-changed', updates);
    }
  }, []);
  
  const toggleGrid = useCallback((show) => {
    if (gridHelperRef.current) {
      const shouldShow = show ?? !gridHelperRef.current.visible;
      gridHelperRef.current.visible = shouldShow;
      setWorldConfig(prev => ({ ...prev, showGrid: shouldShow }));
      EventBus.emit('world:grid-toggled', { visible: shouldShow });
    }
  }, []);
  
  const toggleGround = useCallback((show) => {
    if (groundRef.current) {
      const shouldShow = show ?? !groundRef.current.visible;
      groundRef.current.visible = shouldShow;
      setWorldConfig(prev => ({ ...prev, showGround: shouldShow }));
      EventBus.emit('world:ground-toggled', { visible: shouldShow });
    }
  }, []);
  
  const updateGridAppearance = useCallback((updates) => {
    if (!gridHelperRef.current) return;
    
    const sceneSetup = viewerContext.getSceneSetup();
    if (!sceneSetup?.scene) return;
    
    // Remove old grid
    sceneSetup.scene.remove(gridHelperRef.current);
    gridHelperRef.current.geometry.dispose();
    gridHelperRef.current.material.dispose();
    
    // Create new grid with updated properties
    const newConfig = { ...worldConfig, ...updates };
    const gridHelper = new THREE.GridHelper(
      newConfig.gridSize || worldConfig.gridSize,
      newConfig.gridDivisions || worldConfig.gridDivisions,
      newConfig.gridCenterColor || worldConfig.gridCenterColor,
      newConfig.gridColor || worldConfig.gridColor
    );
    
    gridHelper.position.y = newConfig.gridHeight || worldConfig.gridHeight;
    gridHelper.name = 'world-grid';
    gridHelper.visible = newConfig.showGrid ?? worldConfig.showGrid;
    
    sceneSetup.scene.add(gridHelper);
    gridHelperRef.current = gridHelper;
    
    setWorldConfig(prev => ({ ...prev, ...updates }));
    EventBus.emit('world:grid-updated', updates);
  }, [viewerContext, worldConfig]);
  
  // ========== WORLD STATE ==========
  
  const getWorldState = useCallback(() => {
    return {
      config: { ...worldConfig },
      ground: groundRef.current,
      grid: gridHelperRef.current,
      isReady: isWorldReady
    };
  }, [worldConfig, isWorldReady]);
  
  const setWorldState = useCallback((state) => {
    if (!state?.config) return;
    
    // Update configuration
    setWorldConfig(state.config);
    
    // Apply configuration to existing objects
    if (groundRef.current) {
      updateGroundColor(state.config.groundColor);
      updateGroundOpacity(state.config.groundOpacity);
      updateGroundMaterial({
        roughness: state.config.groundRoughness,
        metalness: state.config.groundMetalness
      });
    }
    
    if (gridHelperRef.current) {
      updateGridAppearance({
        gridSize: state.config.gridSize,
        gridDivisions: state.config.gridDivisions,
        gridColor: state.config.gridColor,
        gridCenterColor: state.config.gridCenterColor,
        gridHeight: state.config.gridHeight,
        showGrid: state.config.showGrid
      });
    }
  }, [updateGroundColor, updateGroundOpacity, updateGroundMaterial, updateGridAppearance]);
  
  const resetWorld = useCallback(() => {
    setWorldConfig(DEFAULT_WORLD_CONFIG);
    
    // Re-initialize with default config
    if (worldInitializedRef.current) {
      setWorldState({ config: DEFAULT_WORLD_CONFIG });
    }
    
    EventBus.emit('world:reset');
  }, [setWorldState]);
  
  // ========== CLEANUP ==========
  
  const cleanupWorld = useCallback(() => {
    const sceneSetup = viewerContext.getSceneSetup();
    if (!sceneSetup?.scene) return;
    
    // Remove ground
    if (groundRef.current) {
      sceneSetup.scene.remove(groundRef.current);
      groundRef.current.geometry.dispose();
      groundRef.current.material.dispose();
      groundRef.current = null;
    }
    
    // Remove grid
    if (gridHelperRef.current) {
      sceneSetup.scene.remove(gridHelperRef.current);
      gridHelperRef.current.geometry.dispose();
      gridHelperRef.current.material.dispose();
      gridHelperRef.current = null;
    }
    
    worldInitializedRef.current = false;
    setIsWorldReady(false);
  }, [viewerContext]);
  
  // ========== EFFECTS ==========
  
  // Initialize world when viewer is ready
  useEffect(() => {
    if (viewerContext.isViewerReady && !worldInitializedRef.current) {
      const timer = setTimeout(() => {
        initializeWorld();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [viewerContext.isViewerReady, initializeWorld]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupWorld();
    };
  }, [cleanupWorld]);
  
  // Add effect to update ground and grid when worldConfig changes
  useEffect(() => {
    if (!worldInitializedRef.current) return;
    // Update ground
    if (groundRef.current) {
      if (groundRef.current.material.color.getStyle() !== worldConfig.groundColor) {
        groundRef.current.material.color.set(worldConfig.groundColor);
      }
      if (groundRef.current.material.opacity !== worldConfig.groundOpacity) {
        groundRef.current.material.opacity = worldConfig.groundOpacity;
        groundRef.current.material.transparent = worldConfig.groundOpacity < 1;
      }
      if (groundRef.current.material.roughness !== worldConfig.groundRoughness) {
        groundRef.current.material.roughness = worldConfig.groundRoughness;
      }
      if (groundRef.current.material.metalness !== worldConfig.groundMetalness) {
        groundRef.current.material.metalness = worldConfig.groundMetalness;
      }
      groundRef.current.visible = worldConfig.showGround;
    }
    // Update grid
    if (gridHelperRef.current) {
      gridHelperRef.current.visible = worldConfig.showGrid && (worldConfig.groundOpacity > 0.1);
      // Only recreate grid if size/divisions/colors/height changed
      if (
        gridHelperRef.current.geometry.parameters.width !== worldConfig.gridSize ||
        gridHelperRef.current.geometry.parameters.height !== worldConfig.gridSize ||
        gridHelperRef.current.geometry.parameters.widthSegments !== worldConfig.gridDivisions ||
        gridHelperRef.current.material.color.getStyle() !== worldConfig.gridColor ||
        gridHelperRef.current.material.color.getStyle() !== worldConfig.gridCenterColor ||
        gridHelperRef.current.position.y !== worldConfig.gridHeight
      ) {
        // Remove and recreate grid
        const sceneSetup = viewerContext.getSceneSetup();
        if (sceneSetup?.scene) {
          sceneSetup.scene.remove(gridHelperRef.current);
          gridHelperRef.current.geometry.dispose();
          gridHelperRef.current.material.dispose();
          const gridHelper = new THREE.GridHelper(
            worldConfig.gridSize,
            worldConfig.gridDivisions,
            worldConfig.gridCenterColor,
            worldConfig.gridColor
          );
          gridHelper.position.y = worldConfig.gridHeight;
          gridHelper.name = 'world-grid';
          gridHelper.visible = worldConfig.showGrid;
          sceneSetup.scene.add(gridHelper);
          gridHelperRef.current = gridHelper;
        }
      }
    }
  }, [worldConfig, viewerContext]);
  
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