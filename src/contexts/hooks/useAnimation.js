import { useCallback, useRef, useEffect } from 'react';
import { useAnimationContext } from '../AnimationContext';
import { useJointContext } from '../JointContext';
import { useIKContext } from '../IKContext';
import { useTrajectoryContext } from '../TrajectoryContext';

export const useAnimation = (type = 'joints') => {
  const animation = useAnimationContext();
  const jointContext = useJointContext();
  const ikContext = useIKContext();
  const trajectoryContext = useTrajectoryContext();
  
  const animationRef = useRef();
  const currentAnimationType = useRef(type);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        animation.stopAnimation();
      }
    };
  }, [animation]);

  // Joint animation handler
  const animateJoints = useCallback((joints, duration, options = {}) => {
    // Stop any existing animation
    if (animationRef.current) {
      animation.stopAnimation();
    }

    const animationOptions = {
      ...options,
      onUpdate: (values, progress) => {
        // Update joint context
        if (jointContext?.updateJoints) {
          jointContext.updateJoints(values);
        }
        
        // Call custom onUpdate if provided
        if (options.onUpdate) {
          options.onUpdate(values, progress);
        }
      },
      onComplete: () => {
        animationRef.current = null;
        
        // Notify joint context
        if (jointContext?.onAnimationComplete) {
          jointContext.onAnimationComplete();
        }
        
        // Call custom onComplete if provided
        if (options.onComplete) {
          options.onComplete();
        }
      }
    };

    animationRef.current = animation.animateJoints(joints, duration, animationOptions);
    return animationRef.current;
  }, [animation, jointContext]);

  // Trajectory animation handler with full playback support
  const animateTrajectory = useCallback((trajectory, options = {}) => {
    // Stop any existing animation
    if (animationRef.current) {
      animation.stopAnimation();
    }

    // Pre-animation setup for trajectory
    const preAnimation = () => {
      // Default trajectory pre-animation
      if (trajectory.preAnimationJoints) {
        // Apply pre-animation joints immediately
        if (jointContext?.updateJoints) {
          jointContext.updateJoints(trajectory.preAnimationJoints);
        }
      }
      
      // Notify trajectory context
      if (trajectoryContext?.prepareAnimation) {
        trajectoryContext.prepareAnimation(trajectory);
      }
      
      // Custom pre-animation
      if (options.preAnimation) {
        options.preAnimation();
      }
    };

    const animationOptions = {
      ...options,
      preAnimation,
      onUpdate: (values, progress, frame) => {
        // Update joint context with trajectory values
        if (jointContext?.updateJoints) {
          jointContext.updateJoints(values);
        }
        
        // Update trajectory progress and frame
        if (trajectoryContext?.updateProgress) {
          trajectoryContext.updateProgress(progress);
        }
        if (trajectoryContext?.updateFrame) {
          trajectoryContext.updateFrame(frame);
        }
        
        // Call custom onUpdate if provided
        if (options.onUpdate) {
          options.onUpdate(values, progress, frame);
        }
      },
      onComplete: () => {
        animationRef.current = null;
        
        // Notify contexts
        if (jointContext?.onAnimationComplete) {
          jointContext.onAnimationComplete();
        }
        if (trajectoryContext?.onPlaybackComplete) {
          trajectoryContext.onPlaybackComplete();
        }
        
        // Call custom onComplete if provided
        if (options.onComplete) {
          options.onComplete();
        }
      }
    };

    animationRef.current = animation.animateTrajectory(trajectory, animationOptions);
    return animationRef.current;
  }, [animation, jointContext, trajectoryContext]);

  // Playback control functions
  const playTrajectory = useCallback((trajectory, options = {}) => {
    // Enhanced playback with pre-animation
    const playbackOptions = {
      ...options,
      preAnimation: () => {
        // Notify UI about playback starting
        console.log('Starting trajectory playback...');
        
        // Execute pre-animation sequence if defined
        if (trajectory.preAnimationSequence) {
          // Move to start position
          if (jointContext?.moveToPosition) {
            jointContext.moveToPosition(trajectory.startPosition);
          }
        }
        
        if (options.preAnimation) {
          options.preAnimation();
        }
      }
    };
    
    return animateTrajectory(trajectory, playbackOptions);
  }, [animateTrajectory, jointContext]);

  const pausePlayback = useCallback(() => {
    animation.pausePlayback();
  }, [animation]);

  const resumePlayback = useCallback(() => {
    animation.resumePlayback();
  }, [animation]);

  const seekToFrame = useCallback((frame) => {
    animation.seekToFrame(frame);
  }, [animation]);

  // IK animation handler
  const animateIK = useCallback((ikSolution, options = {}) => {
    // Stop any existing animation
    if (animationRef.current) {
      animation.stopAnimation();
    }

    const animationOptions = {
      ...options,
      onUpdate: (values, progress) => {
        // Update joint context with IK values
        if (jointContext?.updateJoints) {
          jointContext.updateJoints(values);
        }
        
        // Update IK progress
        if (ikContext?.updateProgress) {
          ikContext.updateProgress(progress);
        }
        
        // Call custom onUpdate if provided
        if (options.onUpdate) {
          options.onUpdate(values, progress);
        }
      },
      onComplete: () => {
        animationRef.current = null;
        
        // Notify contexts
        if (jointContext?.onAnimationComplete) {
          jointContext.onAnimationComplete();
        }
        if (ikContext?.onSolutionComplete) {
          ikContext.onSolutionComplete();
        }
        
        // Call custom onComplete if provided
        if (options.onComplete) {
          options.onComplete();
        }
      }
    };

    animationRef.current = animation.animateIK(ikSolution, animationOptions);
    return animationRef.current;
  }, [animation, jointContext, ikContext]);

  // Generic animate function
  const animate = useCallback((config) => {
    // Stop any existing animation
    if (animationRef.current) {
      animation.stopAnimation();
    }

    animationRef.current = animation.animate(config);
    return animationRef.current;
  }, [animation]);

  // Stop animation
  const stopAnimation = useCallback(() => {
    if (animationRef.current) {
      animation.stopAnimation();
      animationRef.current = null;
    }
  }, [animation]);

  // Get animation and playback state
  const isAnimating = animation.isAnimating;
  const progress = animation.animationProgress;
  const profile = animation.currentProfile;
  const playbackState = animation.playbackState;

  // Set animation profile
  const setProfile = useCallback((profile) => {
    animation.setAnimationProfile(profile);
  }, [animation]);

  return {
    // Animation functions based on type
    ...(type === 'joints' && { animateJoints }),
    ...(type === 'trajectory' && { 
      animateTrajectory,
      playTrajectory,
      pausePlayback,
      resumePlayback,
      seekToFrame
    }),
    ...(type === 'ik' && { animateIK }),
    
    // Generic functions
    animate,
    stopAnimation,
    setProfile,
    
    // State
    isAnimating,
    progress,
    profile,
    playbackState,
    
    // Constants
    ANIMATION_PROFILES: animation.ANIMATION_PROFILES
  };
};

// Specialized hooks for different animation types
export const useJointAnimation = () => useAnimation('joints');
export const useTrajectoryAnimation = () => useAnimation('trajectory');
export const useIKAnimation = () => useAnimation('ik');

// Trajectory playback hook with full controls
export const useTrajectoryPlayback = () => {
  const {
    playTrajectory,
    pausePlayback,
    resumePlayback,
    seekToFrame,
    stopAnimation,
    isAnimating,
    progress,
    playbackState,
    setProfile
  } = useTrajectoryAnimation();

  const playback = useCallback((trajectory, options = {}) => {
    // Enhanced playback with default options
    const defaultOptions = {
      profile: 's-curve',
      playbackSpeed: 1,
      loop: false,
      ...options
    };

    return playTrajectory(trajectory, defaultOptions);
  }, [playTrajectory]);

  const setPlaybackSpeed = useCallback((speed) => {
    // This would need to be implemented in the context
    console.log('Setting playback speed:', speed);
  }, []);

  return {
    play: playback,
    pause: pausePlayback,
    resume: resumePlayback,
    seek: seekToFrame,
    stop: stopAnimation,
    setSpeed: setPlaybackSpeed,
    setProfile,
    
    // State
    isPlaying: playbackState.isPlaying,
    isPaused: playbackState.isPaused,
    currentFrame: playbackState.currentFrame,
    totalFrames: playbackState.totalFrames,
    progress,
    
    // Computed state
    canPlay: !isAnimating,
    canPause: isAnimating && !playbackState.isPaused,
    canResume: playbackState.isPaused
  };
};

// Human animation hook (separate from joint system)
export const useHumanAnimation = () => {
  const animation = useAnimationContext();
  const animationRef = useRef();

  const animateHuman = useCallback((animationName, options = {}) => {
    const { duration = 1000, loop = false, onUpdate, onComplete } = options;
    
    // Human animations don't go through joint system
    const config = {
      startValues: { frame: 0 },
      targetValues: { frame: 1 },
      duration,
      onUpdate: (values, progress) => {
        if (onUpdate) {
          onUpdate(animationName, values.frame, progress);
        }
      },
      onComplete: () => {
        if (loop) {
          // Restart animation
          animateHuman(animationName, options);
        } else if (onComplete) {
          onComplete();
        }
      }
    };

    animationRef.current = animation.animate(config);
    return animationRef.current;
  }, [animation]);

  const stopHumanAnimation = useCallback(() => {
    if (animationRef.current) {
      animation.stopAnimation();
      animationRef.current = null;
    }
  }, [animation]);

  return {
    animateHuman,
    stopHumanAnimation,
    isAnimating: animation.isAnimating
  };
};