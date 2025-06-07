// src/contexts/hooks/useIK.js - Enhanced IK data transfer with joint integration
import { useContext } from 'react';
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

  // Enhanced move to target with IK data
  const moveToTarget = (animate = true) => {
    const ikData = getIKSolverData();
    if (!ikData) {
      console.warn('[useIK] No IK solver data available');
      return Promise.resolve(false);
    }
    
    console.log('[useIK] Executing IK with data:', ikData);
    
    return executeIK(targetPosition, { 
      animate,
      currentPosition: currentEndEffectorPoint,
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

  // Sync target to current end effector position
  const syncTargetToCurrent = () => {
    setTargetPosition({
      x: currentEndEffectorPoint.x,
      y: currentEndEffectorPoint.y,
      z: currentEndEffectorPoint.z
    });
  };

  // Sync target to current end effector with offset
  const syncTargetToCurrentWithOffset = (offset = { x: 0, y: 0, z: 0 }) => {
    setTargetPosition({
      x: currentEndEffectorPoint.x + offset.x,
      y: currentEndEffectorPoint.y + offset.y,
      z: currentEndEffectorPoint.z + offset.z
    });
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

  return {
    // State - enhanced with TCP data and joint integration
    currentPosition: currentEndEffectorPoint,
    currentOrientation: currentEndEffectorOrientation,
    currentEulerAngles: getEndEffectorEulerAngles(),
    targetPosition,
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
    setCurrentSolver,
    moveToTarget,
    moveRelative,
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
        ikData,
        jointDistances: calculateJointDistances()
      });
    }
  };
};

export default useIK;