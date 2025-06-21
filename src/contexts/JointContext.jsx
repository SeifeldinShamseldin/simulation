// src/contexts/JointContext.jsx - Fixed to prevent joints going to zero
import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useViewer } from './ViewerContext';
import { useRobotSelection } from './hooks/useRobotManager';
import EventBus from '../utils/EventBus';
import { useRobotContext } from './RobotContext';
import { MultiAxisProfiler, TrapezoidalProfile } from '../utils/motionProfiles';
import { debug, debugJoint, debugRobot, debugAnimation, debugEvent } from '../utils/DebugSystem';

export const JointContext = createContext();

export const JointProvider = ({ children }) => {
  const { isRobotReady } = useRobotContext();
  const { isViewerReady, getRobotManager } = useViewer();
  const { activeId: activeRobotId } = useRobotSelection();
  
  // State for all robots' joint data
  const [robotJoints, setRobotJoints] = useState(new Map());
  const [robotJointValues, setRobotJointValues] = useState(new Map());
  const [isAnimating, setIsAnimating] = useState(new Map());
  const [animationProgress, setAnimationProgress] = useState(new Map());
  
  // Refs for animation and robot management
  const robotRegistryRef = useRef(new Map());
  const animationFrameRef = useRef(new Map());
  const robotManagerRef = useRef(null);
  const animationStartTimeRef = useRef(null);
  const animationTargetValuesRef = useRef(null);
  const animationOptionsRef = useRef(null);
  const animationResolveRef = useRef(null);
  const ikCallbackRef = useRef(null);
  const trajCallbackRef = useRef(null);
  const registerIKCallback = useCallback((cb) => {
    ikCallbackRef.current = cb;
  }, []);
  const registerTrajectoryCallback = useCallback((cb) => {
    trajCallbackRef.current = cb;
  }, []);

  // Initialize robot manager reference
  useEffect(() => {
    if (isViewerReady) {
      robotManagerRef.current = getRobotManager();
      debugJoint('Robot manager initialized:', !!robotManagerRef.current);
    }
  }, [isViewerReady, getRobotManager]);

  // Stop animation for robot
  const stopAnimation = useCallback((robotId) => {
    const frameId = animationFrameRef.current.get(robotId);
    if (frameId) {
      cancelAnimationFrame(frameId);
      animationFrameRef.current.delete(robotId);
      debugAnimation(`Cancelled animation frame for ${robotId}`);
    }
    
    setIsAnimating(prev => new Map(prev).set(robotId, false));
    setAnimationProgress(prev => new Map(prev).set(robotId, 0));
    
    debugAnimation(`Stopped animation for ${robotId}`);
    
    // Notify IK that animation was stopped
    EventBus.emit('ik:animation-complete', {
      robotId,
      success: false
    });
  }, []);

  // Enhanced robot finder with multiple fallback methods
  const findRobotWithFallbacks = useCallback((robotId) => {
    if (!robotId) return null;

    debugJoint(`Looking for robot: ${robotId}`);

    // Method 1: Check local registry first
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
          robotRegistryRef.current.set(robotId, robotData.robot);
          return robotData.robot;
        }
      } catch (error) {
        debugJoint('Robot manager robots Map failed:', error);
      }
    }

    // Method 4: Try window.robotManagerContext
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

  // Enhanced joint values getter with fallbacks
  const getRobotJointValues = useCallback((robotId) => {
    const robot = findRobotWithFallbacks(robotId);
    if (!robot) {
      debugJoint(`Cannot get joint values - robot ${robotId} not found`);
      return {};
    }

    // CRITICAL: Update matrices first to ensure values are current
    if (robot.updateMatrixWorld) {
      robot.updateMatrixWorld(true);
    }

    const values = {};
    
    try {
      debugJoint(`Getting joint values for ${robotId}`);
      
      // Method 1: Direct robot.joints access
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

      // Method 2: Try robot's getJointValues
      if (robot.getJointValues && typeof robot.getJointValues === 'function') {
        const robotValues = robot.getJointValues();
        Object.assign(values, robotValues);
        debugJoint(`Got joint values via robot.getJointValues(): ${Object.keys(values).length} joints`);
        
        if (Object.keys(values).length > 0) {
          return values;
        }
      }

      // Method 3: Try robot manager's getJointValues
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

      // Method 4: Try traversing robot object
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

  // Helper method to sync joint angle
  const ensureJointAngleSync = useCallback((robot, jointName, value) => {
    let success = false;
    
    // Method 1: Use robot's setJointValue
    if (robot.setJointValue && typeof robot.setJointValue === 'function') {
      success = robot.setJointValue(jointName, value);
      debugJoint(`robot.setJointValue(${jointName}, ${value}) = ${success}`);
    }

    // Method 2: Try direct joint setJointValue
    if (!success && robot.joints && robot.joints[jointName]) {
      if (robot.joints[jointName].setJointValue) {
        success = robot.joints[jointName].setJointValue(value);
        debugJoint(`joint.setJointValue(${value}) = ${success}`);
      }
      
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

  // Enhanced joint setter with proper TCP integration
  const setRobotJointValues_Internal = useCallback((robotId, values) => {
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

      // Method 2: Use robot manager's setJointValues
      if (!success && robotManagerRef.current && robotManagerRef.current.setJointValues) {
        try {
          success = robotManagerRef.current.setJointValues(robotId, values);
          debugJoint(`Robot manager setJointValues result: ${success}`);
        } catch (error) {
          debugJoint('Robot manager setJointValues failed:', error);
        }
      }

      // Method 3: Try individual joint updates
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

      // Force update matrices
      if (success && robot.updateMatrixWorld) {
        robot.updateMatrixWorld(true);
      }

      // Emit joint change event
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

  // Extract joint information when robot loads
  useEffect(() => {
    const handleRobotLoaded = (data) => {
      const { robotName, robot, robotId } = data;
      const targetRobotId = robotId || robotName;
      
      if (!robot || !targetRobotId) return;
      
      debugJoint(`Robot loaded: ${targetRobotId}, extracting joint info`);
      
      // Register robot in local registry
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
      
      debugJoint(`📝 Extracted ${joints.length} joints with values:`, values);
      
      // Store joint info
      setRobotJoints(prev => new Map(prev).set(targetRobotId, joints));
      
      // Initialize UI state with current robot values
      setRobotJointValues(prev => {
        const newMap = new Map(prev);
        // Always update with current robot values to stay in sync
        newMap.set(targetRobotId, values);
        debugJoint(`📝 Initialized UI state for ${targetRobotId} with values:`, values);
        return newMap;
      });
      
      setIsAnimating(prev => new Map(prev).set(targetRobotId, false));
      
      debugJoint(`✅ Robot ${targetRobotId} fully initialized`);
      debugJoint(`   - Joints: ${joints.length}`);
      debugJoint(`   - Initial values:`, values);
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
      
      stopAnimation(targetRobotId);
      
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
      setIsAnimating(prev => {
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
  }, [stopAnimation, robotJoints]);

  // CANONICAL JOINT UPDATE METHOD
  const receiveJoints = useCallback((robotId, values) => {
    debugJoint(`📨 receiveJoints called for ${robotId} with values:`, values);
    
    // ALWAYS update UI state first
    setRobotJointValues(prev => {
      const newMap = new Map(prev);
      newMap.set(robotId, values);
      return newMap;
    });
    
    // Always notify trajectory
    if (trajCallbackRef.current) {
      debugJoint(`📹 Notifying trajectory recorder with joints:`, values);
      trajCallbackRef.current(robotId, values);
    } else {
      debugJoint(`⚠️ No trajectory callback registered!`);
    }
    
    // Try to apply to actual robot
    const success = setRobotJointValues_Internal(robotId, values);
    
    if (success) {
      // Notify IK only on success
      if (ikCallbackRef.current) {
        ikCallbackRef.current(robotId, values);
      }
      EventBus.emit('robot:joints-changed', {
        robotId,
        values: values,
        source: 'receiveJoints'
      });
    } else {
      debugJoint(`⚠️ Failed to apply joints to robot`);
    }
    
    return success;
  }, [setRobotJointValues_Internal]);

  // Animate to target joint values
  const animateToJointValues = useCallback(async (robotId, targetValues, options = {}) => {
    const {
      duration = 1000,
      tolerance = 0.001,
      maxDuration = 10000,
      animationSpeed = 1.0,
      onProgress = null,
      motionProfile = 'trapezoidal',
      jointConstraints = {},
      defaultConstraints = {
        maxVelocity: 2.0,
        maxAcceleration: 4.0,
        maxJerk: 20.0
      }
    } = options;
    
    if (!isRobotReady(robotId)) {
      debugJoint(`Skipping animation for robot ${robotId} - not ready`);
      return Promise.resolve({ success: false, error: 'Robot not ready' });
    }

    return new Promise((resolve) => {
      debugJoint(`Starting motion profile animation for ${robotId}`);
      
      const existingFrameId = animationFrameRef.current.get(robotId);
      if (existingFrameId) {
        cancelAnimationFrame(existingFrameId);
        debugJoint(`Cancelled existing animation for ${robotId}`);
      }
      
      const currentValues = getRobotJointValues(robotId);
      debugJoint(`Current joint values:`, currentValues);
      
      const startTime = Date.now();
      const robot = findRobotWithFallbacks(robotId);
      
      const jointLimits = {};
      Object.keys(targetValues).forEach(jointName => {
        jointLimits[jointName] = jointConstraints[jointName] || defaultConstraints;
      });
      
      const profiler = new MultiAxisProfiler({ profileType: motionProfile });
      
      const profileData = profiler.calculateSynchronizedProfiles(
        currentValues,
        targetValues,
        jointLimits
      );
      
      debugJoint(`Motion profile calculated:`, {
        type: motionProfile,
        totalTime: profileData.totalTime,
        joints: Object.keys(profileData.profiles)
      });
      
      let initialError = 0;
      Object.keys(targetValues).forEach(jointName => {
        const start = currentValues[jointName] || 0;
        const end = targetValues[jointName];
        const diff = end - start;
        initialError += diff * diff;
      });
      initialError = Math.sqrt(initialError);
      
      setIsAnimating(prev => new Map(prev).set(robotId, true));
      debugJoint(`Set isAnimating=true for ${robotId}`);
      
      const animate = () => {
        const robot = findRobotWithFallbacks(robotId);
        
        if (!robot || !robot.setJointValues) {
          debugJoint(`Robot ${robotId} not ready for animation`);
          stopAnimation(robotId);
          resolve({
            success: false,
            error: 'Robot not ready for animation'
          });
          return;
        }
        
        const elapsed = (Date.now() - startTime) / 1000;
        const scaledElapsed = elapsed * animationSpeed;
        
        const interpolatedValues = profiler.getJointValues(scaledElapsed, profileData);
        const progress = profiler.getProgress(scaledElapsed, profileData);
        
        let currentError = 0;
        let maxJointError = 0;
        
        Object.keys(targetValues).forEach(jointName => {
          const current = interpolatedValues[jointName];
          const target = targetValues[jointName];
          const diff = target - current;
          currentError += diff * diff;
          maxJointError = Math.max(maxJointError, Math.abs(diff));
        });
        currentError = Math.sqrt(currentError);
        
        const success = receiveJoints(robotId, interpolatedValues);
        
        if (success) {
          setRobotJointValues(prev => {
            const newMap = new Map(prev);
            const robotValues = newMap.get(robotId) || {};
            newMap.set(robotId, { ...robotValues, ...interpolatedValues });
            return newMap;
          });
          
          EventBus.emit('robot:joints-changed', {
            robotId,
            robotName: robotId,
            values: interpolatedValues,
            source: 'motion-profile-animation',
            progress,
            profileType: motionProfile
          });
        }
        
        setAnimationProgress(prev => new Map(prev).set(robotId, progress));
        
        if (onProgress) {
          const velocities = {};
          Object.keys(profileData.profiles).forEach(jointName => {
            const profile = profileData.profiles[jointName];
            if (profile.profiler) {
              velocities[jointName] = profile.profiler.getVelocity(
                scaledElapsed, 
                profile, 
                profile.distance
              );
            }
          });
          
          onProgress({
            progress,
            currentError,
            maxJointError,
            tolerance,
            elapsed: elapsed * 1000,
            velocities,
            profileType: motionProfile
          });
        }
        
        const profileComplete = progress >= 1;
        const withinTolerance = currentError <= tolerance;
        const timeExpired = elapsed * 1000 >= maxDuration;
        const shouldStop = profileComplete || withinTolerance || timeExpired;
        
        if (shouldStop) {
          if (profileComplete || withinTolerance) {
            debugJoint(`Motion profile complete, applying exact values`);
            const finalSuccess = receiveJoints(robotId, targetValues);
            if (finalSuccess) {
              EventBus.emit('robot:joints-changed', {
                robotId,
                robotName: robotId,
                values: targetValues,
                source: 'motion-profile-complete',
                progress: 1
              });
            }
          }
          
          debugJoint(`Animation complete for ${robotId}. Profile time: ${profileData.totalTime}s`);
          
          setIsAnimating(prev => new Map(prev).set(robotId, false));
          setAnimationProgress(prev => new Map(prev).set(robotId, 0));
          animationFrameRef.current.delete(robotId);
          
          EventBus.emit('ik:animation-complete', {
            robotId,
            success: true,
            withinTolerance,
            finalError: currentError,
            maxJointError,
            duration: elapsed * 1000,
            profileType: motionProfile
          });
          
          resolve({
            success: true,
            withinTolerance,
            finalError: currentError,
            maxJointError,
            duration: elapsed * 1000,
            profileType: motionProfile
          });
        } else {
          const frameId = requestAnimationFrame(animate);
          animationFrameRef.current.set(robotId, frameId);
        }
      };
      
      const frameId = requestAnimationFrame(animate);
      animationFrameRef.current.set(robotId, frameId);
    });
  }, [findRobotWithFallbacks, getRobotJointValues, receiveJoints, isRobotReady, stopAnimation]);

  // Listen for IK calculated joint values
  useEffect(() => {
    const handleIKJointValues = async (data) => {
      const { robotId, jointValues, animate, duration = 1000 } = data;
      
      debugJoint(`Received IK joint values for ${robotId}:`, jointValues);
      
      EventBus.emit('robot:joints-changed', {
        robotId,
        robotName: robotId,
        values: jointValues,
        source: 'ik'
      });
      
      if (animate) {
        await animateToJointValues(robotId, jointValues, duration);
      } else {
        const success = setRobotJointValues_Internal(robotId, jointValues);
        if (success) {
          setRobotJointValues(prev => {
            const newMap = new Map(prev);
            const currentValues = newMap.get(robotId) || {};
            newMap.set(robotId, { ...currentValues, ...jointValues });
            return newMap;
          });
          
          EventBus.emit('robot:joints-changed', {
            robotId,
            robotName: robotId,
            values: jointValues,
            source: 'ik-applied'
          });
        }
        
        EventBus.emit('ik:animation-complete', {
          robotId,
          success: true
        });
      }
    };

    const handleTCPToolAttached = (data) => {
      const { robotId, toolName, originalToolName, toolDimensions } = data;
      debugJoint(`TCP tool attached to ${robotId}:`, {
        toolName,
        originalToolName,
        toolDimensions
      });
      
      EventBus.emit('tcp:force-recalculate', { robotId });
    };

    const unsubscribeJoints = EventBus.on('ik:joint-values-calculated', handleIKJointValues);
    const unsubscribeTCP = EventBus.on('tcp:tool-attached', handleTCPToolAttached);
    
    return () => {
      unsubscribeJoints();
      unsubscribeTCP();
    };
  }, [animateToJointValues, setRobotJointValues_Internal]);

  // Handle high-frequency animation frames
  useEffect(() => {
    let animationFrameId = null;
    let lastFrameTime = 0;
    const targetFPS = 60;
    const frameInterval = 1000 / targetFPS;
    const pendingFrames = new Map();

    const handleAnimationFrame = (data) => {
      const { robotId, jointValues } = data;
      pendingFrames.set(robotId, { robotId, jointValues });
    };

    const processFrame = (timestamp) => {
      if (!lastFrameTime) lastFrameTime = timestamp;
      
      const elapsed = timestamp - lastFrameTime;
      
      if (elapsed >= frameInterval) {
        pendingFrames.forEach((frameData) => {
          const { robotId, jointValues } = frameData;
          
          if (!isRobotReady(robotId)) {
            debugJoint(`Skipping animation frame for robot ${robotId} - not ready`);
            return;
          }
          
          const success = setRobotJointValues_Internal(robotId, jointValues);
          
          if (success) {
            setRobotJointValues(prev => {
              const newMap = new Map(prev);
              const robotValues = newMap.get(robotId) || {};
              newMap.set(robotId, { ...robotValues, ...jointValues });
              return newMap;
            });
          }
        });
        
        pendingFrames.clear();
        lastFrameTime = timestamp;
      }
      
      animationFrameId = requestAnimationFrame(processFrame);
    };

    animationFrameId = requestAnimationFrame(processFrame);

    const unsubscribe = EventBus.on('animation-frame', handleAnimationFrame);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      unsubscribe();
    };
  }, [isRobotReady, setRobotJointValues_Internal]);

  // 🚨 CRITICAL FIX: setJointValue now ensures up-to-date values
  const setJointValue = useCallback((robotId, jointName, value) => {
    debugJoint(`🎯 setJointValue called: ${jointName} = ${value} for robot ${robotId}`);
    
    const robot = findRobotWithFallbacks(robotId);
    if (!robot) {
      debugJoint(`❌ Robot ${robotId} not found`);
      return false;
    }
    
    // Set the single joint
    const success = ensureJointAngleSync(robot, jointName, value);
    
    if (success) {
      // ALWAYS get fresh values from robot to ensure we have the latest state
      const currentRobotJoints = getRobotJointValues(robotId);
      debugJoint(`📥 Current robot joints:`, currentRobotJoints);
      
      // Also check UI state for any pending changes
      const uiJoints = robotJointValues.get(robotId) || {};
      
      // Merge: robot values as base, UI values override, new value on top
      const updatedJoints = {
        ...currentRobotJoints,  // Start with actual robot values
        ...uiJoints,           // Apply any UI state
        [jointName]: value     // Apply the new value
      };
      
      debugJoint(`🎯 Manual joint update: ${jointName} = ${value}`);
      debugJoint(`📊 All joints after merge:`, updatedJoints);
      
      // Now receiveJoints has ALL joint values preserved
      return receiveJoints(robotId, updatedJoints);
    }
    
    debugJoint(`❌ Failed to set joint ${jointName}`);
    return false;
  }, [findRobotWithFallbacks, robotJointValues, getRobotJointValues, ensureJointAngleSync, receiveJoints]);

  // setJointValues uses receiveJoints
  const setJointValues = useCallback((robotId, values, source = 'manual') => {
    return receiveJoints(robotId, values);
  }, [receiveJoints]);

  // Reset joints to zero
  const resetJoints = useCallback((robotId) => {
    debugJoint(`Resetting joints for robot ${robotId}`);
    
    const robot = findRobotWithFallbacks(robotId);
    if (!robot) {
      debugJoint(`Robot ${robotId} not found for reset`);
      return;
    }
    
    try {
      const frameId = animationFrameRef.current.get(robotId);
      if (frameId) {
        cancelAnimationFrame(frameId);
        animationFrameRef.current.delete(robotId);
        setIsAnimating(prev => new Map(prev).set(robotId, false));
        debugJoint(`Stopped animation before reset for ${robotId}`);
      }
      
      const joints = robotJoints.get(robotId) || [];
      const resetValues = {};
      joints.forEach(joint => {
        resetValues[joint.name] = 0;
      });
      
      const success = setRobotJointValues_Internal(robotId, resetValues);
      
      if (success) {
        setRobotJointValues(prev => new Map(prev).set(robotId, resetValues));
        debugJoint(`Reset joints for ${robotId}:`, resetValues);
      }
      
    } catch (error) {
      debugJoint(`Error resetting joints:`, error);
    }
  }, [robotJoints, findRobotWithFallbacks, setRobotJointValues_Internal]);

  // Get joint information
  const getJointInfo = useCallback((robotId) => {
    return robotJoints.get(robotId) || [];
  }, [robotJoints]);

  // Get joint values
  const getJointValues = useCallback((robotId) => {
    if (!isRobotReady(robotId)) {
      const uiValues = robotJointValues.get(robotId);
      if (uiValues) {
        debugJoint(`Robot ${robotId} not ready, returning UI state values`);
        return uiValues;
      }
    }
    return getRobotJointValues(robotId);
  }, [getRobotJointValues, isRobotReady, robotJointValues]);

  // Get joint limits
  const getJointLimits = useCallback((robotId, jointName) => {
    const joints = robotJoints.get(robotId) || [];
    const joint = joints.find(j => j.name === jointName);
    return joint ? joint.limits : {};
  }, [robotJoints]);

  // Check if robot is animating
  const isRobotAnimating = useCallback((robotId) => {
    return isAnimating.get(robotId) || false;
  }, [isAnimating]);

  // Get animation progress
  const getAnimationProgress = useCallback((robotId) => {
    return animationProgress.get(robotId) || 0;
  }, [animationProgress]);

  // Cleanup
  useEffect(() => {
    return () => {
      animationFrameRef.current.forEach((frameId, robotId) => {
        cancelAnimationFrame(frameId);
        debugJoint(`Cleanup: cancelled animation for ${robotId}`);
      });
      animationFrameRef.current.clear();
      robotRegistryRef.current.clear();
    };
  }, []);

  // Move robot to joint values
  const moveJoints = useCallback(async (robotId, values, options = {}) => {
    if (options.animate) {
      return await animateToJointValues(robotId, values, options);
    } else {
      return receiveJoints(robotId, values);
    }
  }, [animateToJointValues, receiveJoints]);

  // Memoize context value
  const value = useMemo(() => ({
    // State
    robotJoints,
    robotJointValues,
    isAnimating,
    animationProgress,
    // Methods
    setJointValue,
    setJointValues,
    resetJoints,
    getJointInfo,
    getJointValues,
    getJointLimits,
    isRobotAnimating,
    getAnimationProgress,
    stopAnimation,
    animateToJointValues,
    moveJoints,
    receiveJoints,
    // Expose active robotId
    activeRobotId,
    registerIKCallback,
    registerTrajectoryCallback,
  }), [
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
    stopAnimation,
    animateToJointValues,
    moveJoints,
    receiveJoints,
    activeRobotId,
    registerIKCallback,
    registerTrajectoryCallback,
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