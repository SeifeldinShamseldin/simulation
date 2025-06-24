// src/contexts/RobotContext.jsx
import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import * as THREE from 'three';
import EventBus from '../utils/EventBus';
import URDFLoader from '../core/Loader/URDFLoader';
import * as DataTransfer from './dataTransfer';
import { RobotPoseEvents, RobotEvents } from './dataTransfer';

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

// Robot registry for global access (if needed for legacy compatibility)
const robotRegistry = new Map();

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

  if (robot.joints && typeof robot.joints === 'object') {
    validation.hasJoints = true;
    validation.jointCount = Object.keys(robot.joints).length;
    
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

  validation.hasSetJointValue = typeof robot.setJointValue === 'function';
  validation.hasSetJointValues = typeof robot.setJointValues === 'function';
  
  if (!validation.hasSetJointValue) {
    validation.issues.push('Robot missing setJointValue method');
  }
  if (!validation.hasSetJointValues) {
    validation.issues.push('Robot missing setJointValues method');
  }

  return validation;
};

export const RobotProvider = ({ children }) => {
  // ========== STATE ==========
  const [availableRobots, setAvailableRobots] = useState([]);
  const [categories, setCategories] = useState([]);
  const [availableTools, setAvailableTools] = useState([]);
  const [workspaceRobots, setWorkspaceRobots] = useState([]);
  const [activeRobotId, setActiveRobotIdState] = useState(null);
  const [loadedRobots, setLoadedRobots] = useState(new Map());
  const [loadingStates, setLoadingStates] = useState(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);
  const [robotPoses, setRobotPoses] = useState(new Map());
  
  // ========== HANDSHAKE STATE ==========
  const [pendingSceneRequest, setPendingSceneRequest] = useState(null);
  const [processingStatus] = useState(new Map()); // Track processing status
  
  // ========== REFS ==========
  const sceneSetupRef = useRef(null);
  const urdfLoaderRef = useRef(null);
  const loadQueueRef = useRef([]);
  const robotManufacturerMap = useRef(new Map());
  const robotIndexMap = useRef(new Map());
  const initializedRef = useRef(false);
  const isDiscoveringRef = useRef(false);
  const abortControllerRef = useRef(null);
  const timeoutIdsRef = useRef(new Set());
  const sceneRequestTimeoutRef = useRef(null);
  
  // ========== HELPER FUNCTIONS ==========
  
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

  const getManufacturer = useCallback((robotId) => {
    const manufacturer = robotManufacturerMap.current.get(robotId);
    if (manufacturer) return manufacturer;
    
    const robot = robotIndexMap.current.get(robotId);
    return robot?.manufacturer || null;
  }, []);

  // ========== SCENE HANDSHAKE INITIALIZATION ==========
  
  useEffect(() => {
    // Skip if already initialized
    if (initializedRef.current || isInitialized) {
      return;
    }
    
    let requestId = null;
    let sceneTimeoutId = null;
    let isHandshakeActive = false;
    
    const cleanup = () => {
      if (sceneTimeoutId) {
        clearTimeout(sceneTimeoutId);
        sceneTimeoutId = null;
      }
      if (requestId) {
        processingStatus.delete(requestId);
        EventBus.off(DataTransfer.EVENT_VIEWER_HERE_IS_SCENE, handleSceneResponse);
        EventBus.off('viewer:scene:status', handleSceneStatus);
      }
      isHandshakeActive = false;
    };
    
    // Handle scene status (handshake completion)
    const handleSceneStatus = ({ requestId: responseId, status }) => {
      if (responseId === requestId && status === 'Done') {
        log('[RobotContext] Scene handshake complete');
        
        // Clear pending request
        setPendingSceneRequest(null);
        processingStatus.delete(requestId);
        
        // Clear timeout
        if (sceneRequestTimeoutRef.current) {
          clearManagedTimeout(sceneRequestTimeoutRef.current);
          sceneRequestTimeoutRef.current = null;
        }
        
        // Cleanup
        cleanup();
      }
    };
    
    const handleSceneResponse = (response) => {
      // Check if this is our request
      if (!isHandshakeActive || response.requestId !== requestId || initializedRef.current) {
        return;
      }
      
      log(`[RobotContext] Received scene response for ${requestId}: ${response.success}`);
      
      if (response.success && response.payload?.getSceneSetup) {
        try {
          // Get scene setup
          const sceneSetup = response.payload.getSceneSetup();
          if (!sceneSetup) {
            throw new Error('Scene setup function returned null');
          }
          
          sceneSetupRef.current = sceneSetup;
          
          // Initialize URDF loader
          urdfLoaderRef.current = new URDFLoader(new THREE.LoadingManager());
          urdfLoaderRef.current.parseVisual = true;
          urdfLoaderRef.current.parseCollision = false;
          
          // Mark as initialized
          setIsInitialized(true);
          initializedRef.current = true;
          
          log(`[RobotContext] Initialized. Processing ${loadQueueRef.current.length} queued robot loads.`);
          
          // Process queued loads
          const queuedLoads = [...loadQueueRef.current];
          loadQueueRef.current = [];
          
          queuedLoads.forEach(req => {
            _loadRobotInternal(req.robotId, req.urdfPath, req.options)
              .then(req.resolve)
              .catch(req.reject);
          });
          
          // Listen for completion status
          EventBus.on('viewer:scene:status', handleSceneStatus);
        } catch (error) {
          log(`[RobotContext] Error processing scene response: ${error.message}`);
          const initError = new Error(`Failed to initialize scene: ${error.message}`);
          setError(initError.message);
          loadQueueRef.current.forEach(req => req.reject(initError));
          loadQueueRef.current = [];
          cleanup();
        }
      } else {
        const initError = new Error(response.error || 'Failed to acquire a 3D scene from the viewer.');
        setError(initError.message);
        loadQueueRef.current.forEach(req => req.reject(initError));
        loadQueueRef.current = [];
        setPendingSceneRequest(null);
        cleanup();
      }
    };

    const requestScene = () => {
      // Skip if already processing or initialized
      if (isHandshakeActive || initializedRef.current || pendingSceneRequest) {
        log('[RobotContext] Scene request already pending or initialized');
        return;
      }
      
      requestId = `req-scene-${Date.now()}`;
      isHandshakeActive = true;
      
      log('[RobotContext] Viewer is ready, requesting scene...');
      setPendingSceneRequest(requestId);
      processingStatus.set(requestId, true);
      
      // Listen for response BEFORE emitting request
      EventBus.on(DataTransfer.EVENT_VIEWER_HERE_IS_SCENE, handleSceneResponse);
      
      // Emit request
      EventBus.emit(DataTransfer.EVENT_ROBOT_NEEDS_SCENE, { requestId });
      
      // Set timeout for no response
      sceneTimeoutId = setTimeout(() => {
        if (!initializedRef.current && pendingSceneRequest === requestId) {
          log('[RobotContext] Scene request timeout - viewer may not be ready');
          setPendingSceneRequest(null);
          cleanup();
          
          // Retry after a delay
          setTimeout(() => {
            if (!initializedRef.current) {
              requestScene();
            }
          }, 1000);
        }
      }, 5000);
      
      sceneRequestTimeoutRef.current = sceneTimeoutId;
    };
    
    // Listen for viewer ready event
    const handleViewerReady = () => {
      log('[RobotContext] Viewer ready event received');
      // Small delay to ensure viewer is fully initialized
      setTimeout(() => {
        if (!initializedRef.current && !isHandshakeActive) {
          requestScene();
        }
      }, 100);
    };
    
    EventBus.on(DataTransfer.EVENT_VIEWER_READY, handleViewerReady);
    
    // Check if viewer is already ready
    // This handles the case where RobotContext mounts after ViewerContext
    setTimeout(() => {
      if (!initializedRef.current && !isHandshakeActive) {
        log('[RobotContext] Checking if viewer is already ready...');
        requestScene();
      }
    }, 500);
    
    return () => {
      EventBus.off(DataTransfer.EVENT_VIEWER_READY, handleViewerReady);
      cleanup();
    };
  }, [isInitialized]); // Only depend on isInitialized state

  // ========== CLEANUP ON UNMOUNT ==========
  useEffect(() => {
    return () => {
      timeoutIdsRef.current.forEach(clearTimeout);
      timeoutIdsRef.current.clear();
      
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // ========== INDEXING & OPTIMIZATION ==========
  
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

  // ========== ROBOT DISCOVERY ==========

  const discoverRobots = useCallback(async () => {
    if (isDiscoveringRef.current) {
      log('[RobotContext] Discovery already in progress, skipping...');
      return;
    }
    
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
              manufacturer: category.id,
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
        setError('Error connecting to server.');
      }
    } finally {
      setIsLoading(false);
      isDiscoveringRef.current = false;
    }
  }, []);

  // ========== DISCOVER TOOLS ==========
  
  const discoverTools = useCallback(async () => {
    try {
      const response = await fetch('/api/tcp/scan');
      const result = await response.json();
      
      if (result.success) {
        setAvailableTools(result.tools || []);
        log('[RobotContext] Discovered tools:', result.tools?.length || 0);
      }
    } catch (err) {
      console.error('[RobotContext] Tool discovery error:', err);
    }
  }, []);

  // ========== ROBOT WORKSPACE MANAGEMENT ==========
  
  const addRobotToWorkspace = useCallback((robotData) => {
    const robotId = `${robotData.id}_${Date.now()}`;
    
    const newRobot = {
      ...robotData,
      id: robotId,
      workspaceId: robotId,
      addedAt: new Date().toISOString(),
      manufacturer: robotData.manufacturer || getManufacturer(robotData.id) || 'unknown'
    };
    
    setWorkspaceRobots(prev => [...prev, newRobot]);
    setSuccessMessage(`${robotData.name} added to workspace!`);
    setManagedTimeout(() => setSuccessMessage(''), 3000);
    
    robotManufacturerMap.current.set(robotId, newRobot.manufacturer);
    
    return newRobot;
  }, [getManufacturer, setManagedTimeout]);

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
  }, [setManagedTimeout]);

  const isRobotInWorkspace = useCallback((robotId) => {
    return workspaceRobots.some(r => r.robotId === robotId);
  }, [workspaceRobots]);

  const getWorkspaceRobot = useCallback((workspaceRobotId) => {
    return workspaceRobots.find(r => r.id === workspaceRobotId);
  }, [workspaceRobots]);

  const clearWorkspace = useCallback(() => {
    if (window.confirm('Clear all robots from workspace?')) {
      loadedRobots.forEach((_, robotId) => unloadRobot(robotId));
      setWorkspaceRobots([]);
      setSuccessMessage('Workspace cleared');
      setManagedTimeout(() => setSuccessMessage(''), 3000);
    }
  }, [loadedRobots, setManagedTimeout]);

  // ========== IMPORT/EXPORT ==========
  
  const importRobots = useCallback(async (file) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      if (data.robots && Array.isArray(data.robots)) {
        setWorkspaceRobots(data.robots);
        setSuccessMessage(`Imported ${data.robots.length} robots`);
        setManagedTimeout(() => setSuccessMessage(''), 3000);
      }
    } catch (err) {
      console.error('[RobotContext] Import error:', err);
      setError('Failed to import robots');
    }
  }, [setManagedTimeout]);

  const exportRobots = useCallback(() => {
    const data = {
      robots: workspaceRobots,
      exportedAt: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `robots-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    setSuccessMessage('Robots exported');
    setManagedTimeout(() => setSuccessMessage(''), 3000);
  }, [workspaceRobots, setManagedTimeout]);

  // ========== ROBOT LOADING ==========

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
      robot.robotName = robotId;

      const validation = validateRobotStructure(robot, robotId);
      if (validation.issues.length > 0) {
        console.warn(`[RobotContext] Robot structure issues for ${robotId}:`, validation.issues);
      }
      
      let baseLink = null;
      robot.traverse((child) => {
        if (child.isURDFLink && child.parent === robot) {
          baseLink = child;
          return;
        }
      });
      
      if (baseLink) {
        baseLink.updateMatrixWorld(true);
        const baseWorldPos = new THREE.Vector3();
        baseLink.getWorldPosition(baseWorldPos);
        
        if (baseWorldPos.lengthSq() > 0.0001) {
          robot.position.sub(baseWorldPos);
          robot.updateMatrixWorld(true);
          log(`[RobotContext] Adjusted robot position to ensure base link is at origin`);
        }
      }
      
      const robotManufacturer = manufacturer || getManufacturer(robotId) || 'unknown';

      const robotData = {
        robot: robot,
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
  }, [activeRobotId, getManufacturer]);

  const loadRobot = useCallback(async (robotId, urdfPath, options = {}) => {
    if (!isInitialized) {
      log(`[RobotContext] Context not ready. Queuing load for: ${robotId}`);
      return new Promise((resolve, reject) => {
        loadQueueRef.current.push({ robotId, urdfPath, options, resolve, reject });
      });
    }
    
    return _loadRobotInternal(robotId, urdfPath, options);
  }, [isInitialized, _loadRobotInternal]);

  // ========== THE ONE WAY TO ACCESS ROBOTS ==========
  
  const getRobot = useCallback((robotId) => {
    if (!robotId) {
      console.warn('[RobotContext] getRobot called with null/undefined robotId');
      return null;
    }
    
    const robotData = loadedRobots.get(robotId);
    if (robotData) {
      return robotData.robot;
    }
    
    // Try to find by base robot ID (for workspace robots)
    const baseRobotId = robotId.split('_')[0];
    for (const [key, data] of loadedRobots.entries()) {
      if (key.startsWith(baseRobotId + '_')) {
        return data.robot;
      }
    }
    
    if (DEBUG) {
      console.warn(`[RobotContext] Robot ${robotId} not found in loaded robots`);
    }
    
    return null;
  }, [loadedRobots]);

  const getAllRobots = useCallback(() => {
    return new Map(loadedRobots);
  }, [loadedRobots]);

  const getActiveRobots = useCallback(() => {
    return activeRobotId ? new Set([activeRobotId]) : new Set();
  }, [activeRobotId]);

  const isRobotLoaded = useCallback((robotId) => {
    return loadedRobots.has(robotId);
  }, [loadedRobots]);

  const setActiveRobotId = useCallback((robotId) => {
    log(`[RobotContext] Setting active robot ID to: ${robotId}`);
    setActiveRobotIdState(robotId);
    
    if (robotId) {
      const robot = getRobot(robotId);
      if (robot) {
        EventBus.emit('robot:active-changed', { robotId, robot });
      }
    }
  }, [getRobot]);

  const activeRobot = useMemo(() => {
    if (!activeRobotId) return null;
    return getRobot(activeRobotId);
  }, [activeRobotId, getRobot]);

  const activeRobots = useMemo(() => {
    return new Set(activeRobotId ? [activeRobotId] : []);
  }, [activeRobotId]);

  const unloadRobot = useCallback((robotId) => {
    const robotData = loadedRobots.get(robotId);
    if (!robotData) {
      if (DEBUG) {
        console.warn(`[RobotContext] Attempted to unload non-existent robot: ${robotId}`);
      }
      return;
    }
    
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

  const setRobotActive = useCallback((robotId, isActive) => {
    if (isActive) {
      setActiveRobotId(robotId);
    } else if (activeRobotId === robotId) {
      setActiveRobotId(null);
    }
  }, [activeRobotId, setActiveRobotId]);

  const getRobotLoadStatus = useCallback((robotId) => {
    return loadingStates.get(robotId) || LOADING_STATES.IDLE;
  }, [loadingStates]);

  const setRobotPose = useCallback((robotId, position, rotation) => {
    const robotData = loadedRobots.get(robotId);
    if (!robotData || !robotData.container) {
      if (DEBUG) {
        console.warn(`[RobotContext] Attempted to set pose for non-existent robot: ${robotId}`);
      }
      return false;
    }
    
    if (position) {
      robotData.container.position.set(position.x, position.y, position.z);
    }
    
    if (rotation) {
      robotData.container.rotation.set(rotation.x, rotation.y, rotation.z);
    }
    
    robotData.container.updateMatrixWorld(true);
    
    const newPose = {
      position: robotData.container.position.clone(),
      rotation: robotData.container.rotation.clone()
    };
    
    setRobotPoses(prev => new Map(prev).set(robotId, newPose));
    
    EventBus.emit(DataTransfer.EVENT_ROBOT_POSITION_CHANGED, {
      robotId,
      position: newPose.position,
      rotation: newPose.rotation
    });
    
    return true;
  }, [loadedRobots]);

  // ========== JOINT COMMAND HANDLERS ==========
  
  useEffect(() => {
    const handleGetInstanceRequest = ({ robotId, requestId }) => {
      const robot = getRobot(robotId);
      if (robot) {
        EventBus.emit(RobotEvents.GET_INSTANCE_RESPONSE, {
          robotId,
          robot: robot,
          requestId
        });
      }
    };

    const handleSetJointValue = ({ robotId, jointName, value, requestId }) => {
      const robot = getRobot(robotId);
      let success = false;
      
      if (robot) {
        if (robot.setJointValue && typeof robot.setJointValue === 'function') {
          success = robot.setJointValue(jointName, value);
        }
        
        if (!success && robot.joints && robot.joints[jointName]) {
          if (robot.joints[jointName].setJointValue) {
            success = robot.joints[jointName].setJointValue(value);
          }
          if (robot.joints[jointName].setPosition) {
            robot.joints[jointName].setPosition(value);
          }
        }
        
        if (success && robot.updateMatrixWorld) {
          robot.updateMatrixWorld(true);
        }
      }
      
      EventBus.emit(RobotEvents.SET_JOINT_VALUE, {
        robotId,
        jointName,
        value,
        requestId
      });
    };

    const handleSetJointValues = ({ robotId, values, requestId }) => {
      const robot = getRobot(robotId);
      let success = false;
      
      if (robot) {
        if (robot.setJointValues && typeof robot.setJointValues === 'function') {
          success = robot.setJointValues(values);
        }
        
        if (!success) {
          for (const [jointName, value] of Object.entries(values || {})) {
            if (robot.joints && robot.joints[jointName]) {
              if (robot.joints[jointName].setJointValue) {
                robot.joints[jointName].setJointValue(value);
                success = true;
              }
            }
          }
        }
        
        if (success && robot.updateMatrixWorld) {
          robot.updateMatrixWorld(true);
        }
      }
      
      EventBus.emit(RobotEvents.SET_JOINT_VALUES, {
        robotId,
        values,
        requestId
      });
    };

    const handleGetJointValues = ({ robotId, requestId }) => {
      const robot = getRobot(robotId);
      const values = {};
      
      if (robot && robot.joints) {
        Object.entries(robot.joints).forEach(([name, joint]) => {
          if (joint.jointType !== 'fixed') {
            values[name] = joint.angle || 0;
          }
        });
      }
      
      EventBus.emit(RobotEvents.GET_JOINT_VALUES, {
        robotId,
        values: values || {},
        requestId
      });
    };

    const unsubGetInstance = EventBus.on(RobotEvents.GET_INSTANCE_REQUEST, handleGetInstanceRequest);
    const unsubSetJoint = EventBus.on(RobotEvents.SET_JOINT_VALUE, handleSetJointValue);
    const unsubSetJoints = EventBus.on(RobotEvents.SET_JOINT_VALUES, handleSetJointValues);
    const unsubGetJoints = EventBus.on(RobotEvents.GET_JOINT_VALUES, handleGetJointValues);
    
    return () => {
      unsubGetInstance();
      unsubSetJoint();
      unsubSetJoints();
      unsubGetJoints();
    };
  }, [getRobot]);

  // ========== CONTEXT VALUE ==========

  const value = useMemo(() => ({
    // State
    availableRobots,
    categories,
    availableTools,
    workspaceRobots,
    activeRobotId,
    activeRobot,
    loadedRobots: (() => {
      // Warn developers about direct access to loadedRobots
      if (DEBUG) {
        console.warn('[RobotContext] ⚠️ Direct access to loadedRobots detected. Use getRobot() instead for better error handling and consistency.');
      }
      return loadedRobots;
    })(),
    robots: loadedRobots, // Alias
    activeRobots,
    loadingStates,
    isLoading,
    error,
    successMessage,
    
    // Robot Discovery
    discoverRobots,
    refresh: discoverRobots,
    
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
    clearError: () => setError(null),
    clearSuccess: () => setSuccessMessage(''),
    
    // Helpers
    getManufacturer,
    
    // Status
    isInitialized,

    // Robot Pose
    setRobotPose,
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
    isInitialized,
    setRobotPose,
  ]);

  // Sync with global registry if needed
  useEffect(() => {
    robotRegistry.clear();
    loadedRobots.forEach((data, key) => {
      robotRegistry.set(key, data);
    });
  }, [loadedRobots]);

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

// Compatibility export
export const useRobotManagerContext = useRobotContext;

// Global accessor (if needed for legacy code)
export const getRobotGlobal = (robotId) => {
  if (DEBUG) {
    console.warn('[RobotContext] ⚠️ getRobotGlobal is deprecated. Use useRobotContext().getRobot() instead for better error handling and consistency.');
  }
  
  if (!robotRegistry) return null;
  if (!robotId) return null;
  const robotData = robotRegistry.get(robotId);
  if (robotData) {
    return robotData.robot;
  }
  const baseRobotId = robotId.split('_')[0];
  for (const [key, data] of robotRegistry.entries()) {
    if (key.startsWith(baseRobotId + '_')) {
      return data.robot;
    }
  }
  return null;
};

export default RobotContext;