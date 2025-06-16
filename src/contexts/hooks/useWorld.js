// src/contexts/hooks/useWorld.js - WORLD MANAGEMENT HOOK
import { useCallback } from 'react';
import { useWorldContext } from '../WorldContext';

export const useWorld = () => {
  const context = useWorldContext();
  
  return {
    // ========== STATE ==========
    worlds: context.savedWorlds,
    currentWorld: context.currentWorldName,
    isLoading: context.isLoading,
    error: context.error,
    successMessage: context.successMessage,
    isDirty: context.isDirty,
    autoSaveEnabled: context.autoSaveEnabled,
    
    // ========== WORLD OPERATIONS ==========
    save: context.saveWorld,
    load: context.loadWorld,
    delete: context.deleteWorld,
    export: context.exportWorld,
    import: context.importWorld,
    clear: context.clearWorld,
    capture: context.captureWorldState,
    restore: context.restoreWorldState,
    
    // ========== GETTERS ==========
    getWorldList: context.getWorldList,
    hasUnsavedChanges: context.hasUnsavedChanges,
    worldCount: Object.keys(context.savedWorlds).length,
    
    // ========== SETTINGS ==========
    setAutoSave: context.setAutoSaveEnabled,
    setCurrentWorld: context.setCurrentWorldName,
    
    // ========== UTILS ==========
    clearError: context.clearError,
    clearSuccess: context.clearSuccess,
    
    // ========== CONVENIENCE METHODS ==========
    saveAs: useCallback((name) => {
      return context.saveWorld(name);
    }, [context.saveWorld]),
    
    quickSave: useCallback(() => {
      const name = context.currentWorldName || `World_${Date.now()}`;
      return context.saveWorld(name);
    }, [context.saveWorld, context.currentWorldName]),
    
    exists: useCallback((name) => {
      return !!context.savedWorlds[name];
    }, [context.savedWorlds]),
    
    getWorld: useCallback((name) => {
      return context.savedWorlds[name];
    }, [context.savedWorlds])
  };
};

// ========== SPECIALIZED HOOKS ==========

export const useWorldSave = () => {
  const world = useWorld();
  
  return {
    save: world.save,
    saveAs: world.saveAs,
    quickSave: world.quickSave,
    isDirty: world.isDirty,
    hasUnsavedChanges: world.hasUnsavedChanges,
    autoSaveEnabled: world.autoSaveEnabled,
    setAutoSave: world.setAutoSave
  };
};

export const useWorldLoad = () => {
  const world = useWorld();
  
  return {
    load: world.load,
    worlds: world.getWorldList(),
    currentWorld: world.currentWorld,
    exists: world.exists,
    isLoading: world.isLoading
  };
};

export const useWorldImportExport = () => {
  const world = useWorld();
  
  return {
    export: world.export,
    import: world.import,
    currentWorld: world.currentWorld
  };
};

export default useWorld;