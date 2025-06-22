// src/contexts/JointContext.jsx - Simplified for direct joint control
import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import EventBus from '../utils/EventBus';
import * as DataTransfer from './dataTransfer.js';
import { debug, debugJoint } from '../utils/DebugSystem';

export const JointContext = createContext();

export const JointProvider = ({ children }) => {
  const [robotJoints, setRobotJoints] = useState(new Map());
  const [robotJointValues, setRobotJointValues] = useState(new Map());
  
  const robotRegistryRef = useRef(new Map());

  const findRobotWithFallbacks = useCallback((robotId) => {
    if (!robotId) return null;
    debugJoint(`Looking for robot: ${robotId}`);
    if (robotRegistryRef.current.has(robotId)) {
      const robot = robotRegistryRef.current.get(robotId);
      debugJoint(`Found robot in local registry: ${robotId}`);
      return robot;
    }
    
    debugJoint(`Robot ${robotId} not found in local registry. It might not be loaded yet.`);
    return null;
  }, []);

  const getRobotJointValues = useCallback((robotId) => {
    const robot = findRobotWithFallbacks(robotId);
    if (!robot) {
      debugJoint(`Cannot get joint values - robot ${robotId} not found`);
      return {};
    }
    const values = {};
    try {
      debugJoint(`Getting joint values for ${robotId}`);
      if (robot.joints) {
        debugJoint(`Found robot.joints:`, Object.keys(robot.joints));
        Object.values(robot.joints).forEach(joint => {
          if (joint && joint.jointType !== 'fixed' && typeof joint.angle !== 'undefined') {
            values[joint.name] = joint.angle;
            debugJoint(`Read joint ${joint.name} = ${joint.angle}`);
          }
        });
        if (Object.keys(values).length > 0) {
          debugJoint(`✅ Got ${Object.keys(values).length} joint values via direct access:`, values);
          return values;
        }
      }
      if (robot.getJointValues && typeof robot.getJointValues === 'function') {
        const robotValues = robot.getJointValues();
        Object.assign(values, robotValues);
        debugJoint(`Got joint values via robot.getJointValues(): ${Object.keys(values).length} joints`);
        if (Object.keys(values).length > 0) {
          return values;
        }
      }
      if (robotManagerRef.current && robotManagerRef.current.getJointValues) {
        try {
          const managerValues = robotManagerRef.current.getJointValues(robotId);
          Object.assign(values, managerValues);
          debugJoint(`Got joint values via manager.getJointValues(): ${Object.keys(values).length} joints`);
          if (Object.keys(values).length > 0) {
            return values;
          }
        } catch (error) {
          debugJoint('Manager getJointValues failed:', error);
        }
      }
      debugJoint('Fallback: traversing robot object to find joints');
      const foundJoints = {};
      robot.traverse((child) => {
        if (child.isURDFJoint && child.jointType !== 'fixed' && typeof child.angle !== 'undefined') {
          foundJoints[child.name] = child.angle;
          debugJoint(`Found joint via traverse: ${child.name} = ${child.angle}`);
        }
      });
      if (Object.keys(foundJoints).length > 0) {
        debugJoint(`✅ Got ${Object.keys(foundJoints).length} joints via traverse:`, foundJoints);
        return foundJoints;
      }
      debugJoint(`❌ Could not retrieve any joint values for ${robotId}`);
      return {};
    } catch (error) {
      debugJoint(`Error getting joint values for ${robotId}:`, error);
      return {};
    }
  }, [findRobotWithFallbacks]);

  const ensureJointAngleSync = useCallback((robot, jointName, value) => {
    let success = false;
    if (robot.setJointValue && typeof robot.setJointValue === 'function') {
      success = robot.setJointValue(jointName, value);
      debugJoint(`robot.setJointValue(${jointName}, ${value}) = ${success}`);
    }
    if (!success && robot.joints && robot.joints[jointName]) {
      if (robot.joints[jointName].setJointValue) {
        success = robot.joints[jointName].setJointValue(value);
        debugJoint(`joint.setJointValue(${value}) = ${success}`);
      }
      if (robot.joints[jointName].setPosition) {
        robot.joints[jointName].setPosition(value);
      }
    }
    if (success && robot.updateMatrixWorld) {
      robot.updateMatrixWorld(true);
    }
    debugJoint(`✅ Joint sync for ${jointName} = ${value}, success: ${success}`);
    return success;
  }, []);

  useEffect(() => {
    const handleRobotLoaded = (data) => {
      const { robotName, robot, robotId } = data;
      const targetRobotId = robotId || robotName;
      if (!robot || !targetRobotId) return;
      debugJoint(`Robot loaded: ${targetRobotId}, extracting joint info`);
      robotRegistryRef.current.set(targetRobotId, robot);
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
      setRobotJoints(prev => new Map(prev).set(targetRobotId, joints));
      setRobotJointValues(prev => new Map(prev).set(targetRobotId, values));
      debugJoint(`Extracted ${joints.length} joints for ${targetRobotId}`);
      debugJoint(`Joint values:`, values);
    };

    const handleRobotRegistered = (data) => {
      const { robotId, robotName, robot } = data;
      const targetRobotId = robotId || robotName;
      if (!robot || !targetRobotId) return;
      debugJoint(`Robot registered: ${targetRobotId}`);
      robotRegistryRef.current.set(targetRobotId, robot);
      if (!robotJoints.has(targetRobotId)) {
        handleRobotLoaded({ robotName: targetRobotId, robot, robotId: targetRobotId });
      }
    };

    const handleRobotRemoved = (data) => {
      const { robotName, robotId } = data;
      const targetRobotId = robotId || robotName;
      debugJoint(`Robot removed: ${targetRobotId}`);
      robotRegistryRef.current.delete(targetRobotId);
      setRobotJoints(prev => {
        const newMap = new Map(prev);
        newMap.delete(targetRobotId);
        return newMap;
      });
      setRobotJointValues(prev => {
        const newMap = new Map(prev);
        newMap.delete(targetRobotId);
        return newMap;
      });
    };

    const unsubscribeLoaded = EventBus.on('robot:loaded', handleRobotLoaded);
    const unsubscribeRegistered = EventBus.on('robot:registered', handleRobotRegistered);
    const unsubscribeRemoved = EventBus.on('robot:removed', handleRobotRemoved);
    
    return () => {
      unsubscribeLoaded();
      unsubscribeRegistered();
      unsubscribeRemoved();
    };
  }, [robotJoints]);

  // ========== EVENT-DRIVEN JOINT CONTROL ========== //
  useEffect(() => {
    // Set single joint value
    const handleSetJointValue = ({ robotId, jointName, value, requestId }) => {
      debugJoint(`Event: set joint ${jointName} = ${value} for robot ${robotId}`);
      const robot = findRobotWithFallbacks(robotId);
      let success = false;
      if (robot) {
        success = ensureJointAngleSync(robot, jointName, value);
        if (success && robot.joints && robot.joints[jointName]) {
          robot.joints[jointName].angle = value;
        }
        if (success) {
          setRobotJointValues(prev => {
            const newMap = new Map(prev);
            const robotValues = newMap.get(robotId) || {};
            robotValues[jointName] = value;
            newMap.set(robotId, robotValues);
            return newMap;
          });
          const allJointValues = getRobotJointValues(robotId);
          EventBus.emit(DataTransfer.EVENT_ROBOT_JOINT_CHANGED, {
            robotId,
            robotName: robotId,
            jointName,
            value,
            allValues: allJointValues
          });
          EventBus.emit(DataTransfer.EVENT_ROBOT_JOINTS_CHANGED, {
            robotId,
            robotName: robotId,
            values: allJointValues,
            source: 'eventbus-single'
          });
        }
      }
      EventBus.emit(DataTransfer.EVENT_JOINT_SET_VALUE_RESPONSE, {
        robotId,
        jointName,
        value,
        success,
        requestId
      });
    };

    // Set multiple joint values
    const handleSetJointValues = ({ robotId, values, requestId }) => {
      debugJoint(`Event: set multiple joints for robot ${robotId}`);
      const robot = findRobotWithFallbacks(robotId);
      let success = false;
      if (robot) {
        success = true;
        Object.entries(values).forEach(([jointName, value]) => {
          const jointSuccess = ensureJointAngleSync(robot, jointName, value);
          if (!jointSuccess) success = false;
        });
        if (success) {
          setRobotJointValues(prev => {
            const newMap = new Map(prev);
            const robotValues = newMap.get(robotId) || {};
            Object.assign(robotValues, values);
            newMap.set(robotId, robotValues);
            return newMap;
          });
          const allJointValues = getRobotJointValues(robotId);
          EventBus.emit(DataTransfer.EVENT_ROBOT_JOINTS_CHANGED, {
            robotId,
            robotName: robotId,
            values: allJointValues,
            source: 'eventbus-batch'
          });
        }
      }
      EventBus.emit(DataTransfer.EVENT_JOINT_SET_VALUES_RESPONSE, {
        robotId,
        values,
        success,
        requestId
      });
    };

    // Get joint values
    const handleGetJointValues = ({ robotId, requestId }) => {
      debugJoint(`Event: get joint values for robot ${robotId}`);
      const values = getRobotJointValues(robotId);
      EventBus.emit(DataTransfer.EVENT_JOINT_GET_VALUES_RESPONSE, {
        robotId,
        values,
        requestId
      });
    };

    // Reset joints
    const handleResetJoints = ({ robotId, requestId }) => {
      debugJoint(`Event: reset joints for robot ${robotId}`);
      const robot = findRobotWithFallbacks(robotId);
      let success = false;
      if (robot) {
        const joints = robotJoints.get(robotId) || [];
        const resetValues = {};
        joints.forEach(joint => {
          resetValues[joint.name] = 0;
        });
        Object.entries(resetValues).forEach(([jointName, value]) => {
          ensureJointAngleSync(robot, jointName, value);
        });
        setRobotJointValues(prev => new Map(prev).set(robotId, resetValues));
        EventBus.emit(DataTransfer.EVENT_ROBOT_JOINTS_RESET, {
          robotId,
          robotName: robotId
        });
        success = true;
      }
      EventBus.emit(DataTransfer.EVENT_JOINT_RESET_RESPONSE, {
        robotId,
        success,
        requestId
      });
    };

    // Register listeners
    const unsubSet = EventBus.on(DataTransfer.EVENT_JOINT_SET_VALUE, handleSetJointValue);
    const unsubSetVals = EventBus.on(DataTransfer.EVENT_JOINT_SET_VALUES, handleSetJointValues);
    const unsubGet = EventBus.on(DataTransfer.EVENT_JOINT_GET_VALUES, handleGetJointValues);
    const unsubReset = EventBus.on(DataTransfer.EVENT_JOINT_RESET, handleResetJoints);
    return () => {
      unsubSet();
      unsubSetVals();
      unsubGet();
      unsubReset();
    };
  }, [findRobotWithFallbacks, ensureJointAngleSync, getRobotJointValues, robotJoints]);

  const getJointInfo = useCallback((robotId) => {
    return robotJoints.get(robotId) || [];
  }, [robotJoints]);

  const getJointValues = useCallback((robotId) => {
    const storedValues = robotJointValues.get(robotId);
    if (storedValues && Object.keys(storedValues).length > 0) {
      return storedValues;
    }
    return getRobotJointValues(robotId);
  }, [robotJointValues, getRobotJointValues]);

  const getJointLimits = useCallback((robotId, jointName) => {
    const joints = robotJoints.get(robotId) || [];
    const joint = joints.find(j => j.name === jointName);
    return joint ? joint.limits : {};
  }, [robotJoints]);

  useEffect(() => {
    return () => {
      robotRegistryRef.current.clear();
    };
  }, []);

  const value = useMemo(() => ({
    robotJoints,
    robotJointValues,
    getJointInfo,
    getJointValues,
    getJointLimits,
  }), [
    robotJoints,
    robotJointValues,
    getJointInfo,
    getJointValues,
    getJointLimits,
  ]);

  return (
    <JointContext.Provider value={value}>
      {children}
    </JointContext.Provider>
  );
};

export const useJointContext = () => {
  const context = useContext(JointContext);
  if (!context) {
    throw new Error('useJointContext must be used within JointProvider');
  }
  return context;
};

export default JointContext;