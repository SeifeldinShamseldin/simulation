// src/contexts/RobotContext.jsx - OPTIMIZED VERSION
import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import * as THREE from 'three';
import EventBus from '../utils/EventBus';
import URDFLoader from '../core/Loader/URDFLoader';
import * as DataTransfer from './dataTransfer';

// Debug flag - set to false in production
const DEBUG = process.env.NODE_ENV === 'development';
const log = DEBUG ? console.log : () => {};

const RobotContext = createContext(null);

// Loading state constants
const LOADING_STATES = {
  IDLE: 'idle',
  LOADING: 'loading',
  LOADED: 'loaded',
  ERROR: 'error'
};

/**
 * Properly dispose of THREE.js objects including textures
 */
const disposeObject3D = (object) => {
  object.traverse(child => {
    if (child.geometry) {
      child.geometry.dispose();
    }
    
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach(material => {
        // Dispose all material properties
        Object.keys(material).forEach(key => {
          const value = material[key];
          if (value && typeof value.dispose === 'function') {
            value.dispose();
          }
        });
        material.dispose();
      });
    }
  });
  
  // Clear from parent
  if (object.parent) {
    object.parent.remove(object);
  }
};

/**
 * Validate robot structure after loading
 */
const validateRobotStructure = (robot, robotId) => {
  log(`[RobotContext] Validating robot structure for ${robotId}`);

  const validation = {
    hasJoints: false,
    jointCount: 0,
    hasSetJointValue: false,
    hasSetJointValues: false,
    jointMethods: [],
    issues: []
  };

  // Check if robot has joints
  if (robot.joints && typeof robot.joints === 'object') {
    validation.hasJoints = true;
    validation.jointCount = Object.keys(robot.joints).length;
    
    // Check each joint
    Object.entries(robot.joints).forEach(([jointName, joint]) => {
      if (joint.jointType !== 'fixed') {
        const jointInfo = {
          name: jointName,
          hasSetJointValue: typeof joint.setJointValue === 'function',
          hasAngle: typeof joint.angle !== 'undefined',
          hasSetPosition: typeof joint.setPosition === 'function'
        };
        
        validation.jointMethods.push(jointInfo);
        
        if (!jointInfo.hasSetJointValue) {
          validation.issues.push(`Joint ${jointName} missing setJointValue method`);
        }
      }
    });
  } else {
    validation.issues.push('Robot has no joints object');
  }

  // Check robot-level methods
  validation.hasSetJointValue = typeof robot.setJointValue === 'function';
  validation.hasSetJointValues = typeof robot.setJointValues === 'function';

  log(`[RobotContext] Validation results for ${robotId}:`, validation);

  return validation;
};

export const RobotProvider = ({ children }) => {
  // ========== REFS (Optimized) ==========
  const sceneSetupRef = useRef(null);
  const urdfLoaderRef = useRef(null);
  const loadQueueRef = useRef([]);
  const robotManufacturerMap = useRef(new Map());
  const robotIndexMap = useRef(new Map()); // NEW: Fast robot lookup
  const timeoutIdsRef = useRef(new Set()); // NEW: Track timeouts for cleanup
  const abortControllerRef = useRef(null); // NEW: For cancelling fetch requests
  const initializedRef = useRef(false);
  const isDiscoveringRef = useRef(false);

  // ========== STATE (Optimized - removed duplicates) ==========
  
  // Robot Discovery State
  const [availableRobots, setAvailableRobots] = useState([]);
  const [categories, setCategories] = useState([]);
  const [availableTools, setAvailableTools] = useState([]);

  // Workspace State
  const [workspaceRobots, setWorkspaceRobots] = useState([]);

  // Active Robot Management (simplified)
  const [activeRobotId, setActiveRobotIdState] = useState(null);
  const [loadedRobots, setLoadedRobots] = useState(new Map());
  const [loadingStates, setLoadingStates] = useState(new Map());

  // Loading & Error States
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);

  // ========== HELPER FUNCTIONS ==========
  
  // Centralized timeout management
  const setManagedTimeout = useCallback((callback, delay) => {
    const timeoutId = setTimeout(() => {
      timeoutIdsRef.current.delete(timeoutId);
      callback();
    }, delay);
    timeoutIdsRef.current.add(timeoutId);
    return timeoutId;
  }, []);

  const clearManagedTimeout = useCallback((timeoutId) => {
    clearTimeout(timeoutId);
    timeoutIdsRef.current.delete(timeoutId);
  }, []);

  // Clear all timeouts on unmount
  useEffect(() => {
    return () => {
      timeoutIdsRef.current.forEach(clearTimeout);
      timeoutIdsRef.current.clear();
      
      // Cancel any pending fetch requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // ========== INITIALIZATION (Optimized) ==========
  
  useEffect(() => {
    const requestId = `req-scene-${Date.now()}`;
    let timeoutId;

    const handleSceneResponse = (response) => {
      if (initializedRef.current) return;
      if (response.requestId === requestId) {
        clearManagedTimeout(timeoutId);
        EventBus.off(DataTransfer.EVENT_VIEWER_HERE_IS_SCENE, handleSceneResponse);
        if (response.success && response.payload?.getSceneSetup) {
          sceneSetupRef.current = response.payload.getSceneSetup();
          urdfLoaderRef.current = new URDFLoader(new THREE.LoadingManager());
          urdfLoaderRef.current.parseVisual = true;
          urdfLoaderRef.current.parseCollision = false;
          setIsInitialized(true);
          initializedRef.current = true;
          
          log(`[RobotContext] Initialized. Processing ${loadQueueRef.current.length} queued robot loads.`);
          
          // Process queued loads
          loadQueueRef.current.forEach(req => {
            _loadRobotInternal(req.robotId, req.urdfPath, req.options)
              .then(req.resolve)
              .catch(req.reject);
          });
          loadQueueRef.current = [];
        } else {
          const initError = new Error('Failed to acquire a 3D scene from the viewer.');
          setError(initError.message);
          loadQueueRef.current.forEach(req => req.reject(initError));
          loadQueueRef.current = [];
          initializedRef.current = true;
        }
      }
    };

    const requestScene = () => {
      if (initializedRef.current) return;
      log('[RobotContext] Viewer is ready, requesting scene...');
      EventBus.on(DataTransfer.EVENT_VIEWER_HERE_IS_SCENE, handleSceneResponse);
      EventBus.emit(DataTransfer.EVENT_ROBOT_NEEDS_SCENE, { requestId });
      
      timeoutId = setManagedTimeout(() => {
        if (!initializedRef.current) {
          setError('Viewer did not respond to scene request in time.');
          EventBus.off(DataTransfer.EVENT_VIEWER_HERE_IS_SCENE, handleSceneResponse);
          const initError = new Error('Viewer response timeout.');
          loadQueueRef.current.forEach(req => req.reject(initError));
          loadQueueRef.current = [];
          initializedRef.current = true;
        }
      }, 5000);
    };
    
    EventBus.on(DataTransfer.EVENT_VIEWER_READY, requestScene);

    return () => {
      if (timeoutId) clearManagedTimeout(timeoutId);
      EventBus.off(DataTransfer.EVENT_VIEWER_HERE_IS_SCENE, handleSceneResponse);
      EventBus.off(DataTransfer.EVENT_VIEWER_READY, requestScene);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ========== INDEXING & OPTIMIZATION ==========
  
  // Update manufacturer map and robot index when categories change
  useEffect(() => {
    robotManufacturerMap.current.clear();
    robotIndexMap.current.clear();
    
    categories.forEach(category => {
      category.robots?.forEach(robot => {
        robotManufacturerMap.current.set(robot.id, category.id);
        robotIndexMap.current.set(robot.id, { ...robot, manufacturer: category.id });
      });
    });
    
    log('[RobotContext] Maps updated:', {
      manufacturers: robotManufacturerMap.current.size,
      robots: robotIndexMap.current.size
    });
  }, [categories]);

  // ========== ROBOT DISCOVERY (Optimized with AbortController) ==========

  const discoverRobots = useCallback(async () => {
    if (isDiscoveringRef.current) {
      log('[RobotContext] Discovery already in progress, skipping...');
      return;
    }
    
    // Cancel any previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();
    
    try {
      isDiscoveringRef.current = true;
      setIsLoading(true);
      setError(null);
      
      log('[RobotContext] Discovering robots...');
      
      const response = await fetch('/api/robots/scan', {
        signal: abortControllerRef.current.signal
      });
      const result = await response.json();
      
      if (result.success) {
        const data = result.categories || [];
        setCategories(data);
        
        const allRobots = [];
        data.forEach(category => {
          (category.robots || []).forEach(robot => {
            allRobots.push({
              ...robot,
              manufacturer: category.id, // Standardize on 'manufacturer'
              manufacturerLogoPath: category.manufacturerLogoPath,
            });
          });
        });
        
        setAvailableRobots(allRobots);
        log('[RobotContext] Discovered robots:', allRobots.length);
      } else {
        setError(result.message || 'Failed to scan robots directory');
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('[RobotContext] Robot discovery error:', err);
        setError('Error connecting to server. Please ensure the server is running on port 3001.');
      }
    } finally {
      setIsLoading(false);
      isDiscoveringRef.current = false;
    }
  }, []);

  // ========== WORKSPACE MANAGEMENT (Optimized localStorage) ==========

  // Load workspace robots once on mount
  useEffect(() => {
    try {
      const savedRobots = localStorage.getItem('workspaceRobots');
      if (savedRobots) {
        const robots = JSON.parse(savedRobots);
        setWorkspaceRobots(robots);
        log('[RobotContext] Loaded workspace robots from localStorage:', robots.length);
      }
    } catch (error) {
      console.error('[RobotContext] Error loading saved robots:', error);
    }
  }, []);

  // Debounced save to localStorage
  useEffect(() => {
    const saveTimeout = setManagedTimeout(() => {
      try {
        localStorage.setItem('workspaceRobots', JSON.stringify(workspaceRobots));
        log('[RobotContext] Saved workspace robots to localStorage');
      } catch (error) {
        console.error('[RobotContext] Error saving robots:', error);
      }
    }, 500); // Debounce for 500ms

    return () => clearManagedTimeout(saveTimeout);
  }, [workspaceRobots, setManagedTimeout, clearManagedTimeout]);

  // ========== OPTIMIZED MANUFACTURER LOOKUP ==========
  
  const getManufacturer = useCallback((robotId) => {
    if (!robotId) return null;
    
    // For objects, extract ID
    if (typeof robotId === 'object') {
      robotId = robotId.id || robotId.robotId;
    }
    
    const baseRobotId = robotId.split('_')[0];
    
    // O(1) lookup from map
    return robotManufacturerMap.current.get(baseRobotId) || 
           robotManufacturerMap.current.get(robotId) || 
           'unknown';
  }, []);

  // ========== ROBOT OPERATIONS (Simplified) ==========

  const addRobotToWorkspace = useCallback((robotData) => {
    const robotId = `${robotData.id}_${Date.now()}`;
    const newRobot = {
      id: robotId,
      robotId: robotData.id,
      name: robotData.name,
      manufacturer: robotData.manufacturer || getManufacturer(robotData.id),
      urdfPath: robotData.urdfPath,
      imagePath: robotData.imagePath,
      addedAt: new Date().toISOString()
    };
    
    setWorkspaceRobots(prev => {
      const exists = prev.some(r => r.robotId === robotData.id);
      if (exists) {
        log('[RobotContext] Robot already in workspace:', robotData.name);
        return prev;
      }
      return [...prev, newRobot];
    });
    
    setSuccessMessage(`${robotData.name} added to workspace!`);
    setManagedTimeout(() => setSuccessMessage(''), 3000);
    
    // Update maps
    robotManufacturerMap.current.set(robotId, newRobot.manufacturer);
    
    return newRobot;
  }, [getManufacturer, setManagedTimeout]);

  const isRobotLoaded = useCallback((robotId) => {
    return loadedRobots.has(robotId);
  }, [loadedRobots]);

  const setActiveRobotId = useCallback((robotId) => {
    log(`[RobotContext] Setting active robot ID to: ${robotId}`);
    setActiveRobotIdState(robotId);
    
    if (robotId) {
      const robotData = loadedRobots.get(robotId);
      if (robotData) {
        const robot = robotData.robot;
        EventBus.emit('robot:active-changed', { robotId, robot });
      }
    }
  }, [loadedRobots]);

  // Active robot getter
  const activeRobot = useMemo(() => {
    if (!activeRobotId) return null;
    const robotData = loadedRobots.get(activeRobotId);
    return robotData?.robot || null;
  }, [activeRobotId, loadedRobots]);

  // Active robots Set (computed from activeRobotId)
  const activeRobots = useMemo(() => {
    return new Set(activeRobotId ? [activeRobotId] : []);
  }, [activeRobotId]);

  const unloadRobot = useCallback((robotId) => {
    const robotData = loadedRobots.get(robotId);
    if (!robotData) return;
    
    // Properly dispose THREE.js objects
    if (robotData.container) {
      disposeObject3D(robotData.container);
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
    setManagedTimeout(() => setSuccessMessage(''), 3000);
    
    EventBus.emit('robot:unloaded', { robotId });
    EventBus.emit('robot:removed', { robotName: robotId, robotId });
  }, [loadedRobots, activeRobotId, setActiveRobotId, setManagedTimeout]);

  const removeRobotFromWorkspace = useCallback((workspaceRobotId) => {
    setWorkspaceRobots(prev => {
      const robotToRemove = prev.find(r => r.id === workspaceRobotId);
      if (robotToRemove && isRobotLoaded(robotToRemove.id)) {
        unloadRobot(robotToRemove.id);
      }
      return prev.filter(r => r.id !== workspaceRobotId);
    });
    
    setSuccessMessage('Robot removed from workspace');
    setManagedTimeout(() => setSuccessMessage(''), 3000);
  }, [isRobotLoaded, unloadRobot, setManagedTimeout]);

  const isRobotInWorkspace = useCallback((robotId) => {
    return workspaceRobots.some(r => r.robotId === robotId);
  }, [workspaceRobots]);

  const getWorkspaceRobot = useCallback((workspaceRobotId) => {
    return workspaceRobots.find(r => r.id === workspaceRobotId);
  }, [workspaceRobots]);

  const clearWorkspace = useCallback(() => {
    if (window.confirm('Clear all robots from workspace?')) {
      // Unload all loaded robots
      loadedRobots.forEach((_, robotId) => unloadRobot(robotId));
      setWorkspaceRobots([]);
      setSuccessMessage('Workspace cleared');
      setManagedTimeout(() => setSuccessMessage(''), 3000);
    }
  }, [loadedRobots, unloadRobot, setManagedTimeout]);

  // ========== ROBOT LOADING (Optimized) ==========

  const isRobotReady = useCallback((robotId) => {
    const robotData = loadedRobots.get(robotId);
    const robot = robotData?.robot;
    const loadingState = loadingStates.get(robotId);
    
    return robot && 
           robot.setJointValues && 
           loadingState === LOADING_STATES.LOADED;
  }, [loadedRobots, loadingStates]);

  const _loadRobotInternal = useCallback(async (robotId, urdfPath, options = {}) => {
    const { 
      onProgress, 
      onComplete, 
      onError,
      position = { x: 0, y: 0, z: 0 },
      manufacturer = null
    } = options;

    log(`[RobotContext] Starting internal load for: ${robotId}`);
    setLoadingStates(prev => new Map(prev).set(robotId, LOADING_STATES.LOADING));

    const scene = sceneSetupRef.current?.scene;
    if (!scene || !sceneSetupRef.current.robotRoot) {
      const errorMsg = `Scene not available for loading ${robotId}`;
      setLoadingStates(prev => new Map(prev).set(robotId, LOADING_STATES.ERROR));
      if (onError) onError(new Error(errorMsg));
      throw new Error(errorMsg);
    }

    try {
      const packagePath = urdfPath.substring(0, urdfPath.lastIndexOf('/'));
      urdfLoaderRef.current.resetLoader();
      urdfLoaderRef.current.packages = { default: packagePath };
      
      const robot = await new Promise((resolve, reject) => {
        urdfLoaderRef.current.load(
          urdfPath,
          resolve,
          onProgress || null,
          reject
        );
      });
      
      robot.name = robotId;
      robot.robotName = robotId; // Compatibility

      const validation = validateRobotStructure(robot, robotId);
      if (validation.issues.length > 0) {
        console.warn(`[RobotContext] Robot structure issues for ${robotId}:`, validation.issues);
      }
      
      const robotManufacturer = manufacturer || getManufacturer(robotId) || 'unknown';

      const robotData = {
        robot: robot, // Single reference, no 'model' duplicate
        id: robotId,
        urdfPath: urdfPath,
        manufacturer: robotManufacturer,
        addedAt: new Date().toISOString(),
        validation: validation,
      };
      
      const robotContainer = new THREE.Object3D();
      robotContainer.name = `${robotId}_container`;
      robotContainer.add(robot);
      robotContainer.position.set(position.x, position.y, position.z);
      sceneSetupRef.current.robotRoot.add(robotContainer);
      robotData.container = robotContainer;

      setLoadedRobots(prev => new Map(prev).set(robotId, robotData));
      setLoadingStates(prev => new Map(prev).set(robotId, LOADING_STATES.LOADED));

      if (!activeRobotId) {
        setActiveRobotId(robotId);
      }
      
      log(`[RobotContext] Successfully loaded robot: ${robotId}`);
      
      EventBus.emit(DataTransfer.EVENT_ROBOT_LOADED, { 
        robotName: robotId, 
        robot: robot, 
        robotId: robotId 
      });

      if (onComplete) onComplete(robot);

      return robot;
    } catch (error) {
      console.error(`[RobotContext] Error loading robot ${robotId}:`, error);
      setLoadingStates(prev => new Map(prev).set(robotId, LOADING_STATES.ERROR));
      setError(`Failed to load robot: ${robotId}`);
      if (onError) onError(error);
      throw error;
    }
  }, [activeRobotId, setActiveRobotId, getManufacturer]);

  const loadRobot = useCallback(async (robotId, urdfPath, options = {}) => {
    if (!isInitialized) {
      log(`[RobotContext] Context not ready. Queuing load for: ${robotId}`);
      return new Promise((resolve, reject) => {
        loadQueueRef.current.push({ robotId, urdfPath, options, resolve, reject });
      });
    }
    
    return _loadRobotInternal(robotId, urdfPath, options);
  }, [isInitialized, _loadRobotInternal]);

  const getRobot = useCallback((robotId) => {
    if (!robotId) return null;
    
    // Direct O(1) lookup
    const robotData = loadedRobots.get(robotId);
    if (robotData) {
      return robotData.robot;
    }
    
    // Try base robot ID
    const baseRobotId = robotId.split('_')[0];
    for (const [key, data] of loadedRobots.entries()) {
      if (key.startsWith(baseRobotId + '_')) {
        return data.robot;
      }
    }
    
    return null;
  }, [loadedRobots]);

  const getAllRobots = useCallback(() => {
    return new Map(loadedRobots);
  }, [loadedRobots]);

  const getActiveRobots = useCallback(() => {
    return activeRobotId ? [activeRobotId] : [];
  }, [activeRobotId]);

  const setRobotActive = useCallback((robotId, isActive) => {
    if (isActive) {
      setActiveRobotId(robotId);
    } else if (activeRobotId === robotId) {
      setActiveRobotId(null);
    }
    
    const robotData = loadedRobots.get(robotId);
    if (robotData?.container) {
      robotData.container.visible = isActive;
    }
    
    return true;
  }, [activeRobotId, setActiveRobotId, loadedRobots]);

  // ========== STATUS & UTILITIES ==========

  const getRobotLoadStatus = useCallback((robot) => {
    const loaded = isRobotLoaded(robot.id);
    return {
      isLoaded: loaded,
      statusText: loaded ? 'Loaded' : 'Click to Load'
    };
  }, [isRobotLoaded]);

  const importRobots = useCallback((robotsData) => {
    try {
      setWorkspaceRobots(robotsData);
      setSuccessMessage(`Imported ${robotsData.length} robots`);
      setManagedTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('[RobotContext] Error importing robots:', error);
      setError('Failed to import robots');
    }
  }, [setManagedTimeout]);

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
      setManagedTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('[RobotContext] Error exporting robots:', error);
      setError('Failed to export robots');
    }
  }, [workspaceRobots, setManagedTimeout]);

  // ========== EVENT LISTENERS ==========

  useEffect(() => {
    const handleRobotRemoved = (data) => {
      if (data.robotName === activeRobotId) {
        setActiveRobotId(null);
      }
    };
    
    const unsubscribeRemoved = EventBus.on('robot:removed', handleRobotRemoved);
    
    return () => {
      unsubscribeRemoved();
    };
  }, [activeRobotId, setActiveRobotId]);

  // ========== TCP TOOLS (Simplified) ==========

  const loadAvailableTools = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/tcp/scan');
      const result = await response.json();
      
      if (result.success) {
        setAvailableTools(result.tools || []);
      } else {
        setError(result.message || 'Failed to scan TCP tools');
      }
    } catch (err) {
      console.error('[RobotContext] Error scanning tools:', err);
      setError('Error connecting to server.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initialize on mount
  useEffect(() => {
    if (isInitialized) {
      discoverRobots();
      loadAvailableTools();
    }
  }, [isInitialized, discoverRobots, loadAvailableTools]);

  // ========== ERROR HANDLING ==========

  const clearError = useCallback(() => setError(null), []);
  const clearSuccess = useCallback(() => setSuccessMessage(''), []);

  // ========== CONTEXT VALUE (Optimized) ==========

  const value = useMemo(() => ({
    // State
    availableRobots,
    categories,
    availableTools,
    workspaceRobots,
    activeRobotId,
    activeRobot,
    loadedRobots,
    robots: loadedRobots, // Alias
    activeRobots,
    loadingStates,
    isLoading,
    error,
    successMessage,
    
    // Robot Discovery
    discoverRobots,
    refresh: discoverRobots,
    
    // TCP Tools
    loadAvailableTools,
    
    // Workspace Operations
    addRobotToWorkspace,
    removeRobotFromWorkspace,
    isRobotInWorkspace,
    getWorkspaceRobot,
    clearWorkspace,
    importRobots,
    exportRobots,
    
    // Robot Loading
    loadRobot,
    unloadRobot,
    isRobotLoaded,
    getRobot,
    setActiveRobotId,
    setActiveRobot: setActiveRobotId, // Alias
    getRobotLoadStatus,
    
    // Robot Management
    getAllRobots,
    setRobotActive,
    removeRobot: unloadRobot, // Alias
    getActiveRobots,
    
    // Computed Properties
    robotCount: workspaceRobots.length,
    isEmpty: workspaceRobots.length === 0,
    hasWorkspaceRobots: workspaceRobots.length > 0,
    hasAvailableRobots: availableRobots.length > 0,
    hasLoadedRobots: loadedRobots.size > 0,
    hasActiveRobot: !!activeRobotId,
    hasAvailableTools: availableTools.length > 0,
    hasRobots: loadedRobots.size > 0,
    activeRobotCount: activeRobotId ? 1 : 0,
    
    // Error Handling
    clearError,
    clearSuccess,
    
    // Helpers
    getManufacturer,
    
    // Status
    isInitialized,
  }), [
    availableRobots,
    categories,
    availableTools,
    workspaceRobots,
    activeRobotId,
    activeRobot,
    loadedRobots,
    activeRobots,
    loadingStates,
    isLoading,
    error,
    successMessage,
    discoverRobots,
    loadAvailableTools,
    addRobotToWorkspace,
    removeRobotFromWorkspace,
    isRobotInWorkspace,
    getWorkspaceRobot,
    clearWorkspace,
    importRobots,
    exportRobots,
    loadRobot,
    unloadRobot,
    isRobotLoaded,
    getRobot,
    setActiveRobotId,
    getRobotLoadStatus,
    getAllRobots,
    setRobotActive,
    getActiveRobots,
    getManufacturer,
    isInitialized
  ]);

  return (
    <RobotContext.Provider value={value}>
      {children}
    </RobotContext.Provider>
  );
};

/* eslint-disable react-refresh/only-export-components */
export const useRobotContext = () => {
  const context = useContext(RobotContext);
  if (!context) {
    throw new Error('useRobotContext must be used within a RobotProvider');
  }
  return context;
};

// Compatibility export - useRobotManagerContext points to useRobotContext
export const useRobotManagerContext = useRobotContext;
/* eslint-enable react-refresh/only-export-components */

export default RobotContext;