// src/contexts/hooks/useJoints.js
// Enhanced with debugging to trace joint value flow

import { useCallback, useMemo, useEffect } from 'react';
import { useJointContext } from '../JointContext';
import { useRobotManager, useRobotSelection } from './useRobotManager';
import { useRobotContext } from '../RobotContext';
import EventBus from '../../utils/EventBus';

/**
 * Complete joints hook that provides all functionality needed for joint operations
 * Acts as a facade to aggregate data from multiple contexts
 * 
 * @param {string|null} robotIdOverride - Optional robot ID to override context
 * @returns {Object} Complete joints API with all necessary data and functions
 */
export const useJoints = (robotIdOverride = null) => {
  // Get core joint context
  const jointContext = useJointContext();
  
  // Get robot-related data
  const { activeId: contextRobotId } = useRobotSelection();
  const { getRobot, isRobotLoaded } = useRobotManager();
  const { isRobotReady } = useRobotContext();
  
  // Determine which robot ID to use
  const robotId = robotIdOverride || contextRobotId;
  
  // Debug when robotId changes
  useEffect(() => {
    console.log('[useJoints] Robot ID:', robotId);
    console.log('[useJoints] Context robot ID:', contextRobotId);
    console.log('[useJoints] Override ID:', robotIdOverride);
  }, [robotId, contextRobotId, robotIdOverride]);
  
  // Get robot instance and state
  const robot = robotId ? getRobot(robotId) : null;
  const isReady = robotId ? isRobotLoaded(robotId) : false;
  const isRobotReadyForControl = robotId ? isRobotReady(robotId) : false;
  
  // Debug robot state
  useEffect(() => {
    console.log('[useJoints] Robot ready state:', {
      robotId,
      isReady,
      isRobotReadyForControl,
      hasRobot: !!robot
    });
  }, [robotId, isReady, isRobotReadyForControl, robot]);
  
  // Get joint info for target robot
  const jointInfo = useMemo(() => {
    if (!robotId) return [];
    const info = jointContext.getJointInfo(robotId);
    console.log('[useJoints] Joint info for', robotId, ':', info);
    return info;
  }, [robotId, jointContext]);
  
  // Get joint values
  const jointValues = useMemo(() => {
    if (!robotId) return {};
    const values = jointContext.getJointValues(robotId);
    console.log('[useJoints] Joint values for', robotId, ':', values);
    return values;
  }, [robotId, jointContext]);
  
  // Get animation state for target robot
  const isAnimating = useMemo(() => {
    if (!robotId) return false;
    return jointContext.isRobotAnimating(robotId);
  }, [robotId, jointContext]);
  
  const animationProgress = useMemo(() => {
    if (!robotId) return 0;
    return jointContext.getAnimationProgress(robotId);
  }, [robotId, jointContext]);
  
  // Check if robot has joints
  const hasJoints = useMemo(() => {
    return jointInfo.length > 0;
  }, [jointInfo]);
  
  // Get movable joints
  const getMovableJoints = useCallback(() => {
    const movable = jointInfo.filter(joint => 
      joint.type === 'revolute' || 
      joint.type === 'prismatic' || 
      joint.type === 'continuous'
    );
    console.log('[useJoints] Movable joints:', movable);
    return movable;
  }, [jointInfo]);
  
  const movableJoints = useMemo(() => getMovableJoints(), [getMovableJoints]);
  
  const hasMovableJoints = useMemo(() => {
    return movableJoints.length > 0;
  }, [movableJoints]);
  
  // Get joint value with validation
  const getJointValue = useCallback((jointName) => {
    const value = jointValues[jointName] || 0;
    console.log(`[useJoints] getJointValue(${jointName}) = ${value}`);
    return value;
  }, [jointValues]);
  
  // Get joint limits
  const getJointLimits = useCallback((jointName) => {
    if (!robotId) return { lower: -Math.PI, upper: Math.PI };
    const limits = jointContext.getJointLimits(robotId, jointName);
    console.log(`[useJoints] getJointLimits(${jointName}) =`, limits);
    return limits;
  }, [robotId, jointContext]);
  
  // Set joint value with validation and event emission
  const setJointValue = useCallback((jointName, value) => {
    console.log(`[useJoints] setJointValue called: ${jointName} = ${value}`);
    console.log('[useJoints] Current robotId:', robotId);
    console.log('[useJoints] Robot ready for control:', isRobotReadyForControl);
    console.log('[useJoints] Current joint values:', jointValues);
    
    if (!robotId) {
      console.warn('[useJoints] No robot ID for joint control');
      return false;
    }
    
    if (!isRobotReadyForControl) {
      console.warn('[useJoints] Robot not ready for joint updates');
      return false;
    }
    
    console.log(`[useJoints] Calling jointContext.setJointValue(${robotId}, ${jointName}, ${value})`);
    
    const success = jointContext.setJointValue(robotId, jointName, value);
    
    console.log(`[useJoints] jointContext.setJointValue returned: ${success}`);
    
    if (success) {
      console.log('[useJoints] Emitting robot:joint-changed event');
      // Emit joint change event
      EventBus.emit('robot:joint-changed', {
        robotId,
        robotName: robotId,
        jointName,
        value,
        allValues: jointContext.getJointValues(robotId)
      });
    }
    
    return success;
  }, [robotId, isRobotReadyForControl, jointContext, jointValues]);
  
  // Set multiple joint values
  const setJointValues = useCallback((values) => {
    console.log('[useJoints] setJointValues called:', values);
    console.log('[useJoints] Current robotId:', robotId);
    
    if (!robotId) {
      console.warn('[useJoints] No robot ID for joint control');
      return false;
    }
    
    if (!isRobotReadyForControl) {
      console.warn('[useJoints] Robot not ready for joint updates');
      return false;
    }
    
    const success = jointContext.setJointValues(robotId, values);
    
    console.log(`[useJoints] jointContext.setJointValues returned: ${success}`);
    
    if (success) {
      // Emit joint change event
      EventBus.emit('robot:joints-changed', {
        robotId,
        robotName: robotId,
        values,
        allValues: { ...jointContext.getJointValues(robotId), ...values }
      });
    }
    
    return success;
  }, [robotId, isRobotReadyForControl, jointContext]);
  
  // Reset joints with validation
  const resetJoints = useCallback(() => {
    console.log('[useJoints] resetJoints called');
    console.log('[useJoints] Current robotId:', robotId);
    
    if (!robotId) {
      console.warn('[useJoints] No robot ID for joint reset');
      return false;
    }
    
    if (!isRobotReadyForControl) {
      console.warn('[useJoints] Robot not ready for reset');
      return false;
    }
    
    console.log(`[useJoints] Calling jointContext.resetJoints(${robotId})`);
    jointContext.resetJoints(robotId);
    
    // Emit reset event
    EventBus.emit('robot:joints-reset', {
      robotId,
      robotName: robotId
    });
    
    return true;
  }, [robotId, isRobotReadyForControl, jointContext]);
  
  // Stop animation
  const stopAnimation = useCallback(() => {
    if (!robotId) return;
    jointContext.stopAnimation(robotId);
  }, [robotId, jointContext]);
  
  // Get all joint names
  const getAllJointNames = useCallback(() => {
    return jointInfo.map(joint => joint.name);
  }, [jointInfo]);
  
  // Get joint type
  const getJointType = useCallback((jointName) => {
    const joint = jointInfo.find(j => j.name === jointName);
    return joint?.type || 'unknown';
  }, [jointInfo]);
  
  // Check if joint is movable
  const isJointMovable = useCallback((jointName) => {
    const joint = jointInfo.find(j => j.name === jointName);
    return joint && (
      joint.type === 'revolute' || 
      joint.type === 'prismatic' || 
      joint.type === 'continuous'
    );
  }, [jointInfo]);
  
  // Get joint range
  const getJointRange = useCallback((jointName) => {
    const limits = getJointLimits(jointName);
    return {
      min: limits.lower ?? -Math.PI,
      max: limits.upper ?? Math.PI,
      range: (limits.upper ?? Math.PI) - (limits.lower ?? -Math.PI)
    };
  }, [getJointLimits]);
  
  // Debug logging utilities
  const debugJoint = useCallback((message) => {
    console.log(`[useJoints] ${message}`);
  }, []);
  
  // Return complete API
  return {
    // Robot state
    robotId,
    robot,
    isReady,
    isRobotReady: isRobotReadyForControl,
    
    // Joint data
    jointInfo,
    jointValues,
    hasJoints,
    hasMovableJoints,
    movableJoints,
    
    // Animation state
    isAnimating,
    animationProgress,
    progress: animationProgress, // Alias for compatibility
    
    // Joint operations
    getJointValue,
    getJointLimits,
    getJointRange,
    setJointValue,
    setJointValues,
    resetJoints,
    stopAnimation,
    
    // Joint queries
    getMovableJoints,
    getAllJointNames,
    getJointType,
    isJointMovable,
    
    // Utility
    debugJoint,
    
    // Status helpers
    status: {
      message: isAnimating ? `Animating... ${Math.round(animationProgress * 100)}%` :
               !isRobotReadyForControl ? 'Robot Loading...' :
               !hasJoints ? 'No joints' :
               !hasMovableJoints ? 'No movable joints' :
               'Ready',
      canControl: isRobotReadyForControl && !isAnimating && hasMovableJoints,
      jointCount: jointInfo.length,
      movableCount: movableJoints.length
    }
  };
};

// Export as default
export default useJoints;