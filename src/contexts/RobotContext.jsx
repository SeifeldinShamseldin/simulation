/**
   * Calculate robot positions (deprecated, return empty array)
   */
const calculateRobotPositions = () => {
  console.warn('[RobotContext] calculateRobotPositions is deprecated');
  return [];
};

// src/contexts/RobotContext.jsx - UNIFIED ROBOT CONTEXT (Discovery + Loading + Management)
import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useViewer } from './ViewerContext';
import URDFLoader from '../core/Loader/URDFLoader';
import MeshLoader from '../core/Loader/MeshLoader';
import EventBus from '../utils/EventBus';

const RobotContext = createContext(null);

// Loading state constants
const LOADING_STATES = {
IDLE: 'idle',
LOADING: 'loading',
LOADED: 'loaded',
ERROR: 'error'
};

/**
* Validate robot structure after loading
*/
const validateRobotStructure = (robot, robotName) => {
console.log(`[RobotContext] Validating robot structure for ${robotName}`);

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

console.log(`[RobotContext] Validation results for ${robotName}:`, validation);

return validation;
};

export const RobotProvider = ({ children }) => {
const { isViewerReady, viewerInstance, getSceneSetup } = useViewer();

// Request deduplication
const isDiscoveringRef = useRef(false);
const hasInitializedRef = useRef(false);

// ========== UNIFIED STATE (All Robot Data) ==========

// Robot Discovery State (from old RobotContext)
const [availableRobots, setAvailableRobots] = useState([]);
const [categories, setCategories] = useState([]);

// TCP Tool Discovery State
const [availableTools, setAvailableTools] = useState([]);

// Workspace State (from old WorkspaceContext)
const [workspaceRobots, setWorkspaceRobots] = useState([]);

// Active Robot Management (unified from both)
const [activeRobotId, setActiveRobotIdState] = useState(null);
const [activeRobot, setActiveRobot] = useState(null);
const [loadedRobots, setLoadedRobots] = useState(new Map()); // Unified robots Map
const [activeRobots, setActiveRobots] = useState(new Set()); // From RobotManagerContext
const [loadingStates, setLoadingStates] = useState(new Map()); // From RobotManagerContext

// --- FIX: Track pending active robot to avoid race condition ---
const [pendingActiveRobotId, setPendingActiveRobotId] = useState(null);

// Loading & Error States
const [isLoading, setIsLoading] = useState(false);
const [error, setError] = useState(null);
const [successMessage, setSuccessMessage] = useState('');

// Refs from RobotManagerContext
const sceneSetupRef = useRef(null);
const urdfLoaderRef = useRef(null);
const loadedRobotsRef = useRef(new Map()); // NEW: Ref to hold the latest loadedRobots map

// Alias for compatibility - robots Map points to loadedRobots
const robots = loadedRobots;
const setRobots = setLoadedRobots;

// Keep loadedRobotsRef up-to-date
useEffect(() => {
  loadedRobotsRef.current = loadedRobots;
}, [loadedRobots]);

// Initialize scene and loader when viewer is ready
useEffect(() => {
  if (isViewerReady) {
    sceneSetupRef.current = getSceneSetup();
    urdfLoaderRef.current = new URDFLoader(new THREE.LoadingManager());
    
    // Configure loader
    urdfLoaderRef.current.parseVisual = true;
    urdfLoaderRef.current.parseCollision = false;
    
    console.log('[RobotContext] Initialized with scene setup');
  }
}, [isViewerReady, getSceneSetup]);

// ========== ROBOT DISCOVERY OPERATIONS (from old RobotContext) ==========

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
            categoryName: category.name,
            manufacturerLogoPath: category.manufacturerLogoPath,
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
    manufacturer: robotData.manufacturer || robotData.categoryName,
    urdfPath: robotData.urdfPath,
    imagePath: robotData.imagePath,
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

// ========== ROBOT LOADING OPERATIONS (Enhanced from RobotManagerContext) ==========

/**
 * Check if a robot is ready for operations
 */
const isRobotReady = useCallback((robotId) => {
  const robot = robots.get(robotId)?.model || robots.get(robotId)?.robot;
  const loadingState = loadingStates.get(robotId);
  
  return robot && 
         robot.setJointValues && 
         loadingState === LOADING_STATES.LOADED;
}, [robots, loadingStates]);

// 🚨 FIXED: Synchronized setActiveRobotId that also updates activeRobot
const setActiveRobotId = useCallback((robotId) => {
  console.log(`[RobotContext] Setting active robot ID to: ${robotId}`);
  setActiveRobotIdState(robotId);
  
  if (robotId) {
    const robotData = loadedRobotsRef.current.get(robotId); // Use ref to get the latest loadedRobots
    if (robotData) {
      const robot = robotData.robot || robotData.model;
      console.log(`[RobotContext] Setting active robot object for: ${robotId}`);
      setActiveRobot(robot);
      
      // Also set in activeRobots Set
      setActiveRobots(prev => new Set(prev).add(robotId));
      
      // Emit event for other components
      EventBus.emit('robot:active-changed', { 
        robotId, 
        robot: robot 
      });
    } else {
      console.warn(`[RobotContext] Robot ${robotId} not found in loaded robots (via ref)`); // Updated log
      setActiveRobot(null);
    }
  } else {
    setActiveRobot(null);
    setActiveRobots(new Set());
  }
}, []); // Empty dependency array, as it now uses a ref

/**
 * Load a URDF model and add to scene (from RobotManagerContext)
 */
const loadRobot = useCallback(async (robotName, urdfPath, options = {}) => {
  const {
    position = { x: 0, y: 0, z: 0 },
  } = options;

  if (!sceneSetupRef.current || !urdfLoaderRef.current) {
    throw new Error('Robot context not initialized');
  }

  try {
    setIsLoading(true);
    setError(null);
    
    // Set loading state for this robot
    setLoadingStates(prev => new Map(prev).set(robotName, LOADING_STATES.LOADING));
    
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
    
    // Validate robot structure
    const validation = validateRobotStructure(robot, robotName);
    if (validation.issues.length > 0) {
      console.warn(`[RobotContext] Robot structure issues:`, validation.issues);
    }
    
    // Store the robot with metadata
    const robotData = {
      name: robotName,
      model: robot,
      robot: robot, // Alias for compatibility
      urdfPath: urdfPath,
      validation,
      id: robotName // Add id for compatibility
    };
    
    // Add to scene with a container
    const robotContainer = new THREE.Object3D();
    robotContainer.name = `${robotName}_container`;
    robotContainer.add(robot);
    robotContainer.position.set(position.x, position.y, position.z);
    
    sceneSetupRef.current.robotRoot.add(robotContainer);
    robotData.container = robotContainer;
    
    // Store the robot
    setRobots(prev => new Map(prev).set(robotName, robotData));
    // --- FIX: Set pending active robot ID instead of calling setActiveRobotId directly ---
    setPendingActiveRobotId(robotName);
    
    // Set loading state to loaded
    setLoadingStates(prev => new Map(prev).set(robotName, LOADING_STATES.LOADED));
    
    // Update scene
    if (sceneSetupRef.current.setUpAxis) {
      sceneSetupRef.current.setUpAxis('+Z');
    }
    
    EventBus.emit('robot:loaded', { 
      robotName, 
      robot,
      robotId: robotName,
      totalRobots: robots.size + 1,
      activeRobots: Array.from(activeRobots),
      validation
    });
    
    setSuccessMessage(`${robotName} loaded successfully!`);
    setTimeout(() => setSuccessMessage(''), 3000);
    
    console.info(`Successfully loaded robot: ${robotName}`);
    return robot;
    
  } catch (error) {
    console.error(`Error loading robot ${robotName}:`, error);
    setError(`Failed to load robot: ${error.message}`);
    
    // Set loading state to error
    setLoadingStates(prev => new Map(prev).set(robotName, LOADING_STATES.ERROR));
    
    throw error;
  } finally {
    setIsLoading(false);
  }
}, [robots, activeRobots, setActiveRobotId]);

/**
 * Get a specific robot by name
 */
const getRobot = useCallback((robotId) => {
  const robotData = robots.get(robotId);
  return robotData ? (robotData.model || robotData.robot) : null;
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
  } else if (robotData.model || robotData.robot) {
    const robot = robotData.model || robotData.robot;
    robot.visible = isActive;
  }
  
  EventBus.emit('robot:active-changed', {
    robotName,
    robotId: robotName,
    isActive,
    activeRobots: isActive ? 
      Array.from(activeRobots).concat(robotName) : 
      Array.from(activeRobots).filter(name => name !== robotName)
  });
  
  return true;
}, [robots, activeRobots]);

// Check if robot is loaded
const isRobotLoaded = useCallback((robotId) => {
  return loadedRobots.has(robotId);
}, [loadedRobots]);

// Unload robot (remove from scene)
const unloadRobot = useCallback((robotId) => {
  const robotData = robots.get(robotId);
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
    newMap.delete(robotId);
    return newMap;
  });
  
  setActiveRobots(prev => {
    const newSet = new Set(prev);
    newSet.delete(robotId);
    return newSet;
  });
  
  if (activeRobotId === robotId) {
    setActiveRobotId(null);
  }
  
  setSuccessMessage(`${robotId} unloaded`);
  setTimeout(() => setSuccessMessage(''), 3000);
  
  EventBus.emit('robot:unloaded', { robotId });
  EventBus.emit('robot:removed', { robotName: robotId, robotId });
}, [robots, activeRobotId, setActiveRobotId]);

/**
 * Remove a specific robot (alias for unloadRobot)
 */
const removeRobot = unloadRobot;

// ========== JOINT CONTROL METHODS (from RobotManagerContext) ==========

/**
 * Set a joint value for a specific robot
 */
const setJointValue = useCallback((robotName, jointName, value) => {
  const robot = getRobot(robotName);
  if (!robot) {
    console.warn(`[RobotContext] Robot ${robotName} not found for joint control`);
    return false;
  }
  
  try {
    let success = false;
    
    // Method 1: Use robot.setJointValue if available
    if (robot.setJointValue && typeof robot.setJointValue === 'function') {
      success = robot.setJointValue(jointName, value);
      console.log(`[RobotContext] robot.setJointValue(${jointName}, ${value}) = ${success}`);
    }
    
    // Method 2: Direct joint access using proper setJointValue method
    if (!success && robot.joints && robot.joints[jointName]) {
      if (robot.joints[jointName].setJointValue) {
        success = robot.joints[jointName].setJointValue(value);
        console.log(`[RobotContext] ✅ Set joint value for ${jointName} = ${value}, success: ${success}`);
      }
      
      if (robot.joints[jointName].setPosition) {
        robot.joints[jointName].setPosition(value);
      }
    }
    
    // Update matrices
    if (success && robot.updateMatrixWorld) {
      robot.updateMatrixWorld(true);
    }
    
    return success;
  } catch (error) {
    console.error(`[RobotContext] Error setting joint ${jointName}:`, error);
    return false;
  }
}, [getRobot]);

/**
 * Set multiple joint values for a specific robot
 */
const setJointValues = useCallback((robotId, values) => {
  if (!isRobotReady(robotId)) {
    console.warn(`[RobotContext] Robot ${robotId} not ready for joint updates`);
    return false;
  }
  
  const robotData = robots.get(robotId);
  if (!robotData) {
    console.warn(`[RobotContext] Robot ${robotId} not found for joint updates`);
    return false;
  }
  
  const robot = robotData.model || robotData.robot;
  let anySuccess = false;
  
  try {
    const success = robot.setJointValues(values);
    if (success) {
      anySuccess = true;
    }
  } catch (error) {
    console.error(`[RobotContext] Error setting multiple joints on robot ${robotId}:`, error);
  }
  
  if (anySuccess) {
    EventBus.emit('robot:joints-changed', { 
      robotId, 
      robotName: robotId,
      values
    });
  }
  
  return anySuccess;
}, [robots, isRobotReady]);

/**
 * Get current joint values for a specific robot
 */
const getJointValues = useCallback((robotName) => {
  const robotData = robots.get(robotName);
  if (!robotData) {
    console.warn(`[RobotContext] Robot ${robotName} not found for getJointValues`);
    return {};
  }
  
  const robot = robotData.model || robotData.robot;
  const values = {};
  
  try {
    // Method 1: Direct joint access
    if (robot.joints) {
      Object.values(robot.joints).forEach(joint => {
        if (joint && joint.jointType !== 'fixed' && typeof joint.angle !== 'undefined') {
          values[joint.name] = joint.angle;
        }
      });
      
      console.log(`[RobotContext] Got ${Object.keys(values).length} joint values for ${robotName}:`, values);
      return values;
    }
    
    // Method 2: Traverse robot object
    robot.traverse((child) => {
      if (child.isURDFJoint && child.jointType !== 'fixed' && typeof child.angle !== 'undefined') {
        values[child.name] = child.angle;
      }
    });
    
    console.log(`[RobotContext] Got ${Object.keys(values).length} joint values via traverse for ${robotName}:`, values);
    return values;
    
  } catch (error) {
    console.error(`[RobotContext] Error getting joint values for ${robotName}:`, error);
    return {};
  }
}, [robots]);

/**
 * Reset all joints to zero position for a specific robot
 */
const resetJoints = useCallback((robotName) => {
  const robotData = robots.get(robotName);
  if (!robotData) return;
  
  const robot = robotData.model || robotData.robot;
  Object.values(robot.joints).forEach(joint => {
    joint.setJointValue(0);
  });
  
  EventBus.emit('robot:joints-reset', { robotName, robotId: robotName });
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

// Load available tools (simplified like environment pattern)
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
  robots, // Alias for compatibility
  activeRobots,
  loadingStates,
  
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
  
  // ========== ROBOT MANAGEMENT METHODS ==========
  getAllRobots,
  setRobotActive,
  removeRobot,
  getActiveRobots,
  
  // ========== JOINT CONTROL METHODS ==========
  setJointValue,
  setJointValues,
  getJointValues,
  resetJoints,
  
  // ========== UTILITY METHODS ==========
  getCurrentRobot,
  getCurrentRobotName,
  isRobotReady,
  calculateRobotPositions: () => [], // Deprecated method
  
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
  hasRobots: robots.size > 0,
  activeRobotCount: activeRobots.size,
  
  // ========== ERROR HANDLING ==========
  clearError,
  clearSuccess
};

// --- FIX: useEffect to set active robot only after it is present in loadedRobots ---
useEffect(() => {
  if (pendingActiveRobotId && loadedRobots.has(pendingActiveRobotId)) {
    setActiveRobotId(pendingActiveRobotId);
    setPendingActiveRobotId(null);
  }
}, [loadedRobots, pendingActiveRobotId, setActiveRobotId]);

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

// Compatibility export - useRobotManagerContext points to useRobotContext
export const useRobotManagerContext = useRobotContext;

export default RobotContext;