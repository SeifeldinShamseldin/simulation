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
    getWorldMatrix,
    getLocalMatrix,
    getDistanceFromBase,
    updatePose,
    isReady,
    toolInfo
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
    return effectiveEndEffector?.object || null;
  }, [effectiveEndEffector]);

  // Get transform relative to robot base
  const getRelativeTransform = useCallback(() => {
    if (!effectiveEndEffector?.baseObject) return null;
    
    const worldMatrix = getWorldMatrix();
    const baseMatrix = new THREE.Matrix4();
    effectiveEndEffector.baseObject.updateMatrixWorld(true);
    baseMatrix.copy(effectiveEndEffector.baseObject.matrixWorld);
    
    // Calculate relative transform
    const relativeMatrix = new THREE.Matrix4();
    relativeMatrix.copy(worldMatrix);
    relativeMatrix.premultiply(baseMatrix.invert());
    
    return relativeMatrix;
  }, [effectiveEndEffector, getWorldMatrix]);

  // Check if position is within workspace bounds
  const isWithinWorkspace = useCallback((bounds = { radius: 2.0 }) => {
    const distance = getDistanceFromBase();
    return distance <= bounds.radius;
  }, [getDistanceFromBase]);

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
    
    // Status
    isReady: isReady && isTracking,
    hasValidEndEffector: !!effectiveEndEffector
  };
};

export default useEndEffector; 