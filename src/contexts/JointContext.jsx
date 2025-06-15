// src/contexts/JointContext.jsx - Updated to use unified RobotContext
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useViewer } from './ViewerContext';
import { useRobotSelection } from './hooks/useRobotManager';
import EventBus from '../utils/EventBus';
import { useRobotContext } from './RobotContext'; // Updated import

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

  // Initialize robot manager reference
  useEffect(() => {
    if (isViewerReady) {
      robotManagerRef.current = getRobotManager();
      console.log('[JointContext] Robot manager initialized:', !!robotManagerRef.current);
    }
  }, [isViewerReady, getRobotManager]);

  // Stop animation for robot (defined early to avoid hoisting issues)
  const stopAnimation = useCallback((robotId) => {
    const frameId = animationFrameRef.current.get(robotId);
    if (frameId) {
      cancelAnimationFrame(frameId);
      animationFrameRef.current.delete(robotId);
      console.log(`[JointContext] Cancelled animation frame for ${robotId}`);
    }
    
    setIsAnimating(prev => new Map(prev).set(robotId, false));
    setAnimationProgress(prev => new Map(prev).set(robotId, 0));
    
    console.log(`[JointContext] Stopped animation for ${robotId}`);
    
    // Notify IK that animation was stopped
    EventBus.emit('ik:animation-complete', {
      robotId,
      success: false // Stopped, not completed
    });
  }, []);

  // 🚨 CRITICAL FIX: Enhanced robot finder with multiple fallback methods
  const findRobotWithFallbacks = useCallback((robotId) => {
    if (!robotId) return null;

    console.log(`[JointContext] Looking for robot: ${robotId}`);

    // Method 1: Check local registry first (most reliable)
    if (robotRegistryRef.current.has(robotId)) {
      const robot = robotRegistryRef.current.get(robotId);
      console.log(`[JointContext] Found robot in local registry: ${robotId}`);
      return robot;
    }

    // Method 2: Try robot manager getRobot method
    if (robotManagerRef.current && robotManagerRef.current.getRobot) {
      try {
        const robot = robotManagerRef.current.getRobot(robotId);
        if (robot) {
          console.log(`[JointContext] Found robot via robot manager: ${robotId}`);
          // Cache in local registry for future use
          robotRegistryRef.current.set(robotId, robot);
          return robot;
        }
      } catch (error) {
        console.warn(`[JointContext] Robot manager getRobot failed:`, error);
      }
    }

    // Method 3: Try robot manager robots Map
    if (robotManagerRef.current && robotManagerRef.current.robots && robotManagerRef.current.robots.has) {
      try {
        const robotData = robotManagerRef.current.robots.get(robotId);
        if (robotData && robotData.robot) {
          console.log(`[JointContext] Found robot in manager robots Map: ${robotId}`);
          // Cache in local registry
          robotRegistryRef.current.set(robotId, robotData.robot);
          return robotData.robot;
        }
      } catch (error) {
        console.warn(`[JointContext] Robot manager robots Map failed:`, error);
      }
    }

    // Method 4: Try window.robotManagerContext (if exists)
    if (window.robotManagerContext && window.robotManagerContext.getRobot) {
      try {
        const robot = window.robotManagerContext.getRobot(robotId);
        if (robot) {
          console.log(`[JointContext] Found robot via window.robotManagerContext: ${robotId}`);
          robotRegistryRef.current.set(robotId, robot);
          return robot;
        }
      } catch (error) {
        console.warn(`[JointContext] Window robot manager failed:`, error);
      }
    }

    console.warn(`[JointContext] Robot ${robotId} not found in any registry`);
    return null;
  }, []);

  // 🚨 CRITICAL FIX: Enhanced joint values getter with fallbacks
  const getRobotJointValues = useCallback((robotId) => {
    const robot = findRobotWithFallbacks(robotId);
    if (!robot) {
      console.warn(`[JointContext] Cannot get joint values - robot ${robotId} not found`);
      return {};
    }

    const values = {};
    
    try {
      console.log(`[JointContext] Getting joint values for ${robotId}`);
      
      // Method 1: Direct robot.joints access (most reliable)
      if (robot.joints) {
        console.log(`[JointContext] Found robot.joints:`, Object.keys(robot.joints));
        
        Object.values(robot.joints).forEach(joint => {
          if (joint && joint.jointType !== 'fixed' && typeof joint.angle !== 'undefined') {
            values[joint.name] = joint.angle;
            console.log(`[JointContext] Read joint ${joint.name} = ${joint.angle}`);
          }
        });
        
        if (Object.keys(values).length > 0) {
          console.log(`[JointContext] ✅ Got ${Object.keys(values).length} joint values via direct access:`, values);
          return values;
        }
      }

      // Method 2: Try robot's getJointValues if available
      if (robot.getJointValues && typeof robot.getJointValues === 'function') {
        const robotValues = robot.getJointValues();
        Object.assign(values, robotValues);
        console.log(`[JointContext] Got joint values via robot.getJointValues(): ${Object.keys(values).length} joints`);
        
        if (Object.keys(values).length > 0) {
          return values;
        }
      }

      // Method 3: Try robot manager's getJointValues (this was failing before)
      if (robotManagerRef.current && robotManagerRef.current.getJointValues) {
        try {
          const managerValues = robotManagerRef.current.getJointValues(robotId);
          Object.assign(values, managerValues);
          console.log(`[JointContext] Got joint values via manager.getJointValues(): ${Object.keys(values).length} joints`);
          
          if (Object.keys(values).length > 0) {
            return values;
          }
        } catch (error) {
          console.warn(`[JointContext] Manager getJointValues failed:`, error);
        }
      }

      // Method 4: Try traversing robot object to find joints
      console.log(`[JointContext] Fallback: traversing robot object to find joints`);
      const foundJoints = {};
      
      robot.traverse((child) => {
        if (child.isURDFJoint && child.jointType !== 'fixed' && typeof child.angle !== 'undefined') {
          foundJoints[child.name] = child.angle;
          console.log(`[JointContext] Found joint via traverse: ${child.name} = ${child.angle}`);
        }
      });
      
      if (Object.keys(foundJoints).length > 0) {
        console.log(`[JointContext] ✅ Got ${Object.keys(foundJoints).length} joints via traverse:`, foundJoints);
        return foundJoints;
      }

      console.warn(`[JointContext] ❌ Could not retrieve any joint values for ${robotId}`);
      return {};

    } catch (error) {
      console.error(`[JointContext] Error getting joint values for ${robotId}:`, error);
      return {};
    }
  }, [findRobotWithFallbacks]);

  // Add this helper method in JointProvider (around line 150)
  const ensureJointAngleSync = useCallback((robot, jointName, value) => {
    let success = false;
    
    // Method 1: Use robot's setJointValue if available
    if (robot.setJointValue && typeof robot.setJointValue === 'function') {
      success = robot.setJointValue(jointName, value);
      console.log(`[JointContext] robot.setJointValue(${jointName}, ${value}) = ${success}`);
    }

    // Method 2: Try direct joint setJointValue if robot method failed
    if (!success && robot.joints && robot.joints[jointName]) {
      if (robot.joints[jointName].setJointValue) {
        success = robot.joints[jointName].setJointValue(value);
        console.log(`[JointContext] joint.setJointValue(${value}) = ${success}`);
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

    console.log(`[JointContext] ✅ Joint sync for ${jointName} = ${value}, success: ${success}`);
    return success;
  }, []);

  // 🚨 CRITICAL FIX: Enhanced joint setter with proper TCP integration
  const setRobotJointValues_Internal = useCallback((robotId, values) => {
    // First check if robot is ready
    if (!isRobotReady(robotId)) {
      console.warn(`[JointContext] Robot ${robotId} not ready for joint updates`);
      return false;
    }

    const robot = findRobotWithFallbacks(robotId);
    if (!robot) {
      console.warn(`[JointContext] Robot ${robotId} not found`);
      return false;
    }

    let success = false;

    try {
      // Method 1: Use robot's setJointValues method
      if (robot.setJointValues && typeof robot.setJointValues === 'function') {
        success = robot.setJointValues(values);
        console.log(`[JointContext] Robot setJointValues result: ${success}`);
      }

      // Method 2: Use robot manager's setJointValues (if robot method failed)
      if (!success && robotManagerRef.current && robotManagerRef.current.setJointValues) {
        try {
          success = robotManagerRef.current.setJointValues(robotId, values);
          console.log(`[JointContext] Robot manager setJointValues result: ${success}`);
        } catch (error) {
          console.warn(`[JointContext] Robot manager setJointValues failed:`, error);
        }
      }

      // Method 3: Try individual joint updates as last resort
      if (!success) {
        success = true;
        Object.entries(values).forEach(([jointName, value]) => {
          const joint = robot.joints[jointName];
          if (!joint) {
            console.warn(`[JointContext] Joint ${jointName} not found in robot ${robotId}`);
            success = false;
            return;
          }

          // Set joint value and check result
          const jointSuccess = robot.setJointValue(jointName, value);
          if (!jointSuccess) {
            console.warn(`[JointContext] Failed to set joint ${jointName} to ${value}`);
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
      console.error(`[JointContext] Error setting joint values for ${robotId}:`, error);
      return false;
    }
  }, [findRobotWithFallbacks, isRobotReady]);

  // Extract joint information when robot loads or registers
  useEffect(() => {
    const handleRobotLoaded = (data) => {
      const { robotName, robot, robotId } = data;
      const targetRobotId = robotId || robotName;
      
      if (!robot || !targetRobotId) return;
      
      console.log(`[JointContext] Robot loaded: ${targetRobotId}, extracting joint info`);
      
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
      setIsAnimating(prev => new Map(prev).set(targetRobotId, false));
      
      console.log(`[JointContext] Extracted ${joints.length} joints for ${targetRobotId}`);
      console.log(`[JointContext] Joint values:`, values);
    };

    // 🚨 NEW: Handle robot registration events (from useRobotControl)
    const handleRobotRegistered = (data) => {
      const { robotId, robotName, robot } = data;
      const targetRobotId = robotId || robotName;
      
      if (!robot || !targetRobotId) return;
      
      console.log(`[JointContext] Robot registered: ${targetRobotId}`);
      
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
      
      console.log(`[JointContext] Robot removed: ${targetRobotId}`);
      
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

  // Listen for IK calculated joint values and handle animation
  useEffect(() => {
    const handleIKJointValues = async (data) => {
      const { robotId, jointValues, animate, duration = 1000 } = data;
      
      console.log(`[JointContext] Received IK joint values for ${robotId}:`, jointValues);
      console.log(`[JointContext] Animate: ${animate}, Duration: ${duration}`);
      
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
        }
        
        // Notify IK immediately for non-animated moves
        console.log(`[JointContext] Immediate move complete for ${robotId}`);
        EventBus.emit('ik:animation-complete', {
          robotId,
          success: true
        });
      }
    };

    // Listen for stop animation requests from IK
    const handleStopAnimation = (data) => {
      const { robotId } = data;
      console.log(`[JointContext] Received stop animation request for ${robotId}`);
      stopAnimation(robotId);
    };

    const unsubscribeJoints = EventBus.on('ik:joint-values-calculated', handleIKJointValues);
    const unsubscribeStop = EventBus.on('joint:stop-animation', handleStopAnimation);
    
    return () => {
      unsubscribeJoints();
      unsubscribeStop();
    };
  }, [stopAnimation, setRobotJointValues_Internal]);

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
            console.warn(`[JointContext] Skipping animation frame for robot ${robotId} - not ready`);
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

  // Animate to target joint values with FIXED current value detection
  const animateToJointValues = useCallback(async (robotId, targetValues, options = {}) => {
    const {
      duration = 1000,
      tolerance = 0.001,
      maxDuration = 10000, // Maximum animation time (10 seconds)
      animationSpeed = 1.0,
      onProgress = null,
      easing = 'exponential' // New option for easing function
    } = options;
    
    // Skip if robot is not ready
    if (!isRobotReady(robotId)) {
      console.warn(`[JointContext] Skipping animation for robot ${robotId} - not ready`);
      return Promise.resolve({ success: false, error: 'Robot not ready' });
    }

    return new Promise((resolve) => {
      console.log(`[JointContext] Starting animation for ${robotId} with tolerance ${tolerance}`);
      
      // Cancel any existing animation for this robot
      const existingFrameId = animationFrameRef.current.get(robotId);
      if (existingFrameId) {
        cancelAnimationFrame(existingFrameId);
        console.log(`[JointContext] Cancelled existing animation for ${robotId}`);
      }
      
      // Get current joint values
      const currentValues = getRobotJointValues(robotId);
      console.log(`[JointContext] Current joint values:`, currentValues);
      
      const startTime = Date.now();
      const robot = findRobotWithFallbacks(robotId);
      
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
      console.log(`[JointContext] Set isAnimating=true for ${robotId}`);
      
      console.log(`[JointContext] Animating ${robotId} from:`, currentValues, 'to:', targetValues);
      console.log(`[JointContext] Initial error: ${initialError}, tolerance: ${tolerance}`);
      
      // Easing functions
      const easingFunctions = {
        linear: t => t,
        exponential: t => 1 - Math.exp(-5 * t),
        smoothstep: t => t * t * (3 - 2 * t),
        smootherstep: t => t * t * t * (t * (t * 6 - 15) + 10)
      };
      
      const getEasing = (t) => {
        const func = easingFunctions[easing] || easingFunctions.exponential;
        return func(t);
      };
      
      const animate = () => {
        const robot = findRobotWithFallbacks(robotId);
        
        // Guard against undefined robot or missing setJointValues method
        if (!robot || !robot.setJointValues) {
          console.warn(`[JointContext] Robot ${robotId} not ready for animation`);
          stopAnimation(robotId);
          resolve({
            success: false,
            error: 'Robot not ready for animation'
          });
          return;
        }
        
        const elapsed = Date.now() - startTime;
        const timeProgress = Math.min(elapsed / duration, 1);
        
        // Apply easing function
        const smoothProgress = getEasing(timeProgress);
        
        // Interpolate joint values
        const interpolatedValues = {};
        let currentError = 0;
        let maxJointError = 0;
        
        Object.keys(targetValues).forEach(jointName => {
          const start = currentValues[jointName] || 0;
          const end = targetValues[jointName];
          const value = start + (end - start) * smoothProgress;
          interpolatedValues[jointName] = value;
          
          // Calculate current error
          const diff = end - value;
          currentError += diff * diff;
          maxJointError = Math.max(maxJointError, Math.abs(diff));
        });
        currentError = Math.sqrt(currentError);
        
        // Apply to robot
        const success = setRobotJointValues_Internal(robotId, interpolatedValues);
        
        if (success) {
          // Update local state
          setRobotJointValues(prev => {
            const newMap = new Map(prev);
            const robotValues = newMap.get(robotId) || {};
            newMap.set(robotId, { ...robotValues, ...interpolatedValues });
            return newMap;
          });
        }
        
        // Calculate error-based progress
        const errorProgress = initialError > 0 ? 1 - (currentError / initialError) : 1;
        
        // Update progress based on both time and error
        const combinedProgress = Math.max(timeProgress, errorProgress);
        setAnimationProgress(prev => new Map(prev).set(robotId, combinedProgress));
        
        // Call progress callback if provided
        if (onProgress) {
          onProgress({
            timeProgress,
            errorProgress,
            currentError,
            maxJointError,
            tolerance,
            elapsed
          });
        }
        
        // Check completion conditions
        const withinTolerance = currentError <= tolerance;
        const timeExpired = elapsed >= maxDuration;
        const shouldStop = withinTolerance || timeExpired || timeProgress >= 1;
        
        if (shouldStop) {
          // If within tolerance, apply exact target values
          if (withinTolerance) {
            console.log(`[JointContext] Within tolerance (${currentError} <= ${tolerance}), applying exact values`);
            setRobotJointValues_Internal(robotId, targetValues);
            setRobotJointValues(prev => {
              const newMap = new Map(prev);
              newMap.set(robotId, targetValues);
              return newMap;
            });
          }
          
          // Animation complete
          console.log(`[JointContext] Animation complete for ${robotId}. Final error: ${currentError}, Within tolerance: ${withinTolerance}`);
          
          // Clean up animation state
          setIsAnimating(prev => new Map(prev).set(robotId, false));
          setAnimationProgress(prev => new Map(prev).set(robotId, 0));
          animationFrameRef.current.delete(robotId);
          
          console.log(`[JointContext] Set isAnimating=false for ${robotId}`);
          console.log(`[JointContext] Notifying IK animation complete`);
          
          // Notify IK that animation is complete
          EventBus.emit('ik:animation-complete', {
            robotId,
            success: true,
            withinTolerance,
            finalError: currentError,
            maxJointError,
            duration: elapsed
          });
          
          resolve({
            success: true,
            withinTolerance,
            finalError: currentError,
            maxJointError,
            duration: elapsed
          });
        } else {
          // Calculate adaptive speed based on error
          const errorRatio = currentError / tolerance;
          const speedMultiplier = errorRatio > 10 ? animationSpeed * 1.5 :
                                errorRatio > 5 ? animationSpeed * 1.2 :
                                errorRatio > 2 ? animationSpeed :
                                animationSpeed * 0.8;
          
          // Schedule next frame with adaptive timing
          const frameId = requestAnimationFrame(animate);
          animationFrameRef.current.set(robotId, frameId);
        }
      };
      
      // Start animation
      const frameId = requestAnimationFrame(animate);
      animationFrameRef.current.set(robotId, frameId);
    });
  }, [findRobotWithFallbacks, getRobotJointValues, setRobotJointValues_Internal, isRobotReady]);

  // Update the setJointValue method (around line 200)
  const setJointValue = useCallback((robotId, jointName, value) => {
    console.log(`[JointContext] Setting joint ${jointName} = ${value} for robot ${robotId}`);
    
    const robot = findRobotWithFallbacks(robotId);
    if (!robot) {
      console.error(`[JointContext] Robot ${robotId} not found for setJointValue`);
      return false;
    }

    let success = false;

    try {
      // 🚨 FIX: Use the new sync method to ensure both visual and internal state are updated
      success = ensureJointAngleSync(robot, jointName, value);
      
      // Try robot manager's setJointValue as additional fallback
      if (!success && robotManagerRef.current && robotManagerRef.current.setJointValue) {
        success = robotManagerRef.current.setJointValue(robotId, jointName, value);
        
        // Still need to sync joint.angle even if manager succeeded
        if (success && robot.joints && robot.joints[jointName]) {
          robot.joints[jointName].angle = value;
          console.log(`[JointContext] ✅ Synced joint.angle via manager fallback for ${jointName} = ${value}`);
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

        // 🚨 CRITICAL: Emit events for TCP integration
        console.log(`[JointContext] Successfully set joint ${jointName} = ${value} for robot ${robotId}`);
        
        EventBus.emit('robot:joint-changed', {
          robotId,
          robotName: robotId,
          jointName,
          value,
          allValues: getRobotJointValues(robotId)
        });

        // Force TCP recalculation
        EventBus.emit('tcp:force-recalculate', { robotId });
      }

      return success;
    } catch (error) {
      console.error(`[JointContext] Error setting joint value:`, error);
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
    }
    return success;
  }, [setRobotJointValues_Internal]);

  // Reset joints to zero
  const resetJoints = useCallback((robotId) => {
    console.log(`[JointContext] Resetting joints for robot ${robotId}`);
    
    const robot = findRobotWithFallbacks(robotId);
    if (!robot) {
      console.error(`[JointContext] Robot ${robotId} not found for reset`);
      return;
    }
    
    try {
      // Stop any ongoing animation first
      const frameId = animationFrameRef.current.get(robotId);
      if (frameId) {
        cancelAnimationFrame(frameId);
        animationFrameRef.current.delete(robotId);
        setIsAnimating(prev => new Map(prev).set(robotId, false));
        console.log(`[JointContext] Stopped animation before reset for ${robotId}`);
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
        console.log(`[JointContext] Reset joints for ${robotId}:`, resetValues);
      }
      
    } catch (error) {
      console.error(`[JointContext] Error resetting joints:`, error);
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
        console.log(`[JointContext] Cleanup: cancelled animation for ${robotId}`);
      });
      animationFrameRef.current.clear();
      robotRegistryRef.current.clear();
    };
  }, []);

  const value = {
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
    stopAnimation
  };

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