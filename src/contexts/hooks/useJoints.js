// src/contexts/hooks/useJoints.js - Simple data transfer hook
import { useCallback, useState, useEffect } from 'react';
import { useJointContext } from '../JointContext';
import { useViewer } from '../ViewerContext';
import { useRobot } from '../RobotContext';
import EventBus from '../../utils/EventBus';

export const useJoints = (robotId = null) => {
  const {
    robotJoints,
    robotJointValues,
    isAnimating,
    animationProgress,
    setJointValue,
    setJointValues,
    resetJoints,
    getJointInfo,
    getJointValues,
    getJointLimits,
    isRobotAnimating,
    getAnimationProgress,
    stopAnimation
  } = useJointContext();
  
  const { activeRobotId } = useRobot();
  
  // Use provided robotId or fall back to active robot
  const targetRobotId = robotId || activeRobotId;
  
  // Get data for target robot
  const jointInfo = targetRobotId ? getJointInfo(targetRobotId) : [];
  const jointValues = targetRobotId ? getJointValues(targetRobotId) : {};
  const isRobotAnimating_current = targetRobotId ? isRobotAnimating(targetRobotId) : false;
  const animationProgress_current = targetRobotId ? getAnimationProgress(targetRobotId) : 0;
  
  // Robot-specific methods
  const setRobotJointValue = useCallback((jointName, value) => {
    if (!targetRobotId) return false;
    return setJointValue(targetRobotId, jointName, value);
  }, [targetRobotId, setJointValue]);
  
  const setRobotJointValues = useCallback((values) => {
    if (!targetRobotId) return false;
    return setJointValues(targetRobotId, values);
  }, [targetRobotId, setJointValues]);
  
  const resetRobotJoints = useCallback(() => {
    if (!targetRobotId) return;
    resetJoints(targetRobotId);
  }, [targetRobotId, resetJoints]);
  
  const getRobotJointLimits = useCallback((jointName) => {
    if (!targetRobotId) return {};
    return getJointLimits(targetRobotId, jointName);
  }, [targetRobotId, getJointLimits]);
  
  const stopRobotAnimation = useCallback(() => {
    if (!targetRobotId) return;
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