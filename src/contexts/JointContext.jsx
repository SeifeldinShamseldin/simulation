// src/contexts/JointContext.jsx - Updated to use unified RobotContext
import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useViewer } from './ViewerContext';
import { useRobotSelection } from './hooks/useRobotManager';
import EventBus from '../utils/EventBus';
import { useRobotContext } from './RobotContext'; // Updated import
import { MultiAxisProfiler, TrapezoidalProfile } from '../utils/motionProfiles'; // Add motion profiles import
import { debug, debugJoint, debugRobot, debugAnimation, debugEvent } from '../utils/DebugSystem'; // Updated debug import

export const JointContext = createContext();

export const JointProvider = ({ children }) => {
  const { isRobotReady } = useRobotContext(); // Updated to use unified context
  const { isViewerReady, getRobotManager } = useViewer();
  const { activeId: activeRobotId } = useRobotSelection();
  
  // State for all robots' joint data
  const [robotJoints, setRobotJoints] = useState(new Map());
  const [robotJointValues, setRobotJointValues] = useState(new Map());
  const robotRegistryRef = useRef(new Map());
  const robotManagerRef = useRef(null);

  // Initialize robot manager reference
  useEffect(() => {
    if (isViewerReady) {
      robotManagerRef.current = getRobotManager();
      debugJoint('Robot manager initialized:', !!robotManagerRef.current);
    }
  }, [isViewerReady, getRobotManager]);

  // 🚨 CRITICAL FIX: Enhanced robot finder with multiple fallback methods
  const findRobotWithFallbacks = useCallback((robotId) => {
    if (!robotId) return null;

    debugJoint(`Looking for robot: ${robotId}`);

    // Method 1: Check local registry first (most reliable)
    if (robotRegistryRef.current.has(robotId)) {
      const robot = robotRegistryRef.current.get(robotId);
      debugJoint(`Found robot in local registry: ${robotId}`);
      return robot;
    }

    // Method 2: Try robot manager getRobot method
    if (robotManagerRef.current && robotManagerRef.current.getRobot) {
      try {
        const robot = robotManagerRef.current.getRobot(robotId);
        if (robot) {
          debugJoint(`Found robot via robot manager: ${robotId}`);
          // Cache in local registry for future use
          robotRegistryRef.current.set(robotId, robot);
          return robot;
        }
      } catch (error) {
        debugJoint('Robot manager getRobot failed:', error);
      }
    }

    // Method 3: Try robot manager robots Map
    if (robotManagerRef.current && robotManagerRef.current.robots && robotManagerRef.current.robots.has) {
      try {
        const robotData = robotManagerRef.current.robots.get(robotId);
        if (robotData && robotData.robot) {
          debugJoint(`Found robot in manager robots Map: ${robotId}`);
          // Cache in local registry
          robotRegistryRef.current.set(robotId, robotData.robot);
          return robotData.robot;
        }
      } catch (error) {
        debugJoint('Robot manager robots Map failed:', error);
      }
    }

    // Method 4: Try window.robotManagerContext (if exists)
    if (window.robotManagerContext && window.robotManagerContext.getRobot) {
      try {
        const robot = window.robotManagerContext.getRobot(robotId);
        if (robot) {
          debugJoint(`Found robot via window.robotManagerContext: ${robotId}`);
          robotRegistryRef.current.set(robotId, robot);
          return robot;
        }
      } catch (error) {
        debugJoint('Window robot manager failed:', error);
      }
    }

    debugJoint(`Robot ${robotId} not found in any registry`);
    return null;
  }, []);

  // 🚨 CRITICAL FIX: Enhanced joint values getter with fallbacks
  const getRobotJointValues = useCallback((robotId) => {
    const robot = findRobotWithFallbacks(robotId);
    if (!robot) {
      debugJoint(`Cannot get joint values - robot ${robotId} not found`);
      return {};
    }

    const values = {};
    
    try {
      debugJoint(`Getting joint values for ${robotId}`);
      
      // Method 1: Direct robot.joints access (most reliable)
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

      // Method 2: Try robot's getJointValues if available
      if (robot.getJointValues && typeof robot.getJointValues === 'function') {
        const robotValues = robot.getJointValues();
        Object.assign(values, robotValues);
        debugJoint(`Got joint values via robot.getJointValues(): ${Object.keys(values).length} joints`);
        
        if (Object.keys(values).length > 0) {
          return values;
        }
      }

      // Method 3: Try robot manager's getJointValues (this was failing before)
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

      // Method 4: Try traversing robot object to find joints
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

  // Add this helper method in JointProvider (around line 150)
  const ensureJointAngleSync = useCallback((robot, jointName, value) => {
    let success = false;
    
    // Method 1: Use robot's setJointValue if available
    if (robot.setJointValue && typeof robot.setJointValue === 'function') {
      success = robot.setJointValue(jointName, value);
      debugJoint(`robot.setJointValue(${jointName}, ${value}) = ${success}`);
    }

    // Method 2: Try direct joint setJointValue if robot method failed
    if (!success && robot.joints && robot.joints[jointName]) {
      if (robot.joints[jointName].setJointValue) {
        success = robot.joints[jointName].setJointValue(value);
        debugJoint(`joint.setJointValue(${value}) = ${success}`);
      }
      
      // If the joint has a setPosition method, call it too
      if (robot.joints[jointName].setPosition) {
        robot.joints[jointName].setPosition(value);
      }
    }

    // Method 3: Update matrices
    if (success && robot.updateMatrixWorld) {
      robot.updateMatrixWorld(true);
    }

    debugJoint(`✅ Joint sync for ${jointName} = ${value}, success: ${success}`);
    return success;
  }, []);

  // 🚨 CRITICAL FIX: Enhanced joint setter with proper TCP integration
  const setRobotJointValues_Internal = useCallback((robotId, values) => {
    // First check if robot is ready
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
      // Method 1: Use robot's setJointValues method
      if (robot.setJointValues && typeof robot.setJointValues === 'function') {
        success = robot.setJointValues(values);
        debugJoint(`Robot setJointValues result: ${success}`);
      }

      // Method 2: Use robot manager's setJointValues (if robot method failed)
      if (!success && robotManagerRef.current && robotManagerRef.current.setJointValues) {
        try {
          success = robotManagerRef.current.setJointValues(robotId, values);
          debugJoint(`Robot manager setJointValues result: ${success}`);
        } catch (error) {
          debugJoint('Robot manager setJointValues failed:', error);
        }
      }

      // Method 3: Try individual joint updates as last resort
      if (!success) {
        success = true;
        Object.entries(values).forEach(([jointName, value]) => {
          const joint = robot.joints[jointName];
          if (!joint) {
            debugJoint(`Joint ${jointName} not found in robot ${robotId}`);
            success = false;
            return;
          }

          // Set joint value and check result
          const jointSuccess = robot.setJointValue(jointName, value);
          if (!jointSuccess) {
            debugJoint(`Failed to set joint ${jointName} to ${value}`);
            success = false;
          }
        });
      }

      // Force update matrices after joint changes
      if (success && robot.updateMatrixWorld) {
        robot.updateMatrixWorld(true);
      }

      // Emit joint change event for TCP integration
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

  // Extract joint information when robot loads or registers
  useEffect(() => {
    const handleRobotLoaded = (data) => {
      const { robotName, robot, robotId } = data;
      const targetRobotId = robotId || robotName;
      
      if (!robot || !targetRobotId) return;
      
      debugJoint(`Robot loaded: ${targetRobotId}, extracting joint info`);
      
      // 🚨 CRITICAL FIX: Register robot in local registry immediately
      robotRegistryRef.current.set(targetRobotId, robot);
      
      const joints = [];
      const values = {};
      
      // Extract joint information
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
      
      // Store joint info and values
      setRobotJoints(prev => new Map(prev).set(targetRobotId, joints));
      setRobotJointValues(prev => new Map(prev).set(targetRobotId, values));
      
      debugJoint(`Extracted ${joints.length} joints for ${targetRobotId}`);
      debugJoint(`Joint values:`, values);
    };

    // 🚨 NEW: Handle robot registration events (from useRobotControl)
    const handleRobotRegistered = (data) => {
      const { robotId, robotName, robot } = data;
      const targetRobotId = robotId || robotName;
      
      if (!robot || !targetRobotId) return;
      
      debugJoint(`Robot registered: ${targetRobotId}`);
      
      // Register in local registry
      robotRegistryRef.current.set(targetRobotId, robot);
      
      // Extract joint info if not already done
      if (!robotJoints.has(targetRobotId)) {
        handleRobotLoaded({ robotName: targetRobotId, robot, robotId: targetRobotId });
      }
    };

    const handleRobotRemoved = (data) => {
      const { robotName, robotId } = data;
      const targetRobotId = robotId || robotName;
      
      debugJoint(`Robot removed: ${targetRobotId}`);
      
      // Clean up robot data
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
    const unsubscribeRegistered = EventBus.on('robot:registered', handleRobotRegistered); // NEW
    const unsubscribeRemoved = EventBus.on('robot:removed', handleRobotRemoved);
    
    return () => {
      unsubscribeLoaded();
      unsubscribeRegistered();
      unsubscribeRemoved();
    };
  }, []);

  // Update the setJointValue method (around line 200)
  const setJointValue = useCallback((robotId, jointName, value) => {
    debugJoint(`Setting joint ${jointName} = ${value} for robot ${robotId}`);
    
    const robot = findRobotWithFallbacks(robotId);
    if (!robot) {
      debugJoint(`Robot ${robotId} not found for setJointValue`);
      return false;
    }

    let success = false;

    try {
      // Use the sync method to ensure both visual and internal state are updated
      success = ensureJointAngleSync(robot, jointName, value);
      
      // Try robot manager's setJointValue as additional fallback
      if (!success && robotManagerRef.current && robotManagerRef.current.setJointValue) {
        success = robotManagerRef.current.setJointValue(robotId, jointName, value);
        
        // Still need to sync joint.angle even if manager succeeded
        if (success && robot.joints && robot.joints[jointName]) {
          robot.joints[jointName].angle = value;
          debugJoint(`✅ Synced joint.angle via manager fallback for ${jointName} = ${value}`);
        }
      }

      if (success) {
        // Update local state
        setRobotJointValues(prev => {
          const newMap = new Map(prev);
          const robotValues = newMap.get(robotId) || {};
          robotValues[jointName] = value;
          newMap.set(robotId, robotValues);
          return newMap;
        });

        // CRITICAL: Get ALL joint values for the event
        const allJointValues = getRobotJointValues(robotId);
        
        debugJoint(`Successfully set joint ${jointName} = ${value} for robot ${robotId}`);
        debugJoint(`All joint values:`, allJointValues);
        
        // Emit comprehensive joint change event
        EventBus.emit('robot:joint-changed', {
          robotId,
          robotName: robotId,
          jointName,
          value,
          allValues: allJointValues
        });
        
        // CRITICAL: Also emit joints-changed event for trajectory recording
        EventBus.emit('robot:joints-changed', {
          robotId,
          robotName: robotId,
          values: allJointValues,
          source: 'manual'
        });

        // Force TCP recalculation
        EventBus.emit('tcp:force-recalculate', { robotId });
      }

      return success;
    } catch (error) {
      debugJoint(`Error setting joint value:`, error);
      return false;
    }
  }, [findRobotWithFallbacks, getRobotJointValues, ensureJointAngleSync]);

  // Public method to set multiple joint values
  const setJointValues = useCallback((robotId, values) => {
    const success = setRobotJointValues_Internal(robotId, values);
    if (success) {
      // Update local state
      setRobotJointValues(prev => {
        const newMap = new Map(prev);
        const robotValues = newMap.get(robotId) || {};
        newMap.set(robotId, { ...robotValues, ...values });
        return newMap;
      });
      
      // CRITICAL: Get ALL joint values for the event
      const allJointValues = getRobotJointValues(robotId);
      
      // Emit comprehensive joints changed event
      EventBus.emit('robot:joints-changed', {
        robotId,
        robotName: robotId,
        values: allJointValues,
        source: 'manual-batch'
      });
    }
    return success;
  }, [setRobotJointValues_Internal, getRobotJointValues]);

  // Reset joints to zero
  const resetJoints = useCallback((robotId) => {
    debugJoint(`Resetting joints for robot ${robotId}`);
    
    const robot = findRobotWithFallbacks(robotId);
    if (!robot) {
      debugJoint(`Robot ${robotId} not found for reset`);
      return;
    }
    
    try {
      // Get all joints and reset to 0
      const joints = robotJoints.get(robotId) || [];
      const resetValues = {};
      joints.forEach(joint => {
        resetValues[joint.name] = 0;
      });
      
      // Apply reset values
      const success = setRobotJointValues_Internal(robotId, resetValues);
      
      if (success) {
        // Update local state
        setRobotJointValues(prev => new Map(prev).set(robotId, resetValues));
        debugJoint(`Reset joints for ${robotId}:`, resetValues);
      }
      
    } catch (error) {
      debugJoint(`Error resetting joints:`, error);
    }
  }, [robotJoints, findRobotWithFallbacks, setRobotJointValues_Internal]);

  // Get joint information for a robot
  const getJointInfo = useCallback((robotId) => {
    return robotJoints.get(robotId) || [];
  }, [robotJoints]);

  // Get joint values for a robot (use enhanced getter)
  const getJointValues = useCallback((robotId) => {
    // First try stored values (faster)
    const storedValues = robotJointValues.get(robotId);
    if (storedValues && Object.keys(storedValues).length > 0) {
      return storedValues;
    }
    
    // If no stored values, get from robot directly
    return getRobotJointValues(robotId);
  }, [robotJointValues, getRobotJointValues]);

  // Get joint limits for a specific joint
  const getJointLimits = useCallback((robotId, jointName) => {
    const joints = robotJoints.get(robotId) || [];
    const joint = joints.find(j => j.name === jointName);
    return joint ? joint.limits : {};
  }, [robotJoints]);

  // Cleanup
  useEffect(() => {
    return () => {
      // Cancel all animations on unmount
      robotRegistryRef.current.clear();
    };
  }, []);

  // Memoize context value to prevent unnecessary re-renders
  const value = useMemo(() => ({
    // State
    robotJoints,
    robotJointValues,
    // Methods
    setJointValue,
    setJointValues,
    resetJoints,
    getJointInfo,
    getJointValues,
    getJointLimits
  }), [
    robotJoints,
    robotJointValues,
    setJointValue,
    setJointValues,
    resetJoints,
    getJointInfo,
    getJointValues,
    getJointLimits
  ]);

  useEffect(() => {
    const handleIKJointValues = (data) => {
      const { robotId, jointValues } = data;
      setJointValues(robotId, jointValues);
    };
    const unsubscribe = EventBus.on('ik:joint-values-calculated', handleIKJointValues);
    return () => unsubscribe();
  }, [setJointValues]);

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