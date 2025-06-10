// src/contexts/JointContext.jsx - Fixed animation state management
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useViewer } from './ViewerContext';
import { useRobotSelection } from './hooks/useRobot';
import { useRobotContext } from './RobotContext'; // ADD: Use RobotContext directly
import EventBus from '../utils/EventBus';

const JointContext = createContext(null);

export const JointProvider = ({ children }) => {
  const { isViewerReady, getRobotManager } = useViewer();
  const { activeId: activeRobotId } = useRobotSelection();
  
  // ADD: Use RobotContext directly
  const { getRobot: getRobotFromContext } = useRobotContext();
  
  // State for all robots' joint data
  const [robotJoints, setRobotJoints] = useState(new Map()); // robotId -> joint info
  const [robotJointValues, setRobotJointValues] = useState(new Map()); // robotId -> joint values
  const [isAnimating, setIsAnimating] = useState(new Map()); // robotId -> boolean
  const [animationProgress, setAnimationProgress] = useState(new Map()); // robotId -> progress
  
  const robotManagerRef = useRef(null);
  const animationFrameRef = useRef(new Map()); // Track animation frames per robot

  // Initialize robot manager reference
  useEffect(() => {
    if (isViewerReady) {
      robotManagerRef.current = getRobotManager();
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

  // Extract joint information when robot loads
  useEffect(() => {
    const handleRobotLoaded = (data) => {
      const { robotName, robot } = data;
      if (!robot) return;
      
      console.log(`[JointContext] Robot loaded: ${robotName}, extracting joint info`);
      
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
      setRobotJoints(prev => new Map(prev).set(robotName, joints));
      setRobotJointValues(prev => new Map(prev).set(robotName, values));
      setIsAnimating(prev => new Map(prev).set(robotName, false));
      
      console.log(`[JointContext] Extracted ${joints.length} joints for ${robotName}`);
    };

    const handleRobotRemoved = (data) => {
      const { robotName } = data;
      console.log(`[JointContext] Robot removed: ${robotName}`);
      
      // Stop any ongoing animation using the defined function
      stopAnimation(robotName);
      
      // Clean up robot data
      setRobotJoints(prev => {
        const newMap = new Map(prev);
        newMap.delete(robotName);
        return newMap;
      });
      setRobotJointValues(prev => {
        const newMap = new Map(prev);
        newMap.delete(robotName);
        return newMap;
      });
      setIsAnimating(prev => {
        const newMap = new Map(prev);
        newMap.delete(robotName);
        return newMap;
      });
    };

    const unsubscribeLoaded = EventBus.on('robot:loaded', handleRobotLoaded);
    const unsubscribeRemoved = EventBus.on('robot:removed', handleRobotRemoved);
    
    return () => {
      unsubscribeLoaded();
      unsubscribeRemoved();
    };
  }, [stopAnimation]);

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
  }, [stopAnimation]);

  // REPLACE: The setRobotJointValues_Internal method with direct robot access
  const setRobotJointValues_Internal = useCallback((robotId, values) => {
    console.log(`[JointContext] Setting joint values for ${robotId}:`, values);
    
    // Method 1: Try RobotContext first (most reliable)
    const robot = getRobotFromContext(robotId);
    if (robot) {
      console.log(`[JointContext] Found robot in RobotContext: ${robotId}`);
      
      let success = false;
      
      // Try robot's setJointValues method
      if (robot.setJointValues && typeof robot.setJointValues === 'function') {
        try {
          success = robot.setJointValues(values);
          console.log(`[JointContext] Robot setJointValues result: ${success}`);
        } catch (error) {
          console.warn(`[JointContext] Robot setJointValues failed:`, error);
        }
      }
      
      // Fallback: set individual joints
      if (!success) {
        console.log(`[JointContext] Falling back to individual joint setting`);
        success = true;
        
        Object.entries(values).forEach(([jointName, value]) => {
          try {
            if (robot.setJointValue && typeof robot.setJointValue === 'function') {
              robot.setJointValue(jointName, value);
            } else if (robot.joints && robot.joints[jointName]) {
              robot.joints[jointName].angle = value;
              if (robot.joints[jointName].setPosition) {
                robot.joints[jointName].setPosition(value);
              }
            } else {
              console.warn(`[JointContext] Joint ${jointName} not found`);
              success = false;
            }
          } catch (error) {
            console.warn(`[JointContext] Failed to set joint ${jointName}:`, error);
            success = false;
          }
        });
      }
      
      // Update matrices
      if (success && robot.updateMatrixWorld) {
        robot.updateMatrixWorld(true);
      }
      
      console.log(`[JointContext] Direct robot control result: ${success}`);
      return success;
    }
    
    // Method 2: Fallback to robot manager (legacy)
    if (robotManagerRef.current) {
      console.log(`[JointContext] Robot not found in context, trying robot manager`);
      
      try {
        if (robotManagerRef.current.setJointValues) {
          const success = robotManagerRef.current.setJointValues(robotId, values);
          console.log(`[JointContext] Robot manager setJointValues result: ${success}`);
          return success;
        }
      } catch (error) {
        console.warn(`[JointContext] Robot manager setJointValues failed:`, error);
      }
    }
    
    console.error(`[JointContext] Failed to set joint values for ${robotId} - robot not found`);
    return false;
  }, [getRobotFromContext]);

  // Animate to target joint values (MOVED AFTER setRobotJointValues_Internal)
  const animateToJointValues = useCallback(async (robotId, targetValues, duration = 1000) => {
    return new Promise((resolve) => {
      console.log(`[JointContext] Starting animation for ${robotId}`);
      
      // Cancel any existing animation for this robot
      const existingFrameId = animationFrameRef.current.get(robotId);
      if (existingFrameId) {
        cancelAnimationFrame(existingFrameId);
        console.log(`[JointContext] Cancelled existing animation for ${robotId}`);
      }
      
      // CRITICAL FIX: Get ACTUAL current joint values from the robot, not stored values
      const currentValues = {};
      if (robotManagerRef.current) {
        const actualValues = robotManagerRef.current.getJointValues(robotId);
        Object.assign(currentValues, actualValues);
        console.log(`[JointContext] Got ACTUAL current joint values:`, currentValues);
      } else {
        // Fallback to stored values if robot manager not available
        const storedValues = robotJointValues.get(robotId) || {};
        Object.assign(currentValues, storedValues);
        console.log(`[JointContext] Using stored joint values (fallback):`, currentValues);
      }
      
      const startTime = Date.now();
      
      // Set animation state
      setIsAnimating(prev => new Map(prev).set(robotId, true));
      console.log(`[JointContext] Set isAnimating=true for ${robotId}`);
      
      console.log(`[JointContext] Animating ${robotId} from:`, currentValues, 'to:', targetValues);
      
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Interpolate joint values
        const interpolatedValues = {};
        Object.keys(targetValues).forEach(jointName => {
          const start = currentValues[jointName] || 0;
          const end = targetValues[jointName];
          const value = start + (end - start) * progress;
          interpolatedValues[jointName] = value;
        });
        
        // Apply to robot
        setRobotJointValues_Internal(robotId, interpolatedValues);
        
        // Update local state
        setRobotJointValues(prev => {
          const newMap = new Map(prev);
          const robotValues = newMap.get(robotId) || {};
          newMap.set(robotId, { ...robotValues, ...interpolatedValues });
          return newMap;
        });
        
        // Update progress
        setAnimationProgress(prev => new Map(prev).set(robotId, progress));
        
        if (progress < 1) {
          // Continue animation
          const frameId = requestAnimationFrame(animate);
          animationFrameRef.current.set(robotId, frameId);
        } else {
          // Animation complete
          console.log(`[JointContext] Animation complete for ${robotId}`);
          
          // Clean up animation state
          setIsAnimating(prev => new Map(prev).set(robotId, false));
          setAnimationProgress(prev => new Map(prev).set(robotId, 0));
          animationFrameRef.current.delete(robotId);
          
          console.log(`[JointContext] Set isAnimating=false for ${robotId}`);
          console.log(`[JointContext] Notifying IK animation complete`);
          
          // Notify IK that animation is complete
          EventBus.emit('ik:animation-complete', {
            robotId,
            success: true
          });
          
          resolve();
        }
      };
      
      // Start animation
      const frameId = requestAnimationFrame(animate);
      animationFrameRef.current.set(robotId, frameId);
    });
  }, [robotJointValues, setRobotJointValues_Internal]);

  // REPLACE: The setJointValue method with direct robot access
  const setJointValue = useCallback((robotId, jointName, value) => {
    console.log(`[JointContext] Setting joint ${jointName} = ${value} for robot ${robotId}`);
    
    // Method 1: Try RobotContext first (most reliable)
    const robot = getRobotFromContext(robotId);
    if (robot) {
      console.log(`[JointContext] Found robot in RobotContext: ${robotId}`);
      
      let success = false;
      
      // Try robot's setJointValue method
      if (robot.setJointValue && typeof robot.setJointValue === 'function') {
        try {
          success = robot.setJointValue(jointName, value);
          console.log(`[JointContext] Robot setJointValue result: ${success}`);
        } catch (error) {
          console.warn(`[JointContext] Robot setJointValue failed:`, error);
        }
      }
      
      // Fallback: direct joint manipulation
      if (!success && robot.joints && robot.joints[jointName]) {
        try {
          robot.joints[jointName].angle = value;
          if (robot.joints[jointName].setPosition) {
            robot.joints[jointName].setPosition(value);
          }
          success = true;
          console.log(`[JointContext] Direct joint manipulation succeeded`);
        } catch (error) {
          console.warn(`[JointContext] Direct joint manipulation failed:`, error);
        }
      }
      
      // Update matrices
      if (success && robot.updateMatrixWorld) {
        robot.updateMatrixWorld(true);
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
        
        console.log(`[JointContext] Successfully set joint ${jointName} = ${value} for robot ${robotId}`);
      }
      
      return success;
    }
    
    // Method 2: Fallback to robot manager (legacy)
    if (robotManagerRef.current) {
      console.log(`[JointContext] Robot not found in context, trying robot manager`);
      
      try {
        if (robotManagerRef.current.setJointValue) {
          const success = robotManagerRef.current.setJointValue(robotId, jointName, value);
          console.log(`[JointContext] Robot manager setJointValue result: ${success}`);
          
          if (success) {
            setRobotJointValues(prev => {
              const newMap = new Map(prev);
              const robotValues = newMap.get(robotId) || {};
              robotValues[jointName] = value;
              newMap.set(robotId, robotValues);
              return newMap;
            });
          }
          
          return success;
        }
      } catch (error) {
        console.warn(`[JointContext] Robot manager setJointValue failed:`, error);
      }
    }
    
    console.error(`[JointContext] Failed to set joint ${jointName} for robot ${robotId} - robot not found`);
    return false;
  }, [getRobotFromContext]);

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
    if (!robotManagerRef.current) return;
    
    try {
      // Stop any ongoing animation first
      const frameId = animationFrameRef.current.get(robotId);
      if (frameId) {
        cancelAnimationFrame(frameId);
        animationFrameRef.current.delete(robotId);
        setIsAnimating(prev => new Map(prev).set(robotId, false));
        console.log(`[JointContext] Stopped animation before reset for ${robotId}`);
      }
      
      robotManagerRef.current.resetJoints(robotId);
      
      // Update local state - set all joints to 0
      const joints = robotJoints.get(robotId) || [];
      const resetValues = {};
      joints.forEach(joint => {
        resetValues[joint.name] = 0;
      });
      
      setRobotJointValues(prev => new Map(prev).set(robotId, resetValues));
      
      console.log(`[JointContext] Reset joints for ${robotId}`);
    } catch (error) {
      console.error(`[JointContext] Error resetting joints:`, error);
    }
  }, [robotJoints]);

  // Get joint information for a robot
  const getJointInfo = useCallback((robotId) => {
    return robotJoints.get(robotId) || [];
  }, [robotJoints]);

  // Get joint values for a robot
  const getJointValues = useCallback((robotId) => {
    return robotJointValues.get(robotId) || {};
  }, [robotJointValues]);

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