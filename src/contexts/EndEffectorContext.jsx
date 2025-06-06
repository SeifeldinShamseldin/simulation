import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import * as THREE from 'three';
import { useRobotControl } from './hooks/useRobotControl';
import EventBus from '../utils/EventBus';

const EndEffectorContext = createContext(null);

export const EndEffectorProvider = ({ children }) => {
  const { activeRobotId, robot, isReady } = useRobotControl();
  
  // State
  const [currentPosition, setCurrentPosition] = useState({ x: 0, y: 0, z: 0 });
  const [currentRotation, setCurrentRotation] = useState({ x: 0, y: 0, z: 0, w: 1 });
  const [isTracking, setIsTracking] = useState(false);
  const [effectiveEndEffector, setEffectiveEndEffector] = useState(null);
  const [hasTCP, setHasTCP] = useState(false);
  const [effectiveType, setEffectiveType] = useState('robot');
  const [toolInfo, setToolInfo] = useState(null);
  
  // Refs for calculations and tracking
  const updateIntervalRef = useRef(null);
  const vectorsRef = useRef({
    worldPos: new THREE.Vector3(),
    worldQuat: new THREE.Quaternion()
  });
  const tcpTrackingRef = useRef({
    toolContainer: null,
    toolTip: null
  });

  // Find robot end effector (only called once when robot loads)
  const findRobotEndEffector = useCallback((robot) => {
    if (!robot) return null;
    
    // Method 1: Look for common end effector names
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
        return leafLinks[leafLinks.length - 1];
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
    
    return deepestLink;
  }, []);

  // Update position and rotation tracking
  const updateEndEffectorPose = useCallback(() => {
    if (!effectiveEndEffector) return;
    
    const { worldPos, worldQuat } = vectorsRef.current;
    
    try {
      // Get world position and rotation
      effectiveEndEffector.getWorldPosition(worldPos);
      effectiveEndEffector.getWorldQuaternion(worldQuat);
      
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
      
      // Emit update event with throttling
      EventBus.emitThrottled('endeffector:pose-updated', {
        robotId: activeRobotId,
        position: { x: worldPos.x, y: worldPos.y, z: worldPos.z },
        rotation: { x: worldQuat.x, y: worldQuat.y, z: worldQuat.z, w: worldQuat.w },
        hasTCP,
        effectiveType
      }, 16); // 60fps
    } catch (error) {
      console.warn(`[EndEffector:${activeRobotId}] Error updating pose:`, error);
    }
  }, [effectiveEndEffector, activeRobotId, hasTCP, effectiveType]);

  // Force immediate update (for when transforms change)
  const forceUpdate = useCallback(() => {
    if (effectiveEndEffector) {
      // Force matrix updates first
      effectiveEndEffector.updateMatrixWorld(true);
      
      // Update TCP tracking objects if they exist
      if (tcpTrackingRef.current.toolContainer) {
        tcpTrackingRef.current.toolContainer.updateMatrixWorld(true);
      }
      if (tcpTrackingRef.current.toolTip) {
        tcpTrackingRef.current.toolTip.updateMatrixWorld(true);
      }
      
      // Update pose immediately
      updateEndEffectorPose();
      
      console.log(`[EndEffector:${activeRobotId}] Forced update completed`);
    }
  }, [effectiveEndEffector, activeRobotId, updateEndEffectorPose]);

  // Initialize with robot end effector when robot loads
  useEffect(() => {
    if (!robot || !isReady) {
      setEffectiveEndEffector(null);
      setHasTCP(false);
      setEffectiveType('robot');
      setToolInfo(null);
      tcpTrackingRef.current = { toolContainer: null, toolTip: null };
      return;
    }
    
    const robotEndEffector = findRobotEndEffector(robot);
    setEffectiveEndEffector(robotEndEffector);
    setHasTCP(false);
    setEffectiveType('robot');
    setToolInfo(null);
    tcpTrackingRef.current = { toolContainer: null, toolTip: null };
    
    console.log(`[EndEffector:${activeRobotId}] Using robot end effector:`, robotEndEffector?.name);
  }, [robot, isReady, activeRobotId, findRobotEndEffector]);

  // Listen for TCP to tell us the new end effector
  useEffect(() => {
    const handleTCPEndEffectorChange = (data) => {
      if (data.robotId === activeRobotId) {
        console.log(`[EndEffector:${activeRobotId}] TCP provided new end effector:`, data.endEffectorObject?.name);
        console.log(`[EndEffector:${activeRobotId}] Change type:`, data.type);
        
        setEffectiveEndEffector(data.endEffectorObject);
        
        if (data.type === 'tcp-attached') {
          setHasTCP(true);
          setEffectiveType('tcp');
          
          // Store TCP tracking references
          tcpTrackingRef.current = {
            toolContainer: data.toolContainer || null,
            toolTip: data.endEffectorObject || null
          };
          
          setToolInfo({
            name: data.toolName || 'Unknown Tool',
            type: data.toolType || 'Unknown Type'
          });
        } else if (data.type === 'tcp-removed') {
          setHasTCP(false);
          setEffectiveType('robot');
          setToolInfo(null);
          tcpTrackingRef.current = { toolContainer: null, toolTip: null };
        }
        
        // Force immediate update after change
        setTimeout(() => forceUpdate(), 10);
      }
    };
    
    const unsubscribe = EventBus.on('tcp:endeffector-changed', handleTCPEndEffectorChange);
    return () => unsubscribe();
  }, [activeRobotId, forceUpdate]);

  // CRITICAL: Listen for TCP transform changes and update immediately
  useEffect(() => {
    const handleTCPTransformChange = (data) => {
      if (data.robotId === activeRobotId && hasTCP) {
        console.log(`[EndEffector:${activeRobotId}] TCP transform changed, forcing update`);
        
        // Update TCP tracking references if provided
        if (data.toolContainer) {
          tcpTrackingRef.current.toolContainer = data.toolContainer;
        }
        if (data.toolTip) {
          tcpTrackingRef.current.toolTip = data.toolTip;
        }
        
        // Force immediate update
        setTimeout(() => forceUpdate(), 0);
      }
    };
    
    const unsubscribe = EventBus.on('tcp:transform-changed', handleTCPTransformChange);
    return () => unsubscribe();
  }, [activeRobotId, hasTCP, forceUpdate]);

  // Start/stop tracking
  useEffect(() => {
    if (effectiveEndEffector && isReady) {
      console.log(`[EndEffector:${activeRobotId}] Starting tracking:`, effectiveEndEffector.name, `(Type: ${effectiveType})`);
      
      setIsTracking(true);
      updateEndEffectorPose(); // Update immediately
      updateIntervalRef.current = setInterval(updateEndEffectorPose, 16); // 60fps
      
      return () => {
        if (updateIntervalRef.current) {
          clearInterval(updateIntervalRef.current);
          updateIntervalRef.current = null;
        }
        setIsTracking(false);
      };
    } else {
      setIsTracking(false);
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
        updateIntervalRef.current = null;
      }
    }
  }, [effectiveEndEffector, isReady, updateEndEffectorPose, activeRobotId, effectiveType]);

  // Listen for joint changes to trigger updates
  useEffect(() => {
    const handleJointChange = (data) => {
      if (data.robotId === activeRobotId || data.robotName === activeRobotId) {
        // For joint changes, force update after a brief delay to allow joint to settle
        setTimeout(updateEndEffectorPose, 5);
      }
    };
    
    const unsubscribeJointChanged = EventBus.on('robot:joint-changed', handleJointChange);
    const unsubscribeJointsChanged = EventBus.on('robot:joints-changed', handleJointChange);
    
    return () => {
      unsubscribeJointChanged();
      unsubscribeJointsChanged();
    };
  }, [activeRobotId, updateEndEffectorPose]);

  // Utility methods
  const getWorldMatrix = useCallback(() => {
    if (!effectiveEndEffector) return null;
    
    const matrix = new THREE.Matrix4();
    effectiveEndEffector.updateMatrixWorld(true);
    matrix.copy(effectiveEndEffector.matrixWorld);
    return matrix;
  }, [effectiveEndEffector]);

  const getLocalMatrix = useCallback(() => {
    if (!effectiveEndEffector) return null;
    
    const matrix = new THREE.Matrix4();
    matrix.copy(effectiveEndEffector.matrix);
    return matrix;
  }, [effectiveEndEffector]);

  const getDistanceFromBase = useCallback(() => {
    if (!effectiveEndEffector || !robot) return 0;
    
    const { worldPos } = vectorsRef.current;
    effectiveEndEffector.getWorldPosition(worldPos);
    
    const robotPos = new THREE.Vector3();
    robot.getWorldPosition(robotPos);
    
    return worldPos.distanceTo(robotPos);
  }, [effectiveEndEffector, robot]);

  const value = {
    // State
    currentPosition,
    currentRotation,
    isTracking,
    activeRobotId,
    
    // Configuration
    effectiveEndEffector,
    hasTCP,
    effectiveType,
    toolInfo,
    
    // Objects (for compatibility)
    endEffectorLink: effectiveEndEffector, // Alias for backward compatibility
    
    // Methods
    getWorldMatrix,
    getLocalMatrix,
    getDistanceFromBase,
    updatePose: updateEndEffectorPose,
    forceUpdate, // Expose force update for external triggers
    
    // Info
    isReady: isReady && !!effectiveEndEffector
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