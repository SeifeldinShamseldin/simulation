// src/contexts/hooks/useJoints.js - Enhanced joint management hook
import { useCallback } from 'react';
import { useJointContext } from '../JointContext';
import { useRobotSelection } from './useRobot';
import EventBus from '../../utils/EventBus';

export const useJoints = (robotId = null) => {
  const {
    robotJoints,
    robotJointValues,
    isAnimating,
    animationProgress,
    setJointValue,
    setJointValues: contextSetJointValues,
    resetJoints,
    getJointInfo,
    getJointValues,
    getJointLimits,
    isRobotAnimating,
    getAnimationProgress,
    stopAnimation
  } = useJointContext();
  
  const { activeId: activeRobotId } = useRobotSelection();
  
  // Use provided robotId or fall back to active robot
  const targetRobotId = robotId || activeRobotId;
  
  // Get data for target robot
  const jointInfo = targetRobotId ? getJointInfo(targetRobotId) : [];
  const jointValues = targetRobotId ? getJointValues(targetRobotId) : {};
  const isRobotAnimating_current = targetRobotId ? isRobotAnimating(targetRobotId) : false;
  const animationProgress_current = targetRobotId ? getAnimationProgress(targetRobotId) : 0;
  
  // Enhanced joint value setting with fallback mechanisms
  const setRobotJointValue = useCallback((jointName, value) => {
    if (!targetRobotId) {
      console.warn('[useJoints] No target robot for joint control');
      return false;
    }

    console.log(`[useJoints] Setting joint ${jointName} = ${value} for robot ${targetRobotId}`);
    
    // Try context's setJointValue first
    const success = setJointValue(targetRobotId, jointName, value);
    
    if (success) {
      // Emit joint change event
      EventBus.emit('robot:joint-changed', {
        robotId: targetRobotId,
        robotName: targetRobotId,
        jointName,
        value,
        allValues: getJointValues(targetRobotId)
      });
    }
    
    return success;
  }, [targetRobotId, setJointValue, getJointValues]);

  // Enhanced multiple joint value setting
  const setRobotJointValues = useCallback((values) => {
    if (!targetRobotId) {
      console.warn('[useJoints] No target robot for joint control');
      return false;
    }

    console.log(`[useJoints] Setting joint values for robot ${targetRobotId}:`, values);
    
    // Try context's setJointValues first
    const success = contextSetJointValues(targetRobotId, values);
    
    if (success) {
      // Emit joint change event
      EventBus.emit('robot:joints-changed', {
        robotId: targetRobotId,
        robotName: targetRobotId,
        values,
        allValues: { ...getJointValues(targetRobotId), ...values }
      });
    }
    
    return success;
  }, [targetRobotId, contextSetJointValues, getJointValues]);
  
  const resetRobotJoints = useCallback(() => {
    if (!targetRobotId) {
      console.warn('[useJoints] No target robot for joint reset');
      return;
    }
    
    console.log(`[useJoints] Resetting joints for robot ${targetRobotId}`);
    resetJoints(targetRobotId);
  }, [targetRobotId, resetJoints]);
  
  const getRobotJointLimits = useCallback((jointName) => {
    if (!targetRobotId) return {};
    return getJointLimits(targetRobotId, jointName);
  }, [targetRobotId, getJointLimits]);
  
  const stopRobotAnimation = useCallback(() => {
    if (!targetRobotId) {
      console.warn('[useJoints] No target robot for animation stop');
      return;
    }
    
    console.log(`[useJoints] Stopping animation for robot ${targetRobotId}`);
    stopAnimation(targetRobotId);
  }, [targetRobotId, stopAnimation]);
  
  // Convenience methods
  const getJointValue = useCallback((jointName) => {
    return jointValues[jointName] || 0;
  }, [jointValues]);
  
  const hasJoint = useCallback((jointName) => {
    return jointInfo.some(joint => joint.name === jointName);
  }, [jointInfo]);
  
  const getMovableJoints = useCallback(() => {
    return jointInfo.filter(joint => joint.type !== 'fixed');
  }, [jointInfo]);
  
  const getJointByName = useCallback((jointName) => {
    return jointInfo.find(joint => joint.name === jointName);
  }, [jointInfo]);
  
  return {
    // Robot identification
    robotId: targetRobotId,
    
    // Joint data for current robot
    jointInfo,
    jointValues,
    isAnimating: isRobotAnimating_current,
    animationProgress: animationProgress_current,
    
    // Robot-specific methods
    setJointValue: setRobotJointValue,
    setJointValues: setRobotJointValues,
    resetJoints: resetRobotJoints,
    getJointLimits: getRobotJointLimits,
    stopAnimation: stopRobotAnimation,
    
    // Convenience methods
    getJointValue,
    hasJoint,
    getMovableJoints,
    getJointByName,
    
    // State checks
    hasJoints: jointInfo.length > 0,
    hasMovableJoints: jointInfo.some(joint => joint.type !== 'fixed'),
    jointCount: jointInfo.length,
    movableJointCount: jointInfo.filter(joint => joint.type !== 'fixed').length
  };
};

export default useJoints;