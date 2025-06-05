import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import worldAPI from '../core/World/WorldAPI';
import EventBus from '../utils/EventBus';

const WorldContext = createContext(null);

export const WorldProvider = ({ children }) => {
  const [worlds, setWorlds] = useState([]);
  const [currentWorldId, setCurrentWorldId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load worlds on mount
  useEffect(() => {
    // Initial load
    worldAPI.loadFromStorage();
    refreshWorlds();
    
    // Listen to world events
    const unsubscribeSaved = EventBus.on('world:saved', refreshWorlds);
    const unsubscribeLoaded = EventBus.on('world:loaded', ({ worldId }) => {
      setCurrentWorldId(worldId);
      refreshWorlds();
    });
    const unsubscribeDeleted = EventBus.on('world:deleted', refreshWorlds);
    const unsubscribeImported = EventBus.on('world:imported', refreshWorlds);
    
    return () => {
      unsubscribeSaved();
      unsubscribeLoaded();
      unsubscribeDeleted();
      unsubscribeImported();
    };
  }, []);
  
  const refreshWorlds = useCallback(() => {
    setWorlds(worldAPI.getAllWorlds());
    setCurrentWorldId(worldAPI.currentWorld);
  }, []);
  
  const saveWorld = useCallback(async (name, sceneData) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const world = worldAPI.saveWorld(name, sceneData);
      refreshWorlds();
      return world;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [refreshWorlds]);
  
  const loadWorld = useCallback(async (worldId, callbacks) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const success = await worldAPI.loadWorld(worldId, callbacks);
      if (success) {
        refreshWorlds();
      }
      return success;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [refreshWorlds]);
  
  const deleteWorld = useCallback((worldId) => {
    if (window.confirm('Are you sure you want to delete this world?')) {
      worldAPI.deleteWorld(worldId);
      refreshWorlds();
    }
  }, [refreshWorlds]);
  
  const exportWorld = useCallback((worldId) => {
    const json = worldAPI.exportWorld(worldId);
    if (!json) return;
    
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `world_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  }, []);
  
  const importWorld = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const world = worldAPI.importWorld(e.target.result);
        if (world) {
          refreshWorlds();
        }
      } catch (error) {
        setError('Failed to import world: ' + error.message);
      }
    };
    reader.readAsText(file);
  }, [refreshWorlds]);
  
  const value = {
    worlds,
    currentWorldId,
    isLoading,
    error,
    saveWorld,
    loadWorld,
    deleteWorld,
    exportWorld,
    importWorld,
    refreshWorlds
  };
  
  return (
    <WorldContext.Provider value={value}>
      {children}
    </WorldContext.Provider>
  );
};

export const useWorld = () => {
  const context = useContext(WorldContext);
  if (!context) {
    throw new Error('useWorld must be used within WorldProvider');
  }
  return context;
}; 