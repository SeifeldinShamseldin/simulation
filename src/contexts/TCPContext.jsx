// src/contexts/TCPContext.jsx - Refactored to use EventBus only cluade shit code
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
    
    // End effector link tracking
    this._endEffectorLinks = new Map(); // Track current end effector link per robot
    this._linkMonitoringInterval = null;
    this._linkCheckInterval = 100; // Check every 100ms
    
    // Centralized end effector configuration
    this.endEffectorPatterns = [
      'tool0', 'ee_link', 'end_effector', 'gripper_link', 
      'link_6', 'link_7', 'wrist_3_link', 'tool_link',
      'flange', 'tool_flange', 'tcp'
    ];

    // Robot pose caching
    this._robotPoseCache = new Map();
  }

  /**
   * Start monitoring end effector links for all robots
   */
  startEndEffectorLinkMonitoring() {
    if (this._linkMonitoringInterval) return;
    
    console.log('[TCPManager] Starting end effector link monitoring');
    
    this._linkMonitoringInterval = setInterval(() => {
      // Check all registered robots
      for (const [robotId, robot] of this.robotRegistry.entries()) {
        this.checkEndEffectorLinkChange(robotId, robot);
      }
    }, this._linkCheckInterval);
  }

  /**
   * Stop monitoring end effector links
   */
  stopEndEffectorLinkMonitoring() {
    if (this._linkMonitoringInterval) {
      clearInterval(this._linkMonitoringInterval);
      this._linkMonitoringInterval = null;
      console.log('[TCPManager] Stopped end effector link monitoring');
    }
  }

  /**
   * Check if end effector link has changed for a robot
   */
  checkEndEffectorLinkChange(robotId, robot) {
    if (!robot) return;
    
    // Find current end effector link
    const currentLink = this.findEndEffector(robot);
    const linkName = currentLink?.name || null;
    
    // Get previous link
    const previousLink = this._endEffectorLinks.get(robotId);
    
    // Check if link has changed
    if (linkName !== previousLink) {
      console.log(`[TCPManager] End effector link changed for ${robotId}: ${previousLink} -> ${linkName}`);
      
      // Update cache
      this._endEffectorLinks.set(robotId, linkName);
      
      // Clear end effector cache to force recalculation
      const cacheKey = `${robotId}_${robot.uuid || 'unknown'}`;
      this._endEffectorCache.delete(cacheKey);
      
      // Emit global link updated event
      EventBus.emit(DataTransfer.EndEffectorEvents.LINK_UPDATED, {
        robotId,
        link: linkName,
        previousLink,
        timestamp: Date.now()
      });
      
      // Force recalculation of end effector
      this.recalculateEndEffector(robotId).catch(console.error);
    }
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
        } catch { /* Continue to next method */ }
      }
      
      // Method 2: robots Map
      if (this.robotManager.robots?.has?.(robotId)) {
        const robot = this.robotManager.robots.get(robotId);
        if (robot) {
          this.robotRegistry.set(robotId, robot);
          return robot;
        }
      }
      
      // Method 3: loadedRobots property
      if (this.robotManager.loadedRobots) {
        const robot = this.robotManager.loadedRobots[robotId];
        if (robot) {
          this.robotRegistry.set(robotId, robot);
          return robot;
        }
      }
    }
    
    // Try scene search as last resort
    if (this.sceneSetup?.scene) {
      const robot = this.findRobotInScene(robotId);
      if (robot) {
        this.robotRegistry.set(robotId, robot);
        return robot;
      }
    }
    
    // Only warn once per robot ID
    if (!this._notFoundWarnings.has(robotId)) {
      console.warn(`[TCPManager] Robot not found: ${robotId}`);
      this._notFoundWarnings.add(robotId);
    }
    
    return null;
  }

  /**
   * Register a robot for tracking
   */
  registerRobot(robotId, robot) {
    if (!robotId || !robot) return;
    this.robotRegistry.set(robotId, robot);
    // Immediately check end effector link
    this.checkEndEffectorLinkChange(robotId, robot);
    // Always emit the initial end effector state
    this.recalculateEndEffector(robotId).catch(console.error);
    console.log(`[TCPManager] Registered robot: ${robotId}`);
  }

  /**
   * Unregister a robot
   */
  unregisterRobot(robotId) {
    this.robotRegistry.delete(robotId);
    this._endEffectorLinks.delete(robotId);
    this._endEffectorCache.delete(`${robotId}_*`);
    this._lastUpdateTime.delete(robotId);
    this.attachedTools.delete(robotId);
    
    console.log(`[TCPManager] Unregistered robot: ${robotId}`);
  }

  /**
   * Find robot in scene hierarchy
   */
  findRobotInScene(robotId) {
    if (!this.sceneSetup?.scene) return null;
    
    let foundRobot = null;
    
    this.sceneSetup.scene.traverse((child) => {
      if (foundRobot) return;
      
      if (child.userData?.robotId === robotId || 
          child.userData?.id === robotId ||
          child.name === robotId) {
        foundRobot = child;
      }
    });
    
    return foundRobot;
  }

  /**
   * Find end effector link in robot hierarchy (cycle-safe)
   */
  findEndEffector(robot) {
    if (!robot) return null;

    let endEffector = null;
    const visited = new Set();

    // Helper to traverse with cycle protection
    function safeTraverse(object, callback) {
      if (!object || visited.has(object)) return;
      visited.add(object);
      callback(object);
      if (Array.isArray(object.children)) {
        for (const child of object.children) {
          safeTraverse(child, callback);
        }
      }
    }

    // Priority-based search
    for (const pattern of this.endEffectorPatterns) {
      safeTraverse(robot, (child) => {
        if (!endEffector && child.isURDFLink &&
            child.name.toLowerCase().includes(pattern.toLowerCase())) {
          endEffector = child;
        }
      });
      if (endEffector) break;
    }

    // Fallback: find the last link in the kinematic chain
    if (!endEffector) {
      const links = [];
      safeTraverse(robot, (child) => {
        if (child.isURDFLink) {
          links.push(child);
        }
      });
      if (links.length > 0) {
        endEffector = links[links.length - 1];
      }
    }

    return endEffector;
  }

  /**
   * Calculate robot's base end effector (without TCP) in ROBOT-LOCAL space
   * Returns position relative to robot base, NOT world position
   */
  async calculateRobotEndEffector(robotId) {
    const robot = this.findRobot(robotId);
    if (!robot) {
      return { position: { x: 0, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } };
    }
    
    const endEffectorLink = this.getEndEffectorLink(robotId);
    if (!endEffectorLink) {
      return { position: { x: 0, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } };
    }
    
    // Calculate end effector position in ROBOT LOCAL space ONLY
    const localPos = new THREE.Vector3();
    const localQuat = new THREE.Quaternion();
    
    // If it's a TCP, calculate from its tip
    if (endEffectorLink.name === 'tcp') {
      const box = new THREE.Box3().setFromObject(endEffectorLink);
      const size = new THREE.Vector3();
      box.getSize(size);
      
      // Get local position relative to parent
      localPos.copy(endEffectorLink.position);
      localPos.add(new THREE.Vector3(0, 0, size.z / 2)); // Assuming Z is forward
      localQuat.copy(endEffectorLink.quaternion);
    } else {
      // For normal links, traverse up to robot root to get local transform
      let currentLink = endEffectorLink;
      const tempMatrix = new THREE.Matrix4();
      tempMatrix.identity();
      
      // Build transform from end effector to robot base
      while (currentLink && currentLink !== robot && currentLink.parent) {
        const linkMatrix = new THREE.Matrix4();
        linkMatrix.compose(
          currentLink.position,
          currentLink.quaternion,
          currentLink.scale
        );
        tempMatrix.premultiply(linkMatrix);
        currentLink = currentLink.parent;
      }
      
      // Extract position and rotation from accumulated transform
      tempMatrix.decompose(localPos, localQuat, new THREE.Vector3());
    }
    
    // RETURN LOCAL POSITION - DO NOT TRANSFORM TO WORLD
    return {
      position: { x: localPos.x, y: localPos.y, z: localPos.z },
      orientation: { x: localQuat.x, y: localQuat.y, z: localQuat.z, w: localQuat.w }
    };
  }

  /**
   * Get final end effector position (robot-local + TCP offset)
   */
  getFinalEndEffectorPosition(robotId) {
    const robotEndEffector = this.calculateRobotEndEffector(robotId);
    const toolData = this.attachedTools.get(robotId);
    
    if (!toolData) {
      return robotEndEffector.position;
    }
  
    const tipOffset = this.calculateToolTipOffset(toolData.toolContainer);
    
    // Return position in robot-local space
    return {
      x: robotEndEffector.position.x + tipOffset.x,
      y: robotEndEffector.position.y + tipOffset.y,
      z: robotEndEffector.position.z + tipOffset.z
    };
  }

  /**
   * Get final end effector orientation (robot + TCP orientation)
   */
  async getFinalEndEffectorOrientation(robotId) {
    const robot = this.findRobot(robotId);
    if (!robot) {
      console.warn(`[TCPManager] Robot ${robotId} not loaded yet, skipping final end effector orientation.`);
      return { x: 0, y: 0, z: 0, w: 1 };
    }
    const robotEndEffector = await this.calculateRobotEndEffector(robotId);
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
    if (!robot) {
      console.warn(`[TCPManager] Robot ${robotId} not loaded yet, skipping getEndEffectorLink.`);
      return null;
    }

    // Always search for the current end effector link in the robot structure
    const link = this.findEndEffector(robot);
    if (link) {
      // If a TCP group is attached as a child, return it as the end effector link
      const tcpGroup = link.children?.find(child => child.name === 'tcp');
      if (tcpGroup) {
        this._endEffectorLinks.set(robotId, tcpGroup.name);
        return tcpGroup;
      }
      this._endEffectorLinks.set(robotId, link.name);
      return link;
    }
    return null;
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
    
    // Start monitoring end effector links
    this.startEndEffectorLinkMonitoring();
  }

  /**
   * Cleanup manager
   */
  cleanup() {
    this.stopEndEffectorLinkMonitoring();
    this.robotRegistry.clear();
    this._endEffectorLinks.clear();
    this._endEffectorCache.clear();
    this._lastUpdateTime.clear();
    this.attachedTools.clear();
    
    // Clear new caches
    this._robotPoseCache?.clear();
    this._poseChangeTimeouts?.forEach(timeout => clearTimeout(timeout));
    this._poseChangeTimeouts?.clear();
  }

  /**
   * Force recalculate end effector (OPTIMIZED)
   */
  async recalculateEndEffector(robotId) {
    // Clear cache if robot has moved
    const robotPose = await this.getRobotPose(robotId);
    const poseCacheKey = `${robotId}_${robotPose.position.x}_${robotPose.position.y}_${robotPose.position.z}`;
    // Remove any previous cache entries for this robotId
    for (const key of this._endEffectorCache.keys()) {
      if (key.startsWith(`${robotId}_`)) {
        this._endEffectorCache.delete(key);
      }
    }
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
    const finalPosition = await this.getFinalEndEffectorPosition(robotId);
    const finalOrientation = await this.getFinalEndEffectorOrientation(robotId);
    const hasTCP = this.attachedTools.has(robotId);
    // Get tool dimensions if TCP is attached (cached)
    let toolDimensions = null;
    let tcpOffset = null;
    if (hasTCP) {
      const toolData = this.attachedTools.get(robotId);
      if (toolData && toolData.toolContainer) {
        toolDimensions = toolData.dimensions || this.calculateToolDimensions(toolData.toolContainer);
        tcpOffset = this.calculateToolTipOffset(toolData.toolContainer);
      }
    }
    const result = { position: finalPosition, orientation: finalOrientation };
    // Cache the result
    const cacheKey = `${robotId}_${this.findRobot(robotId)?.uuid || 'unknown'}`;
    this._endEffectorCache.set(cacheKey, result);
    this._lastUpdateTime.set(robotId, now);
    // Emit legacy TCP event
    EventBus.emit(DataTransfer.EVENT_TCP_ENDEFFECTOR_UPDATED, {
      robotId,
      endEffectorPoint: finalPosition,
      endEffectorOrientation: finalOrientation,
      hasTCP,
      toolDimensions
    });
    // ALWAYS emit the new global END_EFFECTOR event for consistent updates
    EventBus.emit(DataTransfer.EndEffectorEvents.UPDATED, {
      robotId,
      position: finalPosition,
      orientation: finalOrientation,
      hasTCP,
      tcpOffset,
      toolDimensions,
      source: 'recalculate',
      timestamp: now
    });
    return result;
  }

  /**
   * Calculate tool dimensions
   */
  calculateToolDimensions(toolContainer) {
    const cacheKey = `dims_${toolContainer.uuid}`;
    if (this._dimensionCache.has(cacheKey)) {
      return this._dimensionCache.get(cacheKey);
    }
    
    if (!toolContainer) return null;
    
    const box = new THREE.Box3().setFromObject(toolContainer);
    const size = new THREE.Vector3();
    box.getSize(size);
    
    const dimensions = {
      x: size.x,
      y: size.y,
      z: size.z
    };
    
    this._dimensionCache.set(cacheKey, dimensions);
    return dimensions;
  }

  /**
   * Calculate tool tip offset in LOCAL space (relative to tool attachment point)
   */
  calculateToolTipOffset(toolContainer) {
    if (!toolContainer) return { x: 0, y: 0, z: 0 };
    const box = new THREE.Box3().setFromObject(toolContainer);
    const center = new THREE.Vector3();
    box.getCenter(center);
    // Return offset in local tool space
    return {
      x: center.x,
      y: center.y,
      z: center.z
    };
  }

  /**
   * Scan for available TCP tools (OLD IMPLEMENTATION)
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
   * Load tool based on type (OLD IMPLEMENTATION)
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
   * Load URDF tool (OLD IMPLEMENTATION)
   */
  async loadUrdfTool(tool) {
    return new Promise((resolve, reject) => {
      const urdfPath = `${tool.path}/${tool.urdfFile}`;
      this.urdfLoader.resetLoader && this.urdfLoader.resetLoader();
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
   * Load multi-mesh tool (OLD IMPLEMENTATION)
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
   * Load single mesh tool (OLD IMPLEMENTATION)
   */
  async loadSingleMeshTool(tool) {
    const meshPath = tool.fileName ? `${tool.path}/${tool.fileName}` : tool.path;
    return await this.loadSingleMesh(meshPath);
  }

  /**
   * Load single mesh (OLD IMPLEMENTATION)
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
   * Attach tool to robot (OLD IMPLEMENTATION)
   */
  async attachTool(robotId, toolId) {
    const robot = this.findRobot(robotId);
    if (!robot) {
      console.warn(`[TCPManager] Robot ${robotId} not loaded yet, cannot attach tool.`);
      throw new Error(`Robot ${robotId} not loaded yet`);
    }
    // Remove existing tool
    await this.removeTool(robotId);
    // Find tool and robot
    const tool = this.availableTools.find(t => t.id === toolId);
    if (!tool) throw new Error(`Tool ${toolId} not found`);
    const endEffector = this.findEndEffector(robot);
    if (!endEffector) throw new Error('End effector not found');
    // Load and attach tool
    const toolObject = await this.loadTool(tool);
    if (!toolObject) throw new Error('Failed to load tool object');
    // Always name the tool container "tcp"
    const toolContainer = new THREE.Group();
    toolContainer.name = 'tcp';
    toolContainer.add(toolObject);
    endEffector.add(toolContainer);
    // Calculate initial tool dimensions
    const toolDimensions = this.calculateToolDimensions(toolContainer);
    // Store tool data
    this.attachedTools.set(robotId, {
      toolId,
      tool,
      toolObject,
      toolContainer,
      endEffector,
      dimensions: toolDimensions,
      transforms: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 }
      }
    });
    // Emit events
    const finalPosition = this.getFinalEndEffectorPosition(robotId);
    const finalOrientation = this.getFinalEndEffectorOrientation(robotId);
    EventBus.emit(DataTransfer.EVENT_TCP_TOOL_ATTACHED, {
      robotId,
      toolId,
      toolName: 'tcp',
      originalToolName: tool.name,
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
    EventBus.emit(DataTransfer.EVENT_ROBOT_TCP_ATTACHED, {
      robotId,
      toolId,
      toolData: this.getCurrentTool(robotId)
    });
    console.log(`[TCPManager] Tool ${toolId} attached to robot ${robotId}`);
  }

  /**
   * Remove tool from robot
   */
  async removeTool(robotId) {
    const robot = this.findRobot(robotId);
    if (!robot) {
      console.warn(`[TCPManager] Robot ${robotId} not loaded yet, cannot remove tool.`);
      return;
    }
    const toolData = this.attachedTools.get(robotId);
    if (!toolData) return;

    const endEffector = toolData.endEffector;
    if (!endEffector) return;

    // Remove tool from end effector
    endEffector.remove(toolData.toolContainer);

    // Clear tool data
    this.attachedTools.delete(robotId);

    // Emit events
    const finalPosition = this.getFinalEndEffectorPosition(robotId);
    const finalOrientation = this.getFinalEndEffectorOrientation(robotId);
    EventBus.emit(DataTransfer.EVENT_TCP_TOOL_REMOVED, {
      robotId,
      endEffectorPoint: finalPosition,
      endEffectorOrientation: finalOrientation,
      hasTCP: false,
      toolDimensions: toolData.dimensions
    });
    EventBus.emit(DataTransfer.EVENT_TCP_ENDEFFECTOR_UPDATED, {
      robotId,
      endEffectorPoint: finalPosition,
      endEffectorOrientation: finalOrientation,
      hasTCP: false,
      toolDimensions: toolData.dimensions
    });
    EventBus.emit(DataTransfer.EVENT_ROBOT_TCP_REMOVED, {
      robotId,
      toolId: toolData.toolId,
      toolData: toolData
    });
    console.log(`[TCPManager] Tool removed from robot ${robotId}`);
  }

  /**
   * Get current tool data for a robot
   */
  getCurrentTool(robotId) {
    const toolData = this.attachedTools.get(robotId);
    if (!toolData) return null;
    return {
      toolId: toolData.toolId,
      tool: toolData.tool,
      toolObject: toolData.toolObject,
      toolContainer: toolData.toolContainer,
      endEffector: toolData.endEffector,
      dimensions: toolData.dimensions,
      transforms: toolData.transforms
    };
  }
}

function TCPProvider({ children }) {
  const [manager] = React.useState(() => new OptimizedTCPManager());
  const [attachedTools, setAttachedTools] = React.useState(new Map());
  const [availableTools, setAvailableTools] = React.useState([]);
  const [isInitialized, setIsInitialized] = React.useState(false);
  const [isViewerReady, setIsViewerReady] = React.useState(false);
  const [sceneSetup, setSceneSetup] = React.useState(null);
  const initializedRef = React.useRef(false);

  // Initialize when viewer is ready
  React.useEffect(() => {
    let mounted = true;
    let sceneRequestId = null;

    const handleViewerReady = () => {
      setIsViewerReady(true);
      sceneRequestId = `tcp-scene-${Date.now()}`;
      EventBus.emit(DataTransfer.EVENT_TCP_NEEDS_SCENE, { requestId: sceneRequestId });
    };

    const handleSceneResponse = (data) => {
      if (data.requestId === sceneRequestId && mounted) {
        if (data.success && data.payload?.getSceneSetup) {
          const setup = data.payload.getSceneSetup();
          setSceneSetup(setup);
          manager.initialize(setup, setup.robotManager);
          setIsInitialized(true);
        }
      }
    };

    const unsubscribeReady = EventBus.on(DataTransfer.EVENT_VIEWER_READY, handleViewerReady);
    const unsubscribeScene = EventBus.on(DataTransfer.EVENT_VIEWER_TCP_SCENE_RESPONSE, handleSceneResponse);

    if (!initializedRef.current) {
      initializedRef.current = true;
      handleViewerReady();
    }

    return () => {
      mounted = false;
      unsubscribeReady();
      unsubscribeScene();
    };
  }, [manager, isViewerReady, sceneSetup]);

  // Robot event handlers
  React.useEffect(() => {
    if (!isInitialized) return;

    const handleRobotLoaded = ({ robotId, robot }) => {
      manager.registerRobot(robotId, robot);
    };

    const handleRobotRemoved = ({ robotId }) => {
      manager.unregisterRobot(robotId);
    };

    const handleForceRecalculate = ({ robotId }) => {
      manager.recalculateEndEffector(robotId).catch(console.error);
    };

    const handleGetEndEffectorState = async ({ robotId, requestId }) => {
      const position = await manager.getFinalEndEffectorPosition(robotId);
      const orientation = await manager.getFinalEndEffectorOrientation(robotId);
      const hasTCP = manager.attachedTools.has(robotId);
      const toolData = manager.attachedTools.get(robotId);
      EventBus.emit(DataTransfer.EndEffectorEvents.Responses.STATE, {
        robotId,
        position,
        orientation,
        hasTCP,
        tcpOffset: toolData ? manager.calculateToolTipOffset(toolData.toolContainer) : null,
        toolDimensions: toolData?.dimensions || null,
        requestId
      });
    };

    const handleGetEndEffectorLink = ({ robotId, requestId }) => {
      const link = manager.getEndEffectorLink(robotId);
      EventBus.emit(DataTransfer.EndEffectorEvents.Responses.LINK, {
        robotId,
        link: link?.name || null,
        requestId
      });
    };

    // Listen for when robot position actually changes
    const handleRobotPoseChanged = ({ robotId }) => {
      // Only process if we're tracking this robot
      if (!manager.robotRegistry.has(robotId)) return;
      
      // Clear end effector cache for this robot
      manager._endEffectorCache.delete(`${robotId}_${manager.findRobot(robot)?.uuid || 'unknown'}`);
      
      // Debounced recalculation
      clearTimeout(manager._poseChangeTimeouts?.get(robotId));
      
      if (!manager._poseChangeTimeouts) {
        manager._poseChangeTimeouts = new Map();
      }
      
      const timeout = setTimeout(() => {
        manager.recalculateEndEffector(robotId).catch(console.error);
      }, 50); // 50ms debounce
      
      manager._poseChangeTimeouts.set(robotId, timeout);
    };

    const unsubscribeLoaded = EventBus.on(DataTransfer.EVENT_ROBOT_LOADED, handleRobotLoaded);
    const unsubscribeRemoved = EventBus.on(DataTransfer.EVENT_ROBOT_REMOVED, handleRobotRemoved);
    const unsubscribeForce = EventBus.on(DataTransfer.EVENT_TCP_FORCE_RECALCULATE, handleForceRecalculate);
    const unsubscribeGetState = EventBus.on(DataTransfer.EndEffectorEvents.Commands.GET_STATE, handleGetEndEffectorState);
    const unsubscribeGetLink = EventBus.on(DataTransfer.EndEffectorEvents.Commands.GET_LINK, handleGetEndEffectorLink);
    const unsubscribeRecalc = EventBus.on(DataTransfer.EndEffectorEvents.Commands.RECALCULATE, handleForceRecalculate);
    const unsubscribePose = EventBus.on(DataTransfer.RobotPoseEvents.Commands.SET_POSE, handleRobotPoseChanged);

    return () => {
      unsubscribeLoaded();
      unsubscribeRemoved();
      unsubscribeForce();
      unsubscribeGetState();
      unsubscribeGetLink();
      unsubscribeRecalc();
      unsubscribePose();
    };
  }, [manager, isInitialized]);

  // Joint update handler
  React.useEffect(() => {
    if (!isInitialized) return;
    const handleJointUpdate = ({ robotId }) => {
      if (manager.robotRegistry.has(robotId)) {
        manager.recalculateEndEffector(robotId).catch(console.error);
      }
    };
    const unsubscribeJoint = EventBus.on(DataTransfer.RobotEvents.SET_JOINT_VALUE, handleJointUpdate);
    const unsubscribeJoints = EventBus.on(DataTransfer.RobotEvents.SET_JOINT_VALUES, handleJointUpdate);
    return () => {
      unsubscribeJoint();
      unsubscribeJoints();
    };
  }, [manager, isInitialized]);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      manager.cleanup();
    };
  }, [manager]);

  // Always keep TCP tools up to date
  React.useEffect(() => {
    if (!isInitialized) return;
    let isMounted = true;
    const updateTools = async () => {
      const tools = await manager.scanAvailableTools();
      if (isMounted) setAvailableTools(tools);
    };
    updateTools();
    const handleFocus = () => updateTools();
    window.addEventListener('focus', handleFocus);
    const interval = setInterval(updateTools, 5000);
    return () => {
      isMounted = false;
      window.removeEventListener('focus', handleFocus);
      clearInterval(interval);
    };
  }, [isInitialized, manager]);

  // Context API
  const attachTool = React.useCallback(async (robotId, toolId) => {
    if (!isInitialized) {
      throw new Error('TCP manager not initialized');
    }
    const toolData = await manager.attachTool(robotId, toolId);
    setAttachedTools(new Map(manager.attachedTools));
    return toolData;
  }, [manager, isInitialized]);

  const removeTool = React.useCallback(async (robotId) => {
    if (!isInitialized) return;
    await manager.removeTool(robotId);
    setAttachedTools(new Map(manager.attachedTools));
  }, [manager, isInitialized]);

  const setToolTransform = React.useCallback((robotId, transforms) => {
    if (!isInitialized) return;
    manager.setToolTransform?.(robotId, transforms);
    EventBus.emit(DataTransfer.EVENT_TCP_TOOL_TRANSFORM_CHANGED, {
      robotId,
      transforms
    });
  }, [manager, isInitialized]);

  const setToolVisibility = React.useCallback((robotId, visible) => {
    if (!isInitialized) return;
    manager.setToolVisibility?.(robotId, visible);
    setAttachedTools(new Map(manager.attachedTools));
  }, [manager, isInitialized]);

  const scanAvailableTools = React.useCallback(async () => {
    try {
      const tools = await manager.scanAvailableTools();
      setAvailableTools(tools);
      return tools;
    } catch (error) {
      return [];
    }
  }, [manager]);

  const getEndEffectorLink = React.useCallback((robotId) => {
    if (!isInitialized) return null;
    return manager.getEndEffectorLink(robotId);
  }, [manager, isInitialized]);

  const value = {
    attachedTools,
    availableTools,
    isInitialized,
    attachTool,
    removeTool,
    setToolTransform,
    setToolVisibility,
    scanAvailableTools,
    getEndEffectorLink,
    manager
  };

  return (
    <TCPContext.Provider value={value}>
      {children}
    </TCPContext.Provider>
  );
}

export { TCPProvider };
export default TCPContext;
