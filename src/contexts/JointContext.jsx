// src/contexts/JointContext.jsx - CLEAN SINGLE SOURCE OF TRUTH
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useRobotManagerContext } from './RobotManagerContext';
import { useRobotSelection } from './hooks/useRobot';
import EventBus from '../utils/EventBus';

const JointContext = createContext(null);

export const JointProvider = ({ children }) => {
  const { getRobot, setJointValue: managerSetJointValue, getJointValues: managerGetJointValues } = useRobotManagerContext();
  const { activeId: activeRobotId } = useRobotSelection();
  
  // State
  const [jointStates, setJointStates] = useState(new Map()); // Map<robotId, {values, isAnimating, progress}>
  const animationFramesRef = useRef(new Map()); // Map<robotId, frameId>
  
  // ========== INITIALIZE JOINT STATE FOR ROBOT ==========
  const initializeRobotJoints = useCallback((robotId) => {
    if (jointStates.has(robotId)) return;
    
    const robot = getRobot(robotId);
    if (!robot) return;
    
    // Extract joint info
    const joints = [];
    const values = {};
    
    if (robot.joints) {
      Object.values(robot.joints).forEach(joint => {
        if (joint.jointType !== 'fixed') {
          joints.push({
            name: joint.name,
            type: joint.jointType,
            limits: joint.limit || { lower: -Math.PI, upper: Math.PI }
          });
          values[joint.name] = joint.angle || 0;
        }
      });
    }
    
    setJointStates(prev => new Map(prev).set(robotId, {
      joints,
      values,
      isAnimating: false,
      progress: 0
    }));
    
    console.log(`[JointContext] Initialized ${joints.length} joints for robot ${robotId}`);
  }, [getRobot, jointStates]);
  
  // ========== CORE JOINT OPERATIONS ==========
  const setJointValue = useCallback((robotId, jointName, value) => {
    if (!robotId) return false;
    
    // Ensure robot is initialized
    if (!jointStates.has(robotId)) {
      initializeRobotJoints(robotId);
    }
    
    // Use robot manager to actually set the value
    const success = managerSetJointValue(robotId, jointName, value);
    
    if (success) {
      // Update our state
      setJointStates(prev => {
        const newMap = new Map(prev);
        const state = newMap.get(robotId);
        if (state) {
          state.values[jointName] = value;
        }
        return newMap;
      });
      
      // Emit event for other systems (TCP, etc)
      EventBus.emit('joint:value-changed', { robotId, jointName, value });
    }
    
    return success;
  }, [managerSetJointValue, jointStates, initializeRobotJoints]);
  
  const setJointValues = useCallback((robotId, values) => {
    if (!robotId || !values) return false;
    
    // Ensure robot is initialized
    if (!jointStates.has(robotId)) {
      initializeRobotJoints(robotId);
    }
    
    // Apply each joint value
    let success = true;
    Object.entries(values).forEach(([jointName, value]) => {
      if (!setJointValue(robotId, jointName, value)) {
        success = false;
      }
    });
    
    if (success) {
      EventBus.emit('joint:values-changed', { robotId, values });
    }
    
    return success;
  }, [setJointValue, jointStates, initializeRobotJoints]);
  
  const getJointValues = useCallback((robotId) => {
    const state = jointStates.get(robotId);
    if (state) return { ...state.values };
    
    // Fallback to manager
    return managerGetJointValues(robotId) || {};
  }, [jointStates, managerGetJointValues]);
  
  const resetJoints = useCallback((robotId) => {
    const state = jointStates.get(robotId);
    if (!state) return;
    
    const resetValues = {};
    state.joints.forEach(joint => {
      resetValues[joint.name] = 0;
    });
    
    setJointValues(robotId, resetValues);
  }, [jointStates, setJointValues]);
  
  // ========== ANIMATION SYSTEM ==========
  const animateToValues = useCallback((robotId, targetValues, options = {}) => {
    const { duration = 1000, onComplete, onProgress } = options;
    
    return new Promise((resolve) => {
      // Cancel existing animation
      const existingFrame = animationFramesRef.current.get(robotId);
      if (existingFrame) {
        cancelAnimationFrame(existingFrame);
      }
      
      const startValues = getJointValues(robotId);
      const startTime = Date.now();
      
      // Update animation state
      setJointStates(prev => {
        const newMap = new Map(prev);
        const state = newMap.get(robotId);
        if (state) state.isAnimating = true;
        return newMap;
      });
      
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Interpolate values
        const currentValues = {};
        Object.keys(targetValues).forEach(jointName => {
          const start = startValues[jointName] || 0;
          const end = targetValues[jointName];
          currentValues[jointName] = start + (end - start) * progress;
        });
        
        // Apply values
        setJointValues(robotId, currentValues);
        
        // Update progress
        setJointStates(prev => {
          const newMap = new Map(prev);
          const state = newMap.get(robotId);
          if (state) state.progress = progress;
          return newMap;
        });
        
        // Progress callback
        if (onProgress) onProgress(progress);
        
        if (progress >= 1) {
          // Complete
          setJointStates(prev => {
            const newMap = new Map(prev);
            const state = newMap.get(robotId);
            if (state) {
              state.isAnimating = false;
              state.progress = 0;
            }
            return newMap;
          });
          
          animationFramesRef.current.delete(robotId);
          
          if (onComplete) onComplete();
          resolve(true);
          
          EventBus.emit('joint:animation-complete', { robotId });
        } else {
          // Continue
          const frameId = requestAnimationFrame(animate);
          animationFramesRef.current.set(robotId, frameId);
        }
      };
      
      animate();
    });
  }, [getJointValues, setJointValues]);
  
  const stopAnimation = useCallback((robotId) => {
    const frameId = animationFramesRef.current.get(robotId);
    if (frameId) {
      cancelAnimationFrame(frameId);
      animationFramesRef.current.delete(robotId);
    }
    
    setJointStates(prev => {
      const newMap = new Map(prev);
      const state = newMap.get(robotId);
      if (state) {
        state.isAnimating = false;
        state.progress = 0;
      }
      return newMap;
    });
  }, []);
  
  // ========== EVENT LISTENERS ==========
  useEffect(() => {
    // Listen for robot loaded events
    const handleRobotLoaded = (data) => {
      const robotId = data.robotId || data.robotName;
      if (robotId) {
        initializeRobotJoints(robotId);
      }
    };
    
    // Listen for IK animation requests
    const handleIKAnimation = (data) => {
      const { robotId, jointValues, animate, duration } = data;
      
      if (animate) {
        animateToValues(robotId, jointValues, {
          duration,
          onComplete: () => {
            EventBus.emit('ik:animation-complete', { robotId, success: true });
          }
        });
      } else {
        setJointValues(robotId, jointValues);
        EventBus.emit('ik:animation-complete', { robotId, success: true });
      }
    };
    
    const unsubscribes = [
      EventBus.on('robot:loaded', handleRobotLoaded),
      EventBus.on('ik:joint-values-calculated', handleIKAnimation)
    ];
    
    return () => unsubscribes.forEach(unsub => unsub());
  }, [initializeRobotJoints, animateToValues, setJointValues]);
  
  // Initialize active robot
  useEffect(() => {
    if (activeRobotId) {
      initializeRobotJoints(activeRobotId);
    }
  }, [activeRobotId, initializeRobotJoints]);
  
  // ========== CONTEXT VALUE ==========
  const value = {
    // Core operations
    setJointValue,
    setJointValues,
    getJointValues,
    resetJoints,
    
    // Animation
    animateToValues,
    stopAnimation,
    
    // State getters
    getJointInfo: (robotId) => {
      const state = jointStates.get(robotId);
      return state?.joints || [];
    },
    isAnimating: (robotId) => {
      const state = jointStates.get(robotId);
      return state?.isAnimating || false;
    },
    getAnimationProgress: (robotId) => {
      const state = jointStates.get(robotId);
      return state?.progress || 0;
    },
    getMovableJoints: (robotId) => {
      const state = jointStates.get(robotId);
      return state?.joints.filter(joint => joint.type !== 'fixed') || [];
    }
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