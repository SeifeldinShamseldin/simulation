// src/contexts/RobotContext.jsx - Logic Layer (Business Logic + State Management)
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import EventBus from '../utils/EventBus';

const RobotContext = createContext(null);

export const RobotProvider = ({ children }) => {
  // === WORKSPACE STATE (Persistent - localStorage) ===
  const [workspaceRobots, setWorkspaceRobots] = useState([]);
  
  // === AVAILABLE ROBOTS STATE (From server) ===
  const [availableRobots, setAvailableRobots] = useState([]);
  const [categories, setCategories] = useState([]);
  
  // === LOADED ROBOTS STATE (In 3D Viewer - temporary) ===
  const [loadedRobots, setLoadedRobots] = useState(new Map());
  const [activeRobotId, setActiveRobotId] = useState(null);
  
  // === UI STATE ===
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // === VIEWER REFERENCE ===
  const [viewer, setViewer] = useState(null);

  // ===============================
  // WORKSPACE LOGIC (Persistent Storage)
  // ===============================

  // Load workspace robots from localStorage on mount
  useEffect(() => {
    try {
      const savedRobots = localStorage.getItem('workspaceRobots');
      if (savedRobots) {
        const robots = JSON.parse(savedRobots);
        setWorkspaceRobots(robots);
        console.log('[RobotContext] Loaded workspace robots:', robots);
      }
    } catch (error) {
      console.error('[RobotContext] Error loading workspace robots:', error);
      setError('Failed to load saved robots');
    }
  }, []);

  // Save workspace robots to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('workspaceRobots', JSON.stringify(workspaceRobots));
      console.log('[RobotContext] Saved workspace robots:', workspaceRobots);
    } catch (error) {
      console.error('[RobotContext] Error saving workspace robots:', error);
    }
  }, [workspaceRobots]);

  const addRobotToWorkspace = useCallback((robotData) => {
    const newRobot = {
      id: `${robotData.id}_${Date.now()}`,
      robotId: robotData.id,
      name: robotData.name,
      manufacturer: robotData.manufacturer,
      urdfPath: robotData.urdfPath,
      icon: '🤖',
      addedAt: new Date().toISOString()
    };
    
    setWorkspaceRobots(prev => {
      const exists = prev.some(r => r.robotId === robotData.id);
      if (exists) {
        console.log('[RobotContext] Robot already in workspace:', robotData.name);
        return prev;
      }
      
      console.log('[RobotContext] Adding robot to workspace:', newRobot);
      return [...prev, newRobot];
    });
    
    return newRobot;
  }, []);

  const removeRobotFromWorkspace = useCallback((workspaceRobotId) => {
    setWorkspaceRobots(prev => {
      const updated = prev.filter(r => r.id !== workspaceRobotId);
      console.log('[RobotContext] Removing robot from workspace:', workspaceRobotId);
      return updated;
    });
  }, []);

  const isRobotInWorkspace = useCallback((robotId) => {
    return workspaceRobots.some(r => r.robotId === robotId);
  }, [workspaceRobots]);

  // ===============================
  // AVAILABLE ROBOTS LOGIC (Server Discovery)
  // ===============================

  const discoverRobots = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('/robots/list');
      const data = await response.json();
      
      if (response.ok) {
        setCategories(data);
        
        const allRobots = [];
        data.forEach(category => {
          category.robots.forEach(robot => {
            allRobots.push({
              ...robot,
              category: category.id,
              categoryName: category.name
            });
          });
        });
        
        setAvailableRobots(allRobots);
        console.log('[RobotContext] Discovered robots:', allRobots);
      } else {
        throw new Error('Failed to load robots');
      }
    } catch (err) {
      console.error('[RobotContext] Failed to discover robots:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ===============================
  // LOADED ROBOTS LOGIC (3D Viewer Management)
  // ===============================

  const loadRobot = useCallback(async (robotId, urdfPath, options = {}) => {
    const currentViewer = viewer || window.viewerInstance;
    
    if (!currentViewer) {
      throw new Error('Viewer not initialized');
    }

    try {
      setIsLoading(true);
      setError(null);
      
      console.log('[RobotContext] Loading robot into viewer:', robotId);
      
      const robot = await currentViewer.loadRobot(robotId, urdfPath, options);
      
      // Update loaded robots map
      setLoadedRobots(prev => {
        const newMap = new Map(prev);
        newMap.set(robotId, {
          id: robotId,
          robot: robot,
          isActive: options.makeActive !== false,
          urdfPath: urdfPath,
          loadedAt: new Date().toISOString()
        });
        return newMap;
      });
      
      // Set as active if requested
      if (options.makeActive !== false) {
        setActiveRobotId(robotId);
      }
      
      console.log('[RobotContext] Robot loaded successfully:', robotId);
      EventBus.emit('robot:loaded', { robotId, robot });
      
      return robot;
    } catch (err) {
      console.error('[RobotContext] Error loading robot:', err);
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [viewer]);

  const unloadRobot = useCallback((robotId) => {
    const currentViewer = viewer || window.viewerInstance;
    if (!currentViewer) return;
    
    try {
      console.log('[RobotContext] Unloading robot:', robotId);
      
      if (currentViewer.removeRobot) {
        currentViewer.removeRobot(robotId);
      }
      
      setLoadedRobots(prev => {
        const newMap = new Map(prev);
        newMap.delete(robotId);
        return newMap;
      });
      
      if (activeRobotId === robotId) {
        setActiveRobotId(null);
      }
      
      EventBus.emit('robot:unloaded', { robotId });
    } catch (err) {
      console.error('[RobotContext] Error unloading robot:', err);
      setError(err.message);
    }
  }, [viewer, activeRobotId]);

  const isRobotLoaded = useCallback((robotId) => {
    return loadedRobots.has(robotId);
  }, [loadedRobots]);

  const getLoadedRobot = useCallback((robotId) => {
    return loadedRobots.get(robotId)?.robot;
  }, [loadedRobots]);

  const getActiveRobot = useCallback(() => {
    if (!activeRobotId) return null;
    return loadedRobots.get(activeRobotId)?.robot;
  }, [activeRobotId, loadedRobots]);

  const setRobotActive = useCallback((robotId) => {
    if (loadedRobots.has(robotId)) {
      setActiveRobotId(robotId);
      EventBus.emit('robot:active-changed', { robotId });
    }
  }, [loadedRobots]);

  // Get robot status - MOVED AFTER isRobotLoaded is defined
  const getRobotStatus = useCallback((robotId) => {
    const isLoaded = isRobotLoaded(robotId);
    const inWorkspace = isRobotInWorkspace(robotId);
    const isActive = activeRobotId === robotId;
    
    return {
      isLoaded,
      inWorkspace,
      isActive,
      status: isActive ? 'active' : isLoaded ? 'loaded' : inWorkspace ? 'workspace' : 'unknown'
    };
  }, [activeRobotId, isRobotLoaded, isRobotInWorkspace]);

  // ===============================
  // SERVER OPERATIONS (Add New Robots)
  // ===============================

  const addNewRobot = useCallback(async (formData) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('/api/robots/add', {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Refresh available robots
        await discoverRobots();
        
        // Add to workspace automatically
        const newRobotData = {
          id: result.robot.id,
          name: result.robot.name,
          manufacturer: result.robot.manufacturer,
          urdfPath: `/robots/${result.robot.manufacturer}/${result.robot.name}/${result.robot.urdfFile}`
        };
        
        const workspaceRobot = addRobotToWorkspace(newRobotData);
        
        console.log('[RobotContext] New robot added and added to workspace:', workspaceRobot);
        return { success: true, robot: workspaceRobot };
      } else {
        throw new Error(result.message);
      }
    } catch (err) {
      console.error('[RobotContext] Error adding new robot:', err);
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setIsLoading(false);
    }
  }, [discoverRobots, addRobotToWorkspace]);

  // ===============================
  // INITIALIZATION
  // ===============================

  useEffect(() => {
    discoverRobots();
  }, [discoverRobots]);

  // Listen for robot events
  useEffect(() => {
    const handleRobotRemoved = (data) => {
      if (data.robotId === activeRobotId) {
        setActiveRobotId(null);
      }
      
      setLoadedRobots(prev => {
        const newMap = new Map(prev);
        newMap.delete(data.robotId);
        return newMap;
      });
    };
    
    const unsubscribeRemoved = EventBus.on('robot:removed', handleRobotRemoved);
    
    return () => {
      unsubscribeRemoved();
    };
  }, [activeRobotId]);

  // ===============================
  // CONTEXT VALUE (Data Transfer Interface)
  // ===============================

  const value = {
    // === WORKSPACE DATA ===
    workspaceRobots,
    workspaceCount: workspaceRobots.length,
    
    // === AVAILABLE ROBOTS DATA ===
    availableRobots,
    categories,
    
    // === LOADED ROBOTS DATA ===
    loadedRobots: Array.from(loadedRobots.values()),
    loadedRobotsMap: loadedRobots,
    activeRobotId,
    activeRobot: getActiveRobot(),
    
    // === UI STATE ===
    isLoading,
    error,
    
    // === WORKSPACE METHODS ===
    addRobotToWorkspace,
    removeRobotFromWorkspace,
    isRobotInWorkspace,
    
    // === AVAILABLE ROBOTS METHODS ===
    discoverRobots,
    refreshRobots: discoverRobots,
    
    // === LOADED ROBOTS METHODS ===
    loadRobot,
    unloadRobot,
    isRobotLoaded,
    getLoadedRobot,
    getActiveRobot,
    setRobotActive,
    
    // === SERVER METHODS ===
    addNewRobot,
    
    // === VIEWER MANAGEMENT ===
    setViewer,
    
    // === UTILS ===
    clearError: () => setError(null),
    getRobotStatus,
    
    // === COMPUTED DATA ===
    hasWorkspaceRobots: workspaceRobots.length > 0,
    hasLoadedRobots: loadedRobots.size > 0,
    loadedRobotCount: loadedRobots.size
  };
  
  return (
    <RobotContext.Provider value={value}>
      {children}
    </RobotContext.Provider>
  );
};

// Export useRobot hook for components
export const useRobot = () => {
  const context = useContext(RobotContext);
  if (!context) {
    throw new Error('useRobot must be used within RobotProvider');
  }
  return context;
};

export default RobotContext; 