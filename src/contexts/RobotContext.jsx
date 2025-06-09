// src/contexts/RobotContext.jsx - UNIFIED BRAIN (Same as Environment Pattern)
import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useViewer } from './ViewerContext';
import EventBus from '../utils/EventBus';

const RobotContext = createContext(null);

export const RobotProvider = ({ children }) => {
  const { isViewerReady, viewerInstance } = useViewer();
  
  // Request deduplication
  const isDiscoveringRef = useRef(false);
  const hasInitializedRef = useRef(false);
  
  // ========== UNIFIED STATE (All Robot Data) ==========
  
  // Robot Discovery State (from old RobotContext)
  const [availableRobots, setAvailableRobots] = useState([]);
  const [categories, setCategories] = useState([]);
  
  // Workspace State (from old WorkspaceContext)
  const [workspaceRobots, setWorkspaceRobots] = useState([]);
  
  // Active Robot Management 
  const [activeRobotId, setActiveRobotIdState] = useState(null);
  const [activeRobot, setActiveRobot] = useState(null);
  const [loadedRobots, setLoadedRobots] = useState(new Map());
  
  // Loading & Error States
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  
  // ========== ROBOT DISCOVERY OPERATIONS ==========
  
  const discoverRobots = async () => {
    // Prevent multiple simultaneous requests
    if (isDiscoveringRef.current) {
      console.log('[RobotContext] Discovery already in progress, skipping...');
      return;
    }
    
    try {
      isDiscoveringRef.current = true;
      setIsLoading(true);
      setError(null);
      
      // Add timeout and better error handling
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch('/robots/list', {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      clearTimeout(timeout);
      
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
        console.log('[RobotContext] Discovered robots:', allRobots.length);
      } else {
        throw new Error('Failed to load robots');
      }
    } catch (err) {
      console.error('[RobotContext] Failed to discover robots:', err);
      if (err.name === 'AbortError') {
        setError('Request timed out. Please check if the server is running.');
      } else if (err.message.includes('fetch')) {
        setError('Cannot connect to server. Please ensure the server is running on port 3001.');
      } else {
        setError(`Discovery failed: ${err.message}`);
      }
    } finally {
      setIsLoading(false);
      isDiscoveringRef.current = false;
    }
  };
  
  // ========== WORKSPACE MANAGEMENT OPERATIONS ==========
  
  // Load workspace robots from localStorage on mount
  useEffect(() => {
    try {
      const savedRobots = localStorage.getItem('workspaceRobots');
      if (savedRobots) {
        const robots = JSON.parse(savedRobots);
        setWorkspaceRobots(robots);
        console.log('[RobotContext] Loaded workspace robots from localStorage:', robots.length);
      }
    } catch (error) {
      console.error('[RobotContext] Error loading saved robots:', error);
      setError('Failed to load saved robots');
    }
  }, []);

  // Save workspace robots to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('workspaceRobots', JSON.stringify(workspaceRobots));
      console.log('[RobotContext] Saved workspace robots to localStorage:', workspaceRobots.length);
    } catch (error) {
      console.error('[RobotContext] Error saving robots:', error);
      setError('Failed to save robots');
    }
  }, [workspaceRobots]);

  // Add robot to workspace
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
      // Check if robot already exists
      const exists = prev.some(r => r.robotId === robotData.id);
      if (exists) {
        console.log('[RobotContext] Robot already in workspace:', robotData.name);
        return prev;
      }
      
      console.log('[RobotContext] Adding robot to workspace:', newRobot);
      return [...prev, newRobot];
    });
    
    setSuccessMessage(`${robotData.name} added to workspace!`);
    setTimeout(() => setSuccessMessage(''), 3000);
    
    return newRobot;
  }, []);

  // Remove robot from workspace
  const removeRobotFromWorkspace = useCallback((workspaceRobotId) => {
    setWorkspaceRobots(prev => {
      const robotToRemove = prev.find(r => r.id === workspaceRobotId);
      const updated = prev.filter(r => r.id !== workspaceRobotId);
      console.log('[RobotContext] Removing robot from workspace:', robotToRemove?.name);
      return updated;
    });
    
    setSuccessMessage('Robot removed from workspace');
    setTimeout(() => setSuccessMessage(''), 3000);
  }, []);

  // Check if robot is in workspace
  const isRobotInWorkspace = useCallback((robotId) => {
    return workspaceRobots.some(r => r.robotId === robotId);
  }, [workspaceRobots]);

  // Get workspace robot by ID
  const getWorkspaceRobot = useCallback((workspaceRobotId) => {
    return workspaceRobots.find(r => r.id === workspaceRobotId);
  }, [workspaceRobots]);

  // Clear workspace
  const clearWorkspace = useCallback(() => {
    if (window.confirm('Clear all robots from workspace?')) {
      setWorkspaceRobots([]);
      console.log('[RobotContext] Cleared all robots from workspace');
      setSuccessMessage('Workspace cleared');
      setTimeout(() => setSuccessMessage(''), 3000);
    }
  }, []);

  // ========== ROBOT LOADING OPERATIONS ==========
  
  // 🚨 FIXED: Synchronized setActiveRobotId that also updates activeRobot
  const setActiveRobotId = useCallback((robotId) => {
    console.log(`[RobotContext] Setting active robot ID to: ${robotId}`);
    setActiveRobotIdState(robotId);
    
    if (robotId) {
      const robotData = loadedRobots.get(robotId);
      if (robotData) {
        console.log(`[RobotContext] Setting active robot object for: ${robotId}`);
        setActiveRobot(robotData.robot);
        
        // Emit event for other components
        EventBus.emit('robot:active-changed', { 
          robotId, 
          robot: robotData.robot 
        });
      } else {
        console.warn(`[RobotContext] Robot ${robotId} not found in loaded robots`);
        setActiveRobot(null);
      }
    } else {
      setActiveRobot(null);
    }
  }, [loadedRobots]);
  
  // Load robot using viewer
  const loadRobot = useCallback(async (robotId, urdfPath, options = {}) => {
    if (!viewerInstance) {
      throw new Error('Viewer not initialized');
    }
    
    try {
      setIsLoading(true);
      setError(null);
      
      console.log(`[RobotContext] Loading robot ${robotId} from ${urdfPath}`);
      
      const robot = await viewerInstance.loadRobot(robotId, urdfPath, options);
      
      // Update loaded robots map
      setLoadedRobots(prev => {
        const newMap = new Map(prev);
        newMap.set(robotId, {
          id: robotId,
          robot: robot,
          urdfPath,
          isActive: options.makeActive !== false,
          loadedAt: new Date().toISOString()
        });
        return newMap;
      });
      
      // Set as active if requested (use the synchronized method)
      if (options.makeActive !== false) {
        // Use setTimeout to ensure loadedRobots state is updated first
        setTimeout(() => {
          setActiveRobotId(robotId);
        }, 0);
      }
      
      setSuccessMessage(`${robotId} loaded successfully!`);
      setTimeout(() => setSuccessMessage(''), 3000);
      
      EventBus.emit('robot:loaded', { robotId, robot });
      
      return robot;
    } catch (err) {
      console.error('[RobotContext] Error loading robot:', err);
      setError('Failed to load robot: ' + err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [viewerInstance, setActiveRobotId]);
  
  // Check if robot is loaded
  const isRobotLoaded = useCallback((robotId) => {
    return loadedRobots.has(robotId);
  }, [loadedRobots]);
  
  // Get robot by ID
  const getRobot = useCallback((robotId) => {
    const robotData = loadedRobots.get(robotId);
    return robotData?.robot;
  }, [loadedRobots]);
  
  // Unload robot
  const unloadRobot = useCallback((robotId) => {
    if (!viewerInstance) return;
    
    try {
      // Remove from viewer if it has unloadRobot method
      if (viewerInstance.unloadRobot) {
        viewerInstance.unloadRobot(robotId);
      }
      
      setLoadedRobots(prev => {
        const newMap = new Map(prev);
        newMap.delete(robotId);
        return newMap;
      });
      
      if (activeRobotId === robotId) {
        setActiveRobotId(null);
      }
      
      setSuccessMessage(`${robotId} unloaded`);
      setTimeout(() => setSuccessMessage(''), 3000);
      
      EventBus.emit('robot:unloaded', { robotId });
    } catch (err) {
      console.error('[RobotContext] Error unloading robot:', err);
      setError(err.message);
    }
  }, [viewerInstance, activeRobotId, setActiveRobotId]);

  // ========== ROBOT STATUS OPERATIONS ==========
  
  const getRobotLoadStatus = useCallback((robot) => {
    const loaded = isRobotLoaded(robot.id);
    return {
      isLoaded: loaded,
      statusText: loaded ? 'Loaded' : 'Click to Load'
    };
  }, [isRobotLoaded]);

  // ========== IMPORT/EXPORT OPERATIONS ==========
  
  // Import robots (from file)
  const importRobots = useCallback((robotsData) => {
    try {
      setWorkspaceRobots(robotsData);
      setSuccessMessage(`Imported ${robotsData.length} robots`);
      setTimeout(() => setSuccessMessage(''), 3000);
      console.log('[RobotContext] Imported robots:', robotsData.length);
    } catch (error) {
      console.error('[RobotContext] Error importing robots:', error);
      setError('Failed to import robots');
    }
  }, []);

  // Export robots (to file)
  const exportRobots = useCallback(() => {
    try {
      const dataStr = JSON.stringify(workspaceRobots, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `workspace_robots_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
      setSuccessMessage('Robots exported successfully');
      setTimeout(() => setSuccessMessage(''), 3000);
      console.log('[RobotContext] Exported robots to file');
    } catch (error) {
      console.error('[RobotContext] Error exporting robots:', error);
      setError('Failed to export robots');
    }
  }, [workspaceRobots]);

  // ========== EVENT LISTENERS ==========
  
  // Listen for robot events
  useEffect(() => {
    const handleRobotRemoved = (data) => {
      if (data.robotName === activeRobotId) {
        setActiveRobotId(null);
      }
      
      setLoadedRobots(prev => {
        const newMap = new Map(prev);
        newMap.delete(data.robotName);
        return newMap;
      });
    };
    
    const unsubscribeRemoved = EventBus.on('robot:removed', handleRobotRemoved);
    
    return () => {
      unsubscribeRemoved();
    };
  }, [activeRobotId, setActiveRobotId]);
  
  // ========== INITIALIZATION ==========
  
  // Initialize on mount with deduplication
  useEffect(() => {
    if (isViewerReady && !hasInitializedRef.current) {
      console.log('[RobotContext] Viewer ready, discovering robots...');
      hasInitializedRef.current = true;
      discoverRobots();
    }
  }, [isViewerReady]);

  // ========== ERROR HANDLING ==========
  
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clearSuccess = useCallback(() => {
    setSuccessMessage('');
  }, []);

  // ========== CONTEXT VALUE ==========
  
  const value = {
    // ========== STATE ==========
    // Robot Discovery
    availableRobots,
    categories,
    
    // Workspace Management
    workspaceRobots,
    
    // Active Robot Management
    activeRobotId,
    activeRobot,
    loadedRobots,
    
    // Loading & Error States
    isLoading,
    error,
    successMessage,
    
    // ========== ROBOT DISCOVERY OPERATIONS ==========
    discoverRobots,
    refresh: discoverRobots,
    
    // ========== WORKSPACE OPERATIONS ==========
    addRobotToWorkspace,
    removeRobotFromWorkspace,
    isRobotInWorkspace,
    getWorkspaceRobot,
    clearWorkspace,
    importRobots,
    exportRobots,
    
    // ========== ROBOT LOADING OPERATIONS ==========
    loadRobot,
    unloadRobot,
    isRobotLoaded,
    getRobot,
    setActiveRobotId,
    setActiveRobot,
    getRobotLoadStatus,
    
    // ========== CONVENIENCE METHODS ==========
    getLoadedRobots: () => loadedRobots,
    
    // ========== COMPUTED PROPERTIES ==========
    robotCount: workspaceRobots.length,
    isEmpty: workspaceRobots.length === 0,
    hasWorkspaceRobots: workspaceRobots.length > 0,
    hasAvailableRobots: availableRobots.length > 0,
    hasLoadedRobots: loadedRobots.size > 0,
    hasActiveRobot: !!activeRobotId,
    
    // ========== ERROR HANDLING ==========
    clearError,
    clearSuccess
  };
  
  return (
    <RobotContext.Provider value={value}>
      {children}
    </RobotContext.Provider>
  );
};

export const useRobotContext = () => {
  const context = useContext(RobotContext);
  if (!context) {
    throw new Error('useRobotContext must be used within a RobotProvider');
  }
  return context;
};

export default RobotContext;