// src/contexts/JointContext.jsx - Simplified for direct joint control
import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import EventBus from '../utils/EventBus';
import { useRobotContext } from './RobotContext';
import { debug, debugJoint } from '../utils/DebugSystem';

export const JointContext = createContext();

export const JointProvider = ({ children }) => {
  const { isRobotReady } = useRobotContext();
  
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

  const setRobotJointValuesInternal = useCallback((robotId, values) => {
    if (!isRobotReady(robotId)) {
      debugJoint(`Robot ${robotId} not ready for joint updates`);
      return false;
    }
    const robot = findRobotWithFallbacks(robotId);
    if (!robot) {
      debugJoint(`Robot ${robotId} not found`);
      return false;
    }
    let success = false;
    try {
      if (robot.setJointValues && typeof robot.setJointValues === 'function') {
        success = robot.setJointValues(values);
        debugJoint(`Robot setJointValues result: ${success}`);
      }
      if (!success && robotManagerRef.current && robotManagerRef.current.setJointValues) {
        try {
          success = robotManagerRef.current.setJointValues(robotId, values);
          debugJoint(`Robot manager setJointValues result: ${success}`);
        } catch (error) {
          debugJoint('Robot manager setJointValues failed:', error);
        }
      }
      if (!success) {
        success = true;
        Object.entries(values).forEach(([jointName, value]) => {
          const joint = robot.joints[jointName];
          if (!joint) {
            debugJoint(`Joint ${jointName} not found in robot ${robotId}`);
            success = false;
            return;
          }
          const jointSuccess = robot.setJointValue(jointName, value);
          if (!jointSuccess) {
            debugJoint(`Failed to set joint ${jointName} to ${value}`);
            success = false;
          }
        });
      }
      if (success && robot.updateMatrixWorld) {
        robot.updateMatrixWorld(true);
      }
      if (success) {
        EventBus.emit('robot:joints-changed', {
          robotId,
          robotName: robotId,
          values
        });
      }
      return success;
    } catch (error) {
      debugJoint(`Error setting joint values for ${robotId}:`, error);
      return false;
    }
  }, [findRobotWithFallbacks, isRobotReady]);

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

  const setJointValue = useCallback((robotId, jointName, value) => {
    debugJoint(`Setting joint ${jointName} = ${value} for robot ${robotId}`);
    const robot = findRobotWithFallbacks(robotId);
    if (!robot) {
      debugJoint(`Robot ${robotId} not found for setJointValue`);
      return false;
    }
    let success = false;
    try {
      success = ensureJointAngleSync(robot, jointName, value);
      if (!success && robot.setJointValue) {
        success = robot.setJointValue(robotId, jointName, value);
      }
      if (success && robot.joints && robot.joints[jointName]) {
        robot.joints[jointName].angle = value;
        debugJoint(`✅ Synced joint.angle for ${jointName} = ${value}`);
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
        debugJoint(`Successfully set joint ${jointName} = ${value} for robot ${robotId}`);
        debugJoint(`All joint values:`, allJointValues);
        EventBus.emit('robot:joint-changed', {
          robotId,
          robotName: robotId,
          jointName,
          value,
          allValues: allJointValues
        });
        EventBus.emit('robot:joints-changed', {
          robotId,
          robotName: robotId,
          values: allJointValues,
          source: 'manual'
        });
      }
      return success;
    } catch (error) {
      debugJoint(`Error setting joint value:`, error);
      return false;
    }
  }, [findRobotWithFallbacks, getRobotJointValues, ensureJointAngleSync]);

  const setJointValues = useCallback((robotId, values) => {
    const success = setRobotJointValuesInternal(robotId, values);
    if (success) {
      setRobotJointValues(prev => {
        const newMap = new Map(prev);
        const robotValues = newMap.get(robotId) || {};
        newMap.set(robotId, { ...robotValues, ...values });
        return newMap;
      });
      const allJointValues = getRobotJointValues(robotId);
      EventBus.emit('robot:joints-changed', {
        robotId,
        robotName: robotId,
        values: allJointValues,
        source: 'manual-batch'
      });
    }
    return success;
  }, [setRobotJointValuesInternal, getRobotJointValues]);

  const resetJoints = useCallback((robotId) => {
    debugJoint(`Resetting joints for robot ${robotId}`);
    const robot = findRobotWithFallbacks(robotId);
    if (!robot) {
      debugJoint(`Robot ${robotId} not found for reset`);
      return;
    }
    try {
      const joints = robotJoints.get(robotId) || [];
      const resetValues = {};
      joints.forEach(joint => {
        resetValues[joint.name] = 0;
      });
      const success = setRobotJointValuesInternal(robotId, resetValues);
      if (success) {
        setRobotJointValues(prev => new Map(prev).set(robotId, resetValues));
        debugJoint(`Reset joints for ${robotId}:`, resetValues);
      }
    } catch (error) {
      debugJoint(`Error resetting joints:`, error);
    }
  }, [robotJoints, findRobotWithFallbacks, setRobotJointValuesInternal]);

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
    setJointValue,
    setJointValues,
    resetJoints,
    getJointInfo,
    getJointValues,
    getJointLimits,
  }), [
    robotJoints,
    robotJointValues,
    setJointValue,
    setJointValues,
    resetJoints,
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