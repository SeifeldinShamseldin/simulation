import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { useViewer } from './ViewerContext';
import { useRobot } from './RobotContext';
import URDFLoader from '../core/Loader/URDFLoader';
import MeshLoader from '../core/Loader/MeshLoader';
import EventBus from '../utils/EventBus';

const TCPContext = createContext(null);

export const TCPProvider = ({ children }) => {
  const { isViewerReady, getSceneSetup, getRobotManager } = useViewer();
  const { activeRobotId, loadedRobots } = useRobot();
  
  // State
  const [availableTools, setAvailableTools] = useState([]);
  const [attachedTools, setAttachedTools] = useState(new Map()); // robotId -> tool info
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  
  // References
  const sceneSetupRef = useRef(null);
  const robotManagerRef = useRef(null);
  const urdfLoaderRef = useRef(null);
  const toolObjectsRef = useRef(new Map()); // robotId -> { toolContainer, endEffector }
  
  // Initialize when viewer and robots are ready
  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 10;
    
    const tryInitialize = () => {
      if (isViewerReady && loadedRobots.size > 0) {
        const sceneSetup = getSceneSetup();
        const robotManager = getRobotManager();
        
        if (sceneSetup && robotManager) {
          try {
            sceneSetupRef.current = sceneSetup;
            robotManagerRef.current = robotManager;
            urdfLoaderRef.current = new URDFLoader(new THREE.LoadingManager());
            
            // Configure URDF loader for TCP tools
            urdfLoaderRef.current.parseVisual = true;
            urdfLoaderRef.current.parseCollision = false;
            
            setIsInitialized(true);
            setError(null);
            loadAvailableTools();
            
            console.log('TCP Manager initialized successfully');
            return;
          } catch (err) {
            console.error('TCP Manager initialization error:', err);
            setError(`Initialization failed: ${err.message}`);
          }
        }
      }
      
      // Retry logic
      if (retryCount < maxRetries) {
        retryCount++;
        setTimeout(tryInitialize, 500);
      } else {
        setError('TCP Manager initialization timeout');
      }
    };
    
    tryInitialize();
  }, [isViewerReady, loadedRobots, getSceneSetup, getRobotManager]);
  
  // Scan for available TCP tools
  const scanAvailableTools = useCallback(async () => {
    try {
      console.log('Scanning TCP tools via server API...');
      
      const response = await fetch('/api/tcp/scan');
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || 'Failed to scan TCP tools');
      }
      
      const tools = data.tools || [];
      console.log(`Found ${tools.length} TCP tools:`, tools);
      
      return tools;
    } catch (error) {
      console.error('Error scanning TCP tools:', error);
      throw error;
    }
  }, []);
  
  // Load available tools
  const loadAvailableTools = useCallback(async () => {
    if (!isInitialized) return;
    
    try {
      setIsLoading(true);
      setError(null);
      const tools = await scanAvailableTools();
      setAvailableTools(tools);
    } catch (err) {
      setError(`Failed to load tools: ${err.message}`);
      console.error('Error loading TCP tools:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isInitialized, scanAvailableTools]);
  
  // Find robot end effector
  const findEndEffector = useCallback((robot) => {
    console.log('Finding end effector for robot:', robot);
    
    // Method 1: Look for common end effector names
    const endEffectorNames = [
      'end_effector', 'tool0', 'ee_link', 'gripper_link', 
      'link_6', 'link_7', 'wrist_3_link', 'tool_link',
      'flange', 'tool_flange'
    ];
    
    for (const name of endEffectorNames) {
      if (robot.links && robot.links[name]) {
        console.log(`Found end effector by name: ${name}`);
        return robot.links[name];
      }
    }
    
    // Method 2: Find the link that has no child joints
    if (robot.links && robot.joints) {
      const linksWithChildJoints = new Set();
      Object.values(robot.joints).forEach(joint => {
        joint.traverse(child => {
          if (child.parent && child.parent.isURDFLink) {
            linksWithChildJoints.add(child.parent.name);
          }
        });
      });
      
      const leafLinks = [];
      Object.values(robot.links).forEach(link => {
        if (!linksWithChildJoints.has(link.name)) {
          leafLinks.push(link);
        }
      });
      
      if (leafLinks.length > 0) {
        const endEffector = leafLinks[leafLinks.length - 1];
        console.log(`Found end effector as leaf link: ${endEffector.name}`);
        return endEffector;
      }
    }
    
    // Method 3: Fallback - traverse to find the deepest link
    let deepestLink = null;
    let maxDepth = 0;
    const findDeepestLink = (obj, depth = 0) => {
      if (obj.isURDFLink && depth > maxDepth) {
        maxDepth = depth;
        deepestLink = obj;
      }
      if (obj.children) {
        obj.children.forEach(child => {
          findDeepestLink(child, depth + 1);
        });
      }
    };
    findDeepestLink(robot);
    
    if (deepestLink) {
      console.log(`Found end effector as deepest link: ${deepestLink.name}`);
    }
    
    return deepestLink;
  }, []);
  
  // Load single mesh file
  const loadSingleMesh = useCallback(async (meshPath) => {
    return new Promise((resolve, reject) => {
      MeshLoader.load(meshPath, new THREE.LoadingManager(), (obj, err) => {
        if (err) {
          reject(err);
          return;
        }
        
        if (obj) {
          // Apply default material if needed
          obj.traverse(child => {
            if (child instanceof THREE.Mesh) {
              if (!child.material || child.material.name === '' || child.material.name === 'default') {
                child.material = new THREE.MeshPhongMaterial({
                  color: 0x888888,
                  shininess: 100,
                  specular: 0x222222
                });
              }
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
          
          console.log('Single mesh loaded successfully:', meshPath);
          resolve(obj);
        } else {
          reject(new Error('No mesh object returned'));
        }
      });
    });
  }, []);
  
  // Load URDF-based tool
  const loadUrdfTool = useCallback(async (tool) => {
    console.log('Loading URDF tool:', tool);
    
    return new Promise((resolve, reject) => {
      const urdfPath = `${tool.path}/${tool.urdfFile}`;
      
      console.log('URDF path:', urdfPath);
      
      // Configure loader for this tool
      urdfLoaderRef.current.resetLoader();
      urdfLoaderRef.current.packages = tool.path;
      urdfLoaderRef.current.currentRobotName = tool.id;
      
      // Set up mesh loading callback
      urdfLoaderRef.current.loadMeshCb = (path, manager, done, material) => {
        const filename = path.split('/').pop();
        const resolvedPath = `${tool.path}/${filename}`;
        
        console.log('Loading tool mesh:', resolvedPath);
        
        MeshLoader.load(resolvedPath, manager, (obj, err) => {
          if (err) {
            console.error('Error loading tool mesh:', err);
            done(null, err);
            return;
          }
          
          if (obj) {
            obj.traverse(child => {
              if (child instanceof THREE.Mesh) {
                if (!child.material || child.material.name === '' || child.material.name === 'default') {
                  child.material = material || new THREE.MeshPhongMaterial({
                    color: 0x888888,
                    shininess: 100,
                    specular: 0x222222
                  });
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
      
      urdfLoaderRef.current.load(urdfPath, resolve, null, reject);
    });
  }, []);
  
  // Load multi-mesh tool
  const loadMultiMeshTool = useCallback(async (tool) => {
    console.log('Loading multi-mesh tool:', tool);
    
    const group = new THREE.Group();
    group.name = tool.id;
    
    // Load all mesh files
    for (const meshFile of tool.meshFiles) {
      try {
        const meshPath = `${tool.path}/${meshFile}`;
        console.log('Loading mesh file:', meshPath);
        
        const mesh = await loadSingleMesh(meshPath);
        if (mesh) {
          group.add(mesh);
        }
      } catch (error) {
        console.warn(`Failed to load mesh ${meshFile}:`, error);
      }
    }
    
    console.log(`Loaded ${group.children.length} meshes for multi-mesh tool`);
    return group.children.length > 0 ? group : null;
  }, [loadSingleMesh]);
  
  // Load single mesh tool
  const loadSingleMeshTool = useCallback(async (tool) => {
    console.log('Loading single mesh tool:', tool);
    
    const meshPath = tool.fileName ? 
      `${tool.path}/${tool.fileName}` : 
      tool.path;
    
    console.log('Mesh path:', meshPath);
    return await loadSingleMesh(meshPath);
  }, [loadSingleMesh]);
  
  // Attach tool to end effector
  const attachToEndEffector = useCallback((endEffector, toolObject) => {
    console.log('Attaching tool to end effector:', endEffector.name);
    
    // Create a tool container for proper positioning and transforms
    const toolContainer = new THREE.Group();
    toolContainer.name = 'tcp_tool_container';
    toolContainer.add(toolObject);
    
    // Add to end effector
    endEffector.add(toolContainer);
    
    // Store reference for easy access
    toolObject.userData.isToolObject = true;
    toolContainer.userData.isToolContainer = true;
    
    console.log('Tool attached to end effector successfully');
    
    return toolContainer;
  }, []);
  
  // Attach tool to robot
  const attachTool = useCallback(async (robotId, toolId) => {
    if (!robotManagerRef.current || !isInitialized) {
      throw new Error('TCP Manager not ready');
    }
    
    try {
      setIsLoading(true);
      setError(null);
      
      console.log(`Attaching tool ${toolId} to robot ${robotId}`);
      
      // Remove existing tool if present
      if (attachedTools.has(robotId)) {
        await removeTool(robotId);
      }
      
      // Find the tool
      const tool = availableTools.find(t => t.id === toolId);
      if (!tool) {
        throw new Error(`Tool ${toolId} not found`);
      }
      
      // Get robot and end effector
      const robot = robotManagerRef.current.getRobot(robotId);
      if (!robot) {
        throw new Error(`Robot ${robotId} not found`);
      }
      
      const endEffector = findEndEffector(robot);
      if (!endEffector) {
        throw new Error('End effector not found');
      }
      
      console.log('Loading tool:', tool);
      
      // Load the tool based on type
      let toolObject;
      if (tool.type === 'URDF Package') {
        toolObject = await loadUrdfTool(tool);
      } else if (tool.type === 'Multi-Mesh') {
        toolObject = await loadMultiMeshTool(tool);
      } else {
        toolObject = await loadSingleMeshTool(tool);
      }
      
      if (!toolObject) {
        throw new Error('Failed to load tool object');
      }
      
      console.log('Tool loaded successfully:', toolObject);
      
      // Attach to end effector
      const toolContainer = attachToEndEffector(endEffector, toolObject);
      
      // Store tool objects reference
      toolObjectsRef.current.set(robotId, {
        toolContainer,
        endEffector,
        toolObject
      });
      
      // Update state
      setAttachedTools(prev => new Map(prev).set(robotId, {
        toolId,
        tool,
        visible: true,
        transforms: {
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 }
        }
      }));
      
      console.log(`Tool ${toolId} attached to robot ${robotId}`);
      
      // Emit event
      EventBus.emit('tcp:tool-attached', {
        robotId,
        toolId,
        toolName: tool.name
      });
      
      return true;
    } catch (err) {
      setError(`Error attaching tool: ${err.message}`);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [isInitialized, attachedTools, availableTools, findEndEffector, loadUrdfTool, loadMultiMeshTool, loadSingleMeshTool, attachToEndEffector]);
  
  // Remove tool from robot
  const removeTool = useCallback(async (robotId) => {
    if (!attachedTools.has(robotId)) return;
    
    try {
      setIsLoading(true);
      console.log(`Removing tool from robot ${robotId}`);
      
      // Get tool objects
      const toolObjects = toolObjectsRef.current.get(robotId);
      if (toolObjects) {
        const { endEffector, toolContainer } = toolObjects;
        
        if (endEffector && toolContainer) {
          endEffector.remove(toolContainer);
          
          // Dispose of resources
          toolContainer.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach(m => m.dispose());
              } else {
                child.material.dispose();
              }
            }
          });
          
          console.log('Tool container removed and disposed');
        }
        
        // Remove from tracking
        toolObjectsRef.current.delete(robotId);
      }
      
      // Update state
      setAttachedTools(prev => {
        const newMap = new Map(prev);
        newMap.delete(robotId);
        return newMap;
      });
      
      // Emit event
      EventBus.emit('tcp:tool-removed', { robotId });
    } catch (err) {
      setError(`Error removing tool: ${err.message}`);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [attachedTools]);
  
  // Set tool transform
  const setToolTransform = useCallback((robotId, transforms) => {
    if (!attachedTools.has(robotId)) return;
    
    try {
      const toolObjects = toolObjectsRef.current.get(robotId);
      if (!toolObjects || !toolObjects.toolContainer) {
        console.warn(`No tool found for robot ${robotId}`);
        return;
      }
      
      const { toolContainer } = toolObjects;
      
      // Apply position
      if (transforms.position) {
        toolContainer.position.set(
          transforms.position.x || 0,
          transforms.position.y || 0,
          transforms.position.z || 0
        );
      }
      
      // Apply rotation
      if (transforms.rotation) {
        toolContainer.rotation.set(
          transforms.rotation.x || 0,
          transforms.rotation.y || 0,
          transforms.rotation.z || 0
        );
      }
      
      // Apply scale
      if (transforms.scale) {
        toolContainer.scale.set(
          transforms.scale.x || 1,
          transforms.scale.y || 1,
          transforms.scale.z || 1
        );
      }
      
      // Force matrix update
      toolContainer.updateMatrix();
      toolContainer.updateMatrixWorld(true);
      
      console.log(`Applied transforms to tool for robot ${robotId}:`, transforms);
      
      // Update state
      setAttachedTools(prev => {
        const newMap = new Map(prev);
        const toolData = newMap.get(robotId);
        if (toolData) {
          toolData.transforms = { ...transforms };
          newMap.set(robotId, toolData);
        }
        return newMap;
      });
      
      // Emit transform update event
      EventBus.emit('tcp:tool-transformed', {
        robotId,
        transforms
      });
    } catch (err) {
      setError(`Error setting tool transform: ${err.message}`);
    }
  }, [attachedTools]);
  
  // Set tool visibility
  const setToolVisibility = useCallback((robotId, visible) => {
    if (!attachedTools.has(robotId)) return;
    
    try {
      const toolObjects = toolObjectsRef.current.get(robotId);
      if (!toolObjects || !toolObjects.toolContainer) return;
      
      toolObjects.toolContainer.visible = visible;
      console.log(`Tool visibility set to ${visible} for robot ${robotId}`);
      
      // Update state
      setAttachedTools(prev => {
        const newMap = new Map(prev);
        const toolData = newMap.get(robotId);
        if (toolData) {
          toolData.visible = visible;
          newMap.set(robotId, toolData);
        }
        return newMap;
      });
      
      EventBus.emit('tcp:tool-visibility-changed', { robotId, visible });
    } catch (err) {
      setError(`Error setting tool visibility: ${err.message}`);
    }
  }, [attachedTools]);
  
  // Get tool info for specific robot
  const getToolInfo = useCallback((robotId) => {
    return attachedTools.get(robotId) || null;
  }, [attachedTools]);
  
  // Clean up when robots are removed
  useEffect(() => {
    const handleRobotRemoved = (data) => {
      if (attachedTools.has(data.robotName)) {
        removeTool(data.robotName);
      }
    };
    
    const unsubscribe = EventBus.on('robot:removed', handleRobotRemoved);
    return () => unsubscribe();
  }, [attachedTools, removeTool]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Remove all tools
      for (const [robotId] of attachedTools) {
        removeTool(robotId);
      }
      
      toolObjectsRef.current.clear();
      sceneSetupRef.current = null;
      robotManagerRef.current = null;
      urdfLoaderRef.current = null;
    };
  }, []);
  
  const value = {
    // State
    availableTools,
    attachedTools,
    isLoading,
    error,
    isInitialized,
    
    // Methods
    loadAvailableTools,
    attachTool,
    removeTool,
    setToolTransform,
    setToolVisibility,
    getToolInfo,
    
    // Utils
    clearError: () => setError(null)
  };
  
  return (
    <TCPContext.Provider value={value}>
      {children}
    </TCPContext.Provider>
  );
};

export const useTCPContext = () => {
  const context = useContext(TCPContext);
  if (!context) {
    throw new Error('useTCPContext must be used within TCPProvider');
  }
  return context;
};

export default TCPContext; 