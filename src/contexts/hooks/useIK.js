// src/contexts/hooks/useIK.js - Enhanced with orientation support
import { useContext, useState, useCallback } from 'react';
import * as THREE from 'three';
import IKContext from '../IKContext';
import { useTCP } from './useTCP';
import { useJoints } from './useJoints';

export const useIK = () => {
  const context = useContext(IKContext);
  const { 
    currentEndEffectorPoint,
    currentEndEffectorOrientation,
    hasValidEndEffector,
    isUsingTCP,
    isUsingRobotEndEffector,
    getEndEffectorInfo,
    getEndEffectorType,
    getEndEffectorEulerAngles
  } = useTCP();
  
  const {
    robotId,
    jointInfo,
    jointValues,
    isAnimating: isJointAnimating,
    animationProgress
  } = useJoints();

  // Local state for target orientation
  const [targetOrientation, setTargetOrientation] = useState({ roll: 0, pitch: 0, yaw: 0 });

  if (!context) {
    throw new Error('useIK must be used within IKProvider');
  }
  
  const {
    targetPosition,
    isAnimating,
    solverStatus,
    currentSolver,
    availableSolvers,
    setTargetPosition,
    setCurrentSolver,
    executeIK,
    stopAnimation,
    configureSolver,
    getSolverSettings
  } = context;

  // Enhanced data for CCD solver
  const getIKSolverData = () => {
    if (!robotId || !jointInfo.length) return null;
    
    // Prepare comprehensive joint data for CCD
    const movableJoints = jointInfo.filter(joint => joint.type !== 'fixed');
    
    const jointData = movableJoints.map(joint => ({
      name: joint.name,
      type: joint.type,
      limits: joint.limits,
      axis: joint.axis,
      currentAngle: jointValues[joint.name] || 0,
      // Additional data that CCD might need
      hasLimits: !!(joint.limits && (joint.limits.lower !== undefined || joint.limits.upper !== undefined)),
      range: joint.limits ? (joint.limits.upper || Math.PI) - (joint.limits.lower || -Math.PI) : 2 * Math.PI
    }));
    
    return {
      robotId,
      joints: jointData,
      endEffector: {
        position: currentEndEffectorPoint,
        orientation: currentEndEffectorOrientation,
        eulerAngles: getEndEffectorEulerAngles(),
        type: getEndEffectorType(),
        isValid: hasValidEndEffector
      },
      currentJointValues: jointValues,
      movableJointCount: movableJoints.length,
      hasOrientation: isUsingTCP // TCP tools typically have orientation data
    };
  };

  // Calculate distance between joints (useful for CCD)
  const calculateJointDistances = () => {
    // This would require the actual robot model to calculate real distances
    // For now, return estimated distances based on joint hierarchy
    const movableJoints = jointInfo.filter(joint => joint.type !== 'fixed');
    const distances = {};
    
    movableJoints.forEach((joint, index) => {
      // Estimate distance based on joint order and type
      let estimatedDistance = 0.1; // Default distance
      
      switch (joint.type) {
        case 'revolute':
        case 'continuous':
          estimatedDistance = 0.15; // Typical revolute joint reach
          break;
        case 'prismatic':
          estimatedDistance = joint.limits ? 
            Math.abs((joint.limits.upper || 1) - (joint.limits.lower || 0)) : 
            0.5; // Prismatic joint travel
          break;
      }
      
      distances[joint.name] = {
        toEndEffector: (movableJoints.length - index) * estimatedDistance,
        toNext: estimatedDistance,
        index
      };
    });
    
    return distances;
  };

  // Enhanced move to target with IK data including orientation
  const moveToTarget = (animate = true, targetOrientationEuler = null) => {
    const ikData = getIKSolverData();
    if (!ikData) {
      console.warn('[useIK] No IK solver data available');
      return Promise.resolve(false);
    }
    
    console.log('[useIK] Executing IK with data:', ikData);
    console.log('[useIK] Target orientation:', targetOrientationEuler);
    
    return executeIK(targetPosition, { 
      animate,
      currentPosition: currentEndEffectorPoint,
      currentOrientation: currentEndEffectorOrientation,
      targetOrientation: targetOrientationEuler,
      ikData, // Pass comprehensive IK data to solver
      jointDistances: calculateJointDistances()
    });
  };

  // Move relative with IK awareness
  const moveRelative = (axis, amount) => {
    const newTarget = { ...targetPosition };
    newTarget[axis] += amount;
    setTargetPosition(newTarget);
    
    return moveToTarget(true);
  };

  // Rotate relative
  const rotateRelative = (axis, amount) => {
    const newTargetOrientation = { ...targetOrientation };
    newTargetOrientation[axis] += amount;
    setTargetOrientation(newTargetOrientation);
    
    return moveToTarget(true, newTargetOrientation);
  };

  // Sync target to current end effector position
  const syncTargetToCurrent = () => {
    setTargetPosition({
      x: currentEndEffectorPoint.x,
      y: currentEndEffectorPoint.y,
      z: currentEndEffectorPoint.z
    });
    
    // Sync orientation if available
    if (getEndEffectorEulerAngles) {
      const currentEuler = getEndEffectorEulerAngles();
      setTargetOrientation({
        roll: currentEuler.roll * 180 / Math.PI,
        pitch: currentEuler.pitch * 180 / Math.PI,
        yaw: currentEuler.yaw * 180 / Math.PI
      });
    }
  };

  // Sync target to current end effector with offset
  const syncTargetToCurrentWithOffset = (offset = { x: 0, y: 0, z: 0 }, orientationOffset = { roll: 0, pitch: 0, yaw: 0 }) => {
    setTargetPosition({
      x: currentEndEffectorPoint.x + offset.x,
      y: currentEndEffectorPoint.y + offset.y,
      z: currentEndEffectorPoint.z + offset.z
    });
    
    if (getEndEffectorEulerAngles) {
      const currentEuler = getEndEffectorEulerAngles();
      setTargetOrientation({
        roll: (currentEuler.roll * 180 / Math.PI) + orientationOffset.roll,
        pitch: (currentEuler.pitch * 180 / Math.PI) + orientationOffset.pitch,
        yaw: (currentEuler.yaw * 180 / Math.PI) + orientationOffset.yaw
      });
    }
  };

  // Calculate reachability (rough estimate)
  const calculateReachability = (targetPos) => {
    const ikData = getIKSolverData();
    if (!ikData) return { reachable: false, confidence: 0 };
    
    // Simple reachability check based on joint distances
    const jointDistances = calculateJointDistances();
    const totalReach = Object.values(jointDistances)
      .reduce((sum, dist) => sum + (dist.toNext || 0), 0);
    
    const distanceToTarget = Math.sqrt(
      Math.pow(targetPos.x - currentEndEffectorPoint.x, 2) +
      Math.pow(targetPos.y - currentEndEffectorPoint.y, 2) +
      Math.pow(targetPos.z - currentEndEffectorPoint.z, 2)
    );
    
    const reachable = distanceToTarget <= totalReach;
    const confidence = reachable ? 
      Math.max(0, 1 - (distanceToTarget / totalReach)) : 
      0;
    
    return {
      reachable,
      confidence,
      distanceToTarget,
      totalReach,
      reachRatio: distanceToTarget / totalReach
    };
  };

  // Get joint chain info for IK
  const getJointChainInfo = () => {
    const ikData = getIKSolverData();
    if (!ikData) return null;
    
    return {
      length: ikData.joints.length,
      types: ikData.joints.map(j => j.type),
      hasLimits: ikData.joints.filter(j => j.hasLimits).length,
      totalRange: ikData.joints.reduce((sum, j) => sum + j.range, 0),
      endEffectorType: ikData.endEffector.type
    };
  };

  // Set target orientation
  const setTargetOrientationValues = useCallback((orientation) => {
    setTargetOrientation(orientation);
  }, []);

  return {
    // State - enhanced with TCP data and joint integration
    currentPosition: currentEndEffectorPoint,
    currentOrientation: currentEndEffectorOrientation,
    currentEulerAngles: getEndEffectorEulerAngles(),
    targetPosition,
    targetOrientation,
    isAnimating: isAnimating || isJointAnimating, // Combined animation state
    animationProgress,
    solverStatus,
    currentSolver,
    availableSolvers,
    
    // Joint integration
    robotId,
    jointInfo,
    currentJointValues: jointValues,
    
    // TCP awareness
    hasValidEndEffector,
    isUsingTCP,
    isUsingRobotEndEffector,
    
    // Enhanced methods
    setTargetPosition,
    setTargetOrientation: setTargetOrientationValues,
    setCurrentSolver,
    moveToTarget,
    moveRelative,
    rotateRelative,
    syncTargetToCurrent,
    syncTargetToCurrentWithOffset,
    stopAnimation,
    configureSolver,
    getSolverSettings,
    
    // IK analysis methods
    getIKSolverData,
    calculateJointDistances,
    calculateReachability,
    getJointChainInfo,
    
    // TCP-specific methods
    getEndEffectorInfo,
    getEndEffectorType,
    
    // Convenience methods
    canReach: (targetPos) => calculateReachability(targetPos).reachable,
    getReachConfidence: (targetPos) => calculateReachability(targetPos).confidence,
    
    // Direct access to executeIK for custom targets with enhanced data
    executeIK: (target, options = {}) => {
      const ikData = getIKSolverData();
      return executeIK(target, {
        ...options,
        currentPosition: currentEndEffectorPoint,
        currentOrientation: currentEndEffectorOrientation,
        ikData,
        jointDistances: calculateJointDistances()
      });
    }
  };
};

export default useIK;