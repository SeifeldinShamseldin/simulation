// src/contexts/hooks/useJoints.js
// Complete facade hook that aggregates all joint-related functionality

import { useCallback, useMemo, useContext } from 'react';
import { JointContext } from '../JointContext';
import { useRobotManager, useRobotSelection } from './useRobotManager';
import { useRobotContext } from '../RobotContext';
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
  
  // Determine which robot ID to use
  const robotId = robotIdOverride || contextRobotId;
  
  // Get robot instance and state
  const robot = robotId ? getRobot(robotId) : null;
  const isReady = robotId ? isRobotLoaded(robotId) : false;
  
  // Get joint info for target robot
  const jointInfo = useMemo(() => {
    if (!robotId) return [];
    return jointContext.getJointInfo(robotId);
  }, [robotId, jointContext]);
  
  // Get joint values
  const jointValues = useMemo(() => {
    if (!robotId) return {};
    return jointContext.getJointValues(robotId);
  }, [robotId, jointContext]);
  
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
  
  // Event-driven joint operations
  const setJointValue = useCallback((jointName, value) => {
    if (!robotId) {
      console.warn('[useJoints] No robot ID for joint control');
      return false;
    }
    EventBus.emit('joint:command:set-value', { robotId, jointName, value });
    return true;
  }, [robotId]);

  const setJointValues = useCallback((values) => {
    if (!robotId) {
      console.warn('[useJoints] No robot ID for joint control');
      return false;
    }
    EventBus.emit('joint:command:set-values', { robotId, values });
    return true;
  }, [robotId]);

  const resetJoints = useCallback(() => {
    if (!robotId) {
      console.warn('[useJoints] No robot ID for joint reset');
      return false;
    }
    EventBus.emit('joint:command:reset', { robotId });
    return true;
  }, [robotId]);
  
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
    
    // Joint data
    jointInfo,
    jointValues,
    hasJoints,
    hasMovableJoints,
    movableJoints,
    
    // Animation state - REMOVED
    isAnimating: false, // Always false
    animationProgress: 0, // Always 0
    progress: 0, // Alias for compatibility
    
    // Joint operations
    getJointValue,
    getJointLimits,
    getJointRange,
    setJointValue,
    setJointValues,
    resetJoints,
    stopAnimation: () => {}, // No-op
    
    // Joint queries
    getMovableJoints,
    getAllJointNames,
    getJointType,
    isJointMovable,
    
    // Debug
    debugJoint
  };
};

// Export as default
export default useJoints;