import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import * as THREE from 'three';
import { useRobotControl } from './hooks/useRobotControl';
import { useTCP } from './hooks/useTCP';
import EventBus from '../utils/EventBus';

const EndEffectorContext = createContext(null);

export const EndEffectorProvider = ({ children }) => {
  const { activeRobotId, robot, isReady, robotManager } = useRobotControl();
  const { currentTool, hasTool, toolTransforms } = useTCP();
  
  // State
  const [currentPosition, setCurrentPosition] = useState({ x: 0, y: 0, z: 0 });
  const [currentRotation, setCurrentRotation] = useState({ x: 0, y: 0, z: 0, w: 1 });
  const [isTracking, setIsTracking] = useState(false);
  const [endEffectorLink, setEndEffectorLink] = useState(null);
  const [effectiveEndEffector, setEffectiveEndEffector] = useState(null);
  
  // Refs for calculations
  const updateIntervalRef = useRef(null);
  const vectorsRef = useRef({
    worldPos: new THREE.Vector3(),
    worldQuat: new THREE.Quaternion(),
    tempMatrix: new THREE.Matrix4()
  });

  // Debug logging
  const debugLog = useCallback((message, data = null) => {
    console.log(`[EndEffector:${activeRobotId}] ${message}`, data);
  }, [activeRobotId]);

  // Find robot end effector
  const findRobotEndEffector = useCallback((robot) => {
    if (!robot) return null;
    
    debugLog('Finding robot end effector...');
    
    // Method 1: Look for common end effector names
    const endEffectorNames = [
      'end_effector', 'tool0', 'ee_link', 'gripper_link', 
      'link_6', 'link_7', 'wrist_3_link', 'tool_link',
      'flange', 'tool_flange'
    ];
    
    for (const name of endEffectorNames) {
      if (robot.links && robot.links[name]) {
        debugLog(`Found end effector by name: ${name}`);
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
        debugLog(`Found end effector as leaf link: ${endEffector.name}`);
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
      debugLog(`Found end effector as deepest link: ${deepestLink.name}`);
    }
    
    return deepestLink;
  }, [debugLog]);

  // Find TCP tool container and tip
  const findTCPInfo = useCallback((endEffectorLink) => {
    if (!endEffectorLink) return null;
    
    debugLog('Searching for TCP tool container...');
    debugLog('End effector link:', endEffectorLink.name);
    debugLog('End effector children count:', endEffectorLink.children.length);
    
    let toolContainer = null;
    let toolTip = null;
    
    // Search with detailed logging
    const searchForTool = (obj, depth = 0) => {
      const indent = '  '.repeat(depth);
      debugLog(`${indent}Checking: ${obj.name || 'unnamed'} (${obj.type || obj.constructor.name})`);
      
      if (obj.userData) {
        debugLog(`${indent}UserData:`, obj.userData);
        
        if (obj.userData.isToolContainer) {
          toolContainer = obj;
          debugLog(`${indent}*** FOUND TOOL CONTAINER: ${obj.name || 'unnamed'} ***`);
          return true;
        }
      }
      
      // Check by name patterns too
      if (obj.name && (
        obj.name.includes('tcp_tool_container') ||
        obj.name.includes('tool_container') ||
        obj.name.includes('tcp')
      )) {
        debugLog(`${indent}Found potential container by name: ${obj.name}`);
        if (!toolContainer) {
          toolContainer = obj;
        }
      }
      
      // Continue searching children
      if (obj.children && obj.children.length > 0) {
        for (const child of obj.children) {
          if (searchForTool(child, depth + 1)) {
            return true;
          }
        }
      }
      
      return false;
    };
    
    // Start search
    searchForTool(endEffectorLink);
    
    if (!toolContainer) {
      debugLog('No tool container found despite TCP context showing tool attached');
      
      // Get attached tool info from TCP context
      if (currentTool) {
        debugLog('TCP context reports tool:', currentTool);
      }
      
      return null;
    }
    
    debugLog(`Using tool container: ${toolContainer.name || 'unnamed'}`);
    
    // Find tool tip within container
    toolContainer.traverse(child => {
      if (child.name && (
        child.name.includes('tcp') || 
        child.name.includes('tip') || 
        child.name.includes('end') ||
        child.name.includes('tool_tip')
      )) {
        toolTip = child;
        debugLog(`Found named tool tip: ${child.name}`);
      }
    });
    
    // If no named tip, find furthest point or use container
    if (!toolTip) {
      let furthestChild = null;
      let maxDistance = 0;
      
      toolContainer.traverse(child => {
        if (child.isMesh && child !== toolContainer) {
          const worldPos = new THREE.Vector3();
          child.getWorldPosition(worldPos);
          const containerPos = new THREE.Vector3();
          toolContainer.getWorldPosition(containerPos);
          const distance = worldPos.distanceTo(containerPos);
          
          if (distance > maxDistance) {
            maxDistance = distance;
            furthestChild = child;
          }
        }
      });
      
      toolTip = furthestChild || toolContainer;
      debugLog(`Using ${furthestChild ? 'furthest point' : 'container'} as tool tip: ${toolTip.name || 'unnamed'}, distance: ${maxDistance}`);
    }
    
    return {
      container: toolContainer,
      tip: toolTip
    };
  }, [debugLog, currentTool]);

  // Calculate effective end effector - MOVED BEFORE useEffect
  const calculateEffectiveEndEffector = useCallback(() => {
    debugLog('Calculating effective end effector...', {
      hasRobot: !!robot,
      isReady,
      hasTool,
      toolTransforms
    });
    
    if (!robot || !isReady) {
      debugLog('Robot not ready');
      return null;
    }
    
    const robotEndEffector = findRobotEndEffector(robot);
    if (!robotEndEffector) {
      debugLog('No robot end effector found');
      return null;
    }
    
    // If no TCP tool, return robot end effector
    if (!hasTool) {
      debugLog('No TCP tool, using robot end effector');
      return {
        type: 'robot',
        object: robotEndEffector,
        offsetTransform: null
      };
    }
    
    // Find TCP tool info
    const tcpInfo = findTCPInfo(robotEndEffector);
    
    if (!tcpInfo) {
      debugLog('TCP tool expected but not found, falling back to robot end effector');
      return {
        type: 'robot',
        object: robotEndEffector,
        offsetTransform: null
      };
    }
    
    debugLog('Found TCP tool, using tool tip as effective end effector');
    return {
      type: 'tcp',
      object: tcpInfo.tip,
      baseObject: robotEndEffector,
      toolContainer: tcpInfo.container,
      offsetTransform: toolTransforms
    };
  }, [robot, isReady, hasTool, toolTransforms, findRobotEndEffector, findTCPInfo, debugLog]);

  // Update position and rotation tracking
  const updateEndEffectorPose = useCallback(() => {
    if (!effectiveEndEffector || !effectiveEndEffector.object) {
      return;
    }
    
    const { worldPos, worldQuat } = vectorsRef.current;
    
    // Get world position and rotation
    effectiveEndEffector.object.getWorldPosition(worldPos);
    effectiveEndEffector.object.getWorldQuaternion(worldQuat);
    
    // Update state
    setCurrentPosition({
      x: worldPos.x,
      y: worldPos.y,
      z: worldPos.z
    });
    
    setCurrentRotation({
      x: worldQuat.x,
      y: worldQuat.y,
      z: worldQuat.z,
      w: worldQuat.w
    });
    
    // Emit update event for high-frequency consumers
    EventBus.emitThrottled('endeffector:pose-updated', {
      robotId: activeRobotId,
      position: { x: worldPos.x, y: worldPos.y, z: worldPos.z },
      rotation: { x: worldQuat.x, y: worldQuat.y, z: worldQuat.z, w: worldQuat.w },
      type: effectiveEndEffector.type
    }, 16); // 60fps
  }, [effectiveEndEffector, activeRobotId]);

  // Utility methods
  const getWorldMatrix = useCallback(() => {
    if (!effectiveEndEffector?.object) return null;
    
    const matrix = new THREE.Matrix4();
    effectiveEndEffector.object.updateMatrixWorld(true);
    matrix.copy(effectiveEndEffector.object.matrixWorld);
    return matrix;
  }, [effectiveEndEffector]);

  const getLocalMatrix = useCallback(() => {
    if (!effectiveEndEffector?.object) return null;
    
    const matrix = new THREE.Matrix4();
    matrix.copy(effectiveEndEffector.object.matrix);
    return matrix;
  }, [effectiveEndEffector]);

  const getDistanceFromBase = useCallback(() => {
    if (!effectiveEndEffector?.object || !robot) return 0;
    
    const { worldPos } = vectorsRef.current;
    effectiveEndEffector.object.getWorldPosition(worldPos);
    
    const robotPos = new THREE.Vector3();
    robot.getWorldPosition(robotPos);
    
    return worldPos.distanceTo(robotPos);
  }, [effectiveEndEffector, robot]);

  // NOW START THE useEffect HOOKS (after all functions are defined)

  // Update end effector references when robot or TCP changes
  useEffect(() => {
    debugLog('Updating end effector configuration...', {
      hasRobot: !!robot,
      isReady,
      hasTool,
      activeRobotId
    });
    
    if (!robot || !isReady) {
      setEndEffectorLink(null);
      setEffectiveEndEffector(null);
      return;
    }
    
    const robotEndEffector = findRobotEndEffector(robot);
    setEndEffectorLink(robotEndEffector);
    
    const effective = calculateEffectiveEndEffector();
    setEffectiveEndEffector(effective);
    
    debugLog('End effector configuration updated', {
      robotEndEffector: robotEndEffector?.name,
      effectiveType: effective?.type,
      effectiveObject: effective?.object?.name
    });
    
    EventBus.emit('endeffector:configuration-changed', {
      robotId: activeRobotId,
      hasRobotEndEffector: !!robotEndEffector,
      hasTCP: hasTool,
      effectiveType: effective?.type
    });
  }, [robot, isReady, activeRobotId, hasTool, toolTransforms, findRobotEndEffector, calculateEffectiveEndEffector, debugLog]);

  // Start/stop tracking
  useEffect(() => {
    if (effectiveEndEffector && isReady) {
      debugLog('Starting end effector tracking', {
        type: effectiveEndEffector.type,
        objectName: effectiveEndEffector.object?.name
      });
      
      setIsTracking(true);
      
      // Update immediately
      updateEndEffectorPose();
      
      // Set up interval for continuous updates
      updateIntervalRef.current = setInterval(updateEndEffectorPose, 16); // 60fps
      
      return () => {
        if (updateIntervalRef.current) {
          clearInterval(updateIntervalRef.current);
          updateIntervalRef.current = null;
        }
        setIsTracking(false);
        debugLog('Stopped end effector tracking');
      };
    } else {
      setIsTracking(false);
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
        updateIntervalRef.current = null;
      }
    }
  }, [effectiveEndEffector, isReady, updateEndEffectorPose, debugLog]);

  // Listen for joint changes to trigger updates
  useEffect(() => {
    const handleJointChange = (data) => {
      if (data.robotId === activeRobotId || data.robotName === activeRobotId) {
        // Force immediate update on joint change
        setTimeout(updateEndEffectorPose, 0);
      }
    };
    
    const unsubscribeJointChanged = EventBus.on('robot:joint-changed', handleJointChange);
    const unsubscribeJointsChanged = EventBus.on('robot:joints-changed', handleJointChange);
    
    return () => {
      unsubscribeJointChanged();
      unsubscribeJointsChanged();
    };
  }, [activeRobotId, updateEndEffectorPose]);

  // Enhanced TCP change handler
  useEffect(() => {
    const handleTCPChange = (data) => {
      debugLog('TCP change event received', {
        eventType: data.type || 'unknown',
        robotId: data.robotId,
        toolId: data.toolId,
        hasTransforms: !!data.transforms,
        hasDimensions: !!data.newDimensions
      });
      
      if (data.robotId === activeRobotId) {
        debugLog('TCP change for current robot, recalculating effective end effector...');
        
        // Force recalculation after a short delay to ensure TCP changes are applied
        setTimeout(() => {
          const effective = calculateEffectiveEndEffector();
          setEffectiveEndEffector(effective);
          
          debugLog('Effective end effector updated after TCP change', {
            type: effective?.type,
            objectName: effective?.object?.name,
            hasContainer: !!effective?.toolContainer,
            eventType: data.type
          });
          
          // Force immediate pose update if tracking
          if (effective && isTracking) {
            setTimeout(updateEndEffectorPose, 0);
          }
        }, 50);
      }
    };
    
    // Listen to the general TCP change event
    const unsubscribeTCPChanged = EventBus.on('tcp:changed', handleTCPChange);
    
    // Also listen to specific events for detailed handling
    const unsubscribeTCPAttached = EventBus.on('tcp:tool-attached', (data) => {
      debugLog('TCP tool attached event', data);
      handleTCPChange({ ...data, type: 'attached' });
    });
    
    const unsubscribeTCPRemoved = EventBus.on('tcp:tool-removed', (data) => {
      debugLog('TCP tool removed event', data);
      handleTCPChange({ ...data, type: 'removed' });
    });
    
    const unsubscribeTCPTransformed = EventBus.on('tcp:tool-transformed', (data) => {
      debugLog('TCP tool transformed event', data);
      handleTCPChange({ ...data, type: 'transformed' });
    });
    
    const unsubscribeTCPVisibility = EventBus.on('tcp:tool-visibility-changed', (data) => {
      debugLog('TCP tool visibility changed event', data);
      handleTCPChange({ ...data, type: 'visibility' });
    });
    
    return () => {
      unsubscribeTCPChanged();
      unsubscribeTCPAttached();
      unsubscribeTCPRemoved();
      unsubscribeTCPTransformed();
      unsubscribeTCPVisibility();
    };
  }, [activeRobotId, calculateEffectiveEndEffector, debugLog, isTracking, updateEndEffectorPose]);

  // Force update when currentTool changes
  useEffect(() => {
    debugLog('TCP currentTool changed', currentTool);
    
    if (robot && isReady) {
      setTimeout(() => {
        const effective = calculateEffectiveEndEffector();
        setEffectiveEndEffector(effective);
        debugLog('Forced update after currentTool change', {
          type: effective?.type,
          objectName: effective?.object?.name
        });
      }, 50);
    }
  }, [currentTool, robot, isReady, calculateEffectiveEndEffector, debugLog]);

  const value = {
    // State
    currentPosition,
    currentRotation,
    isTracking,
    activeRobotId,
    
    // Configuration
    endEffectorLink,
    effectiveEndEffector,
    hasTCP: hasTool,
    effectiveType: effectiveEndEffector?.type || 'none',
    
    // Methods
    getWorldMatrix,
    getLocalMatrix,
    getDistanceFromBase,
    updatePose: updateEndEffectorPose,
    
    // Info
    isReady: isReady && !!effectiveEndEffector,
    toolInfo: currentTool,
    
    // Debug
    debugLog
  };

  return (
    <EndEffectorContext.Provider value={value}>
      {children}
    </EndEffectorContext.Provider>
  );
};

export const useEndEffectorContext = () => {
  const context = useContext(EndEffectorContext);
  if (!context) {
    throw new Error('useEndEffectorContext must be used within EndEffectorProvider');
  }
  return context;
};

export default EndEffectorContext; 