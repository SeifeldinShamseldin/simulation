// src/contexts/hooks/useIK.js
import { useContext } from 'react';
import * as THREE from 'three';
import IKContext from '../IKContext';

export const useIK = () => {
  const context = useContext(IKContext);
  if (!context) {
    throw new Error('useIK must be used within IKProvider');
  }
  
  const {
    currentPosition,
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
    setTargetPosition(currentPosition);
  };

  return {
    // State
    currentPosition,
    targetPosition,
    isAnimating,
    solverStatus,
    currentSolver,
    availableSolvers,
    
    // Methods
    setTargetPosition,
    setCurrentSolver,
    moveToTarget,
    moveRelative,
    syncTargetToCurrent,
    stopAnimation,
    configureSolver,
    getSolverSettings,
    
    // Direct access to executeIK for custom targets
    executeIK
  };
};

export default useIK; 