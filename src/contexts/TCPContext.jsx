// src/contexts/RobotContext.jsx - UNIFIED ROBOT CONTEXT
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import URDFLoader from '../core/Loader/URDFLoader';
import MeshLoader from '../core/Loader/MeshLoader';
import { useViewer } from './ViewerContext';
import EventBus from '../utils/EventBus';

const RobotContext = createContext(null);

// Robot data structure
const createRobotData = (robot, metadata) => ({
  id: metadata.id,
  name: metadata.name,
  robot: robot, // Three.js object
  container: metadata.container,
  urdfPath: metadata.urdfPath,
  manufacturer: metadata.manufacturer,
  validation: metadata.validation,
  joints: metadata.joints || {},
  isActive: metadata.isActive || false,
  loadedAt: new Date().toISOString()
});

export const RobotProvider = ({ children }) => {
  const { isViewerReady, getSceneSetup } = useViewer();
  
  // ========== REFS ==========
  const sceneSetupRef = useRef(null);
  const urdfLoaderRef = useRef(null);
  const isDiscoveringRef = useRef(false);
  const hasInitializedRef = useRef(false);
  
  // ========== UNIFIED STATE ==========
  
  // Discovery & Available Robots
  const [availableRobots, setAvailableRobots] = useState([]);
  const [categories, setCategories] = useState([]);
  const [availableTools, setAvailableTools] = useState([]);
  
  // Workspace Robots (saved selections)
  const [workspaceRobots, setWorkspaceRobots] = useState([]);
  
  // Loaded Robots (in 3D scene) - Single source of truth
  const [loadedRobots, setLoadedRobots] = useState(new Map());
  
  // Active Robot
  const [activeRobotId, setActiveRobotIdState] = useState(null);
  const [activeRobot, setActiveRobot] = useState(null);
  
  // Loading States
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStates, setLoadingStates] = useState(new Map());
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  
  // ========== INITIALIZATION ==========
  useEffect(() => {
    if (isViewerReady) {
      sceneSetupRef.current = getSceneSetup();
      
      // Initialize URDF loader
      urdfLoaderRef.current = new URDFLoader(new THREE.LoadingManager());
      urdfLoaderRef.current.parseVisual = true;
      urdfLoaderRef.current.parseCollision = false;
      
      console.log('[RobotContext] Initialized with scene setup');
      
      // Auto-discover robots
      if (!hasInitializedRef.current) {
        hasInitializedRef.current = true;
        discoverRobots();
        loadAvailableTools();
      }
    }
  }, [isViewerReady, getSceneSetup]);
  
  // ========== WORKSPACE PERSISTENCE ==========
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
    }
  }, []);
  
  useEffect(() => {
    try {
      localStorage.setItem('workspaceRobots', JSON.stringify(workspaceRobots));
    } catch (error) {
      console.error('[RobotContext] Error saving robots:', error);
    }
  }, [workspaceRobots]);
  
  // ========== ROBOT DISCOVERY ==========
  const discoverRobots = useCallback(async () => {
    if (isDiscoveringRef.current) {
      console.log('[RobotContext] Discovery already in progress');
      return;
    }
    
    try {
      isDiscoveringRef.current = true;
      setIsLoading(true);
      setError(null);
      
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
              manufacturerLogoPath: category.manufacturerLogoPath
            });
          });
        });
        
        setAvailableRobots(allRobots);
        console.log('[RobotContext] Discovered robots:', allRobots.length);
      } else {
        setError(result.message || 'Failed to scan robots directory');
      }
    } catch (err) {
      console.error('[RobotContext] Robot discovery error:', err);
      setError('Error connecting to server');
    } finally {
      setIsLoading(false);
      isDiscoveringRef.current = false;
    }
  }, []);
  
  // ========== TCP TOOL DISCOVERY ==========
  const loadAvailableTools = useCallback(async () => {
    try {
      const response = await fetch('/api/tcp/scan');
      const result = await response.json();
      
      if (result.success) {
        setAvailableTools(result.tools || []);
        console.log('[RobotContext] Found TCP tools:', result.tools?.length);
      }
    } catch (err) {
      console.error('[RobotContext] Error scanning tools:', err);
    }
  }, []);
  
  // ========== WORKSPACE MANAGEMENT ==========
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
      const exists = prev.some(r => r.robotId === robotData.id);
      if (exists) {
        console.log('[RobotContext] Robot already in workspace:', robotData.name);
        return prev;
      }
      return [...prev, newRobot];
    });
    
    setSuccessMessage(`${robotData.name} added to workspace!`);
    setTimeout(() => setSuccessMessage(''), 3000);
    
    return newRobot;
  }, []);
  
  const removeRobotFromWorkspace = useCallback((workspaceRobotId) => {
    setWorkspaceRobots(prev => prev.filter(r => r.id !== workspaceRobotId));
    setSuccessMessage('Robot removed from workspace');
    setTimeout(() => setSuccessMessage(''), 3000);
  }, []);
  
  // ========== ROBOT VALIDATION ==========
  const validateRobotStructure = useCallback((robot, robotId) => {
    console.log(`[RobotContext] Validating robot structure for ${robotId}`);
    
    const validation = {
      hasJoints: false,
      jointCount: 0,
      joints: {},
      issues: []
    };
    
    if (robot.joints && typeof robot.joints === 'object') {
      validation.hasJoints = true;
      validation.jointCount = Object.keys(robot.joints).length;
      
      Object.entries(robot.joints).forEach(([jointName, joint]) => {
        if (joint.jointType !== 'fixed') {
          validation.joints[jointName] = {
            name: jointName,
            type: joint.jointType,
            limits: joint.limit || { lower: -Math.PI, upper: Math.PI },
            currentValue: joint.angle || 0
          };
          
          if (typeof joint.setJointValue !== 'function') {
            validation.issues.push(`Joint ${jointName} missing setJointValue method`);
          }
        }
      });
    } else {
      validation.issues.push('Robot has no joints object');
    }
    
    validation.hasSetJointValue = typeof robot.setJointValue === 'function';
    validation.hasSetJointValues = typeof robot.setJointValues === 'function';
    
    console.log(`[RobotContext] Validation results:`, validation);
    return validation;
  }, []);
  
  // ========== 3D ROBOT LOADING (from RobotManagerContext) ==========
  const loadRobot = useCallback(async (robotId, urdfPath, options = {}) => {
    const {
      position = { x: 0, y: 0, z: 0 },
      makeActive = true,
      clearOthers = false
    } = options;
    
    if (!sceneSetupRef.current || !urdfLoaderRef.current) {
      throw new Error('Scene not initialized');
    }
    
    try {
      setIsLoading(true);
      setError(null);
      setLoadingStates(prev => new Map(prev).set(robotId, 'loading'));
      
      // Clear other robots if requested
      if (clearOthers) {
        for (const [id] of loadedRobots) {
          if (id !== robotId) {
            await unloadRobot(id);
          }
        }
      }
      
      // Extract package path from urdf path
      const packagePath = urdfPath.substring(0, urdfPath.lastIndexOf('/'));
      
      // Reset loader state
      urdfLoaderRef.current.resetLoader();
      urdfLoaderRef.current.packages = packagePath;
      urdfLoaderRef.current.currentRobotName = robotId;
      
      // Set up loadMeshCb
      urdfLoaderRef.current.loadMeshCb = (path, manager, done, material) => {
        const filename = path.split('/').pop();
        const resolvedPath = `${packagePath}/${filename}`;
        
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
      
      console.info(`[RobotContext] Loading robot ${robotId} from ${urdfPath}`);
      
      // Load the URDF model
      const robot = await new Promise((resolve, reject) => {
        urdfLoaderRef.current.load(urdfPath, resolve, null, reject);
      });
      
      // Validate robot structure
      const validation = validateRobotStructure(robot, robotId);
      
      // Create container and add to scene
      const robotContainer = new THREE.Object3D();
      robotContainer.name = `${robotId}_container`;
      robotContainer.add(robot);
      robotContainer.position.set(position.x, position.y, position.z);
      
      sceneSetupRef.current.robotRoot.add(robotContainer);
      
      // Create robot data
      const robotData = createRobotData(robot, {
        id: robotId,
        name: robotId,
        container: robotContainer,
        urdfPath,
        manufacturer: options.manufacturer,
        validation,
        joints: validation.joints,
        isActive: makeActive
      });
      
      // Store the robot
      setLoadedRobots(prev => new Map(prev).set(robotId, robotData));
      setLoadingStates(prev => new Map(prev).set(robotId, 'loaded'));
      
      // Set as active if requested
      if (makeActive) {
        setActiveRobotId(robotId);
      }
      
      // Update scene
      if (sceneSetupRef.current.setUpAxis) {
        sceneSetupRef.current.setUpAxis('+Z');
      }
      
      // Emit events
      EventBus.emit('robot:loaded', { 
        robotId, 
        robot,
        validation
      });
      
      console.info(`[RobotContext] Successfully loaded robot: ${robotId}`);
      setSuccessMessage(`${robotId} loaded successfully!`);
      setTimeout(() => setSuccessMessage(''), 3000);
      
      return robot;
      
    } catch (error) {
      console.error(`[RobotContext] Error loading robot ${robotId}:`, error);
      setError(`Failed to load robot: ${error.message}`);
      setLoadingStates(prev => new Map(prev).set(robotId, 'error'));
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [validateRobotStructure]);
  
  // ========== ROBOT UNLOADING ==========
  const unloadRobot = useCallback((robotId) => {
    const robotData = loadedRobots.get(robotId);
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
    
    // Remove from state
    setLoadedRobots(prev => {
      const newMap = new Map(prev);
      newMap.delete(robotId);
      return newMap;
    });
    
    // Clear active if this was active
    if (activeRobotId === robotId) {
      setActiveRobotId(null);
    }
    
    EventBus.emit('robot:unloaded', { robotId });
  }, [loadedRobots, activeRobotId]);
  
  // ========== ACTIVE ROBOT MANAGEMENT ==========
  const setActiveRobotId = useCallback((robotId) => {
    console.log(`[RobotContext] Setting active robot ID to: ${robotId}`);
    setActiveRobotIdState(robotId);
    
    if (robotId) {
      const robotData = loadedRobots.get(robotId);
      if (robotData) {
        setActiveRobot(robotData.robot);
        
        // Update isActive flag
        setLoadedRobots(prev => {
          const newMap = new Map(prev);
          // Set all to inactive
          newMap.forEach((data, id) => {
            data.isActive = id === robotId;
          });
          return newMap;
        });
        
        EventBus.emit('robot:active-changed', { 
          robotId, 
          robot: robotData.robot 
        });
      } else {
        setActiveRobot(null);
      }
    } else {
      setActiveRobot(null);
      
      // Set all to inactive
      setLoadedRobots(prev => {
        const newMap = new Map(prev);
        newMap.forEach(data => {
          data.isActive = false;
        });
        return newMap;
      });
    }
  }, [loadedRobots]);
  
  // ========== JOINT CONTROL ==========
  const setJointValue = useCallback((robotId, jointName, value) => {
    const robotData = loadedRobots.get(robotId);
    if (!robotData) return false;
    
    try {
      const robot = robotData.robot;
      let success = false;
      
      // Method 1: Use robot.setJointValue
      if (robot.setJointValue && typeof robot.setJointValue === 'function') {
        success = robot.setJointValue(jointName, value);
      }
      
      // Method 2: Direct joint access
      if (!success && robot.joints && robot.joints[jointName]) {
        if (robot.joints[jointName].setJointValue) {
          success = robot.joints[jointName].setJointValue(value);
        }
      }
      
      if (success) {
        // Update stored joint values
        if (robotData.joints[jointName]) {
          robotData.joints[jointName].currentValue = value;
        }
        
        EventBus.emit('robot:joint-changed', { 
          robotId, 
          jointName, 
          value 
        });
      }
      
      return success;
    } catch (error) {
      console.error(`[RobotContext] Error setting joint ${jointName}:`, error);
      return false;
    }
  }, [loadedRobots]);
  
  const setJointValues = useCallback((robotId, values) => {
    const robotData = loadedRobots.get(robotId);
    if (!robotData) return false;
    
    let anySuccess = false;
    
    // Apply each joint value
    Object.entries(values).forEach(([jointName, value]) => {
      if (setJointValue(robotId, jointName, value)) {
        anySuccess = true;
      }
    });
    
    if (anySuccess) {
      EventBus.emit('robot:joints-changed', { robotId, values });
    }
    
    return anySuccess;
  }, [setJointValue]);
  
  const getJointValues = useCallback((robotId) => {
    const robotData = loadedRobots.get(robotId);
    if (!robotData) return {};
    
    const values = {};
    Object.entries(robotData.joints).forEach(([jointName, jointInfo]) => {
      values[jointName] = jointInfo.currentValue || 0;
    });
    
    return values;
  }, [loadedRobots]);
  
  const resetJoints = useCallback((robotId) => {
    const robotData = loadedRobots.get(robotId);
    if (!robotData) return;
    
    const resetValues = {};
    Object.keys(robotData.joints).forEach(jointName => {
      resetValues[jointName] = 0;
    });
    
    setJointValues(robotId, resetValues);
  }, [setJointValues]);
  
  // ========== HELPER METHODS ==========
  const getRobot = useCallback((robotId) => {
    const robotData = loadedRobots.get(robotId);
    return robotData?.robot;
  }, [loadedRobots]);
  
  const isRobotLoaded = useCallback((robotId) => {
    return loadedRobots.has(robotId);
  }, [loadedRobots]);
  
  const isRobotInWorkspace = useCallback((robotId) => {
    return workspaceRobots.some(r => r.robotId === robotId);
  }, [workspaceRobots]);
  
  const getWorkspaceRobot = useCallback((workspaceRobotId) => {
    return workspaceRobots.find(r => r.id === workspaceRobotId);
  }, [workspaceRobots]);
  
  const getRobotLoadStatus = useCallback((robotId) => {
    const loadingState = loadingStates.get(robotId);
    const loaded = loadedRobots.has(robotId);
    
    return {
      isLoading: loadingState === 'loading',
      isLoaded: loaded,
      hasError: loadingState === 'error',
      statusText: loaded ? 'Loaded' : 'Click to Load'
    };
  }, [loadingStates, loadedRobots]);
  
  // ========== IMPORT/EXPORT ==========
  const importRobots = useCallback((robotsData) => {
    try {
      setWorkspaceRobots(robotsData);
      setSuccessMessage(`Imported ${robotsData.length} robots`);
      setTimeout(() => setSuccessMessage(''), 3000);
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
    } catch (error) {
      console.error('[RobotContext] Error exporting robots:', error);
      setError('Failed to export robots');
    }
  }, [workspaceRobots]);
  
  // ========== ERROR HANDLING ==========
  const clearError = useCallback(() => setError(null), []);
  const clearSuccess = useCallback(() => setSuccessMessage(''), []);
  
  // ========== CONTEXT VALUE ==========
  const value = {
    // ========== STATE ==========
    // Discovery
    availableRobots,
    categories,
    availableTools,
    
    // Workspace
    workspaceRobots,
    
    // Loaded Robots (3D Scene)
    loadedRobots,
    
    // Active Robot
    activeRobotId,
    activeRobot,
    
    // Loading States
    isLoading,
    loadingStates,
    error,
    successMessage,
    
    // ========== DISCOVERY OPERATIONS ==========
    discoverRobots,
    refresh: discoverRobots,
    loadAvailableTools,
    
    // ========== WORKSPACE OPERATIONS ==========
    addRobotToWorkspace,
    removeRobotFromWorkspace,
    isRobotInWorkspace,
    getWorkspaceRobot,
    clearWorkspace: () => setWorkspaceRobots([]),
    importRobots,
    exportRobots,
    
    // ========== 3D ROBOT OPERATIONS ==========
    loadRobot,
    unloadRobot,
    isRobotLoaded,
    getRobot,
    getRobotLoadStatus,
    
    // ========== ACTIVE ROBOT OPERATIONS ==========
    setActiveRobotId,
    setActiveRobot,
    
    // ========== JOINT CONTROL ==========
    setJointValue,
    setJointValues,
    getJointValues,
    resetJoints,
    
    // ========== COMPUTED PROPERTIES ==========
    workspaceRobotCount: workspaceRobots.length,
    loadedRobotCount: loadedRobots.size,
    hasWorkspaceRobots: workspaceRobots.length > 0,
    hasAvailableRobots: availableRobots.length > 0,
    hasLoadedRobots: loadedRobots.size > 0,
    hasActiveRobot: !!activeRobotId,
    hasAvailableTools: availableTools.length > 0,
    
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