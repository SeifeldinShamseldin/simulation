// src/contexts/RobotContext.jsx - UNIFIED ROBOT API (Discovery + Loading + 3D Operations)
import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useViewer } from './ViewerContext';
import URDFLoader from '../core/Loader/URDFLoader';
import MeshLoader from '../core/Loader/MeshLoader';
import EventBus from '../utils/EventBus';

const RobotContext = createContext(null);

/**
 * Provider component for robot management
 * ✅ Updated: Focuses on robot management
 * ❌ Removed: Environment-specific functionality (now handled by EnvironmentContext)
 */
export const RobotProvider = ({ children }) => {
  const { isViewerReady, viewerInstance, getSceneSetup } = useViewer();
  
  // Request deduplication
  const isDiscoveringRef = useRef(false);
  const hasInitializedRef = useRef(false);
  
  // 3D Scene references (from RobotLoader)
  const sceneSetupRef = useRef(null);
  const urdfLoaderRef = useRef(null);
  const robotsMapRef = useRef(new Map()); // robotId -> robotData
  const activeRobotsRef = useRef(new Set());
  
  // ========== UNIFIED STATE (All Robot Data) ==========
  
  // Robot Discovery State
  const [availableRobots, setAvailableRobots] = useState([]);
  const [categories, setCategories] = useState([]);
  
  // TCP Tool Discovery State
  const [availableTools, setAvailableTools] = useState([]);
  
  // Workspace State
  const [workspaceRobots, setWorkspaceRobots] = useState([]);
  
  // Active Robot Management 
  const [activeRobotId, setActiveRobotIdState] = useState(null);
  const [activeRobot, setActiveRobot] = useState(null);
  const [loadedRobots, setLoadedRobots] = useState(new Map());
  
  // Loading & Error States
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  
  // ========== 3D SCENE INITIALIZATION (from RobotLoader) ==========
  
  // Initialize 3D scene references
  useEffect(() => {
    if (isViewerReady) {
      sceneSetupRef.current = getSceneSetup();
      
      // Initialize URDF loader
      if (!urdfLoaderRef.current) {
        urdfLoaderRef.current = new URDFLoader(new THREE.LoadingManager());
        urdfLoaderRef.current.parseVisual = true;
        urdfLoaderRef.current.parseCollision = false;
      }
      
      console.log('[RobotContext] 3D Scene initialized');
    }
  }, [isViewerReady, getSceneSetup]);
  
  // ========== 3D ROBOT LOADING OPERATIONS (from RobotLoader) ==========
  
  /**
   * Load a URDF model and add to scene (from RobotLoader)
   */
  const load3DRobot = useCallback(async (robotName, urdfPath, options = {}) => {
    const {
      position = { x: 0, y: 0, z: 0 },
      makeActive = true,
      clearOthers = false
    } = options;

    if (!sceneSetupRef.current || !urdfLoaderRef.current) {
      throw new Error('3D Scene not initialized');
    }

    try {
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
      
      console.info(`[RobotContext] Loading 3D robot ${robotName} from ${urdfPath}`);
      
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
      
      // Only clear if explicitly requested
      if (clearOthers) {
        clear3DRobots();
      }
      
      // Remove existing robot with same name if exists
      if (robotsMapRef.current.has(robotName)) {
        remove3DRobot(robotName);
      }
      
      // Store the robot
      robotsMapRef.current.set(robotName, robotData);
      if (makeActive) {
        activeRobotsRef.current.add(robotName);
      }
      
      // Add to scene with a container for proper orientation
      const robotContainer = new THREE.Object3D();
      robotContainer.name = `${robotName}_container`;
      robotContainer.add(robot);
      
      // Apply position to the container
      robotContainer.position.set(position.x, position.y, position.z);
      
      // Add container to scene
      sceneSetupRef.current.robotRoot.add(robotContainer);
      
      // Store reference to container
      robotData.container = robotContainer;
      
      // Update scene orientation and focus
      update3DSceneForRobot(robotContainer);
      
      // Update React state
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
      
      // Emit events
      EventBus.emit('robot:loaded', { 
        robotName, 
        robot,
        totalRobots: robotsMapRef.current.size,
        activeRobots: Array.from(activeRobotsRef.current)
      });
      
      console.info(`[RobotContext] Successfully loaded 3D robot: ${robotName}`);
      return robot;
      
    } catch (error) {
      console.error(`[RobotContext] Error loading 3D robot ${robotName}:`, error);
      throw error;
    }
  }, []);
  
  /**
   * Update scene orientation for robot (from RobotLoader)
   */
  const update3DSceneForRobot = useCallback((robot) => {
    if (!sceneSetupRef.current) return;
    
    // Apply the up axis transformation to ensure correct orientation
    if (sceneSetupRef.current.setUpAxis) {
      sceneSetupRef.current.setUpAxis('+Z'); // Default URDF convention
    }
    
    // Only focus if it's the first robot being loaded
    if (robotsMapRef.current.size === 1 && sceneSetupRef.current.robotRoot.children.length === 1) {
      setTimeout(() => {
        sceneSetupRef.current.focusOnObject(robot);
      }, 100);
    }
    
    // Emit robot loaded event
    EventBus.emit('robot:loaded', { robot });
  }, []);
  
  /**
   * Remove a specific 3D robot (from RobotLoader)
   */
  const remove3DRobot = useCallback((robotName) => {
    const robotData = robotsMapRef.current.get(robotName);
    if (!robotData || !sceneSetupRef.current) return;
    
    // Remove from scene
    if (robotData.container) {
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
    robotsMapRef.current.delete(robotName);
    activeRobotsRef.current.delete(robotName);
    
    // Update React state
    setLoadedRobots(prev => {
      const newMap = new Map(prev);
      newMap.delete(robotName);
      return newMap;
    });
    
    // Emit event
    EventBus.emit('robot:removed', { robotName });
  }, []);
  
  /**
   * Clear all 3D robots from the scene (from RobotLoader)
   */
  const clear3DRobots = useCallback(() => {
    // Remove all robots
    for (const [robotName] of robotsMapRef.current) {
      remove3DRobot(robotName);
    }
    
    // Clear tracking
    robotsMapRef.current.clear();
    activeRobotsRef.current.clear();
    
    // Update React state
    setLoadedRobots(new Map());
  }, [remove3DRobot]);
  
  // ========== 3D JOINT OPERATIONS (from RobotLoader) ==========
  
  /**
   * Set a joint value for a specific robot (from RobotLoader)
   */
  const set3DJointValue = useCallback((robotName, jointName, value) => {
    const robotData = robotsMapRef.current.get(robotName);
    if (!robotData) {
      console.warn(`[RobotContext] Robot ${robotName} not found for joint update`);
      return false;
    }
    
    if (robotData.model.joints && robotData.model.joints[jointName]) {
      try {
        // Use robot's setJointValue method
        const success = robotData.model.setJointValue(jointName, value);
        if (success) {
          // Emit joint change event
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
        console.error(`[RobotContext] Error setting joint ${jointName} on robot ${robotName}:`, error);
      }
    } else {
      console.warn(`[RobotContext] Joint ${jointName} not found on robot ${robotName}`);
    }
    return false;
  }, []);
  
  /**
   * Set multiple joint values for a specific robot (from RobotLoader)
   */
  const set3DJointValues = useCallback((robotName, values) => {
    const robotData = robotsMapRef.current.get(robotName);
    if (!robotData) {
      console.warn(`[RobotContext] Robot ${robotName} not found for joint updates`);
      return false;
    }
    
    let anySuccess = false;
    
    try {
      // Use robot's setJointValues method
      const success = robotData.model.setJointValues(values);
      if (success) {
        anySuccess = true;
      }
    } catch (error) {
      console.error(`[RobotContext] Error setting multiple joints on robot ${robotName}:`, error);
      
      // Fallback: try setting joints individually
      Object.entries(values).forEach(([jointName, value]) => {
        try {
          if (robotData.model.joints && robotData.model.joints[jointName]) {
            const success = robotData.model.setJointValue(jointName, value);
            if (success) {
              anySuccess = true;
            }
          }
        } catch (err) {
          console.warn(`[RobotContext] Failed to set joint ${jointName}:`, err);
        }
      });
    }
    
    if (anySuccess) {
      // Emit joints change event
      EventBus.emit('robot:joints-changed', { 
        robotName, 
        robotId: robotName,
        values
      });
      
      console.log(`[RobotContext] Set multiple joints for robot ${robotName}:`, values);
    }
    
    return anySuccess;
  }, []);
  
  /**
   * Get current joint values for a specific robot (from RobotLoader)
   */
  const get3DJointValues = useCallback((robotName) => {
    const robotData = robotsMapRef.current.get(robotName);
    if (!robotData || !robotData.model) return {};
    
    const values = {};
    Object.entries(robotData.model.joints).forEach(([name, joint]) => {
      values[name] = joint.angle;
    });
    
    return values;
  }, []);
  
  /**
   * Reset all joints to zero position for a specific robot (from RobotLoader)
   */
  const reset3DJoints = useCallback((robotName) => {
    const robotData = robotsMapRef.current.get(robotName);
    if (!robotData || !robotData.model) return;
    
    Object.values(robotData.model.joints).forEach(joint => {
      joint.setJointValue(0);
    });
    
    EventBus.emit('robot:joints-reset', { robotName });
  }, []);
  
  /**
   * Get a specific robot model (from RobotLoader)
   */
  const get3DRobot = useCallback((robotName) => {
    const robotData = robotsMapRef.current.get(robotName);
    return robotData ? robotData.model : null;
  }, []);
  
  /**
   * Get all loaded 3D robots (from RobotLoader)
   */
  const getAll3DRobots = useCallback(() => {
    return new Map(robotsMapRef.current);
  }, []);
  
  // ========== ROBOT DISCOVERY OPERATIONS ==========
  
  const discoverRobots = useCallback(async () => {
    // Prevent multiple simultaneous requests
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
  
  // Synchronized setActiveRobotId that also updates activeRobot
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
  
  // Load robot using 3D loader (UNIFIED METHOD)
  const loadRobot = useCallback(async (robotId, urdfPath, options = {}) => {
    try {
      setIsLoading(true);
      setError(null);
      
      console.log(`[RobotContext] Loading robot ${robotId} from ${urdfPath}`);
      
      // Use 3D loader
      const robot = await load3DRobot(robotId, urdfPath, options);
      
      // Update loaded robots state immediately
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
      
      // Set as active if requested
      if (options.makeActive !== false) {
        setActiveRobotId(robotId);
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
  }, [load3DRobot, setActiveRobotId]);
  
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
    try {
      // Remove from 3D scene
      remove3DRobot(robotId);
      
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
  }, [activeRobotId, setActiveRobotId, remove3DRobot]);

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
  
  // ========== TCP TOOL DISCOVERY ==========
  
  // Load available tools
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
  
  // Initialize tools on mount
  useEffect(() => {
    if (isViewerReady && !hasInitializedRef.current) {
      console.log('[RobotContext] Viewer ready, discovering robots and tools...');
      hasInitializedRef.current = true;
      discoverRobots();
      loadAvailableTools();
    }
  }, [isViewerReady, discoverRobots, loadAvailableTools]);

  // ========== ERROR HANDLING ==========
  
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clearSuccess = useCallback(() => {
    setSuccessMessage('');
  }, []);

  // ========== JOINT OPERATIONS ==========
  
  const getMovableJoints = useCallback((robotId) => {
    const robotData = loadedRobots.get(robotId);
    if (!robotData?.robot?.joints) return [];
    
    return Object.entries(robotData.robot.joints)
      .filter(([_, joint]) => joint.type !== 'fixed')
      .map(([name, _]) => name);
  }, [loadedRobots]);
  
  const getJointNames = useCallback((robotId) => {
    const robotData = loadedRobots.get(robotId);
    if (!robotData?.robot?.joints) return [];
    return Object.keys(robotData.robot.joints);
  }, [loadedRobots]);
  
  const getJointCount = useCallback((robotId) => {
    const robotData = loadedRobots.get(robotId);
    if (!robotData?.robot?.joints) return 0;
    return Object.keys(robotData.robot.joints).length;
  }, [loadedRobots]);
  
  const getCurrentJointState = useCallback((robotId) => {
    const robotData = loadedRobots.get(robotId);
    if (!robotData?.robot?.joints) return {};
    
    const state = {};
    Object.entries(robotData.robot.joints).forEach(([name, joint]) => {
      state[name] = joint.angle;
    });
    return state;
  }, [loadedRobots]);
  
  const hasJointControl = useCallback((robotId) => {
    const robotData = loadedRobots.get(robotId);
    return !!robotData?.robot?.joints;
  }, [loadedRobots]);
  
  const updateMultipleJoints = useCallback((robotId, jointUpdates) => {
    return set3DJointValues(robotId, jointUpdates);
  }, [set3DJointValues]);
  
  const resetAllJoints = useCallback((robotId) => {
    return reset3DJoints(robotId);
  }, [reset3DJoints]);
  
  const getRobotModel = useCallback((robotId) => {
    const robotData = loadedRobots.get(robotId);
    return robotData?.robot || null;
  }, [loadedRobots]);

  // ========== END EFFECTOR OPERATIONS ==========
  
  const getEndEffectorPosition = useCallback((robotId) => {
    const robotData = loadedRobots.get(robotId);
    if (!robotData?.robot) return null;
    
    const endEffector = robotData.robot.getEndEffector();
    if (!endEffector) return null;
    
    return endEffector.position.clone();
  }, [loadedRobots]);
  
  const getEndEffectorEulerAngles = useCallback((robotId) => {
    const robotData = loadedRobots.get(robotId);
    if (!robotData?.robot) return null;
    
    const endEffector = robotData.robot.getEndEffector();
    if (!endEffector) return null;
    
    return new THREE.Euler().setFromQuaternion(endEffector.quaternion);
  }, [loadedRobots]);
  
  const getEndEffectorQuaternion = useCallback((robotId) => {
    const robotData = loadedRobots.get(robotId);
    if (!robotData?.robot) return null;
    
    const endEffector = robotData.robot.getEndEffector();
    if (!endEffector) return null;
    
    return endEffector.quaternion.clone();
  }, [loadedRobots]);

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
    unloadRobot,
    isRobotLoaded,
    getRobot,
    setActiveRobotId,
    setActiveRobot,
    getRobotLoadStatus,
    
    // ========== 3D ROBOT OPERATIONS (from RobotLoader) ==========
    setJointValue: set3DJointValue,
    setJointValues: set3DJointValues,
    getJointValues: get3DJointValues,
    resetJoints: reset3DJoints,
    get3DRobot,
    getAll3DRobots,
    
    // ========== CONVENIENCE METHODS ==========
    getLoadedRobots: () => loadedRobots,
    
    // ========== COMPUTED PROPERTIES ==========
    robotCount: workspaceRobots.length,
    isEmpty: workspaceRobots.length === 0,
    hasWorkspaceRobots: workspaceRobots.length > 0,
    hasAvailableRobots: availableRobots.length > 0,
    hasLoadedRobots: loadedRobots.size > 0,
    hasActiveRobot: !!activeRobotId,
    hasAvailableTools: availableTools.length > 0,
    
    // ========== ERROR HANDLING ==========
    clearError,
    clearSuccess,
    
    // ========== JOINT OPERATIONS ==========
    getMovableJoints,
    getJointNames,
    getJointCount,
    getCurrentJointState,
    hasJointControl,
    updateMultipleJoints,
    resetAllJoints,
    getRobotModel,
    
    // ========== END EFFECTOR OPERATIONS ==========
    getEndEffectorPosition,
    getEndEffectorEulerAngles,
    getEndEffectorQuaternion
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