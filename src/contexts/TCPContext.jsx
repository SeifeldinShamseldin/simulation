import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { useViewer } from './ViewerContext';
import { useRobotSelection } from './hooks/useRobotManager';
import URDFLoader from '../core/Loader/URDFLoader';
import MeshLoader from '../core/Loader/MeshLoader';
import EventBus from '../utils/EventBus';

const TCPContext = createContext(null);

class OptimizedTCPManager {
  constructor() {
    this.sceneSetup = null;
    this.robotManager = null;
    this.attachedTools = new Map();
    this.availableTools = [];
    this.urdfLoader = null;
    this.robotRegistry = new Map(); // Enhanced robot registry
    this._notFoundWarnings = new Set();
    
    // Centralized end effector configuration
    this.endEffectorPatterns = [
      'tool0', 'ee_link', 'end_effector', 'gripper_link', 
      'link_6', 'link_7', 'wrist_3_link', 'tool_link',
      'flange', 'tool_flange', 'tcp'
    ];
  }

  /**
   * Enhanced robot lookup with fallback methods
   */
  findRobot(robotId) {
    if (!robotId) return null;
    
    // Check local registry first (fastest)
    if (this.robotRegistry.has(robotId)) {
      return this.robotRegistry.get(robotId);
    }
    
    // Try robot manager methods
    if (this.robotManager) {
      // Method 1: getRobot method
      if (this.robotManager.getRobot) {
        try {
          const robot = this.robotManager.getRobot(robotId);
          if (robot) {
            this.robotRegistry.set(robotId, robot);
            return robot;
          }
        } catch (error) { /* Continue to next method */ }
      }
      
      // Method 2: robots Map
      if (this.robotManager.robots?.has?.(robotId)) {
        const robotData = this.robotManager.robots.get(robotId);
        if (robotData?.robot) {
          this.robotRegistry.set(robotId, robotData.robot);
          return robotData.robot;
        }
      }
    }
    
    // Method 3: Scene traversal (slowest, last resort)
    if (this.sceneSetup?.scene) {
      let foundRobot = null;
      this.sceneSetup.scene.traverse((child) => {
        if (child.isURDFRobot && (child.name === robotId || child.robotName === robotId)) {
          foundRobot = child;
        }
      });
      if (foundRobot) {
        this.robotRegistry.set(robotId, foundRobot);
        return foundRobot;
      }
    }
    
    // Only warn once per robot to avoid spam
    if (!this._notFoundWarnings.has(robotId)) {
      console.warn(`[TCP] Robot ${robotId} not found`);
      this._notFoundWarnings.add(robotId);
      setTimeout(() => this._notFoundWarnings.delete(robotId), 5000);
    }
    
    return null;
  }

  /**
   * Register robot in local registry
   */
  registerRobot(robotId, robot) {
    if (robotId && robot) {
      this.robotRegistry.set(robotId, robot);
      this._notFoundWarnings.delete(robotId);
    }
  }

  /**
   * Calculate robot end effector position and orientation
   */
  calculateRobotEndEffector(robotId) {
    const robot = this.findRobot(robotId);
    if (!robot) {
      return { 
        position: { x: 0, y: 0, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 }
      };
    }

    this._notFoundWarnings.delete(robotId);

    // Find end effector link
    const endEffectorNames = [
      'tool0', 'ee_link', 'end_effector', 'gripper_link', 
      'link_6', 'link_7', 'wrist_3_link', 'tool_link',
      'flange', 'tool_flange', 'tcp'
    ];
    
    let endEffectorLink = null;
    
    // Try to find by name first
    if (robot.links) {
      for (const name of endEffectorNames) {
        if (robot.links[name]) {
          endEffectorLink = robot.links[name];
          break;
        }
      }
    }
    
    // Fallback: find deepest link
    if (!endEffectorLink) {
      let deepestLink = null;
      let maxDepth = 0;
      
      const findDeepest = (obj, depth = 0) => {
        if (obj.isURDFLink && depth > maxDepth) {
          maxDepth = depth;
          deepestLink = obj;
        }
        obj.children?.forEach(child => findDeepest(child, depth + 1));
      };
      
      findDeepest(robot);
      endEffectorLink = deepestLink;
    }

    if (!endEffectorLink) {
      return { 
        position: { x: 0, y: 0, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 }
      };
    }

    // Store reference for CCD solver
    robot.userData = robot.userData || {};
    robot.userData.endEffectorLink = endEffectorLink;

    // Get world position and orientation
    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    endEffectorLink.getWorldPosition(worldPos);
    endEffectorLink.getWorldQuaternion(worldQuat);
    
    return {
      position: { x: worldPos.x, y: worldPos.y, z: worldPos.z },
      orientation: { x: worldQuat.x, y: worldQuat.y, z: worldQuat.z, w: worldQuat.w }
    };
  }

  /**
   * Calculate TCP tool tip offset
   */
  calculateToolTipOffset(toolContainer) {
    if (!toolContainer) return { x: 0, y: 0, z: 0 };

    const { position, rotation, scale } = toolContainer;
    let tipOffset = { x: position.x, y: position.y, z: position.z };

    // Apply rotation if present
    if (rotation.x !== 0 || rotation.y !== 0 || rotation.z !== 0) {
      const baseTip = new THREE.Vector3(0, 0, 0.05 * scale.z);
      baseTip.applyEuler(rotation);
      tipOffset.x += baseTip.x;
      tipOffset.y += baseTip.y;
      tipOffset.z += baseTip.z;
    } else {
      tipOffset.z += 0.05 * scale.z;
    }
    
    return tipOffset;
  }

  /**
   * Get final end effector position (robot + TCP offset)
   */
  getFinalEndEffectorPosition(robotId) {
    const robotEndEffector = this.calculateRobotEndEffector(robotId);
    const toolData = this.attachedTools.get(robotId);
    
    if (!toolData) {
      return robotEndEffector.position;
    }

    const tipOffset = this.calculateToolTipOffset(toolData.toolContainer);
    
    return {
      x: robotEndEffector.position.x + tipOffset.x,
      y: robotEndEffector.position.y + tipOffset.y,
      z: robotEndEffector.position.z + tipOffset.z
    };
  }

  /**
   * Get final end effector orientation (robot + TCP orientation)
   */
  getFinalEndEffectorOrientation(robotId) {
    const robotEndEffector = this.calculateRobotEndEffector(robotId);
    const toolData = this.attachedTools.get(robotId);
    
    if (!toolData) {
      return robotEndEffector.orientation;
    }

    const toolQuat = new THREE.Quaternion();
    toolData.toolContainer.getWorldQuaternion(toolQuat);

    const robotQuat = new THREE.Quaternion(
      robotEndEffector.orientation.x,
      robotEndEffector.orientation.y,
      robotEndEffector.orientation.z,
      robotEndEffector.orientation.w
    );

    const finalQuat = robotQuat.multiply(toolQuat);
    
    return {
      x: finalQuat.x,
      y: finalQuat.y,
      z: finalQuat.z,
      w: finalQuat.w
    };
  }

  /**
   * Get the robot's end effector link (for kinematic chain)
   * This is used by IK solvers to traverse the joint chain
   */
  getEndEffectorLink(robotId) {
    const robot = this.findRobot(robotId);
    if (!robot) return null;

    // Use cached link if available
    if (robot.userData?.endEffectorLink) {
      return robot.userData.endEffectorLink;
    }

    // Find and cache the link
    const link = this.findEndEffector(robot);
    if (link && robot.userData) {
      robot.userData.endEffectorLink = link;
    }

    return link;
  }

  /**
   * Initialize manager
   */
  initialize(sceneSetup, robotManager) {
    this.sceneSetup = sceneSetup;
    this.robotManager = robotManager;
    this.urdfLoader = new URDFLoader(new THREE.LoadingManager());
    this.urdfLoader.parseVisual = true;
    this.urdfLoader.parseCollision = false;
  }

  /**
   * Scan for available TCP tools
   */
  async scanAvailableTools() {
    const response = await fetch('/api/tcp/scan');
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.message || 'Failed to scan TCP tools');
    }
    
    this.availableTools = data.tools || [];
    return this.availableTools;
  }

  /**
   * Load tool based on type
   */
  async loadTool(tool) {
    switch (tool.type) {
      case 'URDF Package':
        return await this.loadUrdfTool(tool);
      case 'Multi-Mesh':
        return await this.loadMultiMeshTool(tool);
      default:
        return await this.loadSingleMeshTool(tool);
    }
  }

  /**
   * Load URDF tool
   */
  async loadUrdfTool(tool) {
    return new Promise((resolve, reject) => {
      const urdfPath = `${tool.path}/${tool.urdfFile}`;
      
      this.urdfLoader.resetLoader();
      this.urdfLoader.packages = tool.path;
      this.urdfLoader.currentRobotName = tool.id;
      
      this.urdfLoader.loadMeshCb = (path, manager, done, material) => {
        const filename = path.split('/').pop();
        const resolvedPath = `${tool.path}/${filename}`;
        
        MeshLoader.load(resolvedPath, manager, (obj, err) => {
          if (err) return done(null, err);
          
          if (obj) {
            obj.traverse(child => {
              if (child instanceof THREE.Mesh) {
                if (!child.material || child.material.name === '' || child.material.name === 'default') {
                  child.material = material || new THREE.MeshPhongMaterial({ color: 0x888888 });
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
      
      this.urdfLoader.load(urdfPath, resolve, null, reject);
    });
  }

  /**
   * Load multi-mesh tool
   */
  async loadMultiMeshTool(tool) {
    const group = new THREE.Group();
    group.name = tool.id;
    
    for (const meshFile of tool.meshFiles) {
      try {
        const meshPath = `${tool.path}/${meshFile}`;
        const mesh = await this.loadSingleMesh(meshPath);
        if (mesh) group.add(mesh);
      } catch (error) {
        console.warn(`Failed to load mesh ${meshFile}:`, error);
      }
    }
    
    return group.children.length > 0 ? group : null;
  }

  /**
   * Load single mesh tool
   */
  async loadSingleMeshTool(tool) {
    const meshPath = tool.fileName ? `${tool.path}/${tool.fileName}` : tool.path;
    return await this.loadSingleMesh(meshPath);
  }

  /**
   * Load single mesh
   */
  async loadSingleMesh(meshPath) {
    return new Promise((resolve, reject) => {
      MeshLoader.load(meshPath, new THREE.LoadingManager(), (obj, err) => {
        if (err) return reject(err);
        
        if (obj) {
          obj.traverse(child => {
            if (child instanceof THREE.Mesh) {
              if (!child.material || child.material.name === '' || child.material.name === 'default') {
                child.material = new THREE.MeshPhongMaterial({ color: 0x888888 });
              }
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
          resolve(obj);
        } else {
          reject(new Error('No mesh object returned'));
        }
      });
    });
  }

  /**
   * Find end effector link using centralized patterns
   */
  findEndEffector(robot) {
    if (!robot) return null;
    
    // Try to find by name first
    if (robot.links) {
      for (const pattern of this.endEffectorPatterns) {
        if (robot.links[pattern]) {
          return robot.links[pattern];
        }
      }
    }
    
    // Fallback: find deepest link
    let deepestLink = null;
    let maxDepth = 0;
    
    const findDeepest = (obj, depth = 0) => {
      if (obj.isURDFLink && depth > maxDepth) {
        maxDepth = depth;
        deepestLink = obj;
      }
      obj.children?.forEach(child => findDeepest(child, depth + 1));
    };
    
    findDeepest(robot);
    return deepestLink;
  }

  /**
   * Attach tool to robot
   */
  async attachTool(robotId, toolId) {
    // Remove existing tool
    await this.removeTool(robotId);

    // Find tool and robot
    const tool = this.availableTools.find(t => t.id === toolId);
    if (!tool) throw new Error(`Tool ${toolId} not found`);

    const robot = this.findRobot(robotId);
    if (!robot) throw new Error(`Robot ${robotId} not found`);

    const endEffector = this.findEndEffector(robot);
    if (!endEffector) throw new Error('End effector not found');

    // Load and attach tool
    const toolObject = await this.loadTool(tool);
    if (!toolObject) throw new Error('Failed to load tool object');

    const toolContainer = new THREE.Group();
    toolContainer.name = 'tcp_tool_container';
    toolContainer.add(toolObject);
    endEffector.add(toolContainer);

    // Store tool data
    this.attachedTools.set(robotId, {
      toolId,
      tool,
      toolObject,
      toolContainer,
      endEffector,
      transforms: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 }
      }
    });

    // Emit events
    const finalPosition = this.getFinalEndEffectorPosition(robotId);
    const finalOrientation = this.getFinalEndEffectorOrientation(robotId);
    
    EventBus.emit('tcp:tool-attached', {
      robotId,
      toolId,
      toolName: tool.name,
      endEffectorPoint: finalPosition
    });

    EventBus.emit('tcp:endeffector-updated', {
      robotId,
      endEffectorPoint: finalPosition,
      endEffectorOrientation: finalOrientation,
      hasTCP: true
    });

    return true;
  }

  /**
   * Set tool transform and recalculate
   */
  setToolTransform(robotId, transforms) {
    const toolData = this.attachedTools.get(robotId);
    if (!toolData) return;

    const { toolContainer } = toolData;
    
    // Apply transforms
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

    // Update matrices
    toolContainer.updateMatrix();
    toolContainer.updateMatrixWorld(true);

    // Store transforms
    toolData.transforms = { ...transforms };

    // Emit events
    const finalPosition = this.getFinalEndEffectorPosition(robotId);
    
    EventBus.emit('tcp:tool-transformed', {
      robotId,
      toolId: toolData.toolId,
      transforms,
      endEffectorPoint: finalPosition
    });

    EventBus.emit('tcp:endeffector-updated', {
      robotId,
      endEffectorPoint: finalPosition,
      hasTCP: true
    });
  }

  /**
   * Remove tool
   */
  async removeTool(robotId) {
    const toolData = this.attachedTools.get(robotId);
    if (!toolData) return;

    // Remove from scene and dispose resources
    const { endEffector, toolContainer } = toolData;
    if (endEffector && toolContainer) {
      endEffector.remove(toolContainer);
      
      toolContainer.traverse(child => {
        child.geometry?.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    }

    this.attachedTools.delete(robotId);

    // Emit events
    const robotPosition = this.calculateRobotEndEffector(robotId);
    
    EventBus.emit('tcp:tool-removed', { robotId, toolId: toolData.toolId });
    EventBus.emit('tcp:endeffector-updated', {
      robotId,
      endEffectorPoint: robotPosition.position,
      hasTCP: false
    });
  }

  /**
   * Set tool visibility
   */
  setToolVisibility(robotId, visible) {
    const toolData = this.attachedTools.get(robotId);
    if (toolData) {
      toolData.toolContainer.visible = visible;
    }
  }

  /**
   * Get current tool
   */
  getCurrentTool(robotId) {
    return this.attachedTools.get(robotId);
  }

  /**
   * Force recalculate end effector
   */
  recalculateEndEffector(robotId) {
    const finalPosition = this.getFinalEndEffectorPosition(robotId);
    const finalOrientation = this.getFinalEndEffectorOrientation(robotId);
    const hasTCP = this.attachedTools.has(robotId);
    
    EventBus.emit('tcp:endeffector-updated', {
      robotId,
      endEffectorPoint: finalPosition,
      endEffectorOrientation: finalOrientation,
      hasTCP
    });
    
    return { position: finalPosition, orientation: finalOrientation };
  }

  /**
   * Dispose resources
   */
  dispose() {
    for (const [robotId] of this.attachedTools) {
      this.removeTool(robotId);
    }
    this.attachedTools.clear();
    this.availableTools = [];
    this.robotRegistry.clear();
  }
}

export const TCPProvider = ({ children }) => {
  const { isViewerReady, getSceneSetup, getRobotManager } = useViewer();
  const tcpManagerRef = useRef(null);
  
  // State
  const [isInitialized, setIsInitialized] = useState(false);
  const [availableTools, setAvailableTools] = useState([]);
  const [attachedTools, setAttachedTools] = useState(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Initialize TCP Manager
  useEffect(() => {
    if (isViewerReady) {
      const sceneSetup = getSceneSetup();
      const robotManager = getRobotManager();
      
      if (sceneSetup && robotManager) {
        if (!tcpManagerRef.current) {
          tcpManagerRef.current = new OptimizedTCPManager();
        }
        
        tcpManagerRef.current.initialize(sceneSetup, robotManager);
        setIsInitialized(true);
        setError(null);
        
        loadAvailableTools();
      }
    }
  }, [isViewerReady, getSceneSetup, getRobotManager]);

  // ========== OPTIMIZED EVENT SUBSCRIPTIONS ==========
  useEffect(() => {
    if (!isInitialized) return;

    const handleRobotEvent = (data) => {
      const robotId = data.robotId || data.robotName;
      if (robotId && tcpManagerRef.current) {
        tcpManagerRef.current.registerRobot(robotId, data.robot);
      }
    };

    const handleJointChange = (data) => {
      const robotId = data.robotId || data.robotName;
      if (robotId && tcpManagerRef.current) {
        tcpManagerRef.current.recalculateEndEffector(robotId);
      }
    };

    const handleForceRecalculate = (data) => {
      const robotId = data.robotId || data.robotName;
      if (robotId && tcpManagerRef.current) {
        tcpManagerRef.current.recalculateEndEffector(robotId);
      }
    };

    // Single event handler with switch statement
    const handleEvents = (eventType, data) => {
      switch (eventType) {
        case 'robot:registered':
        case 'robot:loaded':
          handleRobotEvent(data);
          break;
        case 'robot:joint-changed':
        case 'robot:joints-changed':
          handleJointChange(data);
          break;
        case 'tcp:force-recalculate':
          handleForceRecalculate(data);
          break;
        default:
          break;
      }
    };

    // Helper function to create multiple subscriptions
    const createMultiSubscription = (events, handler) => {
      const unsubscribers = events.map(event => 
        EventBus.on(event, (data) => handler(event, data))
      );
      
      return () => {
        unsubscribers.forEach(unsub => unsub());
      };
    };

    // Single subscription for multiple events
    const unsubscribe = createMultiSubscription([
      'robot:registered',
      'robot:loaded',
      'robot:joint-changed',
      'robot:joints-changed',
      'tcp:force-recalculate'
    ], handleEvents);

    return () => unsubscribe();
  }, [isInitialized]);

  // Tool management methods
  const loadAvailableTools = useCallback(async () => {
    if (!tcpManagerRef.current || !isInitialized) return;
    
    try {
      setIsLoading(true);
      setError(null);
      const tools = await tcpManagerRef.current.scanAvailableTools();
      setAvailableTools(tools);
    } catch (err) {
      setError(`Failed to load tools: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [isInitialized]);

  const attachTool = useCallback(async (robotId, toolId) => {
    if (!tcpManagerRef.current) {
      throw new Error('TCP Manager not initialized');
    }
    
    try {
      setIsLoading(true);
      setError(null);
      
      await tcpManagerRef.current.attachTool(robotId, toolId);
      
      const toolData = tcpManagerRef.current.getCurrentTool(robotId);
      if (toolData) {
        setAttachedTools(prev => new Map(prev).set(robotId, {
          toolId,
          tool: toolData.tool,
          visible: true,
          transforms: toolData.transforms
        }));
      }
      
      return true;
    } catch (err) {
      setError(`Error attaching tool: ${err.message}`);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const removeTool = useCallback(async (robotId) => {
    if (!tcpManagerRef.current) return;
    
    try {
      setIsLoading(true);
      await tcpManagerRef.current.removeTool(robotId);
      setAttachedTools(prev => {
        const newMap = new Map(prev);
        newMap.delete(robotId);
        return newMap;
      });
    } catch (err) {
      setError(`Error removing tool: ${err.message}`);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setToolTransform = useCallback((robotId, transforms) => {
    if (!tcpManagerRef.current) return;
    
    try {
      tcpManagerRef.current.setToolTransform(robotId, transforms);
      
      setAttachedTools(prev => {
        const newMap = new Map(prev);
        const toolData = newMap.get(robotId);
        if (toolData) {
          toolData.transforms = transforms;
          newMap.set(robotId, toolData);
        }
        return newMap;
      });
    } catch (err) {
      setError(`Error setting transform: ${err.message}`);
    }
  }, []);

  const setToolVisibility = useCallback((robotId, visible) => {
    if (!tcpManagerRef.current) return;
    
    try {
      tcpManagerRef.current.setToolVisibility(robotId, visible);
      
      setAttachedTools(prev => {
        const newMap = new Map(prev);
        const toolData = newMap.get(robotId);
        if (toolData) {
          toolData.visible = visible;
          newMap.set(robotId, toolData);
        }
        return newMap;
      });
    } catch (err) {
      setError(`Error setting visibility: ${err.message}`);
    }
  }, []);

  // End effector methods
  const getCurrentEndEffectorPoint = useCallback((robotId) => {
    return tcpManagerRef.current?.getFinalEndEffectorPosition(robotId) || { x: 0, y: 0, z: 0 };
  }, []);

  const getCurrentEndEffectorOrientation = useCallback((robotId) => {
    return tcpManagerRef.current?.getFinalEndEffectorOrientation(robotId) || { x: 0, y: 0, z: 0, w: 1 };
  }, []);

  const getEndEffectorLink = useCallback((robotId) => {
    return tcpManagerRef.current?.getEndEffectorLink(robotId) || null;
  }, []);

  const recalculateEndEffector = useCallback((robotId) => {
    return tcpManagerRef.current?.recalculateEndEffector(robotId) || {
      position: { x: 0, y: 0, z: 0 },
      orientation: { x: 0, y: 0, z: 0, w: 1 }
    };
  }, []);

  const getRobotEndEffectorPosition = useCallback((robotId) => {
    const result = tcpManagerRef.current?.calculateRobotEndEffector(robotId);
    return result?.position || { x: 0, y: 0, z: 0 };
  }, []);

  const getRobotEndEffectorOrientation = useCallback((robotId) => {
    const result = tcpManagerRef.current?.calculateRobotEndEffector(robotId);
    return result?.orientation || { x: 0, y: 0, z: 0, w: 1 };
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      tcpManagerRef.current?.dispose();
    };
  }, []);

  const value = {
    // State
    availableTools,
    attachedTools,
    isLoading,
    error,
    isInitialized,
    
    // Tool Management
    loadAvailableTools,
    attachTool,
    removeTool,
    setToolTransform,
    setToolVisibility,
    getToolInfo: (robotId) => attachedTools.get(robotId),
    hasToolAttached: (robotId) => attachedTools.has(robotId),
    
    // End Effector Methods
    getCurrentEndEffectorPoint,
    getCurrentEndEffectorOrientation,
    getEndEffectorLink,
    recalculateEndEffector,
    getRobotEndEffectorPosition,
    getRobotEndEffectorOrientation,
    
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