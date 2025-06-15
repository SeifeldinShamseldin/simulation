// src/contexts/hooks/useIK.js - Clean IK API
import { useCallback } from 'react';
import { useIKContext } from '../IKContext';

export const useIK = () => {
  const context = useIKContext();
  
  if (!context) {
    throw new Error('useIK must be used within IKProvider');
  }
  
  const {
    targetPosition,
    targetOrientation,
    currentEndEffector,
    isAnimating,
    solverStatus,
    currentSolver,
    availableSolvers,
    setTargetPosition,
    setTargetOrientation,
    setCurrentSolver,
    executeIK: contextExecuteIK,
    stopAnimation,
    configureSolver,
    getSolverSettings,
    isReady,
    hasValidEndEffector
  } = context;

  // Simplified execute function
  const executeIK = useCallback(async (position, orientation = null, options = {}) => {
    const ikOptions = {
      ...options,
      targetOrientation: orientation
    };
    
    return contextExecuteIK(position, ikOptions);
  }, [contextExecuteIK]);

  // Move to target with current settings
  const moveToTarget = useCallback(async (animate = true) => {
    return contextExecuteIK(targetPosition, {
      animate,
      targetOrientation
    });
  }, [contextExecuteIK, targetPosition, targetOrientation]);

  // Move relative to current position
  const moveRelative = useCallback((axis, delta) => {
    const newTarget = { ...targetPosition };
    newTarget[axis] += delta;
    setTargetPosition(newTarget);
  }, [targetPosition, setTargetPosition]);

  // Rotate relative (orientation)
  const rotateRelative = useCallback((axis, delta) => {
    const newOrientation = { ...targetOrientation };
    newOrientation[axis] += delta;
    setTargetOrientation(newOrientation);
  }, [targetOrientation, setTargetOrientation]);

  // Sync target to current end effector
  const syncTargetToCurrent = useCallback(() => {
    setTargetPosition({
      x: currentEndEffector.position.x,
      y: currentEndEffector.position.y,
      z: currentEndEffector.position.z
    });
    
    // Convert quaternion to euler if needed
    const euler = quaternionToEuler(currentEndEffector.orientation);
    setTargetOrientation({
      roll: euler.roll * 180 / Math.PI,
      pitch: euler.pitch * 180 / Math.PI,
      yaw: euler.yaw * 180 / Math.PI
    });
  }, [currentEndEffector, setTargetPosition, setTargetOrientation]);

  // Get solver configuration
  const getSolverConfig = useCallback(() => {
    return getSolverSettings(currentSolver);
  }, [getSolverSettings, currentSolver]);

  // Update solver configuration
  const updateSolverConfig = useCallback((config) => {
    configureSolver(currentSolver, config);
  }, [configureSolver, currentSolver]);

  return {
    // Current state
    currentPosition: currentEndEffector.position,
    currentOrientation: currentEndEffector.orientation,
    currentEulerAngles: quaternionToEuler(currentEndEffector.orientation),
    
    // Target state
    targetPosition,
    targetOrientation,
    
    // Animation state
    isAnimating,
    animationProgress: 0, // Could be enhanced later
    
    // Solver state
    solverStatus,
    currentSolver,
    availableSolvers,
    
    // Main methods
    executeIK,
    moveToTarget,
    stopAnimation,
    
    // Position control
    setTargetPosition,
    moveRelative,
    
    // Orientation control
    setTargetOrientation,
    rotateRelative,
    
    // Sync methods
    syncTargetToCurrent,
    
    // Solver management
    setCurrentSolver,
    configureSolver: updateSolverConfig,
    getSolverSettings: getSolverConfig,
    
    // Status
    isReady,
    hasValidEndEffector,
    canExecute: isReady && hasValidEndEffector && !isAnimating
  };
};

// Helper function to convert quaternion to euler angles
function quaternionToEuler(q) {
  const { x, y, z, w } = q;
  
  // Roll (x-axis rotation)
  const sinr_cosp = 2 * (w * x + y * z);
  const cosr_cosp = 1 - 2 * (x * x + y * y);
  const roll = Math.atan2(sinr_cosp, cosr_cosp);
  
  // Pitch (y-axis rotation)
  const sinp = 2 * (w * y - z * x);
  let pitch;
  if (Math.abs(sinp) >= 1) {
    pitch = Math.sign(sinp) * Math.PI / 2;
  } else {
    pitch = Math.asin(sinp);
  }
  
  // Yaw (z-axis rotation)
  const siny_cosp = 2 * (w * z + x * y);
  const cosy_cosp = 1 - 2 * (y * y + z * z);
  const yaw = Math.atan2(siny_cosp, cosy_cosp);
  
  return { roll, pitch, yaw };
}

export default useIK;