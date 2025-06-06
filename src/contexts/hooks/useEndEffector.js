import { useContext, useCallback } from 'react';
import * as THREE from 'three';
import EndEffectorContext from '../EndEffectorContext';

export const useEndEffector = () => {
  const context = useContext(EndEffectorContext);
  if (!context) {
    throw new Error('useEndEffector must be used within EndEffectorProvider');
  }
  
  const {
    currentPosition,
    currentRotation,
    isTracking,
    activeRobotId,
    endEffectorLink,
    effectiveEndEffector,
    hasTCP,
    effectiveType,
    toolInfo,
    getWorldMatrix,
    getLocalMatrix,
    getDistanceFromBase,
    updatePose,
    forceUpdate,
    isReady
  } = context;

  // Convenience methods
  const getPositionVector = useCallback(() => {
    return new THREE.Vector3(currentPosition.x, currentPosition.y, currentPosition.z);
  }, [currentPosition]);

  const getRotationQuaternion = useCallback(() => {
    return new THREE.Quaternion(currentRotation.x, currentRotation.y, currentRotation.z, currentRotation.w);
  }, [currentRotation]);

  const getPositionArray = useCallback(() => {
    return [currentPosition.x, currentPosition.y, currentPosition.z];
  }, [currentPosition]);

  const getRotationArray = useCallback(() => {
    return [currentRotation.x, currentRotation.y, currentRotation.z, currentRotation.w];
  }, [currentRotation]);

  // Get the actual Three.js object for the effective end effector
  const getEndEffectorObject = useCallback(() => {
    return effectiveEndEffector || null;
  }, [effectiveEndEffector]);

  // Get transform relative to robot base
  const getRelativeTransform = useCallback(() => {
    if (!effectiveEndEffector) return null;
    
    const worldMatrix = getWorldMatrix();
    if (!worldMatrix) return null;
    
    // For TCP tools, we need to account for the robot's base transform
    const relativeMatrix = new THREE.Matrix4();
    relativeMatrix.copy(worldMatrix);
    
    return relativeMatrix;
  }, [effectiveEndEffector, getWorldMatrix]);

  // Check if position is within workspace bounds
  const isWithinWorkspace = useCallback((bounds = { radius: 2.0 }) => {
    const distance = getDistanceFromBase();
    return distance <= bounds.radius;
  }, [getDistanceFromBase]);

  // Get TCP information
  const getTCPInfo = useCallback(() => {
    return {
      hasTCP,
      type: effectiveType,
      toolInfo: toolInfo || null,
      isRobotEndEffector: effectiveType === 'robot',
      isTCPEndEffector: effectiveType === 'tcp'
    };
  }, [hasTCP, effectiveType, toolInfo]);

  // Get detailed position info
  const getDetailedPosition = useCallback(() => {
    return {
      position: currentPosition,
      rotation: currentRotation,
      type: effectiveType,
      hasTCP,
      toolInfo,
      distance: getDistanceFromBase(),
      timestamp: Date.now()
    };
  }, [currentPosition, currentRotation, effectiveType, hasTCP, toolInfo, getDistanceFromBase]);

  return {
    // State
    position: currentPosition,
    rotation: currentRotation,
    isTracking,
    robotId: activeRobotId,
    isReady,
    
    // Configuration
    hasTCP,
    effectiveType,
    toolInfo,
    
    // Objects
    endEffectorLink,
    effectiveEndEffector,
    
    // Position methods
    getPositionVector,
    getPositionArray,
    getPosition: () => currentPosition,
    
    // Rotation methods
    getRotationQuaternion,
    getRotationArray,
    getRotation: () => currentRotation,
    
    // Transform methods
    getWorldMatrix,
    getLocalMatrix,
    getRelativeTransform,
    getEndEffectorObject,
    
    // Utility methods
    getDistanceFromBase,
    isWithinWorkspace,
    updatePose,
    forceUpdate, // Expose force update for external use
    getTCPInfo,
    getDetailedPosition,
    
    // Status
    isReady: isReady && isTracking,
    hasValidEndEffector: !!effectiveEndEffector,
    
    // TCP-specific info
    isTCPMode: hasTCP,
    isRobotMode: !hasTCP,
    currentMode: effectiveType
  };
};

export default useEndEffector; 