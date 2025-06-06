import * as THREE from 'three';
import URDFLoader from '../../../core/Loader/URDFLoader';
import MeshLoader from '../../../core/Loader/MeshLoader';
import EventBus from '../../../utils/EventBus';

class TCPManager {
  constructor() {
    this.sceneSetup = null;
    this.robotManager = null;
    this.attachedTools = new Map(); // robotId -> tool data
    this.availableTools = [];
    this.urdfLoader = null;
  }

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

      console.log(`Tool ${toolId} attached to robot ${robotId}`);

      // Emit event
      EventBus.emit('tcp:tool-attached', {
        robotId,
        toolId,
        toolName: tool.name
      });

      return true;
    } catch (error) {
      console.error('Error attaching tool:', error);
      throw error;
    }
  }

  /**
   * Set tool transform (position, rotation, scale)
   */
  setToolTransform(robotId, transforms) {
    const toolData = this.attachedTools.get(robotId);
    if (!toolData || !toolData.toolContainer) {
      console.warn(`No tool found for robot ${robotId}`);
      return;
    }

    try {
      const { toolContainer } = toolData;
      
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

      console.log(`Applied transforms to tool for robot ${robotId}:`, transforms);

      // Emit transform update event
      EventBus.emit('tcp:tool-transformed', {
        robotId,
        toolId: toolData.toolId,
        transforms
      });

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
    
    // Remove from tracking
    this.attachedTools.delete(robotId);
    
    // Emit event
    EventBus.emit('tcp:tool-removed', {
      robotId,
      toolId: toolData.toolId
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
    this.availableTools = [];
    this.sceneSetup = null;
    this.robotManager = null;
    this.urdfLoader = null;
  }
}

export default TCPManager; 