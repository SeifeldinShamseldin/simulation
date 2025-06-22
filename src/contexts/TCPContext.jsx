// src/contexts/TCPContext.jsx - Refactored to use EventBus only
import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import URDFLoader from '../core/Loader/URDFLoader';
import MeshLoader from '../core/Loader/MeshLoader';
import EventBus from '../utils/EventBus';
import * as DataTransfer from './dataTransfer';

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
    
    // Performance optimizations
    this._dimensionCache = new Map(); // Cache tool dimensions
    this._endEffectorCache = new Map(); // Cache end effector calculations
    this._lastUpdateTime = new Map(); // Track last update time per robot
    this._updateDebounceTime = 16; // ~60fps debounce
    
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
   * Calculate robot end effector position (OPTIMIZED)
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

    // Check cache first
    const cacheKey = `${robotId}_${robot.uuid}`;
    const now = Date.now();
    const lastUpdate = this._lastUpdateTime.get(robotId) || 0;
    
    // Use cached result if recent enough
    if (this._endEffectorCache.has(cacheKey) && (now - lastUpdate) < this._updateDebounceTime) {
      return this._endEffectorCache.get(cacheKey);
    }

    // Find end effector link (use cached if available)
    let endEffectorLink = robot.userData?.endEffectorLink;
    
    if (!endEffectorLink) {
      // Try to find by name first
      if (robot.links) {
        for (const name of this.endEffectorPatterns) {
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
          if (obj.isURDFJoint && depth > maxDepth) {
            maxDepth = depth;
            deepestLink = obj;
          }
          obj.children?.forEach(child => findDeepest(child, depth + 1));
        };
        
        findDeepest(robot);
        endEffectorLink = deepestLink;
      }

      // Cache the end effector link
      if (endEffectorLink && robot.userData) {
        robot.userData.endEffectorLink = endEffectorLink;
      }
    }

    if (!endEffectorLink) {
      const result = { 
        position: { x: 0, y: 0, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 }
      };
      this._endEffectorCache.set(cacheKey, result);
      return result;
    }

    // Get world position and orientation (optimized)
    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    
    // Use getWorldPosition/getWorldQuaternion for better performance
    endEffectorLink.getWorldPosition(worldPos);
    endEffectorLink.getWorldQuaternion(worldQuat);
    
    const result = {
      position: { x: worldPos.x, y: worldPos.y, z: worldPos.z },
      orientation: { x: worldQuat.x, y: worldQuat.y, z: worldQuat.z, w: worldQuat.w }
    };

    // Cache the result
    this._endEffectorCache.set(cacheKey, result);
    this._lastUpdateTime.set(robotId, now);
    
    return result;
  }

  /**
   * Calculate TCP tool tip offset based on actual tool geometry
   */
  calculateToolTipOffset(toolContainer) {
    if (!toolContainer) return { x: 0, y: 0, z: 0 };

    const { position, rotation, scale } = toolContainer;
    let tipOffset = { x: position.x, y: position.y, z: position.z };

    // Calculate actual tool dimensions from geometry
    const toolDimensions = this.calculateToolDimensions(toolContainer);
    
    // Use the actual tool length (z-dimension) for tip offset
    const toolLength = toolDimensions.z * scale.z;
    
    // Apply rotation if present
    if (rotation.x !== 0 || rotation.y !== 0 || rotation.z !== 0) {
      const baseTip = new THREE.Vector3(0, 0, toolLength);
      baseTip.applyEuler(rotation);
      tipOffset.x += baseTip.x;
      tipOffset.y += baseTip.y;
      tipOffset.z += baseTip.z;
    } else {
      tipOffset.z += toolLength;
    }
    
    return tipOffset;
  }

  /**
   * Calculate actual tool dimensions from geometry (OPTIMIZED)
   */
  calculateToolDimensions(toolContainer) {
    if (!toolContainer) return { x: 0, y: 0, z: 0 };

    // Check cache first
    const cacheKey = toolContainer.uuid;
    if (this._dimensionCache.has(cacheKey)) {
      return this._dimensionCache.get(cacheKey);
    }

    const boundingBox = new THREE.Box3();
    let hasGeometry = false;
    let meshCount = 0;

    // Optimized traversal - only process meshes with geometry
    toolContainer.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        // Only compute bounding box if not already computed
        if (!child.geometry.boundingBox) {
          child.geometry.computeBoundingBox();
        }
        
        if (child.geometry.boundingBox) {
          // Use expandByObject which is the standard method available in all Three.js versions
          boundingBox.expandByObject(child);
          hasGeometry = true;
          meshCount++;
        }
      }
    });

    let dimensions;
    if (!hasGeometry || meshCount === 0) {
      // Fallback to default dimensions
      dimensions = { x: 0.01, y: 0.01, z: 0.05 };
    } else {
      const size = new THREE.Vector3();
      boundingBox.getSize(size);

      dimensions = {
        x: Math.max(size.x, 0.001), // Minimum 1mm
        y: Math.max(size.y, 0.001),
        z: Math.max(size.z, 0.001)
      };
    }

    // Cache the result
    this._dimensionCache.set(cacheKey, dimensions);
    
    return dimensions;
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

    // 🚨 CRITICAL FIX: Always name the tool container "tcp"
    const toolContainer = new THREE.Group();
    toolContainer.name = 'tcp'; // Always name it "tcp" regardless of original tool name
    toolContainer.add(toolObject);
    endEffector.add(toolContainer);

    // Calculate initial tool dimensions for proper positioning
    const toolDimensions = this.calculateToolDimensions(toolContainer);
    console.log(`[TCP] Tool ${tool.name} dimensions:`, toolDimensions);

    // Store tool data with enhanced information
    this.attachedTools.set(robotId, {
      toolId,
      tool,
      toolObject,
      toolContainer,
      endEffector,
      dimensions: toolDimensions, // Store calculated dimensions
      transforms: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 }
      }
    });

    // Emit events with enhanced information
    const finalPosition = this.getFinalEndEffectorPosition(robotId);
    const finalOrientation = this.getFinalEndEffectorOrientation(robotId);
    
    EventBus.emit(DataTransfer.EVENT_TCP_TOOL_ATTACHED, {
      robotId,
      toolId,
      toolName: 'tcp', // Always emit "tcp" as the name
      originalToolName: tool.name, // Keep original name for reference
      endEffectorPoint: finalPosition,
      toolDimensions: toolDimensions
    });

    EventBus.emit(DataTransfer.EVENT_TCP_ENDEFFECTOR_UPDATED, {
      robotId,
      endEffectorPoint: finalPosition,
      endEffectorOrientation: finalOrientation,
      hasTCP: true,
      toolDimensions: toolDimensions
    });

    // Emit event for cross-context (RobotContext)
    EventBus.emit(DataTransfer.EVENT_ROBOT_TCP_ATTACHED, {
      robotId,
      toolId,
      toolData: this.getCurrentTool(robotId)
    });

    console.log(`[TCP] Tool "${tool.name}" attached to ${robotId} as "tcp"`);
    console.log(`[TCP] Final end effector position:`, finalPosition);

    return true;
  }

  /**
   * Set tool transform and recalculate (OPTIMIZED)
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

    // Update matrices (optimized)
    toolContainer.updateMatrix();
    toolContainer.updateMatrixWorld(true);

    // Clear dimension cache for this tool since transforms changed
    this._dimensionCache.delete(toolContainer.uuid);
    
    // Recalculate tool dimensions after transform changes (debounced)
    const now = Date.now();
    const lastUpdate = this._lastUpdateTime.get(robotId) || 0;
    
    if ((now - lastUpdate) >= this._updateDebounceTime) {
      const updatedDimensions = this.calculateToolDimensions(toolContainer);
      toolData.dimensions = updatedDimensions;

      // Store transforms
      toolData.transforms = { ...transforms };

      // Emit events with updated information (debounced)
      const finalPosition = this.getFinalEndEffectorPosition(robotId);
      const finalOrientation = this.getFinalEndEffectorOrientation(robotId);
      
      EventBus.emit(DataTransfer.EVENT_TCP_TOOL_TRANSFORMED, {
        robotId,
        toolId: toolData.toolId,
        transforms,
        endEffectorPoint: finalPosition,
        toolDimensions: updatedDimensions
      });

      EventBus.emit(DataTransfer.EVENT_TCP_ENDEFFECTOR_UPDATED, {
        robotId,
        endEffectorPoint: finalPosition,
        endEffectorOrientation: finalOrientation,
        hasTCP: true,
        toolDimensions: updatedDimensions
      });

      // Emit event for cross-context
      EventBus.emit(DataTransfer.EVENT_TCP_TOOL_TRANSFORM_CHANGED, {
        robotId,
        transforms
      });

      this._lastUpdateTime.set(robotId, now);
    } else {
      // Just store transforms without emitting events (will be handled by debounce)
      toolData.transforms = { ...transforms };
    }
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
    
    EventBus.emit(DataTransfer.EVENT_TCP_TOOL_REMOVED, { robotId, toolId: toolData.toolId });
    EventBus.emit(DataTransfer.EVENT_TCP_ENDEFFECTOR_UPDATED, {
      robotId,
      endEffectorPoint: robotPosition.position,
      hasTCP: false
    });

    // Emit event for cross-context (RobotContext)
    EventBus.emit(DataTransfer.EVENT_ROBOT_TCP_DETACHED, {
      robotId,
      toolId: null
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
   * Force recalculate end effector (OPTIMIZED)
   */
  recalculateEndEffector(robotId) {
    // Check if we need to recalculate (debouncing)
    const now = Date.now();
    const lastUpdate = this._lastUpdateTime.get(robotId) || 0;
    
    if ((now - lastUpdate) < this._updateDebounceTime) {
      // Return cached result if recent enough
      const cacheKey = `${robotId}_${this.findRobot(robotId)?.uuid || 'unknown'}`;
      if (this._endEffectorCache.has(cacheKey)) {
        return this._endEffectorCache.get(cacheKey);
      }
    }

    const finalPosition = this.getFinalEndEffectorPosition(robotId);
    const finalOrientation = this.getFinalEndEffectorOrientation(robotId);
    const hasTCP = this.attachedTools.has(robotId);
    
    // Get tool dimensions if TCP is attached (cached)
    let toolDimensions = null;
    if (hasTCP) {
      const toolData = this.attachedTools.get(robotId);
      if (toolData && toolData.toolContainer) {
        toolDimensions = toolData.dimensions || this.calculateToolDimensions(toolData.toolContainer);
      }
    }
    
    const result = { position: finalPosition, orientation: finalOrientation };
    
    // Cache the result
    const cacheKey = `${robotId}_${this.findRobot(robotId)?.uuid || 'unknown'}`;
    this._endEffectorCache.set(cacheKey, result);
    this._lastUpdateTime.set(robotId, now);
    
    EventBus.emit(DataTransfer.EVENT_TCP_ENDEFFECTOR_UPDATED, {
      robotId,
      endEffectorPoint: finalPosition,
      endEffectorOrientation: finalOrientation,
      hasTCP,
      toolDimensions
    });
    
    return result;
  }

  /**
   * Clear caches for a specific robot
   */
  clearRobotCache(robotId) {
    const robot = this.findRobot(robotId);
    if (robot) {
      const cacheKey = `${robotId}_${robot.uuid}`;
      this._endEffectorCache.delete(cacheKey);
    }
    this._lastUpdateTime.delete(robotId);
  }

  /**
   * Clear all caches
   */
  clearAllCaches() {
    this._dimensionCache.clear();
    this._endEffectorCache.clear();
    this._lastUpdateTime.clear();
  }

  /**
   * Dispose resources (OPTIMIZED)
   */
  dispose() {
    // Remove all tools
    for (const [robotId] of this.attachedTools) {
      this.removeTool(robotId);
    }
    
    // Clear all caches
    this.clearAllCaches();
    
    // Clear other data
    this.attachedTools.clear();
    this.availableTools = [];
    this.robotRegistry.clear();
    this._notFoundWarnings.clear();
  }
}

export const TCPProvider = ({ children }) => {
  const tcpManagerRef = useRef(null);
  
  // State
  const [isInitialized, setIsInitialized] = useState(false);
  const [availableTools, setAvailableTools] = useState([]);
  const [attachedTools, setAttachedTools] = useState(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Initialize TCP Manager via EventBus
  useEffect(() => {
    const requestId = `tcp-scene-${Date.now()}`;
    let timeoutId;

    const handleSceneResponse = (response) => {
      if (response.requestId === requestId) {
        clearTimeout(timeoutId);
        EventBus.off(DataTransfer.EVENT_VIEWER_TCP_SCENE_RESPONSE, handleSceneResponse);
        
        if (response.success && response.payload?.getSceneSetup) {
          const sceneSetup = response.payload.getSceneSetup();
          if (sceneSetup) {
            if (!tcpManagerRef.current) {
              tcpManagerRef.current = new OptimizedTCPManager();
            }
            tcpManagerRef.current.initialize(sceneSetup, null);
            setIsInitialized(true);
            setError(null);
            console.log('[TCPContext] Initialized via EventBus');
          }
        } else {
          setError('Failed to get scene setup from viewer');
        }
      }
    };

    const requestScene = () => {
      console.log('[TCPContext] Requesting scene via EventBus...');
      EventBus.on(DataTransfer.EVENT_VIEWER_TCP_SCENE_RESPONSE, handleSceneResponse);
      EventBus.emit(DataTransfer.EVENT_TCP_NEEDS_SCENE, { requestId });
      
      timeoutId = setTimeout(() => {
        EventBus.off(DataTransfer.EVENT_VIEWER_TCP_SCENE_RESPONSE, handleSceneResponse);
        setError('Viewer did not respond to scene request');
      }, 5000);
    };

    // Listen for viewer ready event
    const handleViewerReady = () => {
      requestScene();
    };

    EventBus.on(DataTransfer.EVENT_VIEWER_READY, handleViewerReady);

    // Request scene immediately in case viewer is already ready
    requestScene();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      EventBus.off(DataTransfer.EVENT_VIEWER_TCP_SCENE_RESPONSE, handleSceneResponse);
      EventBus.off(DataTransfer.EVENT_VIEWER_READY, handleViewerReady);
    };
  }, []);

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

  // Load tools only after initialization
  useEffect(() => {
    if (isInitialized) {
      loadAvailableTools();
    }
  }, [isInitialized, loadAvailableTools]);

  // Event handlers
  useEffect(() => {
    if (!isInitialized || !tcpManagerRef.current) return;

    const tcpManager = tcpManagerRef.current;

    const handleRobotEvent = (data) => {
      const robotId = data.robotId || data.robotName;
      if (robotId && data.robot) {
        tcpManager.registerRobot(robotId, data.robot);
        setTimeout(() => tcpManager.recalculateEndEffector(robotId), 100);
      }
    };

    const handleJointChange = (data) => {
      const robotId = data.robotId || data.robotName;
      if (robotId) {
        setTimeout(() => tcpManager.recalculateEndEffector(robotId), 10);
      }
    };

    const handleForceRecalculate = (data) => {
      if (data.robotId) {
        tcpManager.recalculateEndEffector(data.robotId);
      }
    };

    // Subscribe to events
    const unsubscribes = [
      EventBus.on('robot:registered', handleRobotEvent),
      EventBus.on('robot:loaded', handleRobotEvent),
      EventBus.on(DataTransfer.EVENT_ROBOT_LOADED, handleRobotEvent),
      EventBus.on('robot:unloaded', (data) => {
        if (data.robotId) {
          tcpManager.unregisterRobot?.(data.robotId);
          setAttachedTools(prev => {
            const newMap = new Map(prev);
            newMap.delete(data.robotId);
            return newMap;
          });
        }
      }),
      EventBus.on('robot:joint-changed', handleJointChange),
      EventBus.on('robot:joints-changed', handleJointChange),
      EventBus.on(DataTransfer.EVENT_TCP_FORCE_RECALCULATE, handleForceRecalculate)
    ];

    return () => unsubscribes.forEach(unsub => unsub());
  }, [isInitialized]);

  // Tool management methods
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

  // Memoize context value to prevent unnecessary re-renders
  const value = useMemo(() => ({
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
  }), [
    availableTools,
    attachedTools,
    isLoading,
    error,
    isInitialized,
    loadAvailableTools,
    attachTool,
    removeTool,
    setToolTransform,
    setToolVisibility,
    getCurrentEndEffectorPoint,
    getCurrentEndEffectorOrientation,
    getEndEffectorLink,
    recalculateEndEffector,
    getRobotEndEffectorPosition,
    getRobotEndEffectorOrientation
  ]);

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