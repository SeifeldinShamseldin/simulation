import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useRobotContext } from './RobotContext';
import MeshLoader from '../core/Loader/MeshLoader';
import URDFLoader from '../core/Loader/URDFLoader';
import EventBus from '../utils/EventBus';
import { RobotEvents, TCPEvents } from './dataTransfer';

const TCPContext = createContext(null);

export const TCPProvider = ({ children }) => {
  // ========== ROBOT ACCESS (THE ONE WAY) ==========
  const { getRobot } = useRobotContext();
  
  // ========== STATE ==========
  const [tcps] = useState(new Map()); // robotId -> tcp object
  const [availableTools, setAvailableTools] = useState([]); // Tools scanned from server
  const [pendingOperations] = useState(new Map()); // robotId -> operation type
  const loaderRef = useRef(null);
  
  // Initialize loader
  if (!loaderRef.current) {
    loaderRef.current = new URDFLoader(new THREE.LoadingManager());
    loaderRef.current.parseVisual = true;
    loaderRef.current.parseCollision = false;
  }
  
  // ========== ROBOT ACCESS HELPER ==========
  const accessRobot = useCallback((robotId) => {
    const robot = getRobot(robotId);
    if (!robot) {
      console.warn(`[AddTCP] Robot ${robotId} not found`);
      return null;
    }
    return robot;
  }, [getRobot]);
  
  // ========== KINEMATIC HELPERS ==========
  const findEndEffectorLink = useCallback((robot) => {
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
  }, []);
  
  // ========== LOAD FUNCTIONS ==========
  const loadMeshTCP = useCallback(async (path) => {
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
  }, []);
  
  const loadURDFTCP = useCallback(async (path) => {
    return new Promise((resolve, reject) => {
      loaderRef.current.load(path, (robot) => {
        resolve(robot);
      }, null, (err) => {
        console.error('[AddTCP] Error loading URDF:', err);
        reject(err);
      });
    });
  }, []);
  
  const loadURDFTool = useCallback(async (tool) => {
    return new Promise((resolve, reject) => {
      const urdfPath = `${tool.path}/${tool.urdfFile}`;
      
      // Reset loader for new robot
      if (loaderRef.current.resetLoader) {
        loaderRef.current.resetLoader();
      }
      
      // Set package path for mesh resolution
      loaderRef.current.packages = tool.path;
      
      // Custom mesh loader callback
      loaderRef.current.loadMeshCb = (path, manager, done) => {
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
      
      loaderRef.current.load(urdfPath, resolve, null, reject);
    });
  }, []);
  
  const loadMultiMeshTool = useCallback(async (tool) => {
    const group = new THREE.Group();
    group.name = tool.id;
    
    for (const meshFile of tool.meshFiles) {
      try {
        const meshPath = `${tool.path}/${meshFile}`;
        const mesh = await loadMeshTCP(meshPath);
        if (mesh) {
          group.add(mesh);
        }
      } catch (error) {
        console.warn(`[AddTCP] Failed to load mesh ${meshFile}:`, error);
      }
    }
    
    return group.children.length > 0 ? group : null;
  }, [loadMeshTCP]);
  
  const loadSingleMeshTool = useCallback(async (tool) => {
    const meshPath = tool.fileName ? `${tool.path}/${tool.fileName}` : tool.path;
    return await loadMeshTCP(meshPath);
  }, [loadMeshTCP]);
  
  // ========== EVENT HANDLERS ==========
  const handleMountStatus = useCallback(({ robotId, status }) => {
    if (status === 'Done' && pendingOperations.get(robotId) === 'mount') {
      console.log(`[AddTCP] Mount operation complete for robot ${robotId}`);
      pendingOperations.delete(robotId);
    }
  }, [pendingOperations]);
  
  const handleUnmountStatus = useCallback(({ robotId, status }) => {
    if (status === 'Done' && pendingOperations.get(robotId) === 'unmount') {
      console.log(`[AddTCP] Unmount operation complete for robot ${robotId}`);
      pendingOperations.delete(robotId);
    }
  }, [pendingOperations]);
  
  const handleRobotUnloaded = useCallback(({ robotId }) => {
    tcps.delete(robotId);
    pendingOperations.delete(robotId);
  }, [tcps, pendingOperations]);
  
  // ========== PUBLIC API ==========
  const scanAvailableTools = useCallback(async () => {
    try {
      const response = await fetch('/api/tcp/scan');
      const data = await response.json();
      
      if (data.success) {
        setAvailableTools(data.tools || []);
        return data.tools || [];
      } else {
        console.error('[AddTCP] Failed to scan tools:', data.message);
        return [];
      }
    } catch (error) {
      console.error('[AddTCP] Error scanning TCP tools:', error);
      return [];
    }
  }, []);
  
  const getAvailableTools = useCallback(() => {
    return availableTools;
  }, [availableTools]);
  
  const removeTCP = useCallback((robotId, robot) => {
    const tcpData = tcps.get(robotId);
    if (!tcpData) return;

    // Check if already processing
    if (pendingOperations.has(robotId)) {
      console.warn(`[AddTCP] Operation already in progress for robot ${robotId}`);
      return;
    }
    
    // Mark operation as pending
    pendingOperations.set(robotId, 'unmount');

    // Remove from parent
    if (tcpData.parentLink && tcpData.link) {
      tcpData.parentLink.remove(tcpData.link);
    }

    // Clear from map
    tcps.delete(robotId);

    console.log(`[AddTCP] TCP removed from robot ${robotId}`);
    
    // Emit global TCP unmount event
    EventBus.emit(TCPEvents.UNMOUNT, {
      robotId,
      timestamp: Date.now()
    });
    
    // EndEffector will send status back when done
  }, [tcps, pendingOperations]);
  
  const addTCPById = useCallback(async (robotId, toolId) => {
    // Check if already processing
    if (pendingOperations.has(robotId)) {
      console.warn(`[AddTCP] Operation already in progress for robot ${robotId}`);
      return;
    }
    
    // Find tool in available tools
    const tool = availableTools.find(t => t.id === toolId);
    if (!tool) {
      console.error(`[AddTCP] Tool ${toolId} not found`);
      return;
    }

    // Get robot using context
    const robot = accessRobot(robotId);
    if (!robot) {
      console.error(`[AddTCP] Robot ${robotId} not found`);
      return;
    }

    // Mark operation as pending
    pendingOperations.set(robotId, 'mount');

    // Remove existing TCP if any
    removeTCP(robotId, robot);

    // Find end effector (last link) using proper kinematic chain analysis
    const endEffectorLink = findEndEffectorLink(robot);
    
    if (!endEffectorLink) {
      console.error('[AddTCP] No end effector link found in robot');
      pendingOperations.delete(robotId);
      return;
    }

    // Load TCP based on tool type
    let tcpObject;
    
    try {
      switch (tool.type) {
        case 'URDF Package':
          tcpObject = await loadURDFTool(tool);
          break;
        case 'Multi-Mesh':
          tcpObject = await loadMultiMeshTool(tool);
          break;
        case 'Single Mesh':
        default:
          tcpObject = await loadSingleMeshTool(tool);
          break;
      }
    } catch (error) {
      console.error('[AddTCP] Error loading tool:', error);
      pendingOperations.delete(robotId);
      return;
    }

    if (!tcpObject) {
      console.error('[AddTCP] Failed to load TCP object');
      pendingOperations.delete(robotId);
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
    tcps.set(robotId, {
      link: tcpLink,
      object: tcpObject,
      parentLink: endEffectorLink,
      tool: tool
    });

    console.log(`[AddTCP] TCP '${tool.name}' added to robot ${robotId}`);
    
    // Emit global TCP mount event
    EventBus.emit(TCPEvents.MOUNT, {
      robotId,
      toolId,
      toolName: tool.name,
      timestamp: Date.now()
    });
    
    // EndEffector will send status back when done
  }, [pendingOperations, availableTools, accessRobot, removeTCP, findEndEffectorLink, loadURDFTool, loadMultiMeshTool, loadSingleMeshTool, tcps]);
  
  const addTCP = useCallback(async (robotId, robot, tcpPath, tcpType = 'stl') => {
    // Check if already processing
    if (pendingOperations.has(robotId)) {
      console.warn(`[AddTCP] Operation already in progress for robot ${robotId}`);
      return;
    }
    
    // Mark operation as pending
    pendingOperations.set(robotId, 'mount');

    // Remove existing TCP if any
    removeTCP(robotId, robot);

    // Find end effector (last link) using proper kinematic chain analysis
    const endEffectorLink = findEndEffectorLink(robot);
    
    if (!endEffectorLink) {
      console.error('[AddTCP] No end effector link found in robot');
      pendingOperations.delete(robotId);
      return;
    }

    // Load TCP based on type
    let tcpObject;
    if (tcpType === 'urdf') {
      tcpObject = await loadURDFTCP(tcpPath);
    } else {
      tcpObject = await loadMeshTCP(tcpPath);
    }

    if (!tcpObject) {
      console.error('[AddTCP] Failed to load TCP');
      pendingOperations.delete(robotId);
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
    tcps.set(robotId, {
      link: tcpLink,
      object: tcpObject,
      parentLink: endEffectorLink
    });

    console.log(`[AddTCP] TCP added to robot ${robotId}`);
    
    // Emit global TCP mount event
    EventBus.emit(TCPEvents.MOUNT, {
      robotId,
      tcpPath,
      tcpType,
      timestamp: Date.now()
    });
    
    // EndEffector will send status back when done
  }, [pendingOperations, removeTCP, findEndEffectorLink, loadURDFTCP, loadMeshTCP, tcps]);
  
  const getTCP = useCallback((robotId) => {
    return tcps.get(robotId);
  }, [tcps]);
  
  const setTCPVisibility = useCallback((robotId, visible) => {
    const tcpData = tcps.get(robotId);
    if (tcpData && tcpData.link) {
      tcpData.link.visible = visible;
    }
  }, [tcps]);
  
  const setTCPTransform = useCallback((robotId, position, rotation, scale) => {
    const tcpData = tcps.get(robotId);
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
  }, [tcps]);
  
  const getTCPWorldPosition = useCallback((robotId) => {
    const tcpData = tcps.get(robotId);
    if (!tcpData || !tcpData.link) return null;

    const worldPos = new THREE.Vector3();
    tcpData.link.getWorldPosition(worldPos);
    return { x: worldPos.x, y: worldPos.y, z: worldPos.z };
  }, [tcps]);
  
  const getTCPWorldOrientation = useCallback((robotId) => {
    const tcpData = tcps.get(robotId);
    if (!tcpData || !tcpData.link) return null;

    const worldQuat = new THREE.Quaternion();
    tcpData.link.getWorldQuaternion(worldQuat);
    return { x: worldQuat.x, y: worldQuat.y, z: worldQuat.z, w: worldQuat.w };
  }, [tcps]);
  
  const getAttachedTool = useCallback((robotId) => {
    const tcpData = tcps.get(robotId);
    if (!tcpData) return null;
    
    return {
      toolId: tcpData.tool?.id,
      toolName: tcpData.tool?.name,
      toolType: tcpData.tool?.type,
      position: getTCPWorldPosition(robotId),
      orientation: getTCPWorldOrientation(robotId)
    };
  }, [tcps, getTCPWorldPosition, getTCPWorldOrientation]);
  
  const hasTCP = useCallback((robotId) => {
    return tcps.has(robotId);
  }, [tcps]);
  
  // ========== EFFECTS ==========
  useEffect(() => {
    // Listen for status events
    const unsubscribeMountStatus = EventBus.on(TCPEvents.MOUNT_STATUS, handleMountStatus);
    const unsubscribeUnmountStatus = EventBus.on(TCPEvents.UNMOUNT_STATUS, handleUnmountStatus);
    const unsubscribeRobotUnloaded = EventBus.on(RobotEvents.UNLOADED, handleRobotUnloaded);
    
    return () => {
      unsubscribeMountStatus();
      unsubscribeUnmountStatus();
      unsubscribeRobotUnloaded();
    };
  }, [handleMountStatus, handleUnmountStatus, handleRobotUnloaded]);
  
  const value = {
    // Tool scanning
    scanAvailableTools,
    getAvailableTools,
    
    // TCP operations
    addTCPById,
    addTCP,
    removeTCP,
    getTCP,
    hasTCP,
    
    // TCP manipulation
    setTCPVisibility,
    setTCPTransform,
    getTCPWorldPosition,
    getTCPWorldOrientation,
    getAttachedTool
  };
  
  return (
    <TCPContext.Provider value={value}>
      {children}
    </TCPContext.Provider>
  );
};

export const useTCP = () => {
  const context = useContext(TCPContext);
  if (!context) {
    throw new Error('useTCP must be used within TCPProvider');
  }
  return context;
};