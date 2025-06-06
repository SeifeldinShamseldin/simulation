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
  
  // Refs for calculations
  const updateIntervalRef = useRef(null);
  const vectorsRef = useRef({
    worldPos: new THREE.Vector3(),
    worldQuat: new THREE.Quaternion()
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
    
    // Emit update event
    EventBus.emitThrottled('endeffector:pose-updated', {
      robotId: activeRobotId,
      position: { x: worldPos.x, y: worldPos.y, z: worldPos.z },
      rotation: { x: worldQuat.x, y: worldQuat.y, z: worldQuat.z, w: worldQuat.w }
    }, 16); // 60fps
  }, [effectiveEndEffector, activeRobotId]);

  // Initialize with robot end effector when robot loads
  useEffect(() => {
    if (!robot || !isReady) {
      setEffectiveEndEffector(null);
      return;
    }
    
    const robotEndEffector = findRobotEndEffector(robot);
    setEffectiveEndEffector(robotEndEffector);
    
    console.log(`[EndEffector:${activeRobotId}] Using robot end effector:`, robotEndEffector?.name);
  }, [robot, isReady, activeRobotId, findRobotEndEffector]);

  // Listen for TCP to tell us the new end effector
  useEffect(() => {
    const handleTCPEndEffectorChange = (data) => {
      if (data.robotId === activeRobotId) {
        console.log(`[EndEffector:${activeRobotId}] TCP provided new end effector:`, data.endEffectorObject?.name);
        setEffectiveEndEffector(data.endEffectorObject);
      }
    };
    
    const unsubscribe = EventBus.on('tcp:endeffector-changed', handleTCPEndEffectorChange);
    return () => unsubscribe();
  }, [activeRobotId]);

  // Start/stop tracking
  useEffect(() => {
    if (effectiveEndEffector && isReady) {
      console.log(`[EndEffector:${activeRobotId}] Starting tracking:`, effectiveEndEffector.name);
      
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
  }, [effectiveEndEffector, isReady, updateEndEffectorPose, activeRobotId]);

  // Listen for joint changes to trigger updates
  useEffect(() => {
    const handleJointChange = (data) => {
      if (data.robotId === activeRobotId || data.robotName === activeRobotId) {
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
    
    // Methods
    getWorldMatrix,
    getLocalMatrix,
    getDistanceFromBase,
    updatePose: updateEndEffectorPose,
    
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