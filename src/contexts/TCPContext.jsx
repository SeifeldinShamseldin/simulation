import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { useViewer } from './ViewerContext';
import { useRobot } from './RobotContext';
import URDFLoader from '../core/Loader/URDFLoader';
import MeshLoader from '../core/Loader/MeshLoader';
import EventBus from '../utils/EventBus';

const TCPContext = createContext(null);

class TCPManager {
  constructor() {
    this.sceneSetup = null;
    this.robotManager = null;
    this.attachedTools = new Map(); // robotId -> tool data
    this.availableTools = [];
    this.urdfLoader = null;
    this.endEffectorCalculators = new Map(); // robotId -> calculator
  }

  /**
   * Calculate robot's default end effector position (when no TCP tool attached)
   */
  calculateRobotEndEffectorPosition(robotId) {
    const robot = this.robotManager.getRobot(robotId);
    if (!robot) return { x: 0, y: 0, z: 0 };
    
    // Find robot base
    const robotBase = this.findRobotBase(robot);
    if (!robotBase) return { x: 0, y: 0, z: 0 };
    
    // Find robot end effector
    const robotEndEffector = this.findEndEffector(robot);
    if (!robotEndEffector) return { x: 0, y: 0, z: 0 };
    
    // Get positions
    const baseWorldPos = new THREE.Vector3();
    const endEffectorWorldPos = new THREE.Vector3();
    
    robotBase.getWorldPosition(baseWorldPos);
    robotEndEffector.getWorldPosition(endEffectorWorldPos);
    
    // Calculate relative position from base
    const relativePos = new THREE.Vector3().subVectors(endEffectorWorldPos, baseWorldPos);
    
    console.log(`Robot end effector position from base: (${relativePos.x.toFixed(3)}, ${relativePos.y.toFixed(3)}, ${relativePos.z.toFixed(3)})`);
    
    return {
      x: relativePos.x,
      y: relativePos.y,
      z: relativePos.z
    };
  }

  /**
   * Find robot's base link
   */
  findRobotBase(robot) {
    // Method 1: Look for common base names
    const baseNames = ['base_link', 'base', 'root', 'world'];
    for (const name of baseNames) {
      if (robot.links && robot.links[name]) {
        console.log(`Found robot base by name: ${name}`);
        return robot.links[name];
      }
    }
    
    // Method 2: Find the root link (has no parent joints)
    if (robot.links && robot.joints) {
      const linksWithParentJoints = new Set();
      Object.values(robot.joints).forEach(joint => {
        joint.children.forEach(child => {
          if (child.isURDFLink) {
            linksWithParentJoints.add(child.name);
          }
        });
      });
      
      const rootLinks = [];
      Object.values(robot.links).forEach(link => {
        if (!linksWithParentJoints.has(link.name)) {
          rootLinks.push(link);
        }
      });
      
      if (rootLinks.length > 0) {
        const base = rootLinks[0];
        console.log(`Found robot base as root link: ${base.name}`);
        return base;
      }
    }
    
    // Method 3: Use the robot itself as base
    console.log('Using robot object as base');
    return robot;
  }

  /**
   * Get current end effector point for a robot (TCP or robot default)
   */
  getCurrentEndEffectorPoint(robotId) {
    // Check if there's a TCP tool attached
    const calculator = this.endEffectorCalculators.get(robotId);
    if (calculator) {
      // TCP tool is attached - use its calculated position
      return calculator.getEndEffectorPoint();
    } else {
      // No TCP tool - calculate robot's default end effector position
      const robotEndEffectorPos = this.calculateRobotEndEffectorPosition(robotId);
      return new THREE.Vector3(robotEndEffectorPos.x, robotEndEffectorPos.y, robotEndEffectorPos.z);
    }
  }

  /**
   * Force recalculation of end effector point (TCP or robot default)
   */
  recalculateEndEffector(robotId) {
    // Check if there's a TCP tool attached
    const calculator = this.endEffectorCalculators.get(robotId);
    let newPoint;
    
    if (calculator) {
      // TCP tool is attached - recalculate its position
      newPoint = calculator.recalculate();
    } else {
      // No TCP tool - recalculate robot's default end effector position
      const robotEndEffectorPos = this.calculateRobotEndEffectorPosition(robotId);
      newPoint = new THREE.Vector3(robotEndEffectorPos.x, robotEndEffectorPos.y, robotEndEffectorPos.z);
    }
    
    // Emit update event
    EventBus.emit('tcp:endeffector-updated', {
      robotId,
      endEffectorPoint: {
        x: newPoint.x,
        y: newPoint.y,
        z: newPoint.z
      },
      hasTCP: !!calculator
    });
    
    return newPoint;
  }

  /**
   * Smart End Effector Calculator - Calculates position from robot base to actual tip
   */
  createSmartEndEffectorCalculator(toolContainer, toolObject, robot) {
    return {
      toolContainer,
      toolObject,
      robot,
      vertices: [],
      currentEndEffectorPoint: new THREE.Vector3(),
      originalVertices: [],
      robotBase: null,
      
      /**
       * Find robot's base link
       */
      findRobotBase() {
        if (!this.robot) return null;
        
        // Method 1: Look for common base names
        const baseNames = ['base_link', 'base', 'root', 'world'];
        for (const name of baseNames) {
          if (this.robot.links && this.robot.links[name]) {
            console.log(`Found robot base by name: ${name}`);
            return this.robot.links[name];
          }
        }
        
        // Method 2: Find the root link (has no parent joints)
        if (this.robot.links && this.robot.joints) {
          const linksWithParentJoints = new Set();
          Object.values(this.robot.joints).forEach(joint => {
            joint.children.forEach(child => {
              if (child.isURDFLink) {
                linksWithParentJoints.add(child.name);
              }
            });
          });
          
          const rootLinks = [];
          Object.values(this.robot.links).forEach(link => {
            if (!linksWithParentJoints.has(link.name)) {
              rootLinks.push(link);
            }
          });
          
          if (rootLinks.length > 0) {
            const base = rootLinks[0];
            console.log(`Found robot base as root link: ${base.name}`);
            return base;
          }
        }
        
        // Method 3: Use the robot itself as base
        console.log('Using robot object as base');
        return this.robot;
      },
      
      /**
       * Extract all vertices from tool geometry
       */
      extractVertices() {
        this.vertices = [];
        this.originalVertices = [];
        
        this.toolObject.traverse(child => {
          if (child.isMesh && child.geometry) {
            const geometry = child.geometry;
            
            // Get position attribute
            const positionAttribute = geometry.attributes.position;
            if (positionAttribute) {
              // Extract vertices
              for (let i = 0; i < positionAttribute.count; i++) {
                const vertex = new THREE.Vector3();
                vertex.fromBufferAttribute(positionAttribute, i);
                
                // Apply child's local transform
                vertex.applyMatrix4(child.matrix);
                
                this.originalVertices.push(vertex.clone());
                this.vertices.push(vertex);
              }
            }
          }
        });
        
        console.log(`Extracted ${this.vertices.length} vertices from tool`);
      },
      
      /**
       * Calculate end effector position from robot base to actual tip
       */
      updateEndEffectorPoint() {
        if (!this.robotBase) {
          this.robotBase = this.findRobotBase();
          if (!this.robotBase) {
            console.warn('Could not find robot base');
            return;
          }
        }
        
        // Get robot base world position
        const baseWorldPos = new THREE.Vector3();
        this.robotBase.getWorldPosition(baseWorldPos);
        
        if (this.vertices.length === 0) {
          // No tool attached - use tool container position
          const containerWorldPos = new THREE.Vector3();
          this.toolContainer.getWorldPosition(containerWorldPos);
          
          // Calculate relative position from base
          this.currentEndEffectorPoint.subVectors(containerWorldPos, baseWorldPos);
        } else {
          // Tool attached - find furthest point from tool container origin
          // Update all vertices with current tool container transform
          this.vertices = this.originalVertices.map(vertex => {
            const transformedVertex = vertex.clone();
            transformedVertex.applyMatrix4(this.toolContainer.matrix);
            return transformedVertex;
          });
          
          // Get tool container world position
          const toolContainerWorldPos = new THREE.Vector3();
          this.toolContainer.getWorldPosition(toolContainerWorldPos);
          
          // Find the furthest vertex from tool container origin
          let maxDistance = 0;
          let furthestPoint = toolContainerWorldPos.clone();
          
          this.vertices.forEach(vertex => {
            // Transform vertex to world space
            const worldVertex = vertex.clone();
            worldVertex.applyMatrix4(this.toolContainer.parent.matrixWorld);
            
            const distance = toolContainerWorldPos.distanceTo(worldVertex);
            if (distance > maxDistance) {
              maxDistance = distance;
              furthestPoint = worldVertex;
            }
          });
          
          // Calculate relative position from robot base
          this.currentEndEffectorPoint.subVectors(furthestPoint, baseWorldPos);
        }
        
        console.log(`Updated end effector point from base: (${this.currentEndEffectorPoint.x.toFixed(3)}, ${this.currentEndEffectorPoint.y.toFixed(3)}, ${this.currentEndEffectorPoint.z.toFixed(3)})`);
        
        return this.currentEndEffectorPoint;
      },
      
      /**
       * Get current end effector point relative to robot base
       */
      getEndEffectorPoint() {
        return this.currentEndEffectorPoint.clone();
      },
      
      /**
       * Force recalculation (call after transforms change)
       */
      recalculate() {
        // Force matrix updates
        this.toolContainer.updateMatrix();
        this.toolContainer.updateMatrixWorld(true);
        
        // Recalculate end effector point
        this.updateEndEffectorPoint();
        
        return this.currentEndEffectorPoint;
      },
      
      // Initialize the calculator
      init() {
        this.extractVertices();
        this.updateEndEffectorPoint();
        return this;
      }
    }.init();
  }

  /**

  /**
   * Initialize the TCP manager
   */
  initialize(sceneSetup, robotManager) {
    this.sceneSetup = sceneSetup;
    this.robotManager = robotManager;
    this.urdfLoader = new URDFLoader(new THREE.LoadingManager());
    
    // Configure URDF loader for TCP tools
    this.urdfLoader.parseVisual = true;
    this.urdfLoader.parseCollision = false;
  }

  /**
   * Scan for available TCP tools using server API
   */
  async scanAvailableTools() {
    try {
      console.log('Scanning TCP tools via server API...');
      
      const response = await fetch('/api/tcp/scan');
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || 'Failed to scan TCP tools');
      }
      
      this.availableTools = data.tools || [];
      console.log(`Found ${this.availableTools.length} TCP tools:`, this.availableTools);
      
      return this.availableTools;
    } catch (error) {
      console.error('Error scanning TCP tools:', error);
      throw error;
    }
  }

  /**
   * Attach a tool to a robot
   */
  async attachTool(robotId, toolId) {
    try {
      if (!this.robotManager || !this.sceneSetup) {
        throw new Error('TCP Manager not initialized');
      }

      console.log(`Attaching tool ${toolId} to robot ${robotId}`);

      // Remove existing tool
      await this.removeTool(robotId);

      // Find the tool
      const tool = this.availableTools.find(t => t.id === toolId);
      if (!tool) {
        throw new Error(`Tool ${toolId} not found`);
      }

      // Get robot and end effector
      const robot = this.robotManager.getRobot(robotId);
      if (!robot) {
        throw new Error(`Robot ${robotId} not found`);
      }

      const endEffector = this.findEndEffector(robot);
      if (!endEffector) {
        throw new Error('End effector not found');
      }

      console.log('Loading tool:', tool);

      // Load the tool based on type
      let toolObject;
      if (tool.type === 'URDF Package') {
        toolObject = await this.loadUrdfTool(tool);
      } else if (tool.type === 'Multi-Mesh') {
        toolObject = await this.loadMultiMeshTool(tool);
      } else {
        toolObject = await this.loadSingleMeshTool(tool);
      }

      if (!toolObject) {
        throw new Error('Failed to load tool object');
      }

      console.log('Tool loaded successfully:', toolObject);

      // Attach to end effector
      const toolContainer = this.attachToEndEffector(endEffector, toolObject);

      // Create smart end effector calculator
      const endEffectorCalculator = this.createSmartEndEffectorCalculator(toolContainer, toolObject, robot);
      this.endEffectorCalculators.set(robotId, endEffectorCalculator);

      // Store tool data
      this.attachedTools.set(robotId, {
        toolId,
        tool,
        toolObject,
        toolContainer,
        endEffector,
        endEffectorCalculator,
        transforms: {
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 }
        }
      });

      console.log(`Tool ${toolId} attached to robot ${robotId}`);

      // Calculate initial end effector point
      const endEffectorPoint = endEffectorCalculator.getEndEffectorPoint();
      console.log(`Initial end effector point: (${endEffectorPoint.x.toFixed(3)}, ${endEffectorPoint.y.toFixed(3)}, ${endEffectorPoint.z.toFixed(3)})`);

      // Emit event with end effector point
      EventBus.emit('tcp:tool-attached', {
        robotId,
        toolId,
        toolName: tool.name,
        endEffectorPoint: {
          x: endEffectorPoint.x,
          y: endEffectorPoint.y,
          z: endEffectorPoint.z
        }
      });

      return true;
    } catch (error) {
      console.error('Error attaching tool:', error);
      throw error;
    }
  }

  /**
   * Set tool transform (position, rotation, scale) with dynamic end effector calculation
   */
  setToolTransform(robotId, transforms) {
    const toolData = this.attachedTools.get(robotId);
    if (!toolData || !toolData.toolContainer) {
      console.warn(`No tool found for robot ${robotId}`);
      return;
    }

    try {
      const { toolContainer, endEffectorCalculator } = toolData;
      
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

      // Update stored transforms
      toolData.transforms = { ...transforms };

      // Force matrix update
      toolContainer.updateMatrix();
      toolContainer.updateMatrixWorld(true);

      // SMART RECALCULATION: Update end effector point after transform
      let newEndEffectorPoint = null;
      if (endEffectorCalculator) {
        newEndEffectorPoint = endEffectorCalculator.recalculate();
        console.log(`Recalculated end effector point: (${newEndEffectorPoint.x.toFixed(3)}, ${newEndEffectorPoint.y.toFixed(3)}, ${newEndEffectorPoint.z.toFixed(3)})`);
      }

      console.log(`Applied transforms to tool for robot ${robotId}:`, transforms);

      // Emit transform update event with new end effector point
      EventBus.emit('tcp:tool-transformed', {
        robotId,
        toolId: toolData.toolId,
        transforms,
        endEffectorPoint: newEndEffectorPoint ? {
          x: newEndEffectorPoint.x,
          y: newEndEffectorPoint.y,
          z: newEndEffectorPoint.z
        } : null
      });

      // Also emit specific end effector update event
      if (newEndEffectorPoint) {
        EventBus.emit('tcp:endeffector-updated', {
          robotId,
          toolId: toolData.toolId,
          endEffectorPoint: {
            x: newEndEffectorPoint.x,
            y: newEndEffectorPoint.y,
            z: newEndEffectorPoint.z
          }
        });
      }

    } catch (error) {
      console.error('Error applying tool transforms:', error);
    }
  }

  /**
   * Get current tool transforms
   */
  getToolTransform(robotId) {
    const toolData = this.attachedTools.get(robotId);
    if (!toolData) return null;

    return { ...toolData.transforms };
  }

  /**
   * Load URDF-based tool
   */
  async loadUrdfTool(tool) {
    console.log('Loading URDF tool:', tool);
    
    return new Promise((resolve, reject) => {
      const urdfPath = `${tool.path}/${tool.urdfFile}`;
      
      console.log('URDF path:', urdfPath);
      
      // Configure loader for this tool
      this.urdfLoader.resetLoader();
      this.urdfLoader.packages = tool.path;
      this.urdfLoader.currentRobotName = tool.id;
      
      // Set up mesh loading callback
      this.urdfLoader.loadMeshCb = (path, manager, done, material) => {
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
      
      this.urdfLoader.load(urdfPath, resolve, null, reject);
    });
  }

  /**
   * Load multi-mesh tool
   */
  async loadMultiMeshTool(tool) {
    console.log('Loading multi-mesh tool:', tool);
    
    const group = new THREE.Group();
    group.name = tool.id;
    
    // Load all mesh files
    for (const meshFile of tool.meshFiles) {
      try {
        const meshPath = `${tool.path}/${meshFile}`;
        console.log('Loading mesh file:', meshPath);
        
        const mesh = await this.loadSingleMesh(meshPath);
        if (mesh) {
          group.add(mesh);
        }
      } catch (error) {
        console.warn(`Failed to load mesh ${meshFile}:`, error);
      }
    }
    
    console.log(`Loaded ${group.children.length} meshes for multi-mesh tool`);
    return group.children.length > 0 ? group : null;
  }

  /**
   * Load single mesh tool
   */
  async loadSingleMeshTool(tool) {
    console.log('Loading single mesh tool:', tool);
    
    const meshPath = tool.fileName ? 
      `${tool.path}/${tool.fileName}` : 
      tool.path;
    
    console.log('Mesh path:', meshPath);
    return await this.loadSingleMesh(meshPath);
  }

  /**
   * Load a single mesh file
   */
  async loadSingleMesh(meshPath) {
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
  }

  /**
   * Find robot end effector
   */
  findEndEffector(robot) {
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
  }

  /**
   * Attach tool to end effector
   */
  attachToEndEffector(endEffector, toolObject) {
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
  }

  /**
   * Remove tool from robot
   */
  async removeTool(robotId) {
    const toolData = this.attachedTools.get(robotId);
    if (!toolData) return;
    
    console.log(`Removing tool from robot ${robotId}`);
    
    // Remove from end effector
    const { endEffector, toolContainer } = toolData;
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
    
    // Remove end effector calculator
    this.endEffectorCalculators.delete(robotId);
    
    // Remove from tracking
    this.attachedTools.delete(robotId);
    
    // Calculate and emit robot's default end effector position
    const robotEndEffectorPos = this.calculateRobotEndEffectorPosition(robotId);
    
    // Emit events
    EventBus.emit('tcp:tool-removed', {
      robotId,
      toolId: toolData.toolId
    });
    
    // Emit robot end effector position
    EventBus.emit('tcp:endeffector-updated', {
      robotId,
      endEffectorPoint: robotEndEffectorPos,
      hasTCP: false
    });
  }

  /**
   * Set tool visibility
   */
  setToolVisibility(robotId, visible) {
    const toolData = this.attachedTools.get(robotId);
    if (!toolData || !toolData.toolContainer) return;
    
    toolData.toolContainer.visible = visible;
    console.log(`Tool visibility set to ${visible} for robot ${robotId}`);
  }

  /**
   * Get current tool for robot
   */
  getCurrentTool(robotId) {
    return this.attachedTools.get(robotId);
  }

  /**
   * Clean up resources
   */
  dispose() {
    // Remove all tools
    for (const [robotId] of this.attachedTools) {
      this.removeTool(robotId);
    }
    
    this.attachedTools.clear();
    this.endEffectorCalculators.clear();
    this.availableTools = [];
    this.sceneSetup = null;
    this.robotManager = null;
    this.urdfLoader = null;
  }
}

export const TCPProvider = ({ children }) => {
  const { isViewerReady, getSceneSetup, getRobotManager } = useViewer();
  const { loadedRobots } = useRobot();
  
  // State
  const [availableTools, setAvailableTools] = useState([]);
  const [attachedTools, setAttachedTools] = useState(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  
  // TCP Manager instance
  const tcpManagerRef = useRef(null);
  
  // Initialize TCP Manager
  useEffect(() => {
    if (isViewerReady && loadedRobots.size > 0) {
      const sceneSetup = getSceneSetup();
      const robotManager = getRobotManager();
      
      if (sceneSetup && robotManager) {
        try {
          if (!tcpManagerRef.current) {
            tcpManagerRef.current = new TCPManager();
          }
          
          tcpManagerRef.current.initialize(sceneSetup, robotManager);
          setIsInitialized(true);
          setError(null);
          
          // Load available tools
          loadAvailableTools();
          
          console.log('TCP Manager initialized successfully');
        } catch (err) {
          console.error('TCP Manager initialization error:', err);
          setError(`Initialization failed: ${err.message}`);
        }
      }
    }
  }, [isViewerReady, loadedRobots, getSceneSetup, getRobotManager]);
  
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
      console.error('Error loading TCP tools:', err);
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
      
      // Update state
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
      
      // Update state
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
      
    } catch (err) {
      setError(`Error setting visibility: ${err.message}`);
    }
  }, []);
  
  // Get current end effector point (TCP or robot default)
  const getCurrentEndEffectorPoint = useCallback((robotId) => {
    if (!tcpManagerRef.current) return null;
    return tcpManagerRef.current.getCurrentEndEffectorPoint(robotId);
  }, []);
  
  // Force recalculate end effector (TCP or robot default)
  const recalculateEndEffector = useCallback((robotId) => {
    if (!tcpManagerRef.current) return null;
    return tcpManagerRef.current.recalculateEndEffector(robotId);
  }, []);
  
  // Get robot's default end effector position (when no TCP)
  const getRobotEndEffectorPosition = useCallback((robotId) => {
    if (!tcpManagerRef.current) return { x: 0, y: 0, z: 0 };
    return tcpManagerRef.current.calculateRobotEndEffectorPosition(robotId);
  }, []);
  
  // Check if robot has TCP tool attached
  const hasToolAttached = useCallback((robotId) => {
    return attachedTools.has(robotId);
  }, [attachedTools]);
  
  // Get tool info
  const getToolInfo = useCallback((robotId) => {
    return attachedTools.get(robotId) || null;
  }, [attachedTools]);
  
  // Cleanup on unmount
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
    
    // Methods
    loadAvailableTools,
    attachTool,
    removeTool,
    setToolTransform,
    setToolVisibility,
    getToolInfo,
    
    // Smart End Effector Methods (works with or without TCP)
    getCurrentEndEffectorPoint,
    recalculateEndEffector,
    getRobotEndEffectorPosition,
    hasToolAttached,
    
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