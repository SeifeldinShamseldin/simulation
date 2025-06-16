// src/contexts/WorldContext.jsx - SIMPLIFIED DATA STORAGE ONLY
import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import EventBus from '../utils/EventBus';

const WorldContext = createContext(null);

// World state version for compatibility checking
const WORLD_VERSION = '1.0.0';

export const WorldProvider = ({ children }) => {
  // ========== STATE ==========
  const [savedWorlds, setSavedWorlds] = useState(() => {
    try {
      const saved = localStorage.getItem('saved_worlds');
      return saved ? JSON.parse(saved) : {};
    } catch (error) {
      console.error('[WorldContext] Error loading saved worlds:', error);
      return {};
    }
  });

  const [currentWorldName, setCurrentWorldName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // ========== REFS ==========
  const autoSaveIntervalRef = useRef(null);
  const lastSaveTimeRef = useRef(Date.now());

  // ========== WORLD DATA CAPTURE (Just collect data) ==========
  
  const captureWorldState = useCallback(() => {
    console.log('[WorldContext] Capturing world state...');
    
    // Emit event to request state from all contexts
    const stateRequests = new Map();
    
    // Create promises for each context's data
    const promises = [];
    
    // Request robot state
    promises.push(new Promise((resolve) => {
      const handler = (data) => {
        resolve({ robots: data });
      };
      EventBus.once('world:robots-captured', handler);
      EventBus.emit('world:capture-robots');
    }));
    
    // Request environment state
    promises.push(new Promise((resolve) => {
      const handler = (data) => {
        resolve({ environment: data });
      };
      EventBus.once('world:environment-captured', handler);
      EventBus.emit('world:capture-environment');
    }));
    
    // Request trajectory state
    promises.push(new Promise((resolve) => {
      const handler = (data) => {
        resolve({ trajectories: data });
      };
      EventBus.once('world:trajectories-captured', handler);
      EventBus.emit('world:capture-trajectories');
    }));
    
    // Request TCP state
    promises.push(new Promise((resolve) => {
      const handler = (data) => {
        resolve({ tcpTools: data });
      };
      EventBus.once('world:tcp-captured', handler);
      EventBus.emit('world:capture-tcp');
    }));
    
    // Request viewer state
    promises.push(new Promise((resolve) => {
      const handler = (data) => {
        resolve({ viewer: data });
      };
      EventBus.once('world:viewer-captured', handler);
      EventBus.emit('world:capture-viewer');
    }));
    
    // Wait for all states with timeout
    return Promise.race([
      Promise.all(promises).then(results => {
        // Merge all results
        const worldState = {
          version: WORLD_VERSION,
          timestamp: new Date().toISOString(),
          name: currentWorldName || 'Untitled World',
          metadata: {
            description: '',
            tags: [],
            author: '',
            createdAt: new Date().toISOString(),
            lastModified: new Date().toISOString()
          }
        };
        
        // Merge all captured states
        results.forEach(result => {
          Object.assign(worldState, result);
        });
        
        console.log('[WorldContext] Captured world state:', worldState);
        return worldState;
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Capture timeout')), 5000)
      )
    ]);
  }, [currentWorldName]);

  // ========== WORLD DATA RESTORATION (Just emit data) ==========
  
  const restoreWorldState = useCallback(async (worldState) => {
    if (!worldState || worldState.version !== WORLD_VERSION) {
      throw new Error('Invalid or incompatible world state version');
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('[WorldContext] Restoring world state:', worldState.name);
      
      // Emit clear event first
      EventBus.emit('world:clear-requested');
      
      // Wait a bit for clear to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Emit restore events for each context with their data
      if (worldState.robots) {
        EventBus.emit('world:restore-robots', worldState.robots);
      }
      
      if (worldState.environment) {
        EventBus.emit('world:restore-environment', worldState.environment);
      }
      
      if (worldState.trajectories) {
        EventBus.emit('world:restore-trajectories', worldState.trajectories);
      }
      
      if (worldState.tcpTools) {
        EventBus.emit('world:restore-tcp', worldState.tcpTools);
      }
      
      if (worldState.viewer) {
        EventBus.emit('world:restore-viewer', worldState.viewer);
      }
      
      setCurrentWorldName(worldState.name);
      setIsDirty(false);
      setSuccessMessage(`World "${worldState.name}" loaded successfully!`);
      
      // Emit completion event
      setTimeout(() => {
        EventBus.emit('world:restore-complete', worldState);
      }, 500);
      
    } catch (error) {
      console.error('[WorldContext] Error restoring world:', error);
      setError(`Failed to load world: ${error.message}`);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ========== WORLD MANAGEMENT ==========
  
  const saveWorld = useCallback(async (name = currentWorldName || 'Untitled World') => {
    try {
      const worldState = await captureWorldState();
      worldState.name = name;
      worldState.metadata.lastModified = new Date().toISOString();
      
      // Save to local storage
      const newSavedWorlds = { ...savedWorlds };
      newSavedWorlds[name] = worldState;
      setSavedWorlds(newSavedWorlds);
      
      // Persist to localStorage
      localStorage.setItem('saved_worlds', JSON.stringify(newSavedWorlds));
      
      setCurrentWorldName(name);
      setIsDirty(false);
      lastSaveTimeRef.current = Date.now();
      
      setSuccessMessage(`World "${name}" saved successfully!`);
      setTimeout(() => setSuccessMessage(''), 3000);
      
      EventBus.emit('world:saved', { name, worldState });
      
      return worldState;
    } catch (error) {
      console.error('[WorldContext] Error saving world:', error);
      setError(`Failed to save world: ${error.message}`);
      return null;
    }
  }, [currentWorldName, savedWorlds, captureWorldState]);

  const loadWorld = useCallback(async (name) => {
    const worldState = savedWorlds[name];
    if (!worldState) {
      setError(`World "${name}" not found`);
      return false;
    }
    
    try {
      await restoreWorldState(worldState);
      return true;
    } catch (error) {
      return false;
    }
  }, [savedWorlds, restoreWorldState]);

  const deleteWorld = useCallback((name) => {
    if (!savedWorlds[name]) return false;
    
    const newSavedWorlds = { ...savedWorlds };
    delete newSavedWorlds[name];
    setSavedWorlds(newSavedWorlds);
    
    localStorage.setItem('saved_worlds', JSON.stringify(newSavedWorlds));
    
    if (currentWorldName === name) {
      setCurrentWorldName('');
    }
    
    setSuccessMessage(`World "${name}" deleted`);
    setTimeout(() => setSuccessMessage(''), 3000);
    
    return true;
  }, [savedWorlds, currentWorldName]);

  const exportWorld = useCallback(async (name = currentWorldName) => {
    try {
      const worldState = name && savedWorlds[name] ? savedWorlds[name] : await captureWorldState();
      worldState.name = name || 'Untitled World';
      
      const dataStr = JSON.stringify(worldState, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `world_${worldState.name.replace(/\s+/g, '_')}_${Date.now()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
      
      setSuccessMessage('World exported successfully');
      setTimeout(() => setSuccessMessage(''), 3000);
      
      return true;
    } catch (error) {
      console.error('[WorldContext] Error exporting world:', error);
      setError(`Failed to export world: ${error.message}`);
      return false;
    }
  }, [currentWorldName, savedWorlds, captureWorldState]);

  const importWorld = useCallback(async (jsonData) => {
    try {
      const worldState = JSON.parse(jsonData);
      
      if (!worldState || worldState.version !== WORLD_VERSION) {
        throw new Error('Invalid or incompatible world file');
      }
      
      // Check if world already exists
      if (savedWorlds[worldState.name]) {
        const overwrite = window.confirm(`World "${worldState.name}" already exists. Overwrite?`);
        if (!overwrite) {
          // Generate new name
          let newName = worldState.name;
          let counter = 1;
          while (savedWorlds[`${newName} (${counter})`]) {
            counter++;
          }
          worldState.name = `${newName} (${counter})`;
        }
      }
      
      // Save imported world
      const newSavedWorlds = { ...savedWorlds };
      newSavedWorlds[worldState.name] = worldState;
      setSavedWorlds(newSavedWorlds);
      localStorage.setItem('saved_worlds', JSON.stringify(newSavedWorlds));
      
      // Load the imported world
      await restoreWorldState(worldState);
      
      return true;
    } catch (error) {
      console.error('[WorldContext] Error importing world:', error);
      setError(`Failed to import world: ${error.message}`);
      return false;
    }
  }, [savedWorlds, restoreWorldState]);

  const clearWorld = useCallback(() => {
    console.log('[WorldContext] Requesting world clear...');
    
    EventBus.emit('world:clear-requested');
    
    setCurrentWorldName('');
    setIsDirty(false);
  }, []);

  // ========== AUTO-SAVE ==========
  
  useEffect(() => {
    if (autoSaveEnabled && currentWorldName) {
      autoSaveIntervalRef.current = setInterval(() => {
        if (isDirty && Date.now() - lastSaveTimeRef.current > 30000) { // 30 seconds
          console.log('[WorldContext] Auto-saving...');
          saveWorld(currentWorldName);
        }
      }, 10000); // Check every 10 seconds
      
      return () => {
        if (autoSaveIntervalRef.current) {
          clearInterval(autoSaveIntervalRef.current);
        }
      };
    }
  }, [autoSaveEnabled, currentWorldName, isDirty, saveWorld]);

  // ========== CHANGE DETECTION ==========
  
  useEffect(() => {
    const markDirty = () => setIsDirty(true);
    
    const events = [
      'robot:loaded',
      'robot:removed',
      'robot:joint-changed',
      'robot:joints-changed',
      'environment:object-added',
      'environment:object-removed',
      'environment:object-updated',
      'tcp:tool-attached',
      'tcp:tool-removed',
      'tcp:tool-transformed',
      'trajectory:recording-stopped',
      'human:spawned',
      'human:removed'
    ];
    
    const unsubscribes = events.map(event => 
      EventBus.on(event, markDirty)
    );
    
    return () => unsubscribes.forEach(unsub => unsub());
  }, []);

  // ========== UTILS ==========
  
  const getWorldList = useCallback(() => {
    return Object.keys(savedWorlds).map(name => ({
      name,
      timestamp: savedWorlds[name].timestamp,
      metadata: savedWorlds[name].metadata
    }));
  }, [savedWorlds]);

  const hasUnsavedChanges = useCallback(() => {
    return isDirty;
  }, [isDirty]);

  const clearError = useCallback(() => setError(null), []);
  const clearSuccess = useCallback(() => setSuccessMessage(''), []);

  // ========== CONTEXT VALUE ==========
  
  const value = {
    // State
    savedWorlds,
    currentWorldName,
    isLoading,
    error,
    successMessage,
    autoSaveEnabled,
    isDirty,
    
    // World management
    saveWorld,
    loadWorld,
    deleteWorld,
    exportWorld,
    importWorld,
    clearWorld,
    captureWorldState,
    restoreWorldState,
    
    // Getters
    getWorldList,
    hasUnsavedChanges,
    
    // Settings
    setAutoSaveEnabled,
    setCurrentWorldName,
    
    // Utils
    clearError,
    clearSuccess
  };

  return (
    <WorldContext.Provider value={value}>
      {children}
    </WorldContext.Provider>
  );
};

export const useWorldContext = () => {
  const context = useContext(WorldContext);
  if (!context) {
    throw new Error('useWorldContext must be used within WorldProvider');
  }
  return context;
};

export default WorldContext;