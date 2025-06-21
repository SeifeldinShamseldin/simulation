// src/contexts/hooks/useJoints.js
// Complete facade hook that aggregates all joint-related functionality

import { useCallback, useMemo, useContext } from 'react';
import { JointContext } from '../JointContext';
import { useRobotManager, useRobotSelection } from './useRobotManager';
import { useRobotContext } from '../RobotContext';
import { useAnimationContext } from '../AnimationContext';
import EventBus from '../../utils/EventBus';

// Helper to use Joint context
const useJointContext = () => {
  const context = useContext(JointContext);
  if (!context) {
    throw new Error('useJointContext must be used within JointProvider');
  }
  return context;
};

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
  
  // Get animation state
  const animationContext = useAnimationContext();
  
  // Determine which robot ID to use
  const robotId = robotIdOverride || contextRobotId;
  
  // Get robot instance and state
  const robot = robotId ? getRobot(robotId) : null;
  const isReady = robotId ? isRobotLoaded(robotId) : false;
  const isRobotReadyForControl = robotId ? isRobotReady(robotId) : false;
  
  // Get joint info for target robot
  const jointInfo = useMemo(() => {
    if (!robotId) return [];
    return jointContext.getJointInfo(robotId);
  }, [robotId, jointContext]);
  
  // Get joint values for target robot
  const jointValues = useMemo(() => {
    if (!robotId) return {};
    return jointContext.getJointValues(robotId);
  }, [robotId, jointContext]);
  
  // Get animation state for target robot
  const isAnimating = useMemo(() => {
    if (!robotId) return false;
    return jointContext.isRobotAnimating(robotId) || animationContext.isAnimating;
  }, [robotId, jointContext, animationContext]);
  
  const animationProgress = useMemo(() => {
    if (!robotId) return 0;
    const jointProgress = jointContext.getAnimationProgress(robotId);
    const globalProgress = animationContext.progress || animationContext.animationProgress || 0;
    return Math.max(jointProgress, globalProgress);
  }, [robotId, jointContext, animationContext]);
  
  // Check if robot has joints
  const hasJoints = useMemo(() => {
    return jointInfo.length > 0;
  }, [jointInfo]);
  
  // Get movable joints
  const getMovableJoints = useCallback(() => {
    return jointInfo.filter(joint => 
      joint.type === 'revolute' || 
      joint.type === 'prismatic' || 
      joint.type === 'continuous'
    );
  }, [jointInfo]);
  
  const movableJoints = useMemo(() => getMovableJoints(), [getMovableJoints]);
  
  const hasMovableJoints = useMemo(() => {
    return movableJoints.length > 0;
  }, [movableJoints]);
  
  // Get joint value with validation
  const getJointValue = useCallback((jointName) => {
    return jointValues[jointName] || 0;
  }, [jointValues]);
  
  // Get joint limits
  const getJointLimits = useCallback((jointName) => {
    if (!robotId) return { lower: -Math.PI, upper: Math.PI };
    return jointContext.getJointLimits(robotId, jointName);
  }, [robotId, jointContext]);
  
  // Set joint value with validation and event emission
  const setJointValue = useCallback((jointName, value) => {
    if (!robotId) {
      console.warn('[useJoints] No robot ID for joint control');
      return false;
    }
    
    if (!isRobotReadyForControl) {
      console.warn('[useJoints] Robot not ready for joint updates');
      return false;
    }
    
    const success = jointContext.setJointValue(robotId, jointName, value);
    
    if (success) {
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
  }, [robotId, isRobotReadyForControl, jointContext]);
  
  // Set multiple joint values
  const setJointValues = useCallback((values) => {
    if (!robotId) {
      console.warn('[useJoints] No robot ID for joint control');
      return false;
    }
    
    if (!isRobotReadyForControl) {
      console.warn('[useJoints] Robot not ready for joint updates');
      return false;
    }
    
    const success = jointContext.setJointValues(robotId, values);
    
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
    if (!robotId) {
      console.warn('[useJoints] No robot ID for joint reset');
      return false;
    }
    
    if (!isRobotReadyForControl) {
      console.warn('[useJoints] Robot not ready for reset');
      return false;
    }
    
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