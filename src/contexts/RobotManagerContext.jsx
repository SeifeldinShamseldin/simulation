// src/contexts/RobotManagerContext.jsx - Robot Loading and Management Context
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import URDFLoader from '../core/Loader/URDFLoader';
import MeshLoader from '../core/Loader/MeshLoader';
import { useViewer } from './ViewerContext';
import EventBus from '../utils/EventBus';

const RobotManagerContext = createContext(null);

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
  console.log(`[RobotManager] Validating robot structure for ${robotName}`);
  
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
  
  console.log(`[RobotManager] Validation results for ${robotName}:`, validation);
  
  return validation;
};

export const RobotManagerProvider = ({ children }) => {
  const { isViewerReady, getSceneSetup } = useViewer();
  
  // State
  const [robots, setRobots] = useState(new Map());
  const [loadingStates, setLoadingStates] = useState(new Map()); // Track loading state per robot
  const [activeRobots, setActiveRobots] = useState(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Refs
  const sceneSetupRef = useRef(null);
  const urdfLoaderRef = useRef(null);
  
  // Initialize when viewer is ready
  useEffect(() => {
    if (isViewerReady) {
      sceneSetupRef.current = getSceneSetup();
      urdfLoaderRef.current = new URDFLoader(new THREE.LoadingManager());
      
      // Configure loader
      urdfLoaderRef.current.parseVisual = true;
      urdfLoaderRef.current.parseCollision = false;
      
      console.log('[RobotManagerContext] Initialized with scene setup');
    }
  }, [isViewerReady, getSceneSetup]);
  
  /**
   * Check if a robot is ready for operations
   */
  const isRobotReady = useCallback((robotId) => {
    const robot = robots.get(robotId)?.model;
    const loadingState = loadingStates.get(robotId);
    
    return robot && 
           robot.setJointValues && 
           loadingState === LOADING_STATES.LOADED;
  }, [robots, loadingStates]);
  
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
        console.warn(`[RobotManager] Robot structure issues:`, validation.issues);
      }
      
      // Store the robot with metadata
      const robotData = {
        name: robotName,
        model: robot,
        urdfPath: urdfPath,
        isActive: makeActive,
        validation // Store validation results
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
      
      // Set loading state to loaded
      setLoadingStates(prev => new Map(prev).set(robotName, LOADING_STATES.LOADED));
      
      if (makeActive) {
        setActiveRobots(prev => new Set(prev).add(robotName));
      }
      
      // Update scene
      if (sceneSetupRef.current.setUpAxis) {
        sceneSetupRef.current.setUpAxis('+Z');
      }
      
      EventBus.emit('robot:loaded', { 
        robotName, 
        robot,
        totalRobots: robots.size + 1,
        activeRobots: Array.from(activeRobots),
        validation // Include validation in event
      });
      
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
  }, [robots, activeRobots]);
  
  /**
   * Get a specific robot by name
   */
  const getRobot = useCallback((robotId) => {
    const robotData = robots.get(robotId);
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
    
    EventBus.emit('robot:removed', { robotName });
  }, [robots]);
  
  /**
   * Set a joint value for a specific robot
   */
  const setJointValue = useCallback((robotName, jointName, value) => {
    const robot = getRobot(robotName);
    if (!robot) {
      console.warn(`[RobotManager] Robot ${robotName} not found for joint control`);
      return false;
    }
    
    try {
      let success = false;
      
      // Method 1: Use robot.setJointValue if available
      if (robot.setJointValue && typeof robot.setJointValue === 'function') {
        success = robot.setJointValue(jointName, value);
        console.log(`[RobotManager] robot.setJointValue(${jointName}, ${value}) = ${success}`);
      }
      
      // Method 2: Direct joint access using proper setJointValue method
      if (!success && robot.joints && robot.joints[jointName]) {
        if (robot.joints[jointName].setJointValue) {
          success = robot.joints[jointName].setJointValue(value);
          console.log(`[RobotManager] ✅ Set joint value for ${jointName} = ${value}, success: ${success}`);
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
      console.error(`[RobotManager] Error setting joint ${jointName}:`, error);
      return false;
    }
  }, [getRobot]);
  
  /**
   * Set multiple joint values for a specific robot
   */
  const setJointValues = useCallback((robotId, values) => {
    if (!isRobotReady(robotId)) {
      console.warn(`[RobotManager] Robot ${robotId} not ready for joint updates`);
      return false;
    }
    
    const robotData = robots.get(robotId);
    if (!robotData) {
      console.warn(`[RobotManager] Robot ${robotId} not found for joint updates`);
      return false;
    }
    
    let anySuccess = false;
    
    try {
      const success = robotData.model.setJointValues(values);
      if (success) {
        anySuccess = true;
      }
    } catch (error) {
      console.error(`[RobotManager] Error setting multiple joints on robot ${robotId}:`, error);
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
    if (!robotData || !robotData.model) {
      console.warn(`[RobotManager] Robot ${robotName} not found for getJointValues`);
      return {};
    }
    
    const robot = robotData.model;
    const values = {};
    
    try {
      // Method 1: Direct joint access
      if (robot.joints) {
        Object.values(robot.joints).forEach(joint => {
          if (joint && joint.jointType !== 'fixed' && typeof joint.angle !== 'undefined') {
            values[joint.name] = joint.angle;
          }
        });
        
        console.log(`[RobotManager] Got ${Object.keys(values).length} joint values for ${robotName}:`, values);
        return values;
      }
      
      // Method 2: Traverse robot object
      robot.traverse((child) => {
        if (child.isURDFJoint && child.jointType !== 'fixed' && typeof child.angle !== 'undefined') {
          values[child.name] = child.angle;
        }
      });
      
      console.log(`[RobotManager] Got ${Object.keys(values).length} joint values via traverse for ${robotName}:`, values);
      return values;
      
    } catch (error) {
      console.error(`[RobotManager] Error getting joint values for ${robotName}:`, error);
      return {};
    }
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
  
  const value = {
    // State
    robots,
    activeRobots,
    isLoading,
    error,
    loadingStates,
    
    // Robot Management Methods
    loadRobot,
    getAllRobots,
    getRobot,
    setRobotActive,
    removeRobot,
    getActiveRobots,
    
    // Joint Control Methods
    setJointValue,
    setJointValues,
    getJointValues,
    resetJoints,
    
    // Utility Methods
    getCurrentRobot,
    getCurrentRobotName,
    
    // Robot State Checks
    isRobotReady,
    hasRobots: robots.size > 0,
    robotCount: robots.size,
    activeRobotCount: activeRobots.size,
    
    // Error Handling
    clearError: () => setError(null)
  };
  
  return (
    <RobotManagerContext.Provider value={value}>
      {children}
    </RobotManagerContext.Provider>
  );
};

export const useRobotManagerContext = () => {
  const context = useContext(RobotManagerContext);
  if (!context) {
    throw new Error('useRobotManagerContext must be used within a RobotManagerProvider');
  }
  return context;
};

export default RobotManagerContext;