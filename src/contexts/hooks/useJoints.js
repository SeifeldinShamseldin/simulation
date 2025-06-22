// src/contexts/hooks/useJoints.js
// Complete facade hook that aggregates all joint-related functionality

import { useEffect, useCallback, useMemo, useContext, useState } from 'react';
import { JointContext } from '../JointContext';
import { useRobotManager, useRobotSelection } from './useRobotManager';
import { useRobotContext } from '../RobotContext';
import EventBus from '../../utils/EventBus';
import * as DataTransfer from '../dataTransfer';
import { JointEvents } from '../dataTransfer';

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
* Listens to joint commands to display target/commanded positions in UI
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
const { isRobotReady, robotId } = useRobotContext();

// Determine which robot ID to use
const robotIdToUse = robotIdOverride || contextRobotId;

// State to track commanded joint values (where joints are going)
const [commandedValues, setCommandedValues] = useState({});

// Get robot instance and state
const robot = robotIdToUse ? getRobot(robotIdToUse) : null;
const isReady = robotIdToUse ? isRobotLoaded(robotIdToUse) : false;

// Get joint info for target robot
const jointInfo = useMemo(() => {
  if (!robotIdToUse) return [];
  return jointContext.getJointInfo(robotIdToUse);
}, [robotIdToUse, jointContext]);

// Get joint values
const jointValues = useMemo(() => {
  if (!robotIdToUse) return {};
  return jointContext.getJointValues(robotIdToUse);
}, [robotIdToUse, jointContext]);

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

// Get joint value - returns commanded value if available, otherwise actual value
const getJointValue = useCallback((jointName) => {
  // Return commanded value if we have one, otherwise fall back to actual value
  if (jointName in commandedValues) {
    return commandedValues[jointName];
  }
  return jointValues[jointName] || 0;
}, [jointValues, commandedValues]);

// Get joint limits
const getJointLimits = useCallback((jointName) => {
  if (!robotIdToUse) return { lower: -Math.PI, upper: Math.PI };
  return jointContext.getJointLimits(robotIdToUse, jointName);
}, [robotIdToUse, jointContext]);

// Event-driven joint operations using JointEvents
const setJointValue = useCallback((jointName, value) => {
  if (!robotIdToUse) {
    console.warn('[useJoints] No robot ID for joint control');
    return false;
  }
  EventBus.emit(JointEvents.Commands.SET_VALUE, { robotId: robotIdToUse, jointName, value });
  return true;
}, [robotIdToUse]);

const setJointValues = useCallback((values) => {
  if (!robotIdToUse) {
    console.warn('[useJoints] No robot ID for joint control');
    return false;
  }
  EventBus.emit(JointEvents.Commands.SET_VALUES, { robotId: robotIdToUse, values });
  return true;
}, [robotIdToUse]);

const resetJoints = useCallback(() => {
  if (!robotIdToUse) {
    console.warn('[useJoints] No robot ID for joint reset');
    return false;
  }
  EventBus.emit(JointEvents.Commands.RESET, { robotId: robotIdToUse });
  return true;
}, [robotIdToUse]);

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

useEffect(() => {
  if (
    robotIdToUse &&
    Object.keys(jointValues).length > 0 &&
    Object.keys(commandedValues).length === 0
  ) {
    setCommandedValues(jointValues);
  }
}, [robotIdToUse, jointValues, commandedValues]);

// Listen to joint command events to update UI with target positions
useEffect(() => {
  if (!robotIdToUse) return;
  
  // Listen for single joint command
  const handleSetValueCommand = (data) => {
    if (data.robotId === robotIdToUse) {
      setCommandedValues(prev => ({
        ...prev,
        [data.jointName]: data.value
      }));
    }
  };
  
  // Listen for multiple joint commands
  const handleSetValuesCommand = (data) => {
    if (data.robotId === robotIdToUse) {
      setCommandedValues(prev => ({
        ...prev,
        ...data.values
      }));
    }
  };
  
  // Listen for reset command
  const handleResetCommand = (data) => {
    if (data.robotId === robotIdToUse) {
      // Reset all joints to 0
      const resetValues = {};
      jointInfo.forEach(joint => {
        resetValues[joint.name] = 0;
      });
      setCommandedValues(resetValues);
    }
  };
  
  // Subscribe to command events
  const unsubSetValue = EventBus.on(JointEvents.Commands.SET_VALUE, handleSetValueCommand);
  const unsubSetValues = EventBus.on(JointEvents.Commands.SET_VALUES, handleSetValuesCommand);
  const unsubReset = EventBus.on(JointEvents.Commands.RESET, handleResetCommand);
  
  return () => {
    unsubSetValue();
    unsubSetValues();
    unsubReset();
  };
}, [robotIdToUse, jointInfo]);

// Return complete API
return {
  // Robot state
  robotId: robotIdToUse,
  robot,
  isReady,
  
  // Joint data
  jointInfo,
  jointValues,
  hasJoints,
  hasMovableJoints,
  movableJoints,
  
  // Joint operations
  getJointValue,
  getJointLimits,
  getJointRange,
  setJointValue,
  setJointValues,
  resetJoints,
  
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