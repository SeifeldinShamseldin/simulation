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

  // Stop animation for robot (defined early to avoid hoisting issues)
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
      success: false // Stopped, not completed
    });
  }, []);

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
      
      // Store joint info
      setRobotJoints(prev => new Map(prev).set(targetRobotId, joints));
      
      // CRITICAL FIX: Don't initialize with zeros! Keep UI state if it exists
      setRobotJointValues(prev => {
        const newMap = new Map(prev);
        // Only set if we don't already have values (preserve user changes)
        if (!newMap.has(targetRobotId)) {
          newMap.set(targetRobotId, values);
        }
        return newMap;
      });
      
      setIsAnimating(prev => new Map(prev).set(targetRobotId, false));
      
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
      
      // Stop any ongoing animation
      stopAnimation(targetRobotId);
      
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
      setIsAnimating(prev => {
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
  }, [stopAnimation, robotJoints]);

  // === CANONICAL JOINT UPDATE METHOD ===
  // All joint updates (single or batch) MUST go through this method.
  // This method is responsible for updating state, notifying IK, Trajectory, and emitting events.
  const receiveJoints = useCallback((robotId, values) => {
    // ALWAYS update UI state first to reflect user intent
    setRobotJointValues(prev => {
      const newMap = new Map(prev);
      newMap.set(robotId, values);
      return newMap;
    });
    
    // Always notify trajectory with user intent
    if (trajCallbackRef.current) {
      debugJoint(`📹 Notifying trajectory recorder with joints:`, values);
      trajCallbackRef.current(robotId, values);
    }
    
    // Try to apply to actual robot
    const success = setRobotJointValues_Internal(robotId, values);
    
    if (success) {
      // Notify IK only on success
      if (ikCallbackRef.current) {
        ikCallbackRef.current(robotId, values);
      }
      // Emit events for UI
      EventBus.emit('robot:joints-changed', {
        robotId,
        values: values,
        source: 'receiveJoints'
      });
    }
    
    return success;
  }, [setRobotJointValues_Internal]);

  // Animate to target joint values with FIXED current value detection
  const animateToJointValues = useCallback(async (robotId, targetValues, options = {}) => {
    const {
      duration = 1000,
      tolerance = 0.001,
      maxDuration = 10000,
      animationSpeed = 1.0,
      onProgress = null,
      motionProfile = 'trapezoidal', // New: 'trapezoidal' or 's-curve'
      jointConstraints = {}, // New: per-joint velocity/acceleration limits
      // Default constraints for all joints if not specified
      defaultConstraints = {
        maxVelocity: 2.0,        // rad/s or deg/s depending on your units
        maxAcceleration: 4.0,    // rad/s² or deg/s²
        maxJerk: 20.0           // rad/s³ (for s-curve only)
      }
    } = options;
    
    // Skip if robot is not ready
    if (!isRobotReady(robotId)) {
      debugJoint(`Skipping animation for robot ${robotId} - not ready`);
      return Promise.resolve({ success: false, error: 'Robot not ready' });
    }

    return new Promise((resolve) => {
      debugJoint(`Starting motion profile animation for ${robotId}`);
      
      // Cancel any existing animation for this robot
      const existingFrameId = animationFrameRef.current.get(robotId);
      if (existingFrameId) {
        cancelAnimationFrame(existingFrameId);
        debugJoint(`Cancelled existing animation for ${robotId}`);
      }
      
      // Get current joint values
      const currentValues = getRobotJointValues(robotId);
      debugJoint(`Current joint values:`, currentValues);
      
      const startTime = Date.now();
      const robot = findRobotWithFallbacks(robotId);
      
      // Build joint constraints map
      const jointLimits = {};
      Object.keys(targetValues).forEach(jointName => {
        jointLimits[jointName] = jointConstraints[jointName] || defaultConstraints;
      });
      
      // Create multi-axis profiler
      const profiler = new MultiAxisProfiler({ profileType: motionProfile });
      
      // Calculate synchronized motion profiles for all joints
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
      
      // Calculate total error at start
      let initialError = 0;
      Object.keys(targetValues).forEach(jointName => {
        const start = currentValues[jointName] || 0;
        const end = targetValues[jointName];
        const diff = end - start;
        initialError += diff * diff;
      });
      initialError = Math.sqrt(initialError);
      
      // Set animation state
      setIsAnimating(prev => new Map(prev).set(robotId, true));
      debugJoint(`Set isAnimating=true for ${robotId}`);
      
      // Animation loop using motion profiles
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
        
        const elapsed = (Date.now() - startTime) / 1000; // Convert to seconds
        const scaledElapsed = elapsed * animationSpeed; // Apply animation speed
        
        // Get interpolated joint values from motion profile
        const interpolatedValues = profiler.getJointValues(scaledElapsed, profileData);
        const progress = profiler.getProgress(scaledElapsed, profileData);
        
        // Calculate current error
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
        
        // Apply to robot
        const success = receiveJoints(robotId, interpolatedValues);
        
        if (success) {
          // Update local state
          setRobotJointValues(prev => {
            const newMap = new Map(prev);
            const robotValues = newMap.get(robotId) || {};
            newMap.set(robotId, { ...robotValues, ...interpolatedValues });
            return newMap;
          });
          
          // Emit joint change event for trajectory recording
          EventBus.emit('robot:joints-changed', {
            robotId,
            robotName: robotId,
            values: interpolatedValues,
            source: 'motion-profile-animation',
            progress,
            profileType: motionProfile
          });
        }
        
        // Update animation progress
        setAnimationProgress(prev => new Map(prev).set(robotId, progress));
        
        // Call progress callback if provided
        if (onProgress) {
          // Get current velocities for each joint
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
            elapsed: elapsed * 1000, // Back to milliseconds
            velocities,
            profileType: motionProfile
          });
        }
        
        // Check completion conditions
        const profileComplete = progress >= 1;
        const withinTolerance = currentError <= tolerance;
        const timeExpired = elapsed * 1000 >= maxDuration;
        const shouldStop = profileComplete || withinTolerance || timeExpired;
        
        if (shouldStop) {
          // If profile is complete, apply exact target values
          if (profileComplete || withinTolerance) {
            debugJoint(`Motion profile complete, applying exact values`);
            const finalSuccess = receiveJoints(robotId, targetValues);
            if (finalSuccess) {
              // Final joint change event with exact values
              EventBus.emit('robot:joints-changed', {
                robotId,
                robotName: robotId,
                values: targetValues,
                source: 'motion-profile-complete',
                progress: 1
              });
            }
          }
          
          // Animation complete
          debugJoint(`Animation complete for ${robotId}. Profile time: ${profileData.totalTime}s`);
          
          // Clean up animation state
          setIsAnimating(prev => new Map(prev).set(robotId, false));
          setAnimationProgress(prev => new Map(prev).set(robotId, 0));
          animationFrameRef.current.delete(robotId);
          
          // Notify IK that animation is complete
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
          // Schedule next frame
          const frameId = requestAnimationFrame(animate);
          animationFrameRef.current.set(robotId, frameId);
        }
      };
      
      // Start animation
      const frameId = requestAnimationFrame(animate);
      animationFrameRef.current.set(robotId, frameId);
    });
  }, [findRobotWithFallbacks, getRobotJointValues, receiveJoints, isRobotReady, stopAnimation]);

  // Listen for IK calculated joint values and handle animation
  useEffect(() => {
    const handleIKJointValues = async (data) => {
      const { robotId, jointValues, animate, duration = 1000 } = data;
      
      debugJoint(`Received IK joint values for ${robotId}:`, jointValues);
      
      // CRITICAL: Emit joint change event BEFORE animation for trajectory recording
      EventBus.emit('robot:joints-changed', {
        robotId,
        robotName: robotId,
        values: jointValues,
        source: 'ik' // Mark source for debugging
      });
      
      if (animate) {
        await animateToJointValues(robotId, jointValues, duration);
      } else {
        // Apply immediately
        const success = setRobotJointValues_Internal(robotId, jointValues);
        if (success) {
          // Update local state
          setRobotJointValues(prev => {
            const newMap = new Map(prev);
            const currentValues = newMap.get(robotId) || {};
            newMap.set(robotId, { ...currentValues, ...jointValues });
            return newMap;
          });
          
          // Emit again after successful application
          EventBus.emit('robot:joints-changed', {
            robotId,
            robotName: robotId,
            values: jointValues,
            source: 'ik-applied'
          });
        }
        
        // Notify IK immediately for non-animated moves
        EventBus.emit('ik:animation-complete', {
          robotId,
          success: true
        });
      }
    };

    // Handle TCP tool attachment events
    const handleTCPToolAttached = (data) => {
      const { robotId, toolName, originalToolName, toolDimensions } = data;
      debugJoint(`TCP tool attached to ${robotId}:`, {
        toolName,
        originalToolName,
        toolDimensions
      });
      
      // Force TCP recalculation after tool attachment
      EventBus.emit('tcp:force-recalculate', { robotId });
    };

    const unsubscribeJoints = EventBus.on('ik:joint-values-calculated', handleIKJointValues);
    const unsubscribeTCP = EventBus.on('tcp:tool-attached', handleTCPToolAttached);
    
    return () => {
      unsubscribeJoints();
      unsubscribeTCP();
    };
  }, [animateToJointValues, setRobotJointValues_Internal]);

  // Handle high-frequency animation frame updates
  useEffect(() => {
    let animationFrameId = null;
    let lastFrameTime = 0;
    const targetFPS = 60;
    const frameInterval = 1000 / targetFPS;
    const pendingFrames = new Map(); // Store pending frames per robot

    const handleAnimationFrame = (data) => {
      const { robotId, jointValues } = data;
      // Store the frame data
      pendingFrames.set(robotId, { robotId, jointValues });
    };

    const processFrame = (timestamp) => {
      if (!lastFrameTime) lastFrameTime = timestamp;
      
      const elapsed = timestamp - lastFrameTime;
      
      if (elapsed >= frameInterval) {
        // Process all pending frames
        pendingFrames.forEach((frameData) => {
          const { robotId, jointValues } = frameData;
          
          // Skip if robot is not ready
          if (!isRobotReady(robotId)) {
            debugJoint(`Skipping animation frame for robot ${robotId} - not ready`);
            return;
          }
          
          // Apply joint values directly without animation
          const success = setRobotJointValues_Internal(robotId, jointValues);
          
          if (success) {
            // Update local state
            setRobotJointValues(prev => {
              const newMap = new Map(prev);
              const robotValues = newMap.get(robotId) || {};
              newMap.set(robotId, { ...robotValues, ...jointValues });
              return newMap;
            });
          }
        });
        
        // Clear processed frames
        pendingFrames.clear();
        lastFrameTime = timestamp;
      }
      
      animationFrameId = requestAnimationFrame(processFrame);
    };

    // Start the animation loop
    animationFrameId = requestAnimationFrame(processFrame);

    // Subscribe to animation frame events
    const unsubscribe = EventBus.on('animation-frame', handleAnimationFrame);

    // Cleanup
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      unsubscribe();
    };
  }, [isRobotReady, setRobotJointValues_Internal]);

  // 🚨 CRITICAL FIX: setJointValue now ensures up-to-date values
  const setJointValue = useCallback((robotId, jointName, value) => {
    const robot = findRobotWithFallbacks(robotId);
    if (!robot) return false;
    
    // Set the single joint
    const success = ensureJointAngleSync(robot, jointName, value);
    
    if (success) {
      // CRITICAL FIX: Use UI state instead of robot values!
      // This preserves other joint values that were previously set
      const currentUiJoints = robotJointValues.get(robotId) || {};
      
      // MANUALLY UPDATE the value we just set
      const updatedJoints = {
        ...currentUiJoints,  // Keep all previous UI values
        [jointName]: value   // Update only this joint
      };
      
      debugJoint(`🎯 Manual joint update: ${jointName} = ${value}`);
      debugJoint(`📊 All joints:`, updatedJoints);
      
      // Now receiveJoints has ALL joint values preserved
      return receiveJoints(robotId, updatedJoints);
    }
    
    return false;
  }, [findRobotWithFallbacks, robotJointValues, ensureJointAngleSync, receiveJoints]);

  // Refactored: setJointValues now uses receiveJoints for all notifications
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
      // Stop any ongoing animation first
      const frameId = animationFrameRef.current.get(robotId);
      if (frameId) {
        cancelAnimationFrame(frameId);
        animationFrameRef.current.delete(robotId);
        setIsAnimating(prev => new Map(prev).set(robotId, false));
        debugJoint(`Stopped animation before reset for ${robotId}`);
      }
      
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

  // Get joint values for a robot (ALWAYS get fresh data)
  const getJointValues = useCallback((robotId) => {
    // First check if robot is ready
    if (!isRobotReady(robotId)) {
      // If robot not ready, return UI state instead of actual robot values
      const uiValues = robotJointValues.get(robotId);
      if (uiValues) {
        debugJoint(`Robot ${robotId} not ready, returning UI state values`);
        return uiValues;
      }
    }
    // If robot is ready, get actual values from robot
    return getRobotJointValues(robotId);
  }, [getRobotJointValues, isRobotReady, robotJointValues]);

  // Get joint limits for a specific joint
  const getJointLimits = useCallback((robotId, jointName) => {
    const joints = robotJoints.get(robotId) || [];
    const joint = joints.find(j => j.name === jointName);
    return joint ? joint.limits : {};
  }, [robotJoints]);

  // Check if robot is animating
  const isRobotAnimating = useCallback((robotId) => {
    return isAnimating.get(robotId) || false;
  }, [isAnimating]);

  // Get animation progress for robot
  const getAnimationProgress = useCallback((robotId) => {
    return animationProgress.get(robotId) || 0;
  }, [animationProgress]);

  // Cleanup
  useEffect(() => {
    return () => {
      // Cancel all animations on unmount
      animationFrameRef.current.forEach((frameId, robotId) => {
        cancelAnimationFrame(frameId);
        debugJoint(`Cleanup: cancelled animation for ${robotId}`);
      });
      animationFrameRef.current.clear();
      robotRegistryRef.current.clear();
    };
  }, []);

  // Move robot to joint values (optionally animated)
  const moveJoints = useCallback(async (robotId, values, options = {}) => {
    if (options.animate) {
      return await animateToJointValues(robotId, values, options);
    } else {
      return receiveJoints(robotId, values);
    }
  }, [animateToJointValues, receiveJoints]);

  // Memoize context value to prevent unnecessary re-renders
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
    // Expose active robotId for consumers
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