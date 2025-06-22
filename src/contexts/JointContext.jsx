// src/contexts/JointContext.jsx - Simplified for direct joint control
import React, { useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import EventBus from '../utils/EventBus';
import { RobotEvents, JointEvents } from './dataTransfer';
import { JointContext } from './JointContext.js';

export const JointProvider = ({ children }) => {
  const [robotJoints, setRobotJoints] = useState(new Map());
  const [robotJointValues, setRobotJointValues] = useState(new Map());
  
  const robotRegistryRef = useRef(new Map());

  const findRobotWithFallbacks = useCallback((robotId) => {
    if (!robotId) return null;
    if (robotRegistryRef.current.has(robotId)) {
      const robot = robotRegistryRef.current.get(robotId);
      return robot;
    }
    
    return null;
  }, []);

  const getRobotJointValues = useCallback((robotId) => {
    const robot = findRobotWithFallbacks(robotId);
    if (!robot) {
      return {};
    }
    const values = {};
    try {
      // Try direct joint access first
      if (robot.joints) {
        Object.values(robot.joints).forEach(joint => {
          if (joint && joint.jointType !== 'fixed' && typeof joint.angle !== 'undefined') {
            values[joint.name] = joint.angle;
          }
        });
        if (Object.keys(values).length > 0) {
          return values;
        }
      }
      
      // Try robot's getJointValues method
      if (robot.getJointValues && typeof robot.getJointValues === 'function') {
        const robotValues = robot.getJointValues();
        Object.assign(values, robotValues);
        if (Object.keys(values).length > 0) {
          return values;
        }
      }
      
      // Fallback: traverse robot object
      const foundJoints = {};
      robot.traverse((child) => {
        if (child.isURDFJoint && child.jointType !== 'fixed' && typeof child.angle !== 'undefined') {
          foundJoints[child.name] = child.angle;
        }
      });
      if (Object.keys(foundJoints).length > 0) {
        return foundJoints;
      }
      
      return {};
    } catch {
      return {};
    }
  }, [findRobotWithFallbacks]);

  const ensureJointAngleSync = useCallback((robot, jointName, value) => {
    let success = false;
    
    // Try robot's setJointValue method
    if (robot.setJointValue && typeof robot.setJointValue === 'function') {
      success = robot.setJointValue(jointName, value);
    }
    
    // Try joint's setJointValue method
    if (!success && robot.joints && robot.joints[jointName]) {
      if (robot.joints[jointName].setJointValue) {
        success = robot.joints[jointName].setJointValue(value);
      }
      if (robot.joints[jointName].setPosition) {
        robot.joints[jointName].setPosition(value);
      }
    }
    
    // Update matrix world if successful
    if (success && robot.updateMatrixWorld) {
      robot.updateMatrixWorld(true);
    }
    
    return success;
  }, []);

  // Listen for robot events
  useEffect(() => {
    const handleRobotLoaded = (data) => {
      const { robotName, robot, robotId } = data;
      const targetRobotId = robotId || robotName;
      if (!robot || !targetRobotId) return;
      
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
    };

    const handleRobotRegistered = (data) => {
      const { robotId, robotName, robot } = data;
      const targetRobotId = robotId || robotName;
      if (!robot || !targetRobotId) return;
      
      robotRegistryRef.current.set(targetRobotId, robot);
      
      // If we don't have joint info yet, extract it
      if (!robotJoints.has(targetRobotId)) {
        handleRobotLoaded({ robotName: targetRobotId, robot, robotId: targetRobotId });
      }
    };

    const handleRobotRemoved = (data) => {
      const { robotName, robotId } = data;
      const targetRobotId = robotId || robotName;
      
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

    const unsubscribeLoaded = EventBus.on(RobotEvents.LOADED, handleRobotLoaded);
    const unsubscribeRegistered = EventBus.on(RobotEvents.REGISTERED, handleRobotRegistered);
    const unsubscribeRemoved = EventBus.on(RobotEvents.REMOVED, handleRobotRemoved);
    
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
      const robot = findRobotWithFallbacks(robotId);
      let success = false;
      
      if (robot) {
        success = ensureJointAngleSync(robot, jointName, value);
        
        // Update angle property if joint exists
        if (success && robot.joints && robot.joints[jointName]) {
          robot.joints[jointName].angle = value;
        }
        
        // Update state
        if (success) {
          setRobotJointValues(prev => {
            const newMap = new Map(prev);
            const robotValues = newMap.get(robotId) || {};
            robotValues[jointName] = value;
            newMap.set(robotId, robotValues);
            return newMap;
          });
          
          // Get all joint values for the events
          const allJointValues = getRobotJointValues(robotId);
          
          // Emit single joint changed event
          EventBus.emit(RobotEvents.JOINT_CHANGED, {
            robotId,
            robotName: robotId,
            jointName,
            value,
            allValues: allJointValues
          });
          
          // Emit all joints changed event
          EventBus.emit(RobotEvents.JOINTS_CHANGED, {
            robotId,
            robotName: robotId,
            values: allJointValues,
            source: 'joint-command'
          });
        }
      }
      
      // Send response if requestId provided
      if (requestId) {
        EventBus.emit(JointEvents.Responses.SET_VALUE, {
          robotId,
          jointName,
          value,
          success,
          requestId
        });
      }
    };

    // Set multiple joint values
    const handleSetJointValues = ({ robotId, values, requestId }) => {
      const robot = findRobotWithFallbacks(robotId);
      let success = false;
      
      if (robot) {
        success = true;
        Object.entries(values).forEach(([jointName, value]) => {
          const jointSuccess = ensureJointAngleSync(robot, jointName, value);
          if (!jointSuccess) success = false;
        });
        
        // Update state
        if (success) {
          setRobotJointValues(prev => {
            const newMap = new Map(prev);
            const robotValues = newMap.get(robotId) || {};
            Object.assign(robotValues, values);
            newMap.set(robotId, robotValues);
            return newMap;
          });
          
          // Get all joint values for the event
          const allJointValues = getRobotJointValues(robotId);
          
          // Emit joints changed event
          EventBus.emit(RobotEvents.JOINTS_CHANGED, {
            robotId,
            robotName: robotId,
            values: allJointValues,
            source: 'joint-command-batch'
          });
        }
      }
      
      // Send response if requestId provided
      if (requestId) {
        EventBus.emit(JointEvents.Responses.SET_VALUES, {
          robotId,
          values,
          success,
          requestId
        });
      }
    };

    // Get joint values
    const handleGetJointValues = ({ robotId, requestId }) => {
      const values = getRobotJointValues(robotId);
      
      EventBus.emit(JointEvents.Responses.GET_VALUES, {
        robotId,
        values,
        requestId
      });
    };

    // Reset joints
    const handleResetJoints = ({ robotId, requestId }) => {
      const robot = findRobotWithFallbacks(robotId);
      let success = false;
      
      if (robot) {
        const joints = robotJoints.get(robotId) || [];
        const resetValues = {};
        
        // Set all joints to 0
        joints.forEach(joint => {
          resetValues[joint.name] = 0;
        });
        
        Object.entries(resetValues).forEach(([jointName, value]) => {
          ensureJointAngleSync(robot, jointName, value);
        });
        
        // Update state
        setRobotJointValues(prev => new Map(prev).set(robotId, resetValues));
        
        // Emit reset event
        EventBus.emit(RobotEvents.JOINTS_RESET, {
          robotId,
          robotName: robotId
        });
        
        success = true;
      }
      
      // Send response if requestId provided
      if (requestId) {
        EventBus.emit(JointEvents.Responses.RESET, {
          robotId,
          success,
          requestId
        });
      }
    };

    // Register listeners using JointEvents namespace
    const unsubSet = EventBus.on(JointEvents.Commands.SET_VALUE, handleSetJointValue);
    const unsubSetVals = EventBus.on(JointEvents.Commands.SET_VALUES, handleSetJointValues);
    const unsubGet = EventBus.on(JointEvents.Commands.GET_VALUES, handleGetJointValues);
    const unsubReset = EventBus.on(JointEvents.Commands.RESET, handleResetJoints);
    
    return () => {
      unsubSet();
      unsubSetVals();
      unsubGet();
      unsubReset();
    };
  }, [findRobotWithFallbacks, ensureJointAngleSync, getRobotJointValues, robotJoints]);

  // Public API methods
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

  // Cleanup
  useEffect(() => {
    const registry = robotRegistryRef.current;
    return () => {
      registry.clear();
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