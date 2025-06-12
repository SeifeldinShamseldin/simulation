// src/contexts/RobotContext.jsx - UNIFIED ROBOT MANAGEMENT
import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import URDFLoader from '../core/Loader/URDFLoader';
import MeshLoader from '../core/Loader/MeshLoader';
import { useViewer } from './ViewerContext';
import EventBus from '../utils/EventBus';

const RobotContext = createContext(null);

export const RobotProvider = ({ children }) => {
  const { isViewerReady, getSceneSetup } = useViewer();
  
  // ========== DISCOVERY STATE ==========
  const [availableRobots, setAvailableRobots] = useState([]);
  const [categories, setCategories] = useState([]);
  const [availableTools, setAvailableTools] = useState([]);
  
  // ========== WORKSPACE STATE ==========
  const [workspaceRobots, setWorkspaceRobots] = useState([]);
  
  // ========== SCENE STATE ==========
  const [loadedRobots, setLoadedRobots] = useState(new Map());
  const [activeRobotId, setActiveRobotId] = useState(null);
  const [activeRobot, setActiveRobot] = useState(null);
  
  // ========== LOADING STATE ==========
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  
  // ========== REFS ==========
  const sceneSetupRef = useRef(null);
  const urdfLoaderRef = useRef(null);
  const isDiscoveringRef = useRef(false);
  const hasInitializedRef = useRef(false);
  
  // ========== INITIALIZATION ==========
  useEffect(() => {
    if (isViewerReady) {
      sceneSetupRef.current = getSceneSetup();
      urdfLoaderRef.current = new URDFLoader(new THREE.LoadingManager());
      urdfLoaderRef.current.parseVisual = true;
      urdfLoaderRef.current.parseCollision = false;
      
      console.log('[RobotContext] Initialized with scene setup');
    }
  }, [isViewerReady, getSceneSetup]);
  
  // ========== DISCOVERY OPERATIONS ==========
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
              categoryName: category.name
            });
          });
        });
        
        setAvailableRobots(allRobots);
        console.log('[RobotContext] Discovered robots:', allRobots.length);
      } else {
        setError(result.message || 'Failed to scan robots directory');
      }
    } catch (err) {
      console.error('[RobotContext] Discovery error:', err);
      setError('Error connecting to server');
    } finally {
      setIsLoading(false);
      isDiscoveringRef.current = false;
    }
  }, []);
  
  const discoverTools = useCallback(async () => {
    try {
      const response = await fetch('/api/tcp/scan');
      const result = await response.json();
      
      if (result.success) {
        setAvailableTools(result.tools || []);
        console.log('[RobotContext] Discovered tools:', result.tools?.length || 0);
      }
    } catch (err) {
      console.error('[RobotContext] Tool discovery error:', err);
    }
  }, []);
  
  // ========== WORKSPACE OPERATIONS ==========
  useEffect(() => {
    // Load workspace from localStorage
    try {
      const saved = localStorage.getItem('workspaceRobots');
      if (saved) {
        setWorkspaceRobots(JSON.parse(saved));
      }
    } catch (error) {
      console.error('[RobotContext] Error loading workspace:', error);
    }
  }, []);
  
  useEffect(() => {
    // Save workspace to localStorage
    try {
      localStorage.setItem('workspaceRobots', JSON.stringify(workspaceRobots));
    } catch (error) {
      console.error('[RobotContext] Error saving workspace:', error);
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
        console.log('[RobotContext] Robot already in workspace');
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
  
  // ========== ROBOT LOADING (SCENE) ==========
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
      
      // Clear other robots if requested
      if (clearOthers) {
        for (const [id, robotData] of loadedRobots) {
          if (id !== robotId) {
            unloadRobot(id);
          }
        }
      }
      
      // Extract package path
      const packagePath = urdfPath.substring(0, urdfPath.lastIndexOf('/'));
      
      // Reset loader
      urdfLoaderRef.current.resetLoader();
      urdfLoaderRef.current.packages = packagePath;
      urdfLoaderRef.current.currentRobotName = robotId;
      
      // Setup mesh loading
      urdfLoaderRef.current.loadMeshCb = (path, manager, done, material) => {
        const filename = path.split('/').pop();
        const resolvedPath = `${packagePath}/${filename}`;
        
        MeshLoader.load(resolvedPath, manager, (obj, err) => {
          if (err) {
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
          }
        }, material);
      };
      
      console.log(`[RobotContext] Loading robot ${robotId}`);
      
      // Load the URDF
      const robot = await new Promise((resolve, reject) => {
        urdfLoaderRef.current.load(urdfPath, resolve, null, reject);
      });
      
      // Add to scene
      const robotContainer = new THREE.Object3D();
      robotContainer.name = `${robotId}_container`;
      robotContainer.add(robot);
      robotContainer.position.set(position.x, position.y, position.z);
      
      sceneSetupRef.current.robotRoot.add(robotContainer);
      
      // Store robot data
      const robotData = {
        id: robotId,
        robot: robot,
        container: robotContainer,
        urdfPath: urdfPath,
        isActive: makeActive,
        loadedAt: new Date().toISOString()
      };
      
      setLoadedRobots(prev => new Map(prev).set(robotId, robotData));
      
      // Set as active if requested
      if (makeActive) {
        setActiveRobotId(robotId);
        setActiveRobot(robot);
      }
      
      // Update scene
      if (sceneSetupRef.current.setUpAxis) {
        sceneSetupRef.current.setUpAxis('+Z');
      }
      
      // Focus on robot
      if (sceneSetupRef.current.focusOnObject) {
        setTimeout(() => {
          sceneSetupRef.current.focusOnObject(robot, 0.8);
        }, 100);
      }
      
      // Emit events
      EventBus.emit('robot:loaded', { 
        robotId, 
        robotName: robotId,
        robot 
      });
      
      EventBus.emit('robot:registered', { 
        robotId, 
        robotName: robotId,
        robot 
      });
      
      setSuccessMessage(`${robotId} loaded successfully!`);
      setTimeout(() => setSuccessMessage(''), 3000);
      
      return robot;
      
    } catch (err) {
      console.error('[RobotContext] Error loading robot:', err);
      setError('Failed to load robot: ' + err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [loadedRobots]);
  
  const unloadRobot = useCallback((robotId) => {
    const robotData = loadedRobots.get(robotId);
    if (!robotData) return;
    
    // Remove from scene
    if (robotData.container && sceneSetupRef.current) {
      sceneSetupRef.current.robotRoot.remove(robotData.container);
      
      // Dispose resources
      robotData.container.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
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
    
    // Clear active if this was the active robot
    if (activeRobotId === robotId) {
      setActiveRobotId(null);
      setActiveRobot(null);
    }
    
    EventBus.emit('robot:unloaded', { robotId });
    EventBus.emit('robot:removed', { robotId, robotName: robotId });
  }, [loadedRobots, activeRobotId]);
  
  // ========== JOINT CONTROL ==========
  const setJointValue = useCallback((robotId, jointName, value) => {
    const robotData = loadedRobots.get(robotId);
    if (!robotData) return false;
    
    const robot = robotData.robot;
    
    try {
      let success = false;
      
      // Try robot's setJointValue method
      if (robot.setJointValue) {
        success = robot.setJointValue(jointName, value);
      }
      
      // Try direct joint access
      if (!success && robot.joints && robot.joints[jointName]) {
        if (robot.joints[jointName].setJointValue) {
          success = robot.joints[jointName].setJointValue(value);
        }
      }
      
      if (success) {
        EventBus.emit('robot:joint-changed', {
          robotId,
          robotName: robotId,
          jointName,
          value
        });
      }
      
      return success;
    } catch (error) {
      console.error('[RobotContext] Error setting joint:', error);
      return false;
    }
  }, [loadedRobots]);
  
  const setJointValues = useCallback((robotId, values) => {
    const robotData = loadedRobots.get(robotId);
    if (!robotData) return false;
    
    const robot = robotData.robot;
    let success = false;
    
    try {
      if (robot.setJointValues) {
        success = robot.setJointValues(values);
      } else {
        // Set individual joints
        success = true;
        Object.entries(values).forEach(([jointName, value]) => {
          if (!setJointValue(robotId, jointName, value)) {
            success = false;
          }
        });
      }
      
      if (success) {
        EventBus.emit('robot:joints-changed', {
          robotId,
          robotName: robotId,
          values
        });
      }
      
      return success;
    } catch (error) {
      console.error('[RobotContext] Error setting joints:', error);
      return false;
    }
  }, [loadedRobots, setJointValue]);
  
  const getJointValues = useCallback((robotId) => {
    const robotData = loadedRobots.get(robotId);
    if (!robotData) return {};
    
    const robot = robotData.robot;
    const values = {};
    
    if (robot.joints) {
      Object.values(robot.joints).forEach(joint => {
        if (joint && joint.jointType !== 'fixed' && typeof joint.angle !== 'undefined') {
          values[joint.name] = joint.angle;
        }
      });
    }
    
    return values;
  }, [loadedRobots]);
  
  const resetJoints = useCallback((robotId) => {
    const joints = getJointValues(robotId);
    const resetValues = {};
    
    Object.keys(joints).forEach(jointName => {
      resetValues[jointName] = 0;
    });
    
    return setJointValues(robotId, resetValues);
  }, [getJointValues, setJointValues]);
  
  // ========== UTILITY METHODS ==========
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
  
  const clearWorkspace = useCallback(() => {
    if (window.confirm('Clear all robots from workspace?')) {
      setWorkspaceRobots([]);
      setSuccessMessage('Workspace cleared');
      setTimeout(() => setSuccessMessage(''), 3000);
    }
  }, []);
  
  // ========== IMPORT/EXPORT ==========
  const exportWorkspace = useCallback(() => {
    const data = JSON.stringify(workspaceRobots, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `workspace_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [workspaceRobots]);
  
  const importWorkspace = useCallback((data) => {
    try {
      setWorkspaceRobots(data);
      setSuccessMessage(`Imported ${data.length} robots`);
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      setError('Failed to import workspace');
    }
  }, []);
  
  // ========== INITIALIZATION ==========
  useEffect(() => {
    if (isViewerReady && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      discoverRobots();
      discoverTools();
    }
  }, [isViewerReady, discoverRobots, discoverTools]);
  
  // ========== CLEANUP ==========
  useEffect(() => {
    return () => {
      // Unload all robots on unmount
      for (const [robotId] of loadedRobots) {
        unloadRobot(robotId);
      }
    };
  }, [loadedRobots, unloadRobot]);
  
  const value = {
    // ========== DISCOVERY ==========
    availableRobots,
    categories,
    availableTools,
    discoverRobots,
    discoverTools,
    
    // ========== WORKSPACE ==========
    workspaceRobots,
    addRobotToWorkspace,
    removeRobotFromWorkspace,
    isRobotInWorkspace,
    clearWorkspace,
    exportWorkspace,
    importWorkspace,
    
    // ========== SCENE MANAGEMENT ==========
    loadedRobots,
    activeRobotId,
    activeRobot,
    loadRobot,
    unloadRobot,
    getRobot,
    isRobotLoaded,
    setActiveRobotId: (id) => {
      setActiveRobotId(id);
      setActiveRobot(id ? getRobot(id) : null);
    },
    
    // ========== JOINT CONTROL ==========
    setJointValue,
    setJointValues,
    getJointValues,
    resetJoints,
    
    // ========== STATE ==========
    isLoading,
    error,
    successMessage,
    clearError: () => setError(null),
    clearSuccess: () => setSuccessMessage(''),
    
    // ========== COMPUTED VALUES ==========
    robotCount: loadedRobots.size,
    workspaceCount: workspaceRobots.length,
    hasLoadedRobots: loadedRobots.size > 0,
    hasWorkspaceRobots: workspaceRobots.length > 0,
    hasActiveRobot: !!activeRobotId
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
    throw new Error('useRobotContext must be used within RobotProvider');
  }
  return context;
};

export default RobotContext;