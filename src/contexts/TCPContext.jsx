import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { useViewer } from './ViewerContext';
import { useRobotSelection } from './hooks/useRobot';
import URDFLoader from '../core/Loader/URDFLoader';
import MeshLoader from '../core/Loader/MeshLoader';
import EventBus from '../utils/EventBus';

const TCPContext = createContext(null);

class SimpleTCPManager {
  constructor() {
    this.sceneSetup = null;
    this.robotManager = null;
    this.attachedTools = new Map(); // robotId -> { toolObject, toolContainer, tipOffset }
    this.availableTools = [];
    this.urdfLoader = null;
    this._notFoundWarnings = new Set(); // Track robots not found to avoid spam
  }

  /**
   * Enhanced robot lookup with fallback methods
   * @param {string} robotId - The robot ID to find
   * @returns {Object|null} The robot object or null if not found
   */
  findRobotWithFallbacks(robotId) {
    if (!robotId) return null;
    
    // Method 1: Try robot manager first
    if (this.robotManager && this.robotManager.getRobot) {
      const robot = this.robotManager.getRobot(robotId);
      if (robot) {
        return robot;
      }
    }
    
    // Method 2: Try robot manager robots map
    if (this.robotManager && this.robotManager.robots && this.robotManager.robots.has) {
      const robotData = this.robotManager.robots.get(robotId);
      if (robotData && robotData.robot) {
        return robotData.robot;
      }
    }
    
    // Method 3: Try scene traversal as last resort
    if (this.sceneSetup && this.sceneSetup.scene) {
      let foundRobot = null;
      this.sceneSetup.scene.traverse((child) => {
        if (child.isURDFRobot && (child.name === robotId || child.robotName === robotId)) {
          foundRobot = child;
        }
      });
      if (foundRobot) {
        console.log(`[TCP] Found robot ${robotId} via scene traversal`);
        return foundRobot;
      }
    }
    
    return null;
  }

  /**
   * Calculate normal robot end effector position and orientation (base calculation)
   * Enhanced with better robot lookup
   */
  calculateRobotEndEffector(robotId) {
    console.log(`[TCP Context] calculateRobotEndEffector for ${robotId}`);
    
    // Use enhanced robot lookup
    const robot = this.findRobotWithFallbacks(robotId);
    if (!robot) {
      // Only warn once per robot to avoid spam
      if (!this._notFoundWarnings.has(robotId)) {
        console.warn(`[TCP Context] Robot ${robotId} not found`);
        this._notFoundWarnings.add(robotId);
        
        // Clear the warning after some time
        setTimeout(() => {
          this._notFoundWarnings.delete(robotId);
        }, 5000);
      }
      
      return { 
        position: { x: 0, y: 0, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 }
      };
    }

    // Clear any previous warnings for this robot since we found it
    this._notFoundWarnings.delete(robotId);

    // Find the actual end effector link in the robot
    const endEffectorNames = [
      'tool0', 'ee_link', 'end_effector', 'gripper_link', 
      'link_6', 'link_7', 'wrist_3_link', 'tool_link',
      'flange', 'tool_flange', 'tcp'
    ];
    
    let endEffectorLink = null;
    
    // First try to find by name
    if (robot.links) {
      for (const name of endEffectorNames) {
        if (robot.links[name]) {
          endEffectorLink = robot.links[name];
          console.log(`[TCP Context] Found end effector link: ${name}`);
          break;
        }
      }
    }
    
    // If not found by name, find the deepest link
    if (!endEffectorLink) {
      console.log(`[TCP Context] Searching for deepest link...`);
      let deepestLink = null;
      let maxDepth = 0;
      
      const findDeepest = (obj, depth = 0) => {
        if (obj.isURDFLink && depth > maxDepth) {
          maxDepth = depth;
          deepestLink = obj;
        }
        if (obj.children) {
          obj.children.forEach(child => findDeepest(child, depth + 1));
        }
      };
      
      findDeepest(robot);
      endEffectorLink = deepestLink;
      
      if (endEffectorLink) {
        console.log(`[TCP Context] Using deepest link: ${endEffectorLink.name} at depth ${maxDepth}`);
      }
    }

    if (!endEffectorLink) {
      console.warn(`[TCP Context] No end effector found for robot ${robotId}`);
      return { 
        position: { x: 0, y: 0, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 }
      };
    }

    // Store reference to end effector for CCD to use
    robot.userData = robot.userData || {};
    robot.userData.endEffectorLink = endEffectorLink;

    // Get world position and orientation
    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    endEffectorLink.getWorldPosition(worldPos);
    endEffectorLink.getWorldQuaternion(worldQuat);
    
    const result = {
      position: { x: worldPos.x, y: worldPos.y, z: worldPos.z },
      orientation: { x: worldQuat.x, y: worldQuat.y, z: worldQuat.z, w: worldQuat.w }
    };
    
    console.log(`[TCP Context] Robot end effector at: (${result.position.x.toFixed(3)}, ${result.position.y.toFixed(3)}, ${result.position.z.toFixed(3)})`);
    console.log(`[TCP Context] Robot end effector orientation: (${result.orientation.x.toFixed(3)}, ${result.orientation.y.toFixed(3)}, ${result.orientation.z.toFixed(3)}, ${result.orientation.w.toFixed(3)})`);
    
    return result;
  }

  /**
   * Calculate robot end effector orientation (legacy method - maintained for backward compatibility)
   */
  calculateRobotEndEffectorOrientation(robotId) {
    console.log(`[TCP Context] calculateRobotEndEffectorOrientation for ${robotId} (legacy method)`);
    
    const result = this.calculateRobotEndEffector(robotId);
    return result.orientation;
  }

  /**
   * Calculate TCP tool tip offset from transform values
   */
  calculateToolTipOffset(toolObject, toolContainer) {
    if (!toolObject || !toolContainer) return { x: 0, y: 0, z: 0 };

    // Get the current transform values applied to the tool container
    const position = toolContainer.position;
    const rotation = toolContainer.rotation;
    const scale = toolContainer.scale;

    // Start with the position offset
    let tipOffset = {
      x: position.x,
      y: position.y,
      z: position.z
    };

    // Apply rotation to the tip offset if there's any base offset
    if (rotation.x !== 0 || rotation.y !== 0 || rotation.z !== 0) {
      // Create a base tip vector (assuming tool extends in Z direction)
      const baseTip = new THREE.Vector3(0, 0, 0.05 * scale.z); // 5cm base length scaled
      
      // Apply rotation
      baseTip.applyEuler(rotation);
      
      // Add rotated tip to position offset
      tipOffset.x += baseTip.x;
      tipOffset.y += baseTip.y;
      tipOffset.z += baseTip.z;
    } else {
      // No rotation, just add a small base tip in Z direction
      tipOffset.z += 0.05 * scale.z;
    }

    console.log(`[TCP] Calculated tool tip offset: (${tipOffset.x.toFixed(3)}, ${tipOffset.y.toFixed(3)}, ${tipOffset.z.toFixed(3)})`);
    console.log(`[TCP] From position: (${position.x.toFixed(3)}, ${position.y.toFixed(3)}, ${position.z.toFixed(3)})`);
    console.log(`[TCP] From rotation: (${rotation.x.toFixed(3)}, ${rotation.y.toFixed(3)}, ${rotation.z.toFixed(3)})`);
    console.log(`[TCP] From scale: (${scale.x.toFixed(3)}, ${scale.y.toFixed(3)}, ${scale.z.toFixed(3)})`);
    
    return tipOffset;
  }

  /**
   * Get final end effector position: robot_end_effector + tcp_tip_offset
   */
  getFinalEndEffectorPosition(robotId) {
    // Step 1: Get base robot end effector (ALWAYS calculate this)
    const robotEndEffector = this.calculateRobotEndEffector(robotId);
    console.log(`[TCP] Robot end effector: (${robotEndEffector.position.x.toFixed(3)}, ${robotEndEffector.position.y.toFixed(3)}, ${robotEndEffector.position.z.toFixed(3)})`);
    
    // Step 2: Check if TCP tool attached
    const toolData = this.attachedTools.get(robotId);
    if (!toolData) {
      // No TCP tool - return robot end effector position
      console.log(`[TCP] No tool attached, using robot end effector position`);
      return robotEndEffector.position;
    }

    // Step 3: Get current tool tip offset (small fixed values)
    const tipOffset = this.calculateToolTipOffset(toolData.toolObject, toolData.toolContainer);
    console.log(`[TCP] Tool tip offset: (${tipOffset.x.toFixed(3)}, ${tipOffset.y.toFixed(3)}, ${tipOffset.z.toFixed(3)})`);
    
    // Step 4: Simple addition: robot + tip
    const finalPosition = {
      x: robotEndEffector.position.x + tipOffset.x,
      y: robotEndEffector.position.y + tipOffset.y,
      z: robotEndEffector.position.z + tipOffset.z
    };

    console.log(`[TCP] Final calculation: robot(${robotEndEffector.position.x.toFixed(3)}, ${robotEndEffector.position.y.toFixed(3)}, ${robotEndEffector.position.z.toFixed(3)}) + tip(${tipOffset.x.toFixed(3)}, ${tipOffset.y.toFixed(3)}, ${tipOffset.z.toFixed(3)}) = final(${finalPosition.x.toFixed(3)}, ${finalPosition.y.toFixed(3)}, ${finalPosition.z.toFixed(3)})`);
    
    return finalPosition;
  }

  /**
   * Get final end effector orientation: robot_end_effector_orientation (+ tcp_orientation if tool attached)
   */
  getFinalEndEffectorOrientation(robotId) {
    // Step 1: Get base robot end effector orientation (ALWAYS calculate this)
    const robotEndEffector = this.calculateRobotEndEffector(robotId);
    console.log(`[TCP] Robot end effector orientation: (${robotEndEffector.orientation.x.toFixed(3)}, ${robotEndEffector.orientation.y.toFixed(3)}, ${robotEndEffector.orientation.z.toFixed(3)}, ${robotEndEffector.orientation.w.toFixed(3)})`);
    
    // Step 2: Check if TCP tool attached
    const toolData = this.attachedTools.get(robotId);
    if (!toolData) {
      // No TCP tool - return robot end effector orientation
      console.log(`[TCP] No tool attached, using robot end effector orientation`);
      return robotEndEffector.orientation;
    }

    // Step 3: Get tool container orientation
    const toolContainer = toolData.toolContainer;
    const toolQuat = new THREE.Quaternion();
    toolContainer.getWorldQuaternion(toolQuat);

    // Step 4: Combine robot and tool orientations
    const robotQuat = new THREE.Quaternion(
      robotEndEffector.orientation.x,
      robotEndEffector.orientation.y,
      robotEndEffector.orientation.z,
      robotEndEffector.orientation.w
    );

    // Multiply quaternions to combine rotations
    const finalQuat = robotQuat.multiply(toolQuat);
    
    const finalOrientation = {
      x: finalQuat.x,
      y: finalQuat.y,
      z: finalQuat.z,
      w: finalQuat.w
    };

    console.log(`[TCP] Final orientation calculation: robot(${robotEndEffector.orientation.x.toFixed(3)}, ${robotEndEffector.orientation.y.toFixed(3)}, ${robotEndEffector.orientation.z.toFixed(3)}, ${robotEndEffector.orientation.w.toFixed(3)}) * tool(${toolQuat.x.toFixed(3)}, ${toolQuat.y.toFixed(3)}, ${toolQuat.z.toFixed(3)}, ${toolQuat.w.toFixed(3)}) = final(${finalOrientation.x.toFixed(3)}, ${finalOrientation.y.toFixed(3)}, ${finalOrientation.z.toFixed(3)}, ${finalOrientation.w.toFixed(3)})`);
    
    return finalOrientation;
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
    try {
      const response = await fetch('/api/tcp/scan');
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || 'Failed to scan TCP tools');
      }
      
      this.availableTools = data.tools || [];
      return this.availableTools;
    } catch (error) {
      console.error('Error scanning TCP tools:', error);
      throw error;
    }
  }

  /**
   * Load tool based on type
   */
  async loadTool(tool) {
    if (tool.type === 'URDF Package') {
      return await this.loadUrdfTool(tool);
    } else if (tool.type === 'Multi-Mesh') {
      return await this.loadMultiMeshTool(tool);
    } else {
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
          if (err) {
            done(null, err);
            return;
          }
          
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
        if (err) {
          reject(err);
          return;
        }
        
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
   * Find robot end effector for attachment
   */
  findEndEffector(robot) {
    const endEffectorNames = [
      'end_effector', 'tool0', 'ee_link', 'gripper_link', 
      'link_6', 'link_7', 'wrist_3_link', 'tool_link',
      'flange', 'tool_flange'
    ];
    
    for (const name of endEffectorNames) {
      if (robot.links && robot.links[name]) {
        return robot.links[name];
      }
    }
    
    // Fallback: find deepest link
    let deepestLink = null;
    let maxDepth = 0;
    const findDeepestLink = (obj, depth = 0) => {
      if (obj.isURDFLink && depth > maxDepth) {
        maxDepth = depth;
        deepestLink = obj;
      }
      if (obj.children) {
        obj.children.forEach(child => findDeepestLink(child, depth + 1));
      }
    };
    findDeepestLink(robot);
    
    return deepestLink;
  }

  /**
   * Attach tool to robot
   */
  async attachTool(robotId, toolId) {
    try {
      // Remove existing tool
      await this.removeTool(robotId);

      // Find tool and robot
      const tool = this.availableTools.find(t => t.id === toolId);
      if (!tool) throw new Error(`Tool ${toolId} not found`);

      const robot = this.robotManager.getRobot(robotId);
      if (!robot) throw new Error(`Robot ${robotId} not found`);

      const endEffector = this.findEndEffector(robot);
      if (!endEffector) throw new Error('End effector not found');

      // Load tool
      const toolObject = await this.loadTool(tool);
      if (!toolObject) throw new Error('Failed to load tool object');

      // Create tool container
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

      // Get final end effector position and emit
      const finalPosition = this.getFinalEndEffectorPosition(robotId);
      
      EventBus.emit('tcp:tool-attached', {
        robotId,
        toolId,
        toolName: tool.name,
        endEffectorPoint: finalPosition
      });

      return true;
    } catch (error) {
      console.error('Error attaching tool:', error);
      throw error;
    }
  }

  /**
   * Set tool transform and recalculate
   */
  setToolTransform(robotId, transforms) {
    const toolData = this.attachedTools.get(robotId);
    if (!toolData) return;

    try {
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

      // CRITICAL: Recalculate final end effector position after transform change
      const finalPosition = this.getFinalEndEffectorPosition(robotId);

      console.log(`[TCP] Transform updated, new final position:`, finalPosition);

      // Emit events
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

    } catch (error) {
      console.error('Error setting tool transform:', error);
    }
  }

  /**
   * Remove tool
   */
  async removeTool(robotId) {
    const toolData = this.attachedTools.get(robotId);
    if (!toolData) return;

    // Remove from scene
    const { endEffector, toolContainer } = toolData;
    if (endEffector && toolContainer) {
      endEffector.remove(toolContainer);
      
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
    }

    // Remove from tracking
    this.attachedTools.delete(robotId);

    // Get robot end effector position (no TCP)
    const robotPosition = this.calculateRobotEndEffector(robotId);

    // Emit events
    EventBus.emit('tcp:tool-removed', { robotId, toolId: toolData.toolId });
    EventBus.emit('tcp:endeffector-updated', {
      robotId,
      endEffectorPoint: robotPosition,
      hasTCP: false
    });
  }

  /**
   * Set tool visibility
   */
  setToolVisibility(robotId, visible) {
    const toolData = this.attachedTools.get(robotId);
    if (!toolData) return;
    
    toolData.toolContainer.visible = visible;
  }

  /**
   * Get current tool
   */
  getCurrentTool(robotId) {
    return this.attachedTools.get(robotId);
  }

  /**
   * Get tool transform
   */
  getToolTransform(robotId) {
    const toolData = this.attachedTools.get(robotId);
    return toolData ? { ...toolData.transforms } : null;
  }

  /**
   * Force recalculate end effector (called when joints change)
   */
  recalculateEndEffector(robotId) {
    // Get both position and orientation
    const finalPosition = this.getFinalEndEffectorPosition(robotId);
    const finalOrientation = this.getFinalEndEffectorOrientation(robotId);
    const hasTCP = this.attachedTools.has(robotId);
    
    // Emit event with both position and orientation
    EventBus.emit('tcp:endeffector-updated', {
      robotId,
      endEffectorPoint: finalPosition,
      endEffectorOrientation: finalOrientation,
      hasTCP
    });
    
    // Return both position and orientation
    return {
      position: finalPosition,
      orientation: finalOrientation
    };
  }

  /**
   * Dispose
   */
  dispose() {
    for (const [robotId] of this.attachedTools) {
      this.removeTool(robotId);
    }
    this.attachedTools.clear();
    this.availableTools = [];
  }
}

export const TCPProvider = ({ children }) => {
  console.log('[TCP Context] Using SIMPLIFIED TCP System v2.0');
  
  const { isViewerReady, getSceneSetup, getRobotManager } = useViewer();
  const { activeId: activeRobotId } = useRobotSelection();
  const tcpManagerRef = useRef(null);
  
  // State
  const [isInitialized, setIsInitialized] = useState(false);
  const [availableTools, setAvailableTools] = useState([]);
  const [attachedTools, setAttachedTools] = useState(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Initialize TCP Manager
  useEffect(() => {
    console.log(`[TCP Context] Init effect - isViewerReady: ${isViewerReady}`);
    
    if (isViewerReady) {
      const sceneSetup = getSceneSetup();
      const robotManager = getRobotManager();
      
      console.log(`[TCP Context] sceneSetup:`, !!sceneSetup);
      console.log(`[TCP Context] robotManager:`, !!robotManager);
      
      if (sceneSetup && robotManager) {
        try {
          if (!tcpManagerRef.current) {
            tcpManagerRef.current = new SimpleTCPManager();
            console.log(`[TCP Context] Created new SimpleTCPManager`);
          }
          
          console.log(`[TCP Context] Initializing TCP manager...`);
          tcpManagerRef.current.initialize(sceneSetup, robotManager);
          
          setIsInitialized(true);
          setError(null);
          
          console.log(`[TCP Context] TCP Manager initialized successfully`);
          
          // Load available tools
          loadAvailableTools();
          
        } catch (err) {
          console.error(`[TCP Context] TCP Manager initialization error:`, err);
          setError(`Initialization failed: ${err.message}`);
        }
      } else {
        console.log(`[TCP Context] Waiting for viewer components - sceneSetup: ${!!sceneSetup}, robotManager: ${!!robotManager}`);
      }
    } else {
      console.log(`[TCP Context] Viewer not ready yet`);
    }
  }, [isViewerReady, getSceneSetup, getRobotManager]);

  // Listen for joint changes to recalculate end effector
  useEffect(() => {
    if (!isInitialized || !tcpManagerRef.current) {
      console.log('[TCP Context] Not initialized or no TCP manager');
      return;
    }

    const handleJointChanged = (data) => {
      const robotId = data.robotId || data.robotName;
      if (!robotId || !tcpManagerRef.current) {
        console.warn('[TCP Context] Invalid joint change data:', data);
        return;
      }

      console.log(`[TCP Context] Joint changed for robot ${robotId}`);
      
      // Add a small delay to ensure joint changes are applied
      setTimeout(() => {
        try {
          tcpManagerRef.current.recalculateEndEffector(robotId);
        } catch (error) {
          console.error(`[TCP Context] Error recalculating end effector for robot ${robotId}:`, error);
        }
      }, 10);
    };

    const handleJointsChanged = (data) => {
      const robotId = data.robotId || data.robotName;
      if (!robotId || !tcpManagerRef.current) {
        console.warn('[TCP Context] Invalid joints change data:', data);
        return;
      }

      console.log(`[TCP Context] Multiple joints changed for robot ${robotId}`);
      
      // Add a small delay to ensure joint changes are applied
      setTimeout(() => {
        try {
          tcpManagerRef.current.recalculateEndEffector(robotId);
        } catch (error) {
          console.error(`[TCP Context] Error recalculating end effector for robot ${robotId}:`, error);
        }
      }, 10);
    };

    const handleForceRecalculate = (data) => {
      if (!data.robotId || !tcpManagerRef.current) {
        console.warn('[TCP Context] Invalid force recalculate data:', data);
        return;
      }

      console.log(`[TCP Context] Force recalculating end effector for robot ${data.robotId}`);
      
      try {
        tcpManagerRef.current.recalculateEndEffector(data.robotId);
      } catch (error) {
        console.error(`[TCP Context] Error force recalculating end effector for robot ${data.robotId}:`, error);
      }
    };

    // 🚨 FIXED: Listen for robot registration to handle newly loaded robots
    const handleRobotRegistered = (data) => {
      const robotId = data.robotId || data.robotName;
      if (!robotId || !tcpManagerRef.current || !data.robot) {
        console.warn('[TCP Context] Invalid robot registration data:', data);
        return;
      }

      console.log(`[TCP Context] Robot registered: ${robotId}`);
      
      // Ensure the robot manager has the robot
      const manager = tcpManagerRef.current.robotManager;
      if (!manager) {
        console.warn('[TCP Context] No robot manager available');
        return;
      }

      // Check if robot is already in manager
      let hasRobot = false;
      try {
        hasRobot = !!manager.getRobot(robotId);
      } catch (error) {
        console.log(`[TCP Context] getRobot check failed, assuming robot not present`);
      }
      
      if (!hasRobot) {
        console.log(`[TCP Context] Adding robot ${robotId} to robot manager for TCP`);
        
        try {
          // Try multiple ways to register the robot in the robot manager
          // Method 1: If robot manager has a robots Map
          if (manager.robots && manager.robots instanceof Map) {
            manager.robots.set(robotId, {
              name: robotId,
              robot: data.robot,
              isActive: true
            });
            console.log(`[TCP Context] Added robot to manager.robots Map`);
          }
          
          // Method 2: If robot manager has an addRobot method
          if (typeof manager.addRobot === 'function') {
            manager.addRobot(robotId, data.robot);
            console.log(`[TCP Context] Called manager.addRobot`);
          }
          
          // Method 3: If robot manager has a setRobot method
          if (typeof manager.setRobot === 'function') {
            manager.setRobot(robotId, data.robot);
            console.log(`[TCP Context] Called manager.setRobot`);
          }
          
          // Method 4: Direct property assignment (fallback)
          if (!manager.robots) {
            manager.robots = new Map();
          }
          if (manager.robots instanceof Map) {
            manager.robots.set(robotId, {
              name: robotId,
              robot: data.robot,
              isActive: true
            });
          }
          
          // Method 5: Create a getRobot method if it doesn't exist
          if (!manager.getRobot) {
            manager.getRobot = (id) => {
              if (manager.robots && manager.robots.has(id)) {
                return manager.robots.get(id).robot;
              }
              return null;
            };
            console.log(`[TCP Context] Created getRobot method for manager`);
          }
          
          // Method 6: Create joint control methods if they don't exist
          if (!manager.setJointValue) {
            manager.setJointValue = (id, jointName, value) => {
              const robot = manager.getRobot(id);
              if (robot && robot.setJointValue) {
                return robot.setJointValue(jointName, value);
              }
              return false;
            };
            console.log(`[TCP Context] Created setJointValue method for manager`);
          }
          
          if (!manager.setJointValues) {
            manager.setJointValues = (id, values) => {
              const robot = manager.getRobot(id);
              if (robot && robot.setJointValues) {
                return robot.setJointValues(values);
              }
              return false;
            };
            console.log(`[TCP Context] Created setJointValues method for manager`);
          }
          
          if (!manager.getJointValues) {
            manager.getJointValues = (id) => {
              const robot = manager.getRobot(id);
              if (robot && robot.joints) {
                const values = {};
                Object.values(robot.joints).forEach(joint => {
                  if (joint.jointType !== 'fixed' && typeof joint.angle !== 'undefined') {
                    values[joint.name] = joint.angle;
                  }
                });
                return values;
              }
              return {};
            };
            console.log(`[TCP Context] Created getJointValues method for manager`);
          }
          
          // Verify the robot is now accessible
          const testRobot = manager.getRobot(robotId);
          if (testRobot) {
            console.log(`[TCP Context] SUCCESS: Robot ${robotId} is now accessible via robot manager`);
          } else {
            console.warn(`[TCP Context] FAILED: Robot ${robotId} still not accessible via robot manager`);
          }
          
        } catch (syncError) {
          console.error(`[TCP Context] Error syncing robot to manager:`, syncError);
        }
      }
      
      // Recalculate end effector for newly registered robot
      setTimeout(() => {
        try {
          if (tcpManagerRef.current) {
            tcpManagerRef.current.recalculateEndEffector(robotId);
            console.log(`[TCP Context] Recalculated end effector for newly registered robot ${robotId}`);
          }
        } catch (error) {
          console.error(`[TCP Context] Error recalculating end effector for newly registered robot ${robotId}:`, error);
        }
      }, 100);
    };

    // Subscribe to events
    const unsubscribeJoint = EventBus.on('robot:joint-changed', handleJointChanged);
    const unsubscribeJoints = EventBus.on('robot:joints-changed', handleJointsChanged);
    const unsubscribeForce = EventBus.on('tcp:force-recalculate', handleForceRecalculate);
    const unsubscribeRegistered = EventBus.on('robot:registered', handleRobotRegistered);

    console.log('[TCP Context] Subscribed to joint change events');

    return () => {
      unsubscribeJoint();
      unsubscribeJoints();
      unsubscribeForce();
      unsubscribeRegistered();
      console.log('[TCP Context] Unsubscribed from joint change events');
    };
  }, [isInitialized]);

  // Load available tools
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

  // Attach tool
  const attachTool = useCallback(async (robotId, toolId) => {
    if (!tcpManagerRef.current) {
      throw new Error('TCP Manager not initialized');
    }
    
    try {
      setIsLoading(true);
      setError(null);
      
      await tcpManagerRef.current.attachTool(robotId, toolId);
      
      // Update state
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

  // Remove tool
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

  // Set tool transform
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

  // Set tool visibility
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

  // Get final end effector position (robot + tcp)
  const getCurrentEndEffectorPoint = useCallback((robotId) => {
    console.log(`[TCP Context] getCurrentEndEffectorPoint called for robotId: ${robotId}`);
    console.log(`[TCP Context] tcpManagerRef.current:`, !!tcpManagerRef.current);
    console.log(`[TCP Context] isInitialized:`, isInitialized);
    
    if (!tcpManagerRef.current) {
      console.warn(`[TCP Context] TCP manager not available`);
      return { x: 0, y: 0, z: 0 };
    }
    
    console.log(`[TCP Context] Calling tcpManagerRef.current.getFinalEndEffectorPosition(${robotId})`);
    const result = tcpManagerRef.current.getFinalEndEffectorPosition(robotId);
    console.log(`[TCP Context] getFinalEndEffectorPosition returned:`, result);
    
    return result;
  }, [isInitialized]);

  // Get final end effector orientation (robot + tcp)
  const getCurrentEndEffectorOrientation = useCallback((robotId) => {
    console.log(`[TCP Context] getCurrentEndEffectorOrientation called for robotId: ${robotId}`);
    console.log(`[TCP Context] tcpManagerRef.current:`, !!tcpManagerRef.current);
    console.log(`[TCP Context] isInitialized:`, isInitialized);
    
    if (!tcpManagerRef.current) {
      console.warn(`[TCP Context] TCP manager not available for orientation`);
      return { x: 0, y: 0, z: 0, w: 1 };
    }
    
    console.log(`[TCP Context] Calling tcpManagerRef.current.getFinalEndEffectorOrientation(${robotId})`);
    const result = tcpManagerRef.current.getFinalEndEffectorOrientation(robotId);
    console.log(`[TCP Context] getFinalEndEffectorOrientation returned:`, result);
    
    return result;
  }, [isInitialized]);

  // Force recalculate end effector position and orientation
  const recalculateEndEffector = useCallback((robotId) => {
    if (!tcpManagerRef.current) {
      return {
        position: { x: 0, y: 0, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 }
      };
    }
    
    const position = tcpManagerRef.current.recalculateEndEffector(robotId);
    const orientation = tcpManagerRef.current.getFinalEndEffectorOrientation(robotId);
    
    return { position, orientation };
  }, []);

  // Get robot end effector position (without TCP)
  const getRobotEndEffectorPosition = useCallback((robotId) => {
    if (!tcpManagerRef.current) return { x: 0, y: 0, z: 0 };
    const result = tcpManagerRef.current.calculateRobotEndEffector(robotId);
    return result.position;
  }, []);

  // Get robot end effector orientation (without TCP)
  const getRobotEndEffectorOrientation = useCallback((robotId) => {
    if (!tcpManagerRef.current) return { x: 0, y: 0, z: 0, w: 1 };
    const result = tcpManagerRef.current.calculateRobotEndEffector(robotId);
    return result.orientation;
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (tcpManagerRef.current) {
        tcpManagerRef.current.dispose();
      }
    };
  }, []);

  const value = {
    // State
    availableTools,
    attachedTools,
    isLoading,
    error,
    isInitialized,
    
    // Tool Management Methods
    loadAvailableTools,
    attachTool,
    removeTool,
    setToolTransform,
    setToolVisibility,
    getToolInfo: (robotId) => attachedTools.get(robotId),
    hasToolAttached: (robotId) => attachedTools.has(robotId),
    
    // End Effector Methods
    // Get current end effector state (with TCP if attached)
    getCurrentEndEffectorPoint,      // Returns { x, y, z }
    getCurrentEndEffectorOrientation, // Returns { x, y, z, w }
    recalculateEndEffector,          // Returns { position: { x, y, z }, orientation: { x, y, z, w } }
    
    // Get robot end effector state (without TCP)
    getRobotEndEffectorPosition,     // Returns { x, y, z }
    getRobotEndEffectorOrientation,  // Returns { x, y, z, w }
    
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