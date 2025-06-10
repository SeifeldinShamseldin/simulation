// src/contexts/JointContext.jsx - Fixed animation state management
import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useRobot } from './hooks/useRobot';
import EventBus from '../utils/EventBus';

const JointContext = createContext(null);

/**
 * Provider component for joint animation state
 * ✅ Updated: Focuses only on animation state
 * ❌ Removed: Direct joint manipulation (now handled by RobotContext)
 */
export const JointProvider = ({ children }) => {
  const { setJointValue: robotSetJointValue, setJointValues: robotSetJointValues, resetJoints: robotResetJoints } = useRobot();
  
  // Animation state
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationProgress, setAnimationProgress] = useState(0);
  const [animationTarget, setAnimationTarget] = useState(null);
  const animationRef = useRef(null);
  
  // Handle joint animation requests
  useEffect(() => {
    const handleJointAnimationRequest = (data) => {
      if (data.robotId && data.jointName && data.targetValue !== undefined) {
        setAnimationTarget({
          robotId: data.robotId,
          jointName: data.jointName,
          targetValue: data.targetValue,
          duration: data.duration || 1000
        });
      }
    };
    
    const unsubscribe = EventBus.on('joint:animate-request', handleJointAnimationRequest);
    return () => unsubscribe();
  }, []);
  
  // Animation loop
  useEffect(() => {
    if (!animationTarget) return;
    
    const startTime = Date.now();
    const duration = animationTarget.duration;
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      setAnimationProgress(progress);
      
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        // Animation complete
        setIsAnimating(false);
        setAnimationProgress(0);
        setAnimationTarget(null);
      }
    };
    
    setIsAnimating(true);
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [animationTarget]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);
  
  const value = {
    // Animation state
    isAnimating,
    animationProgress,
    
    // Animation control
    stopAnimation: useCallback(() => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        setIsAnimating(false);
        setAnimationProgress(0);
        setAnimationTarget(null);
      }
    }, [])
  };
  
  return (
    <JointContext.Provider value={value}>
      {children}
    </JointContext.Provider>
  );
};

/**
 * Hook to use the joint animation context
 * @returns {Object} Joint animation context
 * @throws {Error} If used outside of JointProvider
 */
export const useJointAnimation = () => {
  const context = useContext(JointContext);
  if (!context) {
    throw new Error('useJointAnimation must be used within JointProvider');
  }
  return context;
};

export default JointContext;