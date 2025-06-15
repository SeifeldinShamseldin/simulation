// src/contexts/hooks/useJoints.js - THIN WRAPPER ONLY
import { useCallback } from 'react';
import { useJointContext } from '../JointContext';
import { useRobotSelection } from './useRobot';

/**
 * Thin wrapper around JointContext for component convenience
 * NO DUPLICATE LOGIC - just passes through to context
 */
export const useJoints = (robotId = null) => {
  const context = useJointContext();
  const { activeId: activeRobotId } = useRobotSelection();
  
  // Use provided robotId or fall back to active robot
  const targetRobotId = robotId || activeRobotId;
  
  // Just wrap context methods with robotId
  return {
    // Robot identification
    robotId: targetRobotId,
    
    // Core operations
    setJointValue: useCallback((jointName, value) => 
      context.setJointValue(targetRobotId, jointName, value), 
      [context, targetRobotId]
    ),
    
    setJointValues: useCallback((values) => 
      context.setJointValues(targetRobotId, values), 
      [context, targetRobotId]
    ),
    
    getJointValues: useCallback(() => 
      context.getJointValues(targetRobotId), 
      [context, targetRobotId]
    ),
    
    resetJoints: useCallback(() => 
      context.resetJoints(targetRobotId), 
      [context, targetRobotId]
    ),
    
    // Animation
    animateToValues: useCallback((values, options) => 
      context.animateToValues(targetRobotId, values, options), 
      [context, targetRobotId]
    ),
    
    stopAnimation: useCallback(() => 
      context.stopAnimation(targetRobotId), 
      [context, targetRobotId]
    ),
    
    // State
    jointInfo: context.getJointInfo(targetRobotId),
    isAnimating: context.isAnimating(targetRobotId),
    animationProgress: context.getAnimationProgress(targetRobotId),
    
    // Convenience getters
    getJointLimits: useCallback((jointName) => {
      const joint = context.getJointInfo(targetRobotId).find(j => j.name === jointName);
      return joint?.limits || { lower: -Math.PI, upper: Math.PI };
    }, [context, targetRobotId]),
    
    // State checks
    hasJoints: context.getJointInfo(targetRobotId).length > 0,
    hasMovableJoints: context.getMovableJoints(targetRobotId).length > 0,
    getMovableJoints: useCallback(() => 
      context.getMovableJoints(targetRobotId),
      [context, targetRobotId]
    ),
    hasRobot: !!targetRobotId,
    jointCount: context.getJointInfo(targetRobotId).length
  };
};

export default useJoints;