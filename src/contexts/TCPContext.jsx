import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { useViewer } from './ViewerContext';
import { useRobot } from './hooks/useRobot';
import URDFLoader from '../core/Loader/URDFLoader';
import MeshLoader from '../core/Loader/MeshLoader';
import EventBus from '../utils/EventBus';

const TCPContext = createContext(null);

class SimpleTCPManager {
  constructor() {
    this.sceneSetup = null;
    this.attachedTools = new Map(); // robotId -> { toolObject, toolContainer, tipOffset }
    this.availableTools = [];
    this.urdfLoader = null;
    this.getRobot = null; // Will be set by setRobotGetter
  }

  setRobotGetter(getter) {
    this.getRobot = getter;
  }

  /**
   * Calculate normal robot end effector position and orientation (base calculation)
   */
  calculateRobotEndEffector(robotId) {
    console.log(`[TCP Context] calculateRobotEndEffector for ${robotId}`);
    
    if (!this.getRobot) {
      console.warn('[TCP Context] Robot getter not set');
      return { 
        position: { x: 0, y: 0, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 }
      };
    }

    const robot = this.getRobot(robotId);
    if (!robot) {
      console.warn(`[TCP Context] Robot ${robotId} not found`);
      return { 
        position: { x: 0, y: 0, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 }
      };
    }

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
      let maxDepth = -1;
      let deepestLink = null;
      
      const findDeepestLink = (link, depth = 0) => {
        if (depth > maxDepth) {
          maxDepth = depth;
          deepestLink = link;
        }
        
        if (link.children) {
          for (const child of link.children) {
            if (child.isURDFLink) {
              findDeepestLink(child, depth + 1);
            }
          }
        }
      };
      
      if (robot.links) {
        for (const link of Object.values(robot.links)) {
          findDeepestLink(link);
        }
      }
      
      endEffectorLink = deepestLink;
    }
    
    if (!endEffectorLink) {
      console.warn(`[TCP Context] Could not find end effector link for ${robotId}`);
      return {
        position: { x: 0, y: 0, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 }
      };
    }
    
    // Get world position and orientation
    const worldPosition = new THREE.Vector3();
    const worldQuaternion = new THREE.Quaternion();
    
    endEffectorLink.getWorldPosition(worldPosition);
    endEffectorLink.getWorldQuaternion(worldQuaternion);
    
    return {
      position: {
        x: worldPosition.x,
        y: worldPosition.y,
        z: worldPosition.z
      },
      orientation: {
        x: worldQuaternion.x,
        y: worldQuaternion.y,
        z: worldQuaternion.z,
        w: worldQuaternion.w
      }
    };
  }

  initialize(sceneSetup) {
    this.sceneSetup = sceneSetup;
    
    // Initialize URDF loader
    if (!this.urdfLoader) {
      this.urdfLoader = new URDFLoader(new THREE.LoadingManager());
      this.urdfLoader.parseVisual = true;
      this.urdfLoader.parseCollision = false;
    }
    
    console.log('[TCP Context] TCP Manager initialized');
  }

  async scanAvailableTools() {
    try {
      const response = await fetch('/api/tcp/scan');
      const result = await response.json();
      
      if (result.success) {
        this.availableTools = result.tools || [];
        return this.availableTools;
      } else {
        throw new Error(result.message || 'Failed to scan TCP tools');
      }
    } catch (err) {
      console.error('[TCP Context] Error scanning tools:', err);
      throw err;
    }
  }

  recalculateEndEffector(robotId) {
    const toolData = this.attachedTools.get(robotId);
    if (!toolData) return;
    
    const { toolObject, toolContainer, tipOffset } = toolData;
    
    // Get base end effector position
    const baseEE = this.calculateRobotEndEffector(robotId);
    
    // Apply tool offset
    const offset = new THREE.Vector3(
      tipOffset.x || 0,
      tipOffset.y || 0,
      tipOffset.z || 0
    );
    
    // Update tool position
    if (toolContainer) {
      toolContainer.position.set(
        baseEE.position.x + offset.x,
        baseEE.position.y + offset.y,
        baseEE.position.z + offset.z
      );
      
      toolContainer.quaternion.set(
        baseEE.orientation.x,
        baseEE.orientation.y,
        baseEE.orientation.z,
        baseEE.orientation.w
      );
    }
    
    // Emit update event
    EventBus.emit('tcp:position-updated', {
      robotId,
      position: {
        x: baseEE.position.x + offset.x,
        y: baseEE.position.y + offset.y,
        z: baseEE.position.z + offset.z
      },
      orientation: baseEE.orientation
    });
  }
}

export const TCPProvider = ({ children }) => {
  const { isViewerReady, getSceneSetup } = useViewer();
  const { get3DRobot } = useRobot();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const tcpManagerRef = useRef(null);
  
  // Initialize TCP manager
  useEffect(() => {
    if (isViewerReady) {
      const sceneSetup = getSceneSetup();
      if (!sceneSetup) {
        console.error('[TCPContext] Scene not properly initialized');
        return;
      }
      
      // Create TCP manager
      tcpManagerRef.current = new SimpleTCPManager();
      tcpManagerRef.current.sceneSetup = sceneSetup;
      
      // Set robot getter
      tcpManagerRef.current.setRobotGetter(get3DRobot);
      
      // Initialize URDF loader
      if (!tcpManagerRef.current.urdfLoader) {
        tcpManagerRef.current.urdfLoader = new URDFLoader(new THREE.LoadingManager());
        tcpManagerRef.current.urdfLoader.parseVisual = true;
        tcpManagerRef.current.urdfLoader.parseCollision = false;
      }
      
      console.log('[TCPContext] TCP Manager initialized');
    }
  }, [isViewerReady, getSceneSetup, get3DRobot]);

  // State
  const [isInitialized, setIsInitialized] = useState(false);
  const [availableTools, setAvailableTools] = useState([]);
  const [attachedTools, setAttachedTools] = useState(new Map());

  // Listen for joint changes to recalculate end effector
  useEffect(() => {
    if (!isInitialized || !tcpManagerRef.current) return;

    const handleJointChanged = (data) => {
      if (data.robotName && tcpManagerRef.current) {
        tcpManagerRef.current.recalculateEndEffector(data.robotName);
      }
    };

    const handleJointsChanged = (data) => {
      if (data.robotName && tcpManagerRef.current) {
        tcpManagerRef.current.recalculateEndEffector(data.robotName);
      }
    };

    const handleForceRecalculate = (data) => {
      if (data.robotId && tcpManagerRef.current) {
        tcpManagerRef.current.recalculateEndEffector(data.robotId);
      }
    };

    const unsubscribeJoint = EventBus.on('robot:joint-changed', handleJointChanged);
    const unsubscribeJoints = EventBus.on('robot:joints-changed', handleJointsChanged);
    const unsubscribeForce = EventBus.on('tcp:force-recalculate', handleForceRecalculate);

    return () => {
      unsubscribeJoint();
      unsubscribeJoints();
      unsubscribeForce();
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
    if (!tcpManagerRef.current || !isInitialized) {
      throw new Error('TCP Manager not initialized');
    }
    
    try {
      setIsLoading(true);
      setError(null);
      
      // Get tool data
      const tool = availableTools.find(t => t.id === toolId);
      if (!tool) {
        throw new Error(`Tool ${toolId} not found`);
      }
      
      // Load tool model
      const toolObject = await tcpManagerRef.current.urdfLoader.load(tool.modelPath);
      
      // Create container for tool
      const toolContainer = new THREE.Group();
      toolContainer.add(toolObject);
      
      // Add to scene
      if (tcpManagerRef.current.sceneSetup) {
        tcpManagerRef.current.sceneSetup.scene.add(toolContainer);
      }
      
      // Store tool data
      const toolData = {
        toolObject,
        toolContainer,
        tipOffset: tool.tipOffset || { x: 0, y: 0, z: 0 }
      };
      
      setAttachedTools(prev => {
        const newMap = new Map(prev);
        newMap.set(robotId, toolData);
        return newMap;
      });
      
      // Recalculate position
      tcpManagerRef.current.recalculateEndEffector(robotId);
      
      return toolData;
    } catch (err) {
      setError(`Failed to attach tool: ${err.message}`);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [availableTools, isInitialized]);

  // Detach tool
  const detachTool = useCallback((robotId) => {
    if (!tcpManagerRef.current || !isInitialized) {
      throw new Error('TCP Manager not initialized');
    }
    
    const toolData = attachedTools.get(robotId);
    if (!toolData) return;
    
    // Remove from scene
    if (toolData.toolContainer && tcpManagerRef.current.sceneSetup) {
      tcpManagerRef.current.sceneSetup.scene.remove(toolData.toolContainer);
    }
    
    // Remove from state
    setAttachedTools(prev => {
      const newMap = new Map(prev);
      newMap.delete(robotId);
      return newMap;
    });
  }, [attachedTools, isInitialized]);

  // Get current end effector position
  const getEndEffectorPosition = useCallback((robotId) => {
    if (!tcpManagerRef.current || !isInitialized) {
      return { x: 0, y: 0, z: 0 };
    }
    
    return tcpManagerRef.current.calculateRobotEndEffector(robotId);
  }, [isInitialized]);

  const value = {
    // State
    isInitialized,
    availableTools,
    attachedTools,
    isLoading,
    error,
    successMessage,
    
    // Operations
    loadAvailableTools,
    attachTool,
    detachTool,
    getEndEffectorPosition
  };

  return (
    <TCPContext.Provider value={value}>
      {children}
    </TCPContext.Provider>
  );
};

export default TCPContext;