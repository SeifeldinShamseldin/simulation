// src/contexts/hooks/useJoints.js
// Direct EventBus-based joint control - no JointContext dependency

import { useEffect, useCallback, useMemo, useState } from 'react';
import { useRobotManager, useRobotSelection } from './useRobotManager';
import { useRobotContext } from '../RobotContext';
import EventBus from '../../utils/EventBus';
import { RobotEvents } from '../dataTransfer';

/**
 * Direct EventBus-based joints hook that provides all functionality needed for joint operations
 * Uses EventBus commands directly instead of going through JointContext
 * 
 * @param {string|null} robotIdOverride - Optional robot ID to override context
 * @returns {Object} Complete joints API with all necessary data and functions
 */
export const useJoints = (robotIdOverride = null) => {
  // Get robot-related data
  const { activeId: contextRobotId } = useRobotSelection();
  const { getRobot, isRobotLoaded } = useRobotManager();
  const { isRobotReady, robotId } = useRobotContext();

  // Determine which robot ID to use
  const robotIdToUse = robotIdOverride || contextRobotId;

  // State to track joint info and values
  const [jointInfo, setJointInfo] = useState([]);
  const [jointValues, setJointValuesState] = useState({});
  const [commandedValues, setCommandedValues] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  // Get robot instance and state
  const robot = robotIdToUse ? getRobot(robotIdToUse) : null;
  const isReady = robotIdToUse ? isRobotLoaded(robotIdToUse) : false;

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
    const joint = jointInfo.find(j => j.name === jointName);
    return joint ? joint.limits : { lower: -Math.PI, upper: Math.PI };
  }, [robotIdToUse, jointInfo]);

  // Direct EventBus joint operations
  const setJointValue = useCallback((jointName, value) => {
    if (!robotIdToUse) {
      console.warn('[useJoints] No robot ID for joint control');
      return false;
    }
    
    const requestId = `set-joint-${Date.now()}-${Math.random()}`;
    
    // Update commanded values immediately for UI responsiveness
    setCommandedValues(prev => ({
      ...prev,
      [jointName]: value
    }));
    
    // Emit command directly to RobotContext
    EventBus.emit(RobotEvents.SET_JOINT_VALUE, { 
      robotId: robotIdToUse, 
      jointName, 
      value, 
      requestId 
    });
    
    return true;
  }, [robotIdToUse]);

  const setJointValues = useCallback((values) => {
    if (!robotIdToUse) {
      console.warn('[useJoints] No robot ID for joint control');
      return false;
    }
    
    const requestId = `set-joints-${Date.now()}-${Math.random()}`;
    
    // Update commanded values immediately for UI responsiveness
    setCommandedValues(prev => ({
      ...prev,
      ...values
    }));
    
    // Emit command directly to RobotContext
    EventBus.emit(RobotEvents.SET_JOINT_VALUES, { 
      robotId: robotIdToUse, 
      values, 
      requestId 
    });
    
    return true;
  }, [robotIdToUse]);

  const resetJoints = useCallback(() => {
    if (!robotIdToUse) {
      console.warn('[useJoints] No robot ID for joint reset');
      return false;
    }
    
    // Reset all joints to 0
    const resetValues = {};
    jointInfo.forEach(joint => {
      resetValues[joint.name] = 0;
    });
    
    // Use setJointValues to reset all joints
    const requestId = `reset-joints-${Date.now()}-${Math.random()}`;
    
    // Update commanded values immediately for UI responsiveness
    setCommandedValues(resetValues);
    
    // Emit command directly to RobotContext
    EventBus.emit(RobotEvents.SET_JOINT_VALUES, { 
      robotId: robotIdToUse, 
      values: resetValues, 
      requestId 
    });
    
    return true;
  }, [robotIdToUse, jointInfo]);

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

  // Proactively check for loaded robot on mount or when robotId changes
  useEffect(() => {
    if (robotIdToUse && isRobotLoaded(robotIdToUse)) {
      const robot = getRobot(robotIdToUse);
      if (robot) {
        const joints = [];
        const values = {};
        
        robot.traverse((child) => {
          if (child.isURDFJoint && child.jointType !== 'fixed') {
            joints.push({
              name: child.name,
              type: child.jointType,
              limits: child.limit || {},
              axis: child.axis ? child.axis.toArray() : [0, 0, 1]
            });
            values[child.name] = child.angle || 0;
          }
        });
        
        setJointInfo(joints);
        setJointValuesState(values);
        setCommandedValues(values);
      }
    }
  }, [robotIdToUse, isRobotLoaded, getRobot]);

  // Initialize commanded values when joint values are first available
  useEffect(() => {
    if (
      robotIdToUse &&
      Object.keys(jointValues).length > 0 &&
      Object.keys(commandedValues).length === 0
    ) {
      setCommandedValues(jointValues);
    }
  }, [robotIdToUse, jointValues, commandedValues]);

  // Listen for robot loaded events to extract joint info
  useEffect(() => {
    if (!robotIdToUse) return;
    
    const handleRobotLoaded = (data) => {
      const { robotName, robot, robotId } = data;
      const targetRobotId = robotId || robotName;
      
      if (targetRobotId === robotIdToUse && robot) {
        const joints = [];
        const values = {};
        
        robot.traverse((child) => {
          if (child.isURDFJoint && child.jointType !== 'fixed') {
            joints.push({
              name: child.name,
              type: child.jointType,
              limits: child.limit || {},
              axis: child.axis ? child.axis.toArray() : [0, 0, 1]
            });
            values[child.name] = child.angle || 0;
          }
        });
        
        setJointInfo(joints);
        setJointValuesState(values);
        setCommandedValues(values);
      }
    };

    const handleRobotRegistered = (data) => {
      const { robotId, robotName, robot } = data;
      const targetRobotId = robotId || robotName;
      
      if (targetRobotId === robotIdToUse && robot && jointInfo.length === 0) {
        handleRobotLoaded({ robotName: targetRobotId, robot, robotId: targetRobotId });
      }
    };

    const handleRobotRemoved = (data) => {
      const { robotName, robotId } = data;
      const targetRobotId = robotId || robotName;
      
      if (targetRobotId === robotIdToUse) {
        setJointInfo([]);
        setJointValuesState({});
        setCommandedValues({});
      }
    };

    const unsubLoaded = EventBus.on(RobotEvents.LOADED, handleRobotLoaded);
    const unsubRegistered = EventBus.on(RobotEvents.REGISTERED, handleRobotRegistered);
    const unsubRemoved = EventBus.on(RobotEvents.REMOVED, handleRobotRemoved);
    
    return () => {
      unsubLoaded();
      unsubRegistered();
      unsubRemoved();
    };
  }, [robotIdToUse, jointInfo.length]);

  // Listen for joint response events to update state
  useEffect(() => {
    if (!robotIdToUse) return;
    
    // Handle set joint value response
    const handleSetJointValue = ({ robotId, jointName, value, requestId }) => {
      if (robotId === robotIdToUse) {
        setJointValuesState(prev => ({
          ...prev,
          [jointName]: value
        }));
      }
    };

    // Handle set joint values response
    const handleSetJointValues = ({ robotId, values, requestId }) => {
      if (robotId === robotIdToUse) {
        setJointValuesState(prev => ({
          ...prev,
          ...(values || {})
        }));
      }
    };

    // Handle get joint values response
    const handleGetJointValues = ({ robotId, values, requestId }) => {
      if (robotId === robotIdToUse) {
        setJointValuesState(values || {});
        // Update commanded values if they haven't been set yet
        setCommandedValues(prev => {
          if (Object.keys(prev).length === 0) {
            return values || {};
          }
          return prev;
        });
      }
    };

    // Register listeners on the same event as the request
    const unsubSet = EventBus.on(RobotEvents.SET_JOINT_VALUE, handleSetJointValue);
    const unsubSetVals = EventBus.on(RobotEvents.SET_JOINT_VALUES, handleSetJointValues);
    const unsubGet = EventBus.on(RobotEvents.GET_JOINT_VALUES, handleGetJointValues);
    
    return () => {
      unsubSet();
      unsubSetVals();
      unsubGet();
    };
  }, [robotIdToUse]);

  // Poll for joint values via GET_JOINT_VALUES event every 200ms
  useEffect(() => {
    if (!robotIdToUse) return;
    let isMounted = true;
    let interval;
    let requestId = 'getvals_' + Date.now();

    const handleResponse = (data) => {
      if (isMounted && data.robotId === robotIdToUse && data.requestId === requestId) {
        setJointValuesState(data.values || {});
        // Update commanded values if they haven't been set yet
        setCommandedValues(prev => {
          if (Object.keys(prev).length === 0) {
            return data.values || {};
          }
          return prev;
        });
      }
    };
    
    const unsub = EventBus.on(RobotEvents.GET_JOINT_VALUES, handleResponse);

    // Poll every 200ms
    interval = setInterval(() => {
      requestId = 'getvals_' + Date.now();
      EventBus.emit(RobotEvents.GET_JOINT_VALUES, { robotId: robotIdToUse, requestId });
    }, 200);

    // Initial fetch
    EventBus.emit(RobotEvents.GET_JOINT_VALUES, { robotId: robotIdToUse, requestId });

    return () => {
      isMounted = false;
      clearInterval(interval);
      unsub();
    };
  }, [robotIdToUse]);

  // Return complete API
  return {
    // Robot state
    robotId: robotIdToUse,
    robot,
    isReady,
    isLoading,
    
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