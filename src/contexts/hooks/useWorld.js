// src/contexts/hooks/useWorld.js - WORLD VISUALIZATION HOOK
import { useCallback, useMemo } from 'react';
import { useWorldContext } from '../WorldContext';
import useAnimate from './useAnimate';

/**
 * Hook for world visualization management
 * Provides clean interface for grid, ground, and world appearance
 */
export const useWorld = () => {
  const context = useWorldContext();
  const { isAnimating, animationProgress } = useAnimate();
  
  // ========== MEMOIZED VALUES ==========
  
  const worldState = useMemo(() => ({
    // Configuration
    gridSize: context.worldConfig.gridSize,
    gridDivisions: context.worldConfig.gridDivisions,
    gridColor: context.worldConfig.gridColor,
    gridCenterColor: context.worldConfig.gridCenterColor,
    groundSize: context.worldConfig.groundSize,
    groundColor: context.worldConfig.groundColor,
    groundOpacity: context.worldConfig.groundOpacity,
    groundRoughness: context.worldConfig.groundRoughness,
    groundMetalness: context.worldConfig.groundMetalness,
    
    // Visibility
    showGrid: context.worldConfig.showGrid,
    showGround: context.worldConfig.showGround,
    
    // Status
    isReady: context.isWorldReady
  }), [context.worldConfig, context.isWorldReady]);
  
  // ========== GROUND OPERATIONS ==========
  
  const ground = useMemo(() => ({
    setColor: context.updateGroundColor,
    setOpacity: context.updateGroundOpacity,
    setMaterial: context.updateGroundMaterial,
    toggle: context.toggleGround,
    
    // Convenience methods
    show: useCallback(() => context.toggleGround(true), [context.toggleGround]),
    hide: useCallback(() => context.toggleGround(false), [context.toggleGround]),
    
    // Direct access
    get: context.getGround
  }), [
    context.updateGroundColor,
    context.updateGroundOpacity,
    context.updateGroundMaterial,
    context.toggleGround,
    context.getGround
  ]);
  
  // ========== GRID OPERATIONS ==========
  
  const grid = useMemo(() => ({
    update: context.updateGridAppearance,
    toggle: context.toggleGrid,
    
    // Convenience methods
    show: useCallback(() => context.toggleGrid(true), [context.toggleGrid]),
    hide: useCallback(() => context.toggleGrid(false), [context.toggleGrid]),
    
    // Specific updates
    setSize: useCallback((size) => 
      context.updateGridAppearance({ gridSize: size }), 
      [context.updateGridAppearance]
    ),
    setDivisions: useCallback((divisions) => 
      context.updateGridAppearance({ gridDivisions: divisions }), 
      [context.updateGridAppearance]
    ),
    setColors: useCallback((gridColor, centerColor) => 
      context.updateGridAppearance({ 
        gridColor, 
        gridCenterColor: centerColor || gridColor 
      }), 
      [context.updateGridAppearance]
    ),
    
    // Direct access
    get: context.getGrid
  }), [
    context.updateGridAppearance,
    context.toggleGrid,
    context.getGrid
  ]);
  
  // ========== WORLD OPERATIONS ==========
  
  const setWorldTheme = useCallback((theme) => {
    switch (theme) {
      case 'light':
        context.updateGroundColor('#eeeeee');
        context.updateGroundOpacity(0.8);
        context.updateGridAppearance({
          gridColor: '#888888',
          gridCenterColor: '#dddddd'
        });
        break;
        
      case 'dark':
        context.updateGroundColor('#1a1a1a');
        context.updateGroundOpacity(0.9);
        context.updateGridAppearance({
          gridColor: '#444444',
          gridCenterColor: '#666666'
        });
        break;
        
      case 'transparent':
        context.updateGroundOpacity(0.2);
        break;
        
      case 'industrial':
        context.updateGroundColor('#3a3a3a');
        context.updateGroundOpacity(0.95);
        context.updateGroundMaterial({
          roughness: 0.9,
          metalness: 0.1
        });
        context.updateGridAppearance({
          gridColor: '#ffaa00',
          gridCenterColor: '#ff6600'
        });
        break;
        
      default:
        console.warn(`[useWorld] Unknown theme: ${theme}`);
    }
  }, [
    context.updateGroundColor,
    context.updateGroundOpacity,
    context.updateGroundMaterial,
    context.updateGridAppearance
  ]);
  
  // ========== RETURN VALUE ==========
  
  return {
    // State
    ...worldState,
    
    // Ground controls
    ground,
    
    // Grid controls
    grid,
    
    // World operations
    initialize: context.initializeWorld,
    reset: context.resetWorld,
    cleanup: context.cleanupWorld,
    
    // State management
    getState: context.getWorldState,
    setState: context.setWorldState,
    
    // Themes
    setTheme: setWorldTheme,
    
    // Quick toggles
    toggleGrid: context.toggleGrid,
    toggleGround: context.toggleGround,
    
    // Direct updates
    updateGroundColor: context.updateGroundColor,
    updateGroundOpacity: context.updateGroundOpacity,
    updateGridAppearance: context.updateGridAppearance,
    
    // Animation state
    isAnimating,
    animationProgress
  };
};

// ========== SPECIALIZED HOOKS ==========

/**
 * Hook for ground-specific operations
 */
export const useWorldGround = () => {
  const world = useWorld();
  
  return {
    color: world.groundColor,
    opacity: world.groundOpacity,
    roughness: world.groundRoughness,
    metalness: world.groundMetalness,
    visible: world.showGround,
    
    setColor: world.ground.setColor,
    setOpacity: world.ground.setOpacity,
    setMaterial: world.ground.setMaterial,
    toggle: world.ground.toggle,
    show: world.ground.show,
    hide: world.ground.hide,
    
    get: world.ground.get
  };
};

/**
 * Hook for grid-specific operations
 */
export const useWorldGrid = () => {
  const world = useWorld();
  
  return {
    size: world.gridSize,
    divisions: world.gridDivisions,
    color: world.gridColor,
    centerColor: world.gridCenterColor,
    visible: world.showGrid,
    
    update: world.grid.update,
    toggle: world.grid.toggle,
    show: world.grid.show,
    hide: world.grid.hide,
    setSize: world.grid.setSize,
    setDivisions: world.grid.setDivisions,
    setColors: world.grid.setColors,
    
    get: world.grid.get
  };
};

/**
 * Hook for world appearance presets
 */
export const useWorldThemes = () => {
  const world = useWorld();
  
  return {
    setLight: useCallback(() => world.setTheme('light'), [world.setTheme]),
    setDark: useCallback(() => world.setTheme('dark'), [world.setTheme]),
    setTransparent: useCallback(() => world.setTheme('transparent'), [world.setTheme]),
    setIndustrial: useCallback(() => world.setTheme('industrial'), [world.setTheme]),
    setCustom: world.setTheme
  };
};

export default useWorld;