// src/contexts/hooks/useIK.js - Updated to work with TCP system
import { useContext } from 'react';
import * as THREE from 'three';
import IKContext from '../IKContext';
import { useTCP } from './useTCP';

export const useIK = () => {
  const context = useContext(IKContext);
  const { 
    currentEndEffectorPoint,
    hasValidEndEffector,
    isUsingTCP,
    isUsingRobotEndEffector,
    getEndEffectorInfo,
    getEndEffectorType
  } = useTCP();

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

  // Convenience methods for common operations
  const moveToTarget = (animate = true) => {
    return executeIK(targetPosition, { animate });
  };

  const moveRelative = (axis, amount) => {
    const newTarget = { ...targetPosition };
    newTarget[axis] += amount;
    setTargetPosition(newTarget);
    return executeIK(newTarget);
  };

  const syncTargetToCurrent = () => {
    setTargetPosition(currentEndEffectorPoint);
  };

  return {
    // State
    currentPosition: currentEndEffectorPoint,
    targetPosition,
    isAnimating,
    solverStatus,
    currentSolver,
    availableSolvers,
    
    // TCP awareness
    hasValidEndEffector,
    isUsingTCP,
    isUsingRobotEndEffector,
    
    // Methods
    setTargetPosition,
    setCurrentSolver,
    moveToTarget,
    moveRelative,
    syncTargetToCurrent,
    stopAnimation,
    configureSolver,
    getSolverSettings,
    
    // TCP-specific methods
    getEndEffectorInfo,
    getEndEffectorType,
    
    // Direct access to executeIK for custom targets
    executeIK
  };
};

export default useIK; 