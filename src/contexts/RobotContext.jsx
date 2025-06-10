// src/contexts/RobotContext.jsx - UNIFIED ROBOT CONTEXT (Discovery + Loading + Management)
import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import URDFLoader from '../core/Loader/URDFLoader';
import MeshLoader from '../core/Loader/MeshLoader';
import { useViewer } from './ViewerContext';
import EventBus from '../utils/EventBus';

const RobotContext = createContext(null);

export const RobotProvider = ({ children }) => {
  const { isViewerReady, getSceneSetup } = useViewer();
  
  // Request deduplication
  const isDiscoveringRef = useRef(false);
  const hasInitializedRef = useRef(false);
  const sceneSetupRef = useRef(null);
  const urdfLoaderRef = useRef(null);
  
  // ========== UNIFIED STATE (All Robot Data) ==========
  
  // Robot Discovery State
  const [availableRobots, setAvailableRobots] = useState([]);
  const [categories, setCategories] = useState([]);
  
  // TCP Tool Discovery State
  const [availableTools, setAvailableTools] = useState([]);
  
  // Workspace State
  const [workspaceRobots, setWorkspaceRobots] = useState([]);
  
  // Robot Loading & Management State (from RobotManagerContext)
  const [robots, setRobots] = useState(new Map()); // robotName -> robotData
  const [activeRobots, setActiveRobots] = useState(new Set()); // Set of active robot names
  
  // Active Robot Management 
  const [activeRobotId, setActiveRobotIdState] = useState(null);
  const [activeRobot, setActiveRobot] = useState(null);
  const [loadedRobots, setLoadedRobots] = useState(new Map());
  
  // Loading & Error States
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  
  // ========== INITIALIZATION ==========
  
  // Initialize robot manager when viewer is ready
  useEffect(() => {
    if (isViewerReady) {
      sceneSetupRef.current = getSceneSetup();
      urdfLoaderRef.current = new URDFLoader(new THREE.LoadingManager());
      
      // Configure loader
      urdfLoaderRef.current.parseVisual = true;
      urdfLoaderRef.current.parseCollision = false;
      
      console.log('[RobotContext] Robot manager initialized with scene setup');
    }
  }, [isViewerReady, getSceneSetup]);
  
  // Initialize on mount with deduplication
  useEffect(() => {
    if (isViewerReady && !hasInitializedRef.current) {
      console.log('[RobotContext] Viewer ready, discovering robots and tools...');
      hasInitializedRef.current = true;
      discoverRobots();
      loadAvailableTools();
    }
  }, [isViewerReady]);
  
  // ========== ROBOT DISCOVERY OPERATIONS ==========
  
  const discoverRobots = useCallback(async () => {
    if (isDiscoveringRef.current) {
      console.log('[RobotContext] Discovery already in progress, skipping...');
      return;
    }
    
    try {
      isDiscoveringRef.current = true;
      setIsLoading(true);
      setError(null);
      
      console.log('[RobotContext] Discovering robots...');
      
      const response = await fetch('/robots/list');
      const result = await response.json();
      
      if (result.success) {
        const data = result.categories || [];
        setCategories(data);
        
        const allRobots = [];
        data.forEach(category => {
          (category.robots || []).forEach(robot => {
            allRobots.push({
              ...robot,
              category: category.id,
              categoryName: category.name
            });
          });
        });
        
        setAvailableRobots(allRobots);
        console.log('[RobotContext] Discovered robots:', allRobots.length);
        console.log('[RobotContext] Categories:', data.length);
      } else {
        setError(result.message || 'Failed to scan robots directory');
      }
    } catch (err) {
      console.error('[RobotContext] Robot discovery error:', err);
      setError('Error connecting to server. Please ensure the server is running on port 3001.');
    } finally {
      setIsLoading(false);
      isDiscoveringRef.current = false;
    }
  }, []);
  
  // ========== TCP TOOL DISCOVERY ==========
  
  const loadAvailableTools = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('[RobotContext] Scanning available tools...');
      
      const response = await fetch('/api/tcp/scan');
      const result = await response.json();
      
      if (result.success) {
        const tools = result.tools || [];
        setAvailableTools(tools);
        console.log(`[RobotContext] Found ${tools.length} available tools`);
      } else {
        setError(result.message || 'Failed to scan TCP tools');
      }
    } catch (err) {
      console.error('[RobotContext] Error scanning tools:', err);
      setError('Error connecting to server. Please ensure the server is running.');
    } finally {
      setIsLoading(false);
    }
  }, []);
  
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

  // ========== ROBOT LOADING OPERATIONS (from RobotManagerContext) ==========
  
  /**
   * Load a URDF model and add to scene
   */
  const loadRobot = useCallback(async (robotName, urdfPath, options = {}) => {
    const {
      position = { x: 0, y: 0, z: 0 },
      makeActive = true,
      clearOthers = false
    } = options;

    if (!sceneSetupRef.current || !urdfLoaderRef.current) {
      throw new Error('Robot manager not initialized');
    }

    try {
      setIsLoading(true);
      setError(null);
      
      // Extract package path from urdf path
      const packagePath = urdfPath.substring(0, urdfPath.lastIndexOf('/'));
      
      // Reset loader state
      urdfLoaderRef.current.resetLoader();
      urdfLoaderRef.current.packages = packagePath;
      urdfLoaderRef.current.currentRobotName = robotName;
      
      // Set up loadMeshCb
      urdfLoaderRef.current.loadMeshCb = (path, manager, done, material) => {
        const filename = path.split('/').pop();
        const resolvedPath = `${urdfLoaderRef.current.packages}/${filename}`;
        
        MeshLoader.load(resolvedPath, manager, (obj, err) => {
          if (err) {
            console.error('Error loading mesh:', err);
            done(null, err);
            return;
          }
          
          if (obj) {
            obj.traverse(child => {
              if (child instanceof THREE.Mesh) {
                if (!child.material || child.material.name === '' || child.material.name === 'default') {
                  child.material = material;
                }
                child.castShadow = true;
                child.receiveShadow = true;
              }
            });
            
            done(obj);
          } else {
            done(null, new Error('No mesh object returned'));
          }
        }, material);
      };
      
      console.info(`Loading robot ${robotName} from ${urdfPath}`);
      
      // Load the URDF model
      const robot = await new Promise((resolve, reject) => {
        urdfLoaderRef.current.load(urdfPath, resolve, null, reject);
      });
      
      // Store the robot with metadata
      const robotData = {
        name: robotName,
        model: robot,
        urdfPath: urdfPath,
        isActive: makeActive
      };
      
      // Add to scene with a container
      const robotContainer = new THREE.Object3D();
      robotContainer.name = `${robotName}_container`;
      robotContainer.add(robot);
      robotContainer.position.set(position.x, position.y, position.z);
      
      sceneSetupRef.current.robotRoot.add(robotContainer);
      robotData.container = robotContainer;
      
      // Update both robot maps
      setRobots(prev => new Map(prev).set(robotName, robotData));
      setLoadedRobots(prev => {
        const newMap = new Map(prev);
        newMap.set(robotName, {
          id: robotName,
          robot: robot,
          urdfPath,
          isActive: makeActive,
          loadedAt: new Date().toISOString()
        });
        return newMap;
      });
      
      if (makeActive) {
        setActiveRobots(prev => new Set(prev).add(robotName));
        // Use setTimeout to ensure loadedRobots state is updated first
        setTimeout(() => {
          setActiveRobotId(robotName);
        }, 0);
      }
      
      // Update scene
      if (sceneSetupRef.current.setUpAxis) {
        sceneSetupRef.current.setUpAxis('+Z');
      }
      
      EventBus.emit('robot:loaded', { 
        robotName, 
        robot,
        totalRobots: robots.size + 1,
        activeRobots: Array.from(activeRobots)
      });
      
      setSuccessMessage(`${robotName} loaded successfully!`);
      setTimeout(() => setSuccessMessage(''), 3000);
      
      console.info(`Successfully loaded robot: ${robotName}`);
      return robot;
      
    } catch (error) {
      console.error(`Error loading robot ${robotName}:`, error);
      setError(`Failed to load robot: ${error.message}`);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [robots, activeRobots]);
  
  // 🚨 FIXED: Synchronized setActiveRobotId that also updates activeRobot
  const setActiveRobotId = useCallback((robotId) => {
    console.log(`[RobotContext] Setting active robot ID to: ${robotId}`);
    setActiveRobotIdState(robotId);
    
    if (robotId) {
      const robotData = loadedRobots.get(robotId) || robots.get(robotId);
      if (robotData) {
        const robotModel = robotData.robot || robotData.model;
        console.log(`[RobotContext] Setting active robot object for: ${robotId}`);
        setActiveRobot(robotModel);
        
        // Emit event for other components
        EventBus.emit('robot:active-changed', { 
          robotId, 
          robot: robotModel 
        });
      } else {
        console.warn(`[RobotContext] Robot ${robotId} not found in loaded robots`);
        setActiveRobot(null);
      }
    } else {
      setActiveRobot(null);
    }
  }, [loadedRobots, robots]);
  
  // ========== ROBOT MANAGEMENT METHODS (from RobotManagerContext) ==========
  
  /**
   * Get a specific robot by name
   */
  const getRobot = useCallback((robotName) => {
    const robotData = robots.get(robotName);
    return robotData ? robotData.model : null;
  }, [robots]);
  
  /**
   * Get all loaded robots
   */
  const getAllRobots = useCallback(() => {
    return new Map(robots);
  }, [robots]);
  
  /**
   * Get active robots
   */
  const getActiveRobots = useCallback(() => {
    return Array.from(activeRobots);
  }, [activeRobots]);
  
  /**
   * Set robot active state
   */
  const setRobotActive = useCallback((robotName, isActive) => {
    const robotData = robots.get(robotName);
    if (!robotData) return false;
    
    // Update robot data
    setRobots(prev => {
      const newMap = new Map(prev);
      const updatedRobotData = { ...robotData, isActive };
      newMap.set(robotName, updatedRobotData);
      return newMap;
    });
    
    // Update active robots set
    setActiveRobots(prev => {
      const newSet = new Set(prev);
      if (isActive) {
        newSet.add(robotName);
      } else {
        newSet.delete(robotName);
      }
      return newSet;
    });
    
    // Update visibility
    if (robotData.container) {
      robotData.container.visible = isActive;
    } else {
      robotData.model.visible = isActive;
    }
    
    EventBus.emit('robot:active-changed', {
      robotName,
      isActive,
      activeRobots: isActive ? 
        Array.from(activeRobots).concat(robotName) : 
        Array.from(activeRobots).filter(name => name !== robotName)
    });
    
    return true;
  }, [robots, activeRobots]);
  
  /**
   * Remove a specific robot
   */
  const removeRobot = useCallback((robotName) => {
    const robotData = robots.get(robotName);
    if (!robotData) return;
    
    // Remove from scene
    if (robotData.container && sceneSetupRef.current) {
      sceneSetupRef.current.robotRoot.remove(robotData.container);
      robotData.container.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(material => material.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    }
    
    // Remove from tracking
    setRobots(prev => {
      const newMap = new Map(prev);
      newMap.delete(robotName);
      return newMap;
    });
    
    setActiveRobots(prev => {
      const newSet = new Set(prev);
      newSet.delete(robotName);
      return newSet;
    });
    
    setLoadedRobots(prev => {
      const newMap = new Map(prev);
      newMap.delete(robotName);
      return newMap;
    });
    
    if (activeRobotId === robotName) {
      setActiveRobotId(null);
    }
    
    EventBus.emit('robot:removed', { robotName });
    
    setSuccessMessage(`${robotName} removed`);
    setTimeout(() => setSuccessMessage(''), 3000);
  }, [robots, activeRobotId, setActiveRobotId]);
  
  // ========== JOINT CONTROL METHODS (from RobotManagerContext) ==========
  
  /**
   * Set a joint value for a specific robot
   */
  const setJointValue = useCallback((robotName, jointName, value) => {
    const robotData = robots.get(robotName);
    if (!robotData) {
      console.warn(`Robot ${robotName} not found for joint update`);
      return false;
    }
    
    if (robotData.model.joints && robotData.model.joints[jointName]) {
      try {
        const success = robotData.model.setJointValue(jointName, value);
        if (success) {
          EventBus.emit('robot:joint-changed', { 
            robotName, 
            robotId: robotName,
            jointName, 
            value
          });
          
          console.log(`[RobotContext] Set joint ${jointName} = ${value} for robot ${robotName}`);
          return true;
        }
      } catch (error) {
        console.error(`Error setting joint ${jointName} on robot ${robotName}:`, error);
      }
    }
    return false;
  }, [robots]);
  
  /**
   * Set multiple joint values for a specific robot
   */
  const setJointValues = useCallback((robotName, values) => {
    const robotData = robots.get(robotName);
    if (!robotData) {
      console.warn(`Robot ${robotName} not found for joint updates`);
      return false;
    }
    
    let anySuccess = false;
    
    try {
      const success = robotData.model.setJointValues(values);
      if (success) {
        anySuccess = true;
      }
    } catch (error) {
      console.error(`Error setting multiple joints on robot ${robotName}:`, error);
    }
    
    if (anySuccess) {
      EventBus.emit('robot:joints-changed', { 
        robotName, 
        robotId: robotName,
        values
      });
    }
    
    return anySuccess;
  }, [robots]);
  
  /**
   * Get current joint values for a specific robot
   */
  const getJointValues = useCallback((robotName) => {
    const robotData = robots.get(robotName);
    if (!robotData || !robotData.model) return {};
    
    const values = {};
    Object.entries(robotData.model.joints).forEach(([name, joint]) => {
      values[name] = joint.angle;
    });
    
    return values;
  }, [robots]);
  
  /**
   * Reset all joints to zero position for a specific robot
   */
  const resetJoints = useCallback((robotName) => {
    const robotData = robots.get(robotName);
    if (!robotData || !robotData.model) return;
    
    Object.values(robotData.model.joints).forEach(joint => {
      joint.setJointValue(0);
    });
    
    EventBus.emit('robot:joints-reset', { robotName });
  }, [robots]);
  
  /**
   * Get the current active robot
   */
  const getCurrentRobot = useCallback(() => {
    if (activeRobots.size === 0) return null;
    
    const activeRobotName = Array.from(activeRobots)[0];
    return getRobot(activeRobotName);
  }, [activeRobots, getRobot]);
  
  /**
   * Get the name of the current active robot
   */
  const getCurrentRobotName = useCallback(() => {
    if (activeRobots.size === 0) return null;
    return Array.from(activeRobots)[0];
  }, [activeRobots]);
  
  // ========== ROBOT STATUS OPERATIONS ==========
  
  const isRobotLoaded = useCallback((robotId) => {
    return robots.has(robotId);
  }, [robots]);
  
  const getRobotLoadStatus = useCallback((robot) => {
    const loaded = isRobotLoaded(robot.id);
    return {
      isLoaded: loaded,
      statusText: loaded ? 'Loaded' : 'Click to Load'
    };
  }, [isRobotLoaded]);

  // ========== IMPORT/EXPORT OPERATIONS ==========
  
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
    
    // TCP Tool Discovery
    availableTools,
    
    // Workspace Management
    workspaceRobots,
    
    // Robot Loading & Management (from RobotManagerContext)
    robots,
    activeRobots,
    
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
    
    // ========== TCP TOOL OPERATIONS ==========
    loadAvailableTools,
    
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
    unloadRobot: removeRobot, // Alias for compatibility
    isRobotLoaded,
    getRobot,
    setActiveRobotId,
    setActiveRobot,
    getRobotLoadStatus,
    
    // ========== ROBOT MANAGEMENT METHODS (from RobotManagerContext) ==========
    getAllRobots,
    setRobotActive,
    removeRobot,
    getActiveRobots,
    
    // ========== JOINT CONTROL METHODS (from RobotManagerContext) ==========
    setJointValue,
    setJointValues,
    getJointValues,
    resetJoints,
    
    // ========== UTILITY METHODS ==========
    getCurrentRobot,
    getCurrentRobotName,
    
    // ========== CONVENIENCE METHODS ==========
    getLoadedRobots: () => loadedRobots,
    
    // ========== COMPUTED PROPERTIES ==========
    robotCount: workspaceRobots.length,
    isEmpty: workspaceRobots.length === 0,
    hasWorkspaceRobots: workspaceRobots.length > 0,
    hasAvailableRobots: availableRobots.length > 0,
    hasLoadedRobots: robots.size > 0,
    hasActiveRobot: !!activeRobotId,
    hasAvailableTools: availableTools.length > 0,
    
    // Robot Manager computed properties
    hasRobots: robots.size > 0,
    activeRobotCount: activeRobots.size,
    
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