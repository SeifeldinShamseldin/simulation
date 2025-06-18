import React, { createContext, useContext, useCallback, useRef, useState } from 'react';

const AnimationContext = createContext();

// Animation profiles
const ANIMATION_PROFILES = {
  LINEAR: 'linear',
  S_CURVE: 's-curve'
};

// S-curve easing function
const sCurveEasing = (t) => {
  return t < 0.5 
    ? 2 * t * t 
    : 1 - Math.pow(-2 * t + 2, 2) / 2;
};

export const AnimationProvider = ({ children }) => {
  // Animation state
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationProgress, setAnimationProgress] = useState(0);
  const [currentProfile, setCurrentProfile] = useState(ANIMATION_PROFILES.S_CURVE);
  
  // Animation refs
  const animationFrameRef = useRef();
  const startTimeRef = useRef();
  const startValuesRef = useRef({});
  const targetValuesRef = useRef({});
  const durationRef = useRef(1000);
  const onCompleteRef = useRef();
  const onUpdateRef = useRef();

  // Core animation function
  const animate = useCallback((config) => {
    const {
      startValues,
      targetValues,
      duration = 1000,
      profile = currentProfile,
      onUpdate,
      onComplete,
      preAnimation
    } = config;

    // Cancel any existing animation
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    // Store animation parameters
    startValuesRef.current = { ...startValues };
    targetValuesRef.current = { ...targetValues };
    durationRef.current = duration;
    onUpdateRef.current = onUpdate;
    onCompleteRef.current = onComplete;

    // Execute pre-animation if provided
    if (preAnimation) {
      preAnimation();
    }

    // Start animation
    setIsAnimating(true);
    setAnimationProgress(0);
    startTimeRef.current = performance.now();

    const animationLoop = (currentTime) => {
      const elapsed = currentTime - startTimeRef.current;
      const rawProgress = Math.min(elapsed / durationRef.current, 1);
      
      // Apply easing based on profile
      const easedProgress = profile === ANIMATION_PROFILES.LINEAR 
        ? rawProgress 
        : sCurveEasing(rawProgress);

      setAnimationProgress(rawProgress);

      // Calculate interpolated values
      const interpolatedValues = {};
      const startVals = startValuesRef.current;
      const targetVals = targetValuesRef.current;

      for (const key in startVals) {
        if (typeof startVals[key] === 'number' && typeof targetVals[key] === 'number') {
          interpolatedValues[key] = startVals[key] + 
            (targetVals[key] - startVals[key]) * easedProgress;
        } else if (Array.isArray(startVals[key]) && Array.isArray(targetVals[key])) {
          interpolatedValues[key] = startVals[key].map((val, i) => 
            val + (targetVals[key][i] - val) * easedProgress
          );
        } else {
          interpolatedValues[key] = targetVals[key];
        }
      }

      // Call update callback
      if (onUpdateRef.current) {
        onUpdateRef.current(interpolatedValues, easedProgress);
      }

      // Continue or complete animation
      if (rawProgress < 1) {
        animationFrameRef.current = requestAnimationFrame(animationLoop);
      } else {
        setIsAnimating(false);
        setAnimationProgress(1);
        
        // Ensure final values are set
        if (onUpdateRef.current) {
          onUpdateRef.current(targetVals, 1);
        }
        
        if (onCompleteRef.current) {
          onCompleteRef.current();
        }
      }
    };

    animationFrameRef.current = requestAnimationFrame(animationLoop);

    // Return stop function
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        setIsAnimating(false);
        setAnimationProgress(0);
      }
    };
  }, [currentProfile]);

  // Joint animation wrapper
  const animateJoints = useCallback((joints, duration, options = {}) => {
    const { onUpdate, onComplete, profile, preAnimation } = options;
    
    // Get current joint values (assumes joints is an object with joint names as keys)
    const startValues = {};
    const targetValues = {};
    
    for (const [jointName, targetValue] of Object.entries(joints)) {
      startValues[jointName] = 0; // This should be retrieved from current state
      targetValues[jointName] = targetValue;
    }

    return animate({
      startValues,
      targetValues,
      duration,
      profile,
      preAnimation,
      onUpdate: (values, progress) => {
        if (onUpdate) {
          onUpdate(values, progress);
        }
      },
      onComplete
    });
  }, [animate]);

  // Trajectory animation
  const animateTrajectory = useCallback((trajectory, options = {}) => {
    const { 
      duration = trajectory.duration || 1000,
      onUpdate,
      onComplete,
      profile,
      preAnimation
    } = options;

    // Extract joint values from trajectory
    const jointValues = trajectory.joints || trajectory;
    
    return animateJoints(jointValues, duration, {
      onUpdate,
      onComplete,
      profile,
      preAnimation
    });
  }, [animateJoints]);

  // IK animation
  const animateIK = useCallback((ikSolution, options = {}) => {
    const {
      duration = 500,
      onUpdate,
      onComplete,
      profile
    } = options;

    // Extract joint values from IK solution
    const jointValues = ikSolution.joints || ikSolution;
    
    return animateJoints(jointValues, duration, {
      onUpdate,
      onComplete,
      profile
    });
  }, [animateJoints]);

  // Stop all animations
  const stopAnimation = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setIsAnimating(false);
    setAnimationProgress(0);
  }, []);

  // Set animation profile
  const setAnimationProfile = useCallback((profile) => {
    if (ANIMATION_PROFILES[profile.toUpperCase()]) {
      setCurrentProfile(ANIMATION_PROFILES[profile.toUpperCase()]);
    }
  }, []);

  const value = {
    // State
    isAnimating,
    animationProgress,
    currentProfile,
    
    // Core functions
    animate,
    animateJoints,
    animateTrajectory,
    animateIK,
    stopAnimation,
    setAnimationProfile,
    
    // Constants
    ANIMATION_PROFILES
  };

  return (
    <AnimationContext.Provider value={value}>
      {children}
    </AnimationContext.Provider>
  );
};

export const useAnimationContext = () => {
  const context = useContext(AnimationContext);
  if (!context) {
    throw new Error('useAnimationContext must be used within AnimationProvider');
  }
  return context;
};

export default AnimationContext;