import * as THREE from 'three';
import MeshLoader from '../core/Loader/MeshLoader';
import URDFLoader from '../core/Loader/URDFLoader';
import { getRobotGlobal } from '../contexts/RobotContext';

class AddTCP {
  constructor() {
    this.tcps = new Map(); // robotId -> tcp object
    this.availableTools = []; // Tools scanned from server
    this.loader = new URDFLoader(new THREE.LoadingManager());
    this.loader.parseVisual = true;
    this.loader.parseCollision = false;
  }

  /**
   * Find the end effector link in the robot's kinematic chain
   * @param {Object} robot - Robot object
   * @returns {Object|null} End effector link or null
   */
  findEndEffectorLink(robot) {
    const links = [];
    const joints = [];
    
    // Collect all links and joints
    robot.traverse((child) => {
      if (child.isURDFLink) {
        links.push(child);
      } else if (child.isURDFJoint) {
        joints.push(child);
      }
    });
    
    if (links.length === 0) {
      console.warn('[AddTCP] No URDF links found in robot');
      return null;
    }
    
    // Build parent-child relationships through joints
    const linkChildren = new Map();
    
    joints.forEach(joint => {
      // Find parent and child links of this joint
      let parentLink = null;
      let childLink = null;
      
      // Look at joint's parent property
      if (joint.parent && joint.parent.isURDFLink) {
        parentLink = joint.parent;
      }
      
      // Look for child link
      joint.traverse((child) => {
        if (child.isURDFLink && child !== joint && !parentLink) {
          parentLink = child;
        } else if (child.isURDFLink && child !== joint && child !== parentLink) {
          childLink = child;
        }
      });
      
      // Map parent to children
      if (parentLink && childLink) {
        if (!linkChildren.has(parentLink)) {
          linkChildren.set(parentLink, []);
        }
        linkChildren.get(parentLink).push(childLink);
      }
    });
    
    // Find leaf links (links with no children)
    const leafLinks = links.filter(link => {
      const children = linkChildren.get(link) || [];
      return children.length === 0;
    });
    
    if (leafLinks.length > 0) {
      // If there's a TCP already attached, find the link before it
      const tcpLink = leafLinks.find(link => link.name === 'tcp');
      if (tcpLink && tcpLink.parent && tcpLink.parent.isURDFLink) {
        return tcpLink.parent;
      }
      
      // Otherwise return the first leaf link (end effector)
      return leafLinks[0];
    }
    
    // Fallback: find the deepest link in the chain
    const baseLink = links.find(link => {
      // Base link is one that no other link has as a child
      return !Array.from(linkChildren.values()).flat().includes(link);
    });
    
    if (baseLink) {
      let endEffector = baseLink;
      let maxDepth = 0;
      
      const findDeepestLink = (link, depth = 0) => {
        if (depth > maxDepth) {
          maxDepth = depth;
          endEffector = link;
        }
        
        const children = linkChildren.get(link) || [];
        children.forEach(child => {
          findDeepestLink(child, depth + 1);
        });
      };
      
      findDeepestLink(baseLink);
      return endEffector;
    }
    
    // Last resort: return the last link in the list
    return links[links.length - 1];
  }

  /**
   * Scan available TCP tools from server
   * @returns {Promise<Array>} Array of available tools
   */
  async scanAvailableTools() {
    try {
      const response = await fetch('/api/tcp/scan');
      const data = await response.json();
      
      if (data.success) {
        this.availableTools = data.tools || [];
        console.log(`[AddTCP] Found ${this.availableTools.length} TCP tools`);
        return this.availableTools;
      } else {
        console.error('[AddTCP] Failed to scan tools:', data.message);
        return [];
      }
    } catch (error) {
      console.error('[AddTCP] Error scanning TCP tools:', error);
      return [];
    }
  }

  /**
   * Get available tools (cached)
   * @returns {Array} Available tools
   */
  getAvailableTools() {
    return this.availableTools;
  }

  /**
   * Add TCP to robot by tool ID
   * @param {string} robotId - Robot ID
   * @param {string} toolId - Tool ID from available tools
   */
  async addTCPById(robotId, toolId) {
    // Find tool in available tools
    const tool = this.availableTools.find(t => t.id === toolId);
    if (!tool) {
      console.error(`[AddTCP] Tool ${toolId} not found`);
      return;
    }

    // Get robot using global function
    const robot = getRobotGlobal(robotId);
    if (!robot) {
      console.error(`[AddTCP] Robot ${robotId} not found`);
      return;
    }

    // Remove existing TCP if any
    this.removeTCP(robotId, robot);

    // Find end effector (last link) using proper kinematic chain analysis
    const endEffectorLink = this.findEndEffectorLink(robot);
    
    if (!endEffectorLink) {
      console.error('[AddTCP] No end effector link found in robot');
      return;
    }

    // Load TCP based on tool type
    let tcpObject;
    
    try {
      switch (tool.type) {
        case 'URDF Package':
          tcpObject = await this.loadURDFTool(tool);
          break;
        case 'Multi-Mesh':
          tcpObject = await this.loadMultiMeshTool(tool);
          break;
        case 'Single Mesh':
        default:
          tcpObject = await this.loadSingleMeshTool(tool);
          break;
      }
    } catch (error) {
      console.error('[AddTCP] Error loading tool:', error);
      return;
    }

    if (!tcpObject) {
      console.error('[AddTCP] Failed to load TCP object');
      return;
    }

    // Create TCP link
    const tcpLink = new THREE.Group();
    tcpLink.name = 'tcp';
    tcpLink.isURDFLink = true; // Mark as URDF link for compatibility
    tcpLink.add(tcpObject);

    // Add TCP to end effector link
    endEffectorLink.add(tcpLink);

    // Store reference
    this.tcps.set(robotId, {
      link: tcpLink,
      object: tcpObject,
      parentLink: endEffectorLink,
      tool: tool
    });

    console.log(`[AddTCP] TCP '${tool.name}' added to robot ${robotId}`);
  }

  /**
   * Add TCP to robot (direct path method for backward compatibility)
   * @param {string} robotId - Robot ID
   * @param {Object} robot - Robot THREE.Object3D
   * @param {string} tcpPath - Path to TCP file (STL, URDF, etc.)
   * @param {string} tcpType - Type of TCP file ('stl', 'urdf', etc.)
   */
  async addTCP(robotId, robot, tcpPath, tcpType = 'stl') {
    // Remove existing TCP if any
    this.removeTCP(robotId, robot);

    // Find end effector (last link) using proper kinematic chain analysis
    const endEffectorLink = this.findEndEffectorLink(robot);
    
    if (!endEffectorLink) {
      console.error('[AddTCP] No end effector link found in robot');
      return;
    }

    // Load TCP based on type
    let tcpObject;
    if (tcpType === 'urdf') {
      tcpObject = await this.loadURDFTCP(tcpPath);
    } else {
      tcpObject = await this.loadMeshTCP(tcpPath);
    }

    if (!tcpObject) {
      console.error('[AddTCP] Failed to load TCP');
      return;
    }

    // Create TCP link
    const tcpLink = new THREE.Group();
    tcpLink.name = 'tcp';
    tcpLink.isURDFLink = true; // Mark as URDF link for compatibility
    tcpLink.add(tcpObject);

    // Add TCP to end effector link
    endEffectorLink.add(tcpLink);

    // Store reference
    this.tcps.set(robotId, {
      link: tcpLink,
      object: tcpObject,
      parentLink: endEffectorLink
    });

    console.log(`[AddTCP] TCP added to robot ${robotId}`);
  }

  /**
   * Load URDF-based tool
   */
  async loadURDFTool(tool) {
    return new Promise((resolve, reject) => {
      const urdfPath = `${tool.path}/${tool.urdfFile}`;
      
      // Reset loader for new robot
      if (this.loader.resetLoader) {
        this.loader.resetLoader();
      }
      
      // Set package path for mesh resolution
      this.loader.packages = tool.path;
      
      // Custom mesh loader callback
      this.loader.loadMeshCb = (path, manager, done) => {
        const filename = path.split('/').pop();
        const resolvedPath = `${tool.path}/${filename}`;
        
        MeshLoader.load(resolvedPath, manager, (obj, err) => {
          if (err) {
            console.warn(`[AddTCP] Error loading mesh ${filename}:`, err);
            done(null, err);
            return;
          }
          
          if (obj) {
            obj.traverse(child => {
              if (child instanceof THREE.Mesh) {
                if (!child.material || child.material.name === '' || child.material.name === 'default') {
                  child.material = new THREE.MeshPhongMaterial({ 
                    color: 0x888888,
                    metalness: 0.6,
                    roughness: 0.4
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
        });
      };
      
      this.loader.load(urdfPath, resolve, null, reject);
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
        const mesh = await this.loadMeshTCP(meshPath);
        if (mesh) {
          group.add(mesh);
        }
      } catch (error) {
        console.warn(`[AddTCP] Failed to load mesh ${meshFile}:`, error);
      }
    }
    
    return group.children.length > 0 ? group : null;
  }

  /**
   * Load single mesh tool
   */
  async loadSingleMeshTool(tool) {
    const meshPath = tool.fileName ? `${tool.path}/${tool.fileName}` : tool.path;
    return await this.loadMeshTCP(meshPath);
  }

  /**
   * Load mesh-based TCP (STL, DAE, etc.)
   */
  async loadMeshTCP(path) {
    return new Promise((resolve) => {
      MeshLoader.load(path, new THREE.LoadingManager(), (obj, err) => {
        if (err) {
          console.error('[AddTCP] Error loading mesh:', err);
          resolve(null);
          return;
        }

        // Apply material and settings
        obj.traverse(child => {
          if (child instanceof THREE.Mesh) {
            if (!child.material || child.material.name === '') {
              child.material = new THREE.MeshPhongMaterial({ 
                color: 0x888888,
                metalness: 0.6,
                roughness: 0.4
              });
            }
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        resolve(obj);
      });
    });
  }

  /**
   * Load URDF-based TCP
   */
  async loadURDFTCP(path) {
    return new Promise((resolve, reject) => {
      this.loader.load(path, (robot) => {
        resolve(robot);
      }, null, (err) => {
        console.error('[AddTCP] Error loading URDF:', err);
        reject(err);
      });
    });
  }

  /**
   * Remove TCP from robot
   */
  removeTCP(robotId, robot) {
    const tcpData = this.tcps.get(robotId);
    if (!tcpData) return;

    // Remove from parent
    if (tcpData.parentLink && tcpData.link) {
      tcpData.parentLink.remove(tcpData.link);
    }

    // Clear from map
    this.tcps.delete(robotId);

    console.log(`[AddTCP] TCP removed from robot ${robotId}`);
  }

  /**
   * Get TCP for robot
   */
  getTCP(robotId) {
    return this.tcps.get(robotId);
  }

  /**
   * Update TCP visibility
   */
  setTCPVisibility(robotId, visible) {
    const tcpData = this.tcps.get(robotId);
    if (tcpData && tcpData.link) {
      tcpData.link.visible = visible;
    }
  }

  /**
   * Update TCP transform
   */
  setTCPTransform(robotId, position, rotation, scale) {
    const tcpData = this.tcps.get(robotId);
    if (!tcpData || !tcpData.link) return;

    if (position) {
      tcpData.link.position.set(position.x, position.y, position.z);
    }
    if (rotation) {
      tcpData.link.rotation.set(rotation.x, rotation.y, rotation.z);
    }
    if (scale) {
      tcpData.link.scale.set(scale.x, scale.y, scale.z);
    }
  }

  /**
   * Get TCP world position
   */
  getTCPWorldPosition(robotId) {
    const tcpData = this.tcps.get(robotId);
    if (!tcpData || !tcpData.link) return null;

    const worldPos = new THREE.Vector3();
    tcpData.link.getWorldPosition(worldPos);
    return { x: worldPos.x, y: worldPos.y, z: worldPos.z };
  }

  /**
   * Get TCP world orientation
   */
  getTCPWorldOrientation(robotId) {
    const tcpData = this.tcps.get(robotId);
    if (!tcpData || !tcpData.link) return null;

    const worldQuat = new THREE.Quaternion();
    tcpData.link.getWorldQuaternion(worldQuat);
    return { x: worldQuat.x, y: worldQuat.y, z: worldQuat.z, w: worldQuat.w };
  }

  /**
   * Get attached tool info
   */
  getAttachedTool(robotId) {
    const tcpData = this.tcps.get(robotId);
    if (!tcpData) return null;
    
    return {
      toolId: tcpData.tool?.id,
      toolName: tcpData.tool?.name,
      toolType: tcpData.tool?.type,
      position: this.getTCPWorldPosition(robotId),
      orientation: this.getTCPWorldOrientation(robotId)
    };
  }

  /**
   * Check if robot has TCP attached
   */
  hasTCP(robotId) {
    return this.tcps.has(robotId);
  }
}

// Create singleton instance
const addTCP = new AddTCP();
export default addTCP;

// Usage example:
// import addTCP from './AddTCP';
// 
// // Scan available tools from server
// const tools = await addTCP.scanAvailableTools();
// console.log('Available tools:', tools);
// 
// // Add TCP by tool ID
// await addTCP.addTCPById('robot1', 'robotiq_robotiqarg2f85model');
// 
// // Or add TCP directly by path (backward compatibility)
// await addTCP.addTCP('robot1', robotObject, '/tcp/gripper.stl', 'stl');
// 
// // Get TCP position
// const pos = addTCP.getTCPWorldPosition('robot1');
// 
// // Update TCP transform
// addTCP.setTCPTransform('robot1', {x: 0, y: 0, z: 0.1}, null, null);
// 
// // Check if robot has TCP
// if (addTCP.hasTCP('robot1')) {
//   const toolInfo = addTCP.getAttachedTool('robot1');
//   console.log('Attached tool:', toolInfo);
// }
// 
// // Remove TCP
// addTCP.removeTCP('robot1', robotObject);