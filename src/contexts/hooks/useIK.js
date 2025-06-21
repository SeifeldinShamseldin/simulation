// src/contexts/hooks/useIK.js
// Complete facade hook that aggregates all IK-related functionality

import { useCallback, useMemo, useContext } from 'react';
import { useIKContext } from '../IKContext';
import { useRobotManager, useRobotSelection } from './useRobotManager';
import { useJoints } from './useJoints';
import { useTCP } from './useTCP';
import { useJointContext } from '../JointContext';
import EventBus from '../../utils/EventBus';
import * as THREE from 'three';

/**
 * Utility function to convert quaternion to Euler angles
 * @param {Object} quaternion - Quaternion object with x, y, z, w components
 * @returns {Object} Euler angles in degrees { roll, pitch, yaw }
 */
const quaternionToEuler = (quaternion) => {
  if (!quaternion) {
    return { roll: 0, pitch: 0, yaw: 0 };
  }

  // Create THREE.js quaternion
  const q = new THREE.Quaternion(
    quaternion.x || 0,
    quaternion.y || 0,
    quaternion.z || 0,
    quaternion.w || 1
  );

  // Create Euler angles
  const euler = new THREE.Euler();
  euler.setFromQuaternion(q, 'XYZ');

  // Return in roll, pitch, yaw format (converted to degrees)
  return {
    roll: euler.x * 180 / Math.PI,
    pitch: euler.y * 180 / Math.PI,
    yaw: euler.z * 180 / Math.PI
  };
};

/**
 * Utility function to convert Euler angles to quaternion
 * @param {Object} euler - Euler angles in degrees { roll, pitch, yaw }
 * @returns {Object} Quaternion { x, y, z, w }
 */
const eulerToQuaternion = (euler) => {
  // Convert degrees to radians
  const rollRad = (euler.roll || 0) * Math.PI / 180;
  const pitchRad = (euler.pitch || 0) * Math.PI / 180;
  const yawRad = (euler.yaw || 0) * Math.PI / 180;
  
  // Create Euler and quaternion
  const e = new THREE.Euler(rollRad, pitchRad, yawRad, 'XYZ');
  const q = new THREE.Quaternion();
  q.setFromEuler(e);
  
  return {
    x: q.x,
    y: q.y,
    z: q.z,
    w: q.w
  };
};

/**
 * Complete IK hook that provides all functionality needed for IK operations
 * Acts as a facade to aggregate data from multiple contexts
 * 
 * @param {string|null} robotIdOverride - Optional robot ID to override context
 * @returns {Object} Complete IK API with all necessary data and functions
 */
export const useIK = (robotIdOverride = null) => {
  // Get core IK context
  const ikContext = useIKContext();
  
  // Get robot-related data
  const { activeId: contextRobotId } = useRobotSelection();
  const { getRobot, isRobotLoaded } = useRobotManager();
  
  // Get joint context for animation state
  const jointContext = useJointContext();
  
  // Determine which robot ID to use
  const robotId = robotIdOverride || contextRobotId;
  
  // Get robot instance and state
  const robot = getRobot(robotId);
  const isReady = isRobotLoaded(robotId) && ikContext.isReady;
  
  // Get joint control functions
  const { getJointValues, updateJoints } = useJoints(robotId);
  
  // Get TCP state
  const tcp = useTCP(robotId);
  const { 
    endEffector: { hasValid: hasValidEndEffector, isUsing: isUsingTCP },
    utils: { getCurrentEndEffectorPoint, getCurrentEndEffectorOrientation },
    tool: { offset: tcpOffset }
  } = tcp;
  
  // Get animation state from joint context
  const isAnimating = robotId ? jointContext.isRobotAnimating(robotId) : false;
  
  // Robot state helpers
  const hasJoints = robot && robot.joints && Object.keys(robot.joints).length > 0;
  const canOperate = isReady && hasJoints && robotId && hasValidEndEffector;
  
  // Get current Euler angles from quaternion
  const currentEulerAngles = useMemo(() => {
    return quaternionToEuler(ikContext.currentEndEffector?.orientation);
  }, [ikContext.currentEndEffector?.orientation]);
  
  // Get target Euler angles from quaternion
  const targetEulerAngles = useMemo(() => {
    return quaternionToEuler(ikContext.targetOrientation);
  }, [ikContext.targetOrientation]);
  
  // Enhanced IK execution with validation
  const executeIKWithValidation = useCallback(async (position, orientation = null, options = {}) => {
    if (!canOperate) {
      console.warn('[useIK] Cannot execute IK - robot not ready');
      return { success: false, error: 'Robot not ready' };
    }
    
    if (isAnimating || ikContext.isAnimating) {
      console.warn('[useIK] Cannot execute IK - animation in progress');
      return { success: false, error: 'Animation in progress' };
    }
    
    // Emit start event
    EventBus.emit('ik:execution-started', {
      robotId,
      position,
      orientation,
      options
    });
    
    try {
      const result = await ikContext.executeIK(position, {
        ...options,
        targetOrientation: orientation
      });
      
      if (result.success) {
        EventBus.emit('ik:execution-completed', {
          robotId,
          solution: result.solution
        });
      } else {
        EventBus.emit('ik:execution-failed', {
          robotId,
          error: result.error
        });
      }
      
      return result;
    } catch (error) {
      EventBus.emit('ik:execution-error', {
        robotId,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }, [canOperate, isAnimating, ikContext, robotId]);
  
  // Move to target position with current settings
  const moveToTarget = useCallback(async (animate = true) => {
    const orientationQuat = eulerToQuaternion(targetEulerAngles);
    return executeIKWithValidation(ikContext.targetPosition, orientationQuat, { animate });
  }, [executeIKWithValidation, ikContext.targetPosition, targetEulerAngles]);
  
  // Move relative to current position
  const moveRelative = useCallback((axis, delta) => {
    const newTarget = { ...ikContext.targetPosition };
    newTarget[axis] = (newTarget[axis] || 0) + delta;
    ikContext.setTargetPosition(newTarget);
  }, [ikContext]);
  
  // Set target orientation in Euler angles
  const setTargetEulerAngles = useCallback((euler) => {
    const quaternion = eulerToQuaternion(euler);
    ikContext.setTargetOrientation(quaternion);
  }, [ikContext]);
  
  // Rotate relative (in Euler angles)
  const rotateRelative = useCallback((axis, delta) => {
    const currentEuler = targetEulerAngles;
    const newEuler = { ...currentEuler };
    newEuler[axis] = (newEuler[axis] || 0) + delta;
    setTargetEulerAngles(newEuler);
  }, [targetEulerAngles, setTargetEulerAngles]);
  
  // Sync target to current end effector
  const syncTargetToCurrent = useCallback(() => {
    // Set position
    const currentPos = getCurrentEndEffectorPoint();
    if (currentPos) {
      ikContext.setTargetPosition({
        x: currentPos.x || 0,
        y: currentPos.y || 0,
        z: currentPos.z || 0
      });
    }
    
    // Set orientation (already in Euler)
    setTargetEulerAngles(currentEulerAngles);
  }, [getCurrentEndEffectorPoint, currentEulerAngles, ikContext, setTargetEulerAngles]);
  
  // Get solver configuration with defaults
  const getSolverConfig = useCallback(() => {
    const config = ikContext.getSolverSettings(ikContext.currentSolver);
    return config || getDefaultSolverConfig(ikContext.currentSolver);
  }, [ikContext]);
  
  // Update solver configuration
  const updateSolverConfig = useCallback((config) => {
    ikContext.configureSolver(ikContext.currentSolver, config);
    
    EventBus.emit('ik:solver-configured', {
      robotId,
      solver: ikContext.currentSolver,
      config
    });
  }, [ikContext, robotId]);
  
  // Get default solver configuration
  const getDefaultSolverConfig = (solverName) => {
    const defaults = {
      'ccd': {
        maxIterations: 50,
        tolerance: 0.001,
        constraintsEnabled: true
      },
      'fabrik': {
        maxIterations: 20,
        tolerance: 0.01,
        chainLength: 'auto'
      },
      'jacobian': {
        dampingFactor: 0.1,
        stepSize: 0.1,
        maxIterations: 100,
        tolerance: 0.001
      }
    };
    
    return defaults[solverName] || {};
  };
  
  // Motion profile helpers
  const motionProfiles = ['linear', 'trapezoidal', 's-curve', 'cubic', 'quintic'];
  
  // Get position increment options
  const getPositionIncrements = () => [
    { label: '0.001m', value: 0.001 },
    { label: '0.01m', value: 0.01 },
    { label: '0.1m', value: 0.1 },
    { label: '1m', value: 1.0 }
  ];
  
  // Get rotation increment options
  const getRotationIncrements = () => [
    { label: '0.1°', value: 0.1 },
    { label: '1°', value: 1.0 },
    { label: '5°', value: 5.0 },
    { label: '10°', value: 10.0 }
  ];
  
  // Return complete API
  return {
    // Robot state
    robotId,
    robot,
    isReady,
    hasJoints,
    canOperate,
    
    // Current state
    current: {
      position: ikContext.currentEndEffector?.position || { x: 0, y: 0, z: 0 },
      orientation: ikContext.currentEndEffector?.orientation || { x: 0, y: 0, z: 0, w: 1 },
      eulerAngles: currentEulerAngles,
      endEffectorValid: hasValidEndEffector
    },
    
    // Target state
    target: {
      position: ikContext.targetPosition,
      orientation: ikContext.targetOrientation,
      eulerAngles: targetEulerAngles,
      setPosition: ikContext.setTargetPosition,
      setOrientation: ikContext.setTargetOrientation,
      setEulerAngles: setTargetEulerAngles
    },
    
    // Movement API
    movement: {
      executeIK: executeIKWithValidation,
      moveToTarget,
      moveRelative,
      rotateRelative,
      syncTargetToCurrent,
      stopAnimation: ikContext.stopAnimation
    },
    
    // Solver API
    solver: {
      current: ikContext.currentSolver,
      available: ikContext.availableSolvers,
      status: ikContext.solverStatus,
      setSolver: ikContext.setCurrentSolver,
      getConfig: getSolverConfig,
      updateConfig: updateSolverConfig,
      defaultConfigs: {
        ccd: getDefaultSolverConfig('ccd'),
        fabrik: getDefaultSolverConfig('fabrik'),
        jacobian: getDefaultSolverConfig('jacobian')
      }
    },
    
    // Animation state
    animation: {
      isAnimating: isAnimating || ikContext.isAnimating,
      progress: robotId ? jointContext.getAnimationProgress(robotId) : 0
    },
    
    // TCP state
    tcp: {
      isUsing: isUsingTCP,
      hasValid: hasValidEndEffector,
      offset: tcpOffset
    },
    
    // UI Helpers
    ui: {
      motionProfiles,
      positionIncrements: getPositionIncrements(),
      rotationIncrements: getRotationIncrements(),
      canExecute: canOperate && !ikContext.isAnimating && !isAnimating
    },
    
    // Status helpers
    status: {
      message: isAnimating ? 'Executing IK...' :
               isAnimating ? 'Animation in progress' :
               !hasValidEndEffector ? 'No valid end effector' :
               !isReady ? 'IK not ready' :
               'Ready',
      isReady: canOperate,
      isBusy: isAnimating || ikContext.isAnimating
    }
  };
};

// Export as default
export default useIK;