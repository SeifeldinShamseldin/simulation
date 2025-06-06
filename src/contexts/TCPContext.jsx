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
  
  // Enhanced readiness check with detailed logging
  const checkTCPReadiness = useCallback((operation = 'operation') => {
    console.log(`[TCP] Checking readiness for ${operation}...`);
    
    if (!isInitialized) {
      console.log(`[TCP] ${operation} failed: not initialized`);
      return false;
    }
    
    if (!robotManagerRef.current) {
      console.log(`[TCP] ${operation} failed: robotManager not available`);
      return false;
    }
    
    if (!sceneSetupRef.current) {
      console.log(`[TCP] ${operation} failed: sceneSetup not available`);
      return false;
    }
    
    if (!urdfLoaderRef.current) {
      console.log(`[TCP] ${operation} failed: urdfLoader not available`);
      return false;
    }
    
    // Additional check: verify robot manager has robots
    const allRobots = robotManagerRef.current.getAllRobots();
    if (!allRobots || allRobots.size === 0) {
      console.log(`[TCP] ${operation} failed: no robots in robotManager`);
      return false;
    }
    
    console.log(`[TCP] Readiness check passed for ${operation}`);
    return true;
  }, [isInitialized]);

  // Simplified wait for readiness - just wait for basic initialization
  const waitForReadiness = useCallback(async (timeoutMs = 3000, operation = 'operation') => {
    const startTime = Date.now();
    let checkCount = 0;
    
    while (!checkTCPReadiness(operation) && (Date.now() - startTime) < timeoutMs) {
      checkCount++;
      console.log(`[TCP] Waiting for ${operation} readiness... (check ${checkCount}, ${Date.now() - startTime}ms elapsed)`);
      await new Promise(resolve => setTimeout(resolve, 200)); // Check every 200ms
    }
    
    const isReady = checkTCPReadiness(operation);
    if (!isReady) {
      throw new Error(`TCP Manager not ready for ${operation} after ${timeoutMs}ms timeout`);
    }
    
    console.log(`[TCP] Ready for ${operation} after ${Date.now() - startTime}ms`);
    return true;
  }, [checkTCPReadiness]);

  // Scan for available TCP tools (moved up before useEffect)
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

  // Enhanced initialization with better timing
  useEffect(() => {
    let initTimeout;
    let attemptCount = 0;
    const maxAttempts = 30;
    
    const waitForSystemsReady = async () => {
      attemptCount++;
      console.log(`[TCP] Initialization attempt ${attemptCount}/${maxAttempts}`);
      
      // More thorough readiness check
      if (!isViewerReady) {
        console.log('[TCP] Viewer not ready yet');
        scheduleRetry();
        return;
      }
      
      if (loadedRobots.size === 0) {
        console.log('[TCP] No robots loaded yet');
        scheduleRetry();
        return;
      }
      
      const sceneSetup = getSceneSetup();
      const robotManager = getRobotManager();
      
      if (!sceneSetup) {
        console.log('[TCP] SceneSetup not available');
        scheduleRetry();
        return;
      }
      
      if (!robotManager) {
        console.log('[TCP] RobotManager not available');
        scheduleRetry();
        return;
      }
      
      // Additional check: verify robot manager actually has robots
      const allRobots = robotManager.getAllRobots();
      if (!allRobots || allRobots.size === 0) {
        console.log('[TCP] RobotManager has no robots yet');
        scheduleRetry();
        return;
      }
      
      // Additional check: verify scene has the robot root
      if (!sceneSetup.robotRoot || sceneSetup.robotRoot.children.length === 0) {
        console.log('[TCP] Scene robotRoot not ready');
        scheduleRetry();
        return;
      }
      
      console.log('[TCP] All systems ready, initializing TCP Manager...');
      
      try {
        // Store references
        sceneSetupRef.current = sceneSetup;
        robotManagerRef.current = robotManager;
        
        // Create URDF loader
        urdfLoaderRef.current = new URDFLoader(new THREE.LoadingManager());
        urdfLoaderRef.current.parseVisual = true;
        urdfLoaderRef.current.parseCollision = false;
        
        // Mark as initialized
        setIsInitialized(true);
        setError(null);
        
        console.log('[TCP] Manager initialized successfully, loading tools...');
        
        // Load tools (don't wait for this to complete)
        scanAvailableTools()
          .then(tools => {
            setAvailableTools(tools);
            console.log(`[TCP] Tools loaded: ${tools.length} available`);
          })
          .catch(toolError => {
            console.warn('[TCP] Failed to load tools:', toolError);
            setAvailableTools([]);
          });
        
      } catch (err) {
        console.error('[TCP] Initialization failed:', err);
        setError(`Initialization failed: ${err.message}`);
        setIsInitialized(false);
        scheduleRetry();
      }
    };
    
    const scheduleRetry = () => {
      if (attemptCount < maxAttempts) {
        const delay = Math.min(500 + (attemptCount * 100), 2000); // Progressive delay
        console.log(`[TCP] Retrying in ${delay}ms...`);
        initTimeout = setTimeout(waitForSystemsReady, delay);
      } else {
        console.error('[TCP] Max initialization attempts reached');
        setError('TCP Manager failed to initialize - systems not ready');
      }
    };
    
    // Start initialization
    waitForSystemsReady();
    
    return () => {
      if (initTimeout) {
        clearTimeout(initTimeout);
      }
    };
  }, [isViewerReady, loadedRobots, getSceneSetup, getRobotManager, scanAvailableTools]);
  
  // Load available tools with better error handling
  const loadAvailableTools = useCallback(async () => {
    if (!isInitialized) {
      console.log('[TCP] Cannot load tools - not initialized yet');
      return;
    }
    
    try {
      setIsLoading(true);
      setError(null);
      console.log('[TCP] Loading available tools...');
      
      const tools = await scanAvailableTools();
      setAvailableTools(tools);
      console.log(`[TCP] Successfully loaded ${tools.length} tools`);
    } catch (err) {
      const errorMsg = `Failed to load tools: ${err.message}`;
      setError(errorMsg);
      console.error('[TCP] Error loading TCP tools:', err);
      
      // Don't fail completely - just log and continue with empty tools
      setAvailableTools([]);
    } finally {
      setIsLoading(false);
    }
  }, [isInitialized, scanAvailableTools]);

  // Debug helper to check TCP manager status
  const getTCPStatus = useCallback(() => {
    return {
      isInitialized,
      isLoading,
      error,
      hasRobotManager: !!robotManagerRef.current,
      hasSceneSetup: !!sceneSetupRef.current,
      hasUrdfLoader: !!urdfLoaderRef.current,
      availableToolsCount: availableTools.length,
      attachedToolsCount: attachedTools.size,
      isViewerReady,
      loadedRobotsCount: loadedRobots.size
    };
  }, [isInitialized, isLoading, error, availableTools.length, attachedTools.size, isViewerReady, loadedRobots.size]);
  
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
  
  // Find the effective tool tip (the actual TCP point)
  const findToolTip = useCallback((toolObject, toolContainer) => {
    console.log('Finding tool tip in:', toolObject);
    
    let toolTip = toolObject;
    
    // Method 1: Look for explicit TCP/tip markers
    const tcpNames = ['tcp', 'tip', 'end', 'tool_tip', 'flange'];
    toolObject.traverse(child => {
      if (child.name && tcpNames.some(name => child.name.toLowerCase().includes(name))) {
        console.log(`Found TCP by name: ${child.name}`);
        toolTip = child;
        return;
      }
    });
    
    // Method 2: If no explicit tip, find the furthest point from container
    if (toolTip === toolObject) {
      let furthestChild = null;
      let maxDistance = 0;
      
      toolContainer.updateMatrixWorld(true);
      const containerPos = new THREE.Vector3();
      toolContainer.getWorldPosition(containerPos);
      
      toolObject.traverse(child => {
        if (child.isMesh && child !== toolContainer && child !== toolObject) {
          child.updateMatrixWorld(true);
          const childPos = new THREE.Vector3();
          child.getWorldPosition(childPos);
          const distance = childPos.distanceTo(containerPos);
          
          if (distance > maxDistance) {
            maxDistance = distance;
            furthestChild = child;
          }
        }
      });
      
      if (furthestChild) {
        console.log(`Found tool tip as furthest point: ${furthestChild.name || 'unnamed'} at distance ${maxDistance.toFixed(3)}`);
        toolTip = furthestChild;
      } else {
        console.log('Using tool container as tool tip');
        toolTip = toolContainer;
      }
    }
    
    return toolTip;
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
    
    console.log('Tool container children after adding:', toolContainer.children.length);
    console.log('End effector children after adding tool:', endEffector.children.length);
    
    // Force matrix update
    toolContainer.updateMatrixWorld(true);
    toolObject.updateMatrixWorld(true);
    
    console.log('Tool attached to end effector successfully');
    
    return toolContainer;
  }, []);
  
  // Enhanced event emission helper
  const emitTCPEvent = useCallback((eventType, data) => {
    const eventData = {
      robotId: data.robotId,
      timestamp: Date.now(),
      ...data
    };
    
    console.log(`[TCP Event] ${eventType}:`, eventData);
    EventBus.emit(eventType, eventData);
    
    // Also emit a general TCP change event
    EventBus.emit('tcp:changed', {
      type: eventType,
      ...eventData
    });
  }, []);
  
  // Define functions in correct order to avoid initialization errors

  // 1. FIRST: attachToolWithTransforms (no dependencies on other functions)
  const attachToolWithTransforms = useCallback(async (robotId, toolId, transforms) => {
    console.log(`[TCP] Attaching tool ${toolId} with transforms to robot ${robotId}`);
    
    // Enhanced readiness check with auto-wait
    try {
      await waitForReadiness(3000);
    } catch (error) {
      console.error(`[TCP] Manager not ready for tool attachment:`, error);
      throw new Error(`TCP Manager not ready: ${error.message}`);
    }
    
    try {
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
      
      console.log('[TCP] Loading tool for respawn:', tool);
      
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
      
      // Create tool container
      const toolContainer = new THREE.Group();
      toolContainer.name = 'tcp_tool_container';
      toolContainer.add(toolObject);
      
      // Apply transforms BEFORE attaching to end effector
      if (transforms.position) {
        toolContainer.position.set(
          transforms.position.x || 0,
          transforms.position.y || 0,
          transforms.position.z || 0
        );
      }
      
      if (transforms.rotation) {
        toolContainer.rotation.set(
          transforms.rotation.x || 0,
          transforms.rotation.y || 0,
          transforms.rotation.z || 0
        );
      }
      
      if (transforms.scale) {
        toolContainer.scale.set(
          transforms.scale.x || 1,
          transforms.scale.y || 1,
          transforms.scale.z || 1
        );
      }
      
      // Add to end effector
      endEffector.add(toolContainer);
      
      // Update matrices
      toolContainer.updateMatrix();
      toolContainer.updateMatrixWorld(true);
      
      // Find the effective tool tip
      const toolTip = findToolTip(toolObject, toolContainer);
      
      // Store tool objects
      const toolObjectData = {
        toolContainer,
        endEffector,
        toolObject,
        toolTip,
        tool
      };
      
      toolObjectsRef.current.set(robotId, toolObjectData);
      
      // Get bounds and dimensions
      const bounds = new THREE.Box3().setFromObject(toolObject);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      
      // Update state
      const toolInfo = {
        toolId,
        tool,
        visible: true,
        transforms: { ...transforms }, // Store the applied transforms
        dimensions: {
          width: size.x,
          height: size.y,
          depth: size.z,
          center: { x: center.x, y: center.y, z: center.z }
        },
        bounds: {
          min: { x: bounds.min.x, y: bounds.min.y, z: bounds.min.z },
          max: { x: bounds.max.x, y: bounds.max.y, z: bounds.max.z }
        }
      };
      
      setAttachedTools(prev => new Map(prev).set(robotId, toolInfo));
      
      // Tell EndEffectorContext about the new end effector
      EventBus.emit('tcp:endeffector-changed', {
        robotId,
        endEffectorObject: toolTip,
        type: 'tcp-attached',
        toolContainer: toolContainer,
        toolName: tool.name,
        toolType: tool.type
      });
      
      // Emit detailed attachment event
      emitTCPEvent('tcp:tool-attached', {
        robotId,
        toolId,
        toolName: tool.name,
        toolType: tool.type,
        toolInfo,
        endEffectorName: endEffector.name,
        containerObject: toolContainer,
        toolObject: toolObject,
        toolTip: toolTip,
        transforms: transforms // Include transforms in event
      });
      
      console.log(`[TCP] Tool respawned successfully with transforms applied`);
      
    } catch (err) {
      console.error('[TCP] Error in attachToolWithTransforms:', err);
      throw err;
    }
  }, [availableTools, findEndEffector, findToolTip, loadUrdfTool, loadMultiMeshTool, loadSingleMeshTool, emitTCPEvent, waitForReadiness]);

  // 2. SECOND: removeTool (independent function)
  const removeTool = useCallback(async (robotId) => {
    console.log(`[TCP] Removing tool from robot ${robotId}`);
    
    try {
      setIsLoading(true);
      
      // Remove from state first
      setAttachedTools(prev => {
        const newMap = new Map(prev);
        newMap.delete(robotId);
        return newMap;
      });
      
      // Get tool objects
      const toolObjects = toolObjectsRef.current.get(robotId);
      if (toolObjects) {
        const { endEffector, toolContainer } = toolObjects;
        
        if (endEffector && toolContainer) {
          // Remove from scene
          endEffector.remove(toolContainer);
          
          // Force update the parent
          endEffector.updateMatrixWorld(true);
          
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
          
          console.log('[TCP] Tool container removed and disposed');
        }
        
        // Remove from tracking
        toolObjectsRef.current.delete(robotId);
      }
      
      // Tell EndEffectorContext to revert
      if (robotManagerRef.current) {
        const robot = robotManagerRef.current.getRobot(robotId);
        if (robot) {
          const robotEndEffector = findEndEffector(robot);
          EventBus.emit('tcp:endeffector-changed', {
            robotId,
            endEffectorObject: robotEndEffector,
            type: 'tcp-removed'
          });
        }
      }
      
      // Emit removal event
      emitTCPEvent('tcp:tool-removed', {
        robotId,
        toolRemoved: true
      });
      
      console.log(`[TCP] Tool successfully removed from robot ${robotId}`);
      
    } catch (err) {
      setError(`Error removing tool: ${err.message}`);
      console.error('Error removing TCP tool:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [emitTCPEvent, findEndEffector]);

  // 3. THIRD: setToolTransform with robust respawn logic
  const setToolTransform = useCallback(async (robotId, transforms) => {
    console.log(`[TCP] setToolTransform - respawning tool for robot: ${robotId}`);
    console.log(`[TCP] New transforms:`, transforms);
    
    if (!attachedTools.has(robotId)) {
      console.warn(`[TCP] No tool attached to robot ${robotId}`);
      return;
    }
    
    const operationId = `transform-${robotId}-${Date.now()}`;
    
    try {
      setIsLoading(true);
      
      // Get current tool info before removing
      const currentToolInfo = attachedTools.get(robotId);
      if (!currentToolInfo) {
        console.error(`[TCP] No current tool info found for robot ${robotId}`);
        return;
      }
      
      const currentToolId = currentToolInfo.toolId;
      console.log(`[TCP] Current tool ID: ${currentToolId}`);
      
      // Step 1: Wait for system readiness
      console.log(`[TCP] Step 1: Checking system readiness for respawn...`);
      await waitForReadiness(5000, `respawn-${operationId}`);
      
      // Step 2: Remove current tool
      console.log(`[TCP] Step 2: Removing current tool`);
      
      // Remove from state first to prevent conflicts
      setAttachedTools(prev => {
        const newMap = new Map(prev);
        newMap.delete(robotId);
        return newMap;
      });
      
      // Remove from scene
      const toolObjects = toolObjectsRef.current.get(robotId);
      if (toolObjects) {
        const { endEffector, toolContainer } = toolObjects;
        
        if (endEffector && toolContainer && endEffector.children.includes(toolContainer)) {
          endEffector.remove(toolContainer);
          endEffector.updateMatrixWorld(true);
          
          // Dispose resources
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
          
          console.log('[TCP] Tool physically removed from scene');
        }
        
        // Clean up tracking
        toolObjectsRef.current.delete(robotId);
      }
      
      // Step 3: Wait for cleanup to complete
      console.log(`[TCP] Step 3: Waiting for cleanup...`);
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Step 4: Verify system is still ready
      console.log(`[TCP] Step 4: Re-verifying system readiness...`);
      await waitForReadiness(3000, `re-attach-${operationId}`);
      
      // Step 5: Respawn with new transforms
      console.log(`[TCP] Step 5: Respawning tool with new transforms`);
      await attachToolWithTransforms(robotId, currentToolId, transforms);
      
      console.log(`[TCP] Tool respawned successfully with new transforms`);
      
      // Emit successful transform event
      emitTCPEvent('tcp:transform-changed', {
        robotId,
        toolId: currentToolId,
        transforms,
        operationId
      });
      
    } catch (err) {
      console.error(`[TCP] Error in setToolTransform for robot ${robotId}:`, err);
      setError(`Error updating tool transform: ${err.message}`);
      
      // Emit failed transform event
      emitTCPEvent('tcp:transform-failed', {
        robotId,
        error: err.message,
        operationId
      });
      
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [attachedTools, waitForReadiness, attachToolWithTransforms, emitTCPEvent]);

  // 4. FOURTH: attachTool (uses attachToolWithTransforms)
  const attachTool = useCallback(async (robotId, toolId) => {
    console.log(`[TCP] Attaching tool ${toolId} to robot ${robotId}`);
    
    // Use the new attachToolWithTransforms with default transforms
    const defaultTransforms = {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    };
    
    try {
      setIsLoading(true);
      setError(null);
      
      // Remove existing tool if present
      if (attachedTools.has(robotId)) {
        await removeTool(robotId);
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      await attachToolWithTransforms(robotId, toolId, defaultTransforms);
      return true;
      
    } catch (err) {
      console.error('[TCP] Error attaching tool:', err);
      setError(`Error attaching tool: ${err.message}`);
      emitTCPEvent('tcp:attachment-failed', {
        robotId,
        toolId,
        error: err.message
      });
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [attachedTools, removeTool, attachToolWithTransforms, emitTCPEvent]);
  
  // Update setToolVisibility to emit events
  const setToolVisibility = useCallback((robotId, visible) => {
    if (!attachedTools.has(robotId)) return;
    
    try {
      const toolObjects = toolObjectsRef.current.get(robotId);
      if (!toolObjects || !toolObjects.toolContainer) return;
      
      const previousVisibility = toolObjects.toolContainer.visible;
      toolObjects.toolContainer.visible = visible;
      console.log(`[TCP] Tool visibility set to ${visible} for robot ${robotId}`);
      
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
      
      // Emit visibility change event
      emitTCPEvent('tcp:tool-visibility-changed', {
        robotId,
        visible,
        previousVisibility
      });
    } catch (err) {
      setError(`Error setting tool visibility: ${err.message}`);
      emitTCPEvent('tcp:visibility-failed', {
        robotId,
        visible,
        error: err.message
      });
    }
  }, [attachedTools, emitTCPEvent]);
  
  // Clean up when robots are removed
  useEffect(() => {
    const handleRobotRemoved = (data) => {
      if (attachedTools.has(data.robotName)) {
        const toolObjects = toolObjectsRef.current.get(data.robotName);
        if (toolObjects) {
          const { endEffector, toolContainer } = toolObjects;
          if (endEffector && toolContainer) {
            endEffector.remove(toolContainer);
          }
          toolObjectsRef.current.delete(data.robotName);
        }
        
        setAttachedTools(prev => {
          const newMap = new Map(prev);
          newMap.delete(data.robotName);
          return newMap;
        });
      }
    };
    
    const unsubscribe = EventBus.on('robot:removed', handleRobotRemoved);
    return () => unsubscribe();
  }, [attachedTools]);
  
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
  }, [attachedTools]);
  
  // Get tool info for specific robot
  const getToolInfo = useCallback((robotId) => {
    return attachedTools.get(robotId) || null;
  }, [attachedTools]);
  
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
    clearError: () => setError(null),
    
    // Debug helpers
    getTCPStatus,
    checkReadiness: checkTCPReadiness,
    
    // Manual retry for failed initializations
    forceInitialize: () => {
      console.log('[TCP] Force re-initializing...');
      setIsInitialized(false);
      setError(null);
      // Trigger re-initialization
      setTimeout(() => {
        const sceneSetup = getSceneSetup();
        const robotManager = getRobotManager();
        if (sceneSetup && robotManager) {
          sceneSetupRef.current = sceneSetup;
          robotManagerRef.current = robotManager;
          setIsInitialized(true);
          loadAvailableTools();
        }
      }, 100);
    }
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