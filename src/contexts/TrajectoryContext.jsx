// contexts/TrajectoryContext.jsx - Unified trajectory system
import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useViewer } from './ViewerContext';
import { useRobotSelection, useRobotManager } from './hooks/useRobotManager';
import EventBus from '../utils/EventBus';
import { debug, debugJoint, debugAnimation } from '../utils/DebugSystem';
import { MultiAxisProfiler } from '../utils/motionProfiles';

// Motion profiles will be conditionally used if available
// If not available, simple interpolation will be used instead

export const TrajectoryContext = createContext();

export const TrajectoryProvider = ({ children }) => {
  const { isViewerReady, getRobotManager } = useViewer();
  const { activeId: activeRobotId } = useRobotSelection();
  const { categories, getRobotById } = useRobotManager();
  
  // ========== UNIFIED STATE ==========
  // Joint state (from JointContext)
  const [robotJoints, setRobotJoints] = useState(new Map());
  const [robotJointValues, setRobotJointValues] = useState(new Map());
  
  // Animation state (from AnimationContext)
  const [isAnimating, setIsAnimating] = useState(new Map());
  const [animationProgress, setAnimationProgress] = useState(new Map());
  const [currentProfile, setCurrentProfile] = useState('TRAPEZOIDAL');
  
  // Trajectory state (existing)
  const [recordingStates, setRecordingStates] = useState(new Map());
  const [playbackStates, setPlaybackStates] = useState(new Map());
  const [availableTrajectories, setAvailableTrajectories] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Refs for performance
  const robotManagerRef = useRef(null);
  const animationFrameRef = useRef(new Map());
  const playbackStatesRef = useRef(new Map());
  const recordingDataRef = useRef(new Map());
  const lastFrameTimeRef = useRef(new Map());
  
  // ========== ANIMATION PROFILES ==========
  const ANIMATION_PROFILES = {
    LINEAR: { ease: (t) => t },
    EASE_IN_OUT: { ease: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t },
    TRAPEZOIDAL: { ease: (t) => t }, // Handled by motion profiler
    S_CURVE: { ease: (t) => t }      // Handled by motion profiler
  };
  
  // ========== HELPER FUNCTIONS ==========
  const processTrajectoryFrames = useCallback((frames, profileType) => {
    const processed = [];
    
    for (let i = 0; i < frames.length - 1; i++) {
      const current = frames[i];
      const next = frames[i + 1];
      const timeDelta = (next.timestamp - current.timestamp) / 1000;
      
      // Create motion profiles between frames
      const subFrameCount = Math.max(Math.ceil(timeDelta * 60), 10);
      
      for (let j = 0; j < subFrameCount; j++) {
        const t = j / subFrameCount;
        const timestamp = current.timestamp + t * (next.timestamp - current.timestamp);
        
        const interpolated = {};
        Object.keys(current.jointValues).forEach(joint => {
          const start = current.jointValues[joint];
          const end = next.jointValues[joint] || start;
          interpolated[joint] = start + (end - start) * t;
        });
        
        processed.push({ timestamp, jointValues: interpolated });
      }
    }
    
    processed.push(frames[frames.length - 1]);
    return processed;
  }, []);
  
  const getRobotInfo = useCallback((robotId) => {
    // Extract the base robot ID (e.g., 'crx10ial' from 'crx10ial_1750085029868')
    const baseRobotId = robotId.split('_')[0];

    // Find the robot's category to get the manufacturer
    let manufacturer = 'unknown';
    let model = baseRobotId.toLowerCase();
    
    for (const category of categories) {
      if (category.robots.some(robot => robot.id === baseRobotId)) {
        manufacturer = category.id;
        const fullRobotData = getRobotById(baseRobotId);
        model = fullRobotData?.name?.toLowerCase() || baseRobotId.toLowerCase();
        break;
      }
    }

    return { manufacturer, model };
  }, [categories, getRobotById]);
  
  // ========== JOINT MANAGEMENT (from JointContext) ==========
  const getJointInfo = useCallback((robotId) => {
    return robotJoints.get(robotId) || {};
  }, [robotJoints]);
  
  const getJointLimits = useCallback((robotId, jointName) => {
    const joints = robotJoints.get(robotId) || {};
    const joint = joints[jointName];
    return joint?.limits || { lower: -Math.PI, upper: Math.PI };
  }, [robotJoints]);
  
  const setJointValues = useCallback((robotId, values) => {
    const robot = robotManagerRef.current?.getRobot(robotId);
    if (!robot || !robot.setJointValues) return false;
    
    const success = robot.setJointValues(values);
    if (success) {
      setRobotJointValues(prev => {
        const newMap = new Map(prev);
        newMap.set(robotId, { ...newMap.get(robotId), ...values });
        return newMap;
      });
      
      EventBus.emit('robot:joints-changed', {
        robotId,
        values,
        source: 'trajectory'
      });
    }
    return success;
  }, []);
  
  const isRobotReady = useCallback((robotId) => {
    const robot = robotManagerRef.current?.getRobot(robotId);
    const joints = robotJoints.get(robotId);
    return !!(robot && joints && Object.keys(joints).length > 0);
  }, [robotJoints]);
  
  const resetJoints = useCallback((robotId) => {
    const robot = robotManagerRef.current?.getRobot(robotId);
    if (!robot || !robot.joints) return false;
    
    const resetValues = {};
    Object.keys(robot.joints).forEach(jointName => {
      resetValues[jointName] = 0;
    });
    
    return setJointValues(robotId, resetValues);
  }, [setJointValues]);
  
  const setJointValue = useCallback((robotId, jointName, value) => {
    const robot = robotManagerRef.current?.getRobot(robotId);
    if (!robot || !robot.setJointValue) return false;
    
    const success = robot.setJointValue(jointName, value);
    if (success) {
      setRobotJointValues(prev => {
        const newMap = new Map(prev);
        const currentValues = newMap.get(robotId) || {};
        newMap.set(robotId, { ...currentValues, [jointName]: value });
        return newMap;
      });
      
      EventBus.emit('robot:joint-changed', {
        robotId,
        jointName,
        value,
        allValues: { ...robotJointValues.get(robotId), [jointName]: value }
      });
    }
    return success;
  }, [robotJointValues]);
  
  // ========== SIMPLE MOTION PROFILE HELPERS ==========
  const simpleTrapezoidal = useCallback((t, duration) => {
    // Simple trapezoidal velocity profile
    const accelTime = duration * 0.2; // 20% acceleration
    const decelTime = duration * 0.2; // 20% deceleration
    const constTime = duration * 0.6; // 60% constant velocity
    
    if (t <= accelTime) {
      // Acceleration phase: s = 0.5 * a * t^2
      const phase = t / accelTime;
      return 0.5 * phase * phase * (accelTime / duration);
    } else if (t <= accelTime + constTime) {
      // Constant velocity phase
      const accelDist = 0.5 * (accelTime / duration);
      const constPhase = (t - accelTime) / constTime;
      return accelDist + constPhase * (constTime / duration);
    } else {
      // Deceleration phase
      const accelDist = 0.5 * (accelTime / duration);
      const constDist = constTime / duration;
      const decelPhase = (t - accelTime - constTime) / decelTime;
      const decelDist = (1 - 0.5 * (1 - decelPhase) * (1 - decelPhase)) * (decelTime / duration);
      return accelDist + constDist + decelDist;
    }
  }, []);
  
  // ========== CORE ANIMATION ENGINE (from AnimationContext) ==========
  const animate = useCallback(({
    startValues,
    targetValues,
    duration,
    robotId,
    profile = currentProfile,
    onUpdate,
    onComplete,
    preAnimation
  }) => {
    // Cancel existing animation
    const existingFrame = animationFrameRef.current.get(robotId);
    if (existingFrame) {
      cancelAnimationFrame(existingFrame);
    }
    
    const startTime = Date.now();
    const profileFn = ANIMATION_PROFILES[profile]?.ease || ANIMATION_PROFILES.LINEAR.ease;
    
    // Pre-animation callback
    if (preAnimation) {
      preAnimation();
    }
    
    setIsAnimating(prev => new Map(prev).set(robotId, true));
    
    const animationLoop = () => {
      const elapsed = Date.now() - startTime;
      const rawProgress = Math.min(elapsed / duration, 1);
      const easedProgress = profileFn(rawProgress);
      
      // Calculate interpolated values
      const currentValues = {};
      for (const [key, startVal] of Object.entries(startValues)) {
        const targetVal = targetValues[key];
        currentValues[key] = startVal + (targetVal - startVal) * easedProgress;
      }
      
      // Update animation progress
      setAnimationProgress(prev => new Map(prev).set(robotId, rawProgress));
      
      // Callback with current values
      if (onUpdate) {
        onUpdate(currentValues, rawProgress);
      }
      
      // Apply values to robot
      setJointValues(robotId, currentValues);
      
      if (rawProgress >= 1) {
        // Animation complete
        animationFrameRef.current.delete(robotId);
        setIsAnimating(prev => new Map(prev).set(robotId, false));
        setAnimationProgress(prev => new Map(prev).set(robotId, 0));
        
        if (onComplete) {
          onComplete();
        }
      } else {
        // Continue animation
        const frameId = requestAnimationFrame(animationLoop);
        animationFrameRef.current.set(robotId, frameId);
      }
    };
    
    const frameId = requestAnimationFrame(animationLoop);
    animationFrameRef.current.set(robotId, frameId);
    
    return {
      stop: () => {
        const frame = animationFrameRef.current.get(robotId);
        if (frame) {
          cancelAnimationFrame(frame);
          animationFrameRef.current.delete(robotId);
          setIsAnimating(prev => new Map(prev).set(robotId, false));
          setAnimationProgress(prev => new Map(prev).set(robotId, 0));
        }
      }
    };
  }, [currentProfile, setJointValues]);
  
  // ========== MOTION PROFILED ANIMATION ==========
  const animateWithMotionProfile = useCallback(async (robotId, targetValues, options = {}) => {
    const {
      duration = 1000,
      motionProfile = 'trapezoidal',
      tolerance = 0.001,
      onProgress = null,
      jointConstraints = {},
      defaultConstraints = {
        maxVelocity: 2.0,
        maxAcceleration: 4.0,
        maxJerk: 20.0
      }
    } = options;
    
    return new Promise((resolve) => {
      // Get current values
      const currentValues = robotJointValues.get(robotId) || {};
      
      // Build constraints
      const jointLimits = {};
      Object.keys(targetValues).forEach(jointName => {
        jointLimits[jointName] = jointConstraints[jointName] || defaultConstraints;
      });
      
      // Create profiler
      const profiler = new MultiAxisProfiler({ profileType: motionProfile });
      const profileData = profiler.calculateSynchronizedProfiles(
        currentValues,
        targetValues,
        jointLimits
      );
      
      const startTime = Date.now();
      
      const animateProfile = () => {
        const elapsed = (Date.now() - startTime) / 1000;
        const progress = Math.min(elapsed / profileData.totalTime, 1);
        
        // Calculate current positions
        const currentPositions = {};
        let withinTolerance = true;
        
        Object.entries(profileData.profiles).forEach(([jointName, profile]) => {
          if (!profile.profiler) {
            // Static profile: just set to target
            currentPositions[jointName] = targetValues[jointName];
            return;
          }
          const position = profile.profiler.getPosition(
            elapsed,
            profile,
            profile.distance
          );
          currentPositions[jointName] = (currentValues[jointName] || 0) + position;
          
          const error = Math.abs(currentPositions[jointName] - targetValues[jointName]);
          if (error > tolerance) {
            withinTolerance = false;
          }
        });
        
        // Apply positions
        setJointValues(robotId, currentPositions);
        
        if (onProgress) {
          onProgress({ progress, positions: currentPositions });
        }
        
        if (progress >= 1 || withinTolerance) {
          // Complete
          animationFrameRef.current.delete(robotId);
          setIsAnimating(prev => new Map(prev).set(robotId, false));
          resolve({ success: true, withinTolerance });
        } else {
          const frameId = requestAnimationFrame(animateProfile);
          animationFrameRef.current.set(robotId, frameId);
        }
      };
      
      setIsAnimating(prev => new Map(prev).set(robotId, true));
      const frameId = requestAnimationFrame(animateProfile);
      animationFrameRef.current.set(robotId, frameId);
    });
  }, [robotJointValues, setJointValues, simpleTrapezoidal]);
  
  // ========== FILE SYSTEM OPERATIONS ==========
  const scanTrajectories = useCallback(async () => {
    try {
      setIsScanning(true);
      setError(null);
      
      const response = await fetch('/api/trajectory/scan');
      const result = await response.json();
      
      if (result.success) {
        setAvailableTrajectories(result.trajectories);
        console.log(`[TrajectoryContext] Found ${result.trajectories.length} trajectories`);
      } else {
        setError(result.message || 'Failed to scan trajectories');
      }
    } catch (error) {
      console.error('[TrajectoryContext] Error scanning trajectories:', error);
      setError('Failed to scan trajectories');
    } finally {
      setIsScanning(false);
    }
  }, []);

  const saveTrajectoryToFile = useCallback(async (trajectory, robotId) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const { manufacturer, model } = getRobotInfo(robotId);
      
      const response = await fetch('/api/trajectory/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          manufacturer,
          model,
          name: trajectory.name,
          data: trajectory
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        console.log(`[TrajectoryContext] Saved trajectory to: ${result.path}`);
        await scanTrajectories();
        return true;
      } else {
        setError(result.message || 'Failed to save trajectory');
        return false;
      }
    } catch (error) {
      console.error('[TrajectoryContext] Error saving trajectory:', error);
      setError('Failed to save trajectory to file');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [getRobotInfo, scanTrajectories]);

  const loadTrajectoryFromFile = useCallback(async (manufacturer, model, name) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch(`/api/trajectory/load/${manufacturer}/${model}/${name}`);
      const result = await response.json();
      
      if (result.success) {
        console.log(`[TrajectoryContext] Loaded trajectory: ${result.trajectory.name}`);
        return result.trajectory;
      } else {
        setError(result.message || 'Failed to load trajectory');
        return null;
      }
    } catch (error) {
      console.error('[TrajectoryContext] Error loading trajectory:', error);
      setError('Failed to load trajectory from file');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deleteTrajectoryFromFile = useCallback(async (manufacturer, model, name) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch(`/api/trajectory/delete/${manufacturer}/${model}/${name}`, {
        method: 'DELETE'
      });
      
      const result = await response.json();
      
      if (result.success) {
        console.log(`[TrajectoryContext] Deleted trajectory: ${name}`);
        await scanTrajectories();
        return true;
      } else {
        setError(result.message || 'Failed to delete trajectory');
        return false;
      }
    } catch (error) {
      console.error('[TrajectoryContext] Error deleting trajectory:', error);
      setError('Failed to delete trajectory from file');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [scanTrajectories]);
  
  // ========== TRAJECTORY PRE-ANIMATION ==========
  const preAnimateToStart = useCallback(async (robotId, trajectory, options = {}) => {
    const {
      duration = 2000,
      profile = 'trapezoidal',
      onProgress
    } = options;
    
    // Find first valid frame
    const firstValidFrame = trajectory.frames.find(frame => 
      frame.jointValues && Object.keys(frame.jointValues).length > 0
    );
    
    if (!firstValidFrame) {
      console.warn('No valid frames found for pre-animation');
      return false;
    }
    
    const currentValues = robotJointValues.get(robotId) || {};
    const targetValues = firstValidFrame.jointValues;
    
    // Check if movement needed
    let needsMovement = false;
    Object.keys(targetValues).forEach(jointName => {
      const diff = Math.abs((currentValues[jointName] || 0) - targetValues[jointName]);
      if (diff > 0.001) needsMovement = true;
    });
    
    if (!needsMovement) {
      console.log('Robot already at start position');
      return true;
    }
    
    // Emit pre-animation start
    EventBus.emit('trajectory:pre-animation-started', {
      robotId,
      trajectoryName: trajectory.name,
      currentPosition: currentValues,
      targetPosition: targetValues
    });
    
    // Animate to start
    const result = await animateWithMotionProfile(robotId, targetValues, {
      duration,
      motionProfile: profile,
      onProgress: (data) => {
        EventBus.emit('trajectory:pre-animation-progress', {
          robotId,
          progress: data.progress
        });
        if (onProgress) onProgress(data);
      }
    });
    
    if (result.success) {
      EventBus.emit('trajectory:pre-animation-completed', { robotId });
      await new Promise(resolve => setTimeout(resolve, 500)); // Small delay
    }
    
    return result.success;
  }, [robotJointValues, animateWithMotionProfile]);
  
  // ========== PLAYBACK CONTROL ==========
  const stopPlayback = useCallback((robotId) => {
    const playbackState = playbackStatesRef.current.get(robotId);
    if (!playbackState) return false;

    console.log(`[TrajectoryContext] Stopping playback for robot ${robotId}`);

    // Clear from both state and ref
    playbackStatesRef.current.delete(robotId);
    setPlaybackStates(prev => {
      const newMap = new Map(prev);
      newMap.delete(robotId);
      return newMap;
    });
    
    // Emit playback stopped event
    EventBus.emit('trajectory:playback-stopped', {
      robotId,
      trajectoryName: playbackState.trajectory.name
    });
    
    return true;
  }, []);
  
  // ========== UNIFIED TRAJECTORY PLAYBACK ==========
  const playTrajectory = useCallback(async (trajectoryInfo, robotId, options = {}) => {
    const {
      speed = 1.0,
      loop = false,
      onComplete = () => {},
      onFrame = () => {},
      enablePreAnimation = true,
      animationDuration = 2000,
      animationProfile = 'trapezoidal',
      useMotionProfile = true
    } = options;
    
    // Load trajectory
    const trajectory = await loadTrajectoryFromFile(
      trajectoryInfo.manufacturer,
      trajectoryInfo.model,
      trajectoryInfo.name
    );
    
    if (!trajectory || !trajectory.frames?.length) {
      setError('Invalid trajectory');
      return false;
    }
    
    // Check if already animating
    if (isAnimating.get(robotId)) {
      setError('Robot is currently animating');
      return false;
    }
    
    // Stop existing playback
    stopPlayback(robotId);
    
    // Pre-animation if enabled
    if (enablePreAnimation) {
      const preAnimSuccess = await preAnimateToStart(robotId, trajectory, {
        duration: animationDuration,
        profile: animationProfile
      });
      
      if (!preAnimSuccess) {
        console.warn('Pre-animation failed, continuing anyway');
      }
    }
    
    // Process frames for motion profiling if needed
    let processedFrames = trajectory.frames;
    if (useMotionProfile && processTrajectoryFrames) {
      processedFrames = processTrajectoryFrames(trajectory.frames, animationProfile);
    }
    
    // Create playback state
    const playbackState = {
      trajectory: { ...trajectory, frames: processedFrames },
      robotId,
      startTime: Date.now(),
      speed,
      loop,
      onComplete,
      onFrame,
      isPlaying: true,
      currentFrameIndex: 0,
      useMotionProfile
    };
    
    setPlaybackStates(prev => new Map(prev).set(robotId, playbackState));
    playbackStatesRef.current.set(robotId, playbackState);
    
    EventBus.emit('trajectory:playback-started', {
      robotId,
      trajectoryName: trajectory.name,
      frameCount: processedFrames.length
    });
    
    // Start playback loop
    const playbackLoop = () => {
      const state = playbackStatesRef.current.get(robotId);
      if (!state?.isPlaying) return;
      
      const elapsed = (Date.now() - state.startTime) * state.speed;
      const progress = Math.min(elapsed / state.trajectory.duration, 1);
      
      // Find current frame
      let frameIndex = 0;
      for (let i = 0; i < state.trajectory.frames.length - 1; i++) {
        if (state.trajectory.frames[i].timestamp <= elapsed &&
            state.trajectory.frames[i + 1].timestamp > elapsed) {
          frameIndex = i;
          break;
        }
      }
      
      const frame = state.trajectory.frames[frameIndex];
      if (frame?.jointValues) {
        setJointValues(robotId, frame.jointValues);
        state.onFrame(frame, null, progress);
        
        EventBus.emit('trajectory:frame-played', {
          robotId,
          frameIndex,
          progress
        });
      }
      
      if (progress >= 1) {
        if (state.loop) {
          state.startTime = Date.now();
          EventBus.emit('trajectory:loop-restarted', { robotId });
        } else {
          // Playback complete
          state.isPlaying = false;
          setPlaybackStates(prev => {
            const newMap = new Map(prev);
            newMap.delete(robotId);
            return newMap;
          });
          
          EventBus.emit('trajectory:playback-completed', { robotId });
          state.onComplete();
          return;
        }
      }
      
      requestAnimationFrame(playbackLoop);
    };
    
    requestAnimationFrame(playbackLoop);
    return true;
  }, [isAnimating, loadTrajectoryFromFile, preAnimateToStart, setJointValues, stopPlayback, processTrajectoryFrames]);
  
  // ========== RECORDING FUNCTIONS ==========
  const startRecording = useCallback((trajectoryName, robotId) => {
    if (recordingStates.get(robotId)) {
      console.warn(`Already recording for robot ${robotId}`);
      return false;
    }
    
    const recordingState = {
      trajectoryName,
      robotId,
      startTime: Date.now(),
      frames: [],
      endEffectorPath: [],
      isRecording: true
    };
    
    setRecordingStates(prev => new Map(prev).set(robotId, recordingState));
    recordingDataRef.current.set(robotId, recordingState);
    
    EventBus.emit('trajectory:recording-started', { robotId, trajectoryName });
    return true;
  }, []);
  
  const stopRecording = useCallback(async (robotId) => {
    const state = recordingStates.get(robotId);
    if (!state) return null;
    
    state.isRecording = false;
    
    const trajectory = {
      name: state.trajectoryName,
      robotId,
      frames: state.frames,
      endEffectorPath: state.endEffectorPath,
      duration: Date.now() - state.startTime,
      recordedAt: new Date().toISOString(),
      frameCount: state.frames.length
    };
    
    setRecordingStates(prev => {
      const newMap = new Map(prev);
      newMap.delete(robotId);
      return newMap;
    });
    
    if (trajectory.frameCount > 0) {
      await saveTrajectoryToFile(trajectory, robotId);
    }
    
    EventBus.emit('trajectory:recording-stopped', { robotId, frameCount: trajectory.frameCount });
    return trajectory;
  }, [recordingStates, saveTrajectoryToFile]);
  
  // ========== UTILITY FUNCTIONS ==========
  const getRobotTrajectories = useCallback((robotId) => {
    if (!robotId) return [];
    
    const { manufacturer, model } = getRobotInfo(robotId);
    
    return availableTrajectories.filter(traj => 
      traj.manufacturer === manufacturer && traj.model === model
    );
  }, [availableTrajectories, getRobotInfo]);
  
  const analyzeTrajectory = useCallback((trajectoryInfo) => {
    // Placeholder for trajectory analysis
    // This would analyze the trajectory and return statistics
    return {
      frameCount: trajectoryInfo.frameCount || 0,
      duration: trajectoryInfo.duration || 0,
      averageSpeed: 0,
      maxSpeed: 0,
      totalDistance: 0
    };
  }, []);
  
  const createTrajectoryVisualization = useCallback((trajectory) => {
    // Placeholder for visualization creation
    // This would process the trajectory for 3D visualization
    return {
      points: [],
      colors: [],
      bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } }
    };
  }, []);
  
  const calculateCameraPosition = useCallback((bounds) => {
    // Simple camera positioning based on bounds
    const center = {
      x: (bounds.min.x + bounds.max.x) / 2,
      y: (bounds.min.y + bounds.max.y) / 2,
      z: (bounds.min.z + bounds.max.z) / 2
    };
    
    const size = Math.max(
      bounds.max.x - bounds.min.x,
      bounds.max.y - bounds.min.y,
      bounds.max.z - bounds.min.z
    );
    
    return {
      position: { x: center.x + size, y: center.y + size, z: center.z + size },
      target: center
    };
  }, []);
  
  const getTrajectoryVisualization = useCallback(async (trajectoryInfo) => {
    const trajectory = await loadTrajectoryFromFile(
      trajectoryInfo.manufacturer,
      trajectoryInfo.model,
      trajectoryInfo.name
    );
    
    if (!trajectory) return null;
    
    const visualization = createTrajectoryVisualization(trajectory);
    const analysis = analyzeTrajectory(trajectory);
    
    return {
      trajectory,
      visualization,
      analysis
    };
  }, [loadTrajectoryFromFile, createTrajectoryVisualization, analyzeTrajectory]);
  
  // ========== ROBOT INITIALIZATION ==========
  const initializeRobotJoints = useCallback((robotId) => {
    const robot = robotManagerRef.current?.getRobot(robotId);
    if (!robot) return;
    
    // Get joint information from robot
    const joints = robot.joints || {};
    const jointValues = {};
    
    // Initialize joint values
    Object.keys(joints).forEach(jointName => {
      const joint = joints[jointName];
      if (joint && joint.angle !== undefined) {
        jointValues[jointName] = joint.angle;
      }
    });
    
    // Store joint data
    setRobotJoints(prev => new Map(prev).set(robotId, joints));
    setRobotJointValues(prev => new Map(prev).set(robotId, jointValues));
    
    console.log(`[TrajectoryContext] Initialized joints for ${robotId}:`, Object.keys(joints).length);
  }, []);
  
  // ========== EVENT LISTENERS ==========
  useEffect(() => {
    // Handle robot loaded event
    const handleRobotLoaded = (data) => {
      const { robotId } = data;
      console.log(`[TrajectoryContext] Robot loaded: ${robotId}`);
      
      // Initialize joints after a small delay to ensure robot is fully loaded
      setTimeout(() => {
        initializeRobotJoints(robotId);
      }, 100);
    };
    
    // Handle robot registered event (alternative event)
    const handleRobotRegistered = (data) => {
      const { robotId } = data;
      console.log(`[TrajectoryContext] Robot registered: ${robotId}`);
      initializeRobotJoints(robotId);
    };
    
    // Handle robot removed event
    const handleRobotRemoved = (data) => {
      const { robotId } = data;
      console.log(`[TrajectoryContext] Robot removed: ${robotId}`);
      
      // Clean up robot data
      setRobotJoints(prev => {
        const newMap = new Map(prev);
        newMap.delete(robotId);
        return newMap;
      });
      setRobotJointValues(prev => {
        const newMap = new Map(prev);
        newMap.delete(robotId);
        return newMap;
      });
      
      // Stop any animations
      const frame = animationFrameRef.current.get(robotId);
      if (frame) {
        cancelAnimationFrame(frame);
        animationFrameRef.current.delete(robotId);
      }
      
      // Stop recording/playback
      recordingDataRef.current.delete(robotId);
      playbackStatesRef.current.delete(robotId);
    };
    
    // Record frames when joints change
    const handleJointChange = (data) => {
      const { robotId, values } = data;
      const state = recordingDataRef.current.get(robotId);
      
      if (state?.isRecording) {
        const elapsed = Date.now() - state.startTime;
        state.frames.push({
          timestamp: elapsed,
          jointValues: { ...values }
        });
        
        EventBus.emit('trajectory:frame-recorded', {
          robotId,
          frameCount: state.frames.length
        });
      }
    };
    
    const unsubscribeLoaded = EventBus.on('robot:loaded', handleRobotLoaded);
    const unsubscribeRegistered = EventBus.on('robot:registered', handleRobotRegistered);
    const unsubscribeRemoved = EventBus.on('robot:removed', handleRobotRemoved);
    const unsubscribeJointChange = EventBus.on('robot:joints-changed', handleJointChange);
    
    return () => {
      unsubscribeLoaded();
      unsubscribeRegistered();
      unsubscribeRemoved();
      unsubscribeJointChange();
    };
  }, [initializeRobotJoints]);
  
  // Initialize robot manager
  useEffect(() => {
    if (isViewerReady) {
      robotManagerRef.current = getRobotManager();
    }
  }, [isViewerReady, getRobotManager]);
  
  // Initialize by scanning trajectories
  useEffect(() => {
    scanTrajectories();
  }, [scanTrajectories]);
  
  // ========== MEMOIZED VALUE ==========
  const value = useMemo(() => ({
    // State
    robotJoints,
    robotJointValues,
    isAnimating,
    animationProgress,
    recordingStates,
    playbackStates,
    availableTrajectories,
    error,
    isLoading,
    isScanning,
    
    // Joint control
    setJointValue,
    setJointValues,
    getJointValues: (robotId) => robotJointValues.get(robotId) || {},
    getJointInfo,
    getJointLimits,
    isRobotReady,
    resetJoints,
    
    // Animation control
    processTrajectoryFrames,
    simpleTrapezoidal,
    animate,
    animateWithMotionProfile,
    stopAnimation: (robotId) => {
      const frame = animationFrameRef.current.get(robotId);
      if (frame) {
        cancelAnimationFrame(frame);
        animationFrameRef.current.delete(robotId);
        setIsAnimating(prev => new Map(prev).set(robotId, false));
      }
    },
    
    // Trajectory control
    playTrajectory,
    startRecording,
    stopRecording,
    stopPlayback,
    isRecording: (robotId) => recordingStates.has(robotId),
    isPlaying: (robotId) => playbackStates.has(robotId),
    
    // File operations
    scanTrajectories,
    loadTrajectoryFromFile,
    saveTrajectoryToFile,
    deleteTrajectoryFromFile,
    getRobotTrajectories,
    
    // Analysis and visualization
    analyzeTrajectory,
    createTrajectoryVisualization,
    calculateCameraPosition,
    getTrajectoryVisualization,
    
    // Utils
    setAnimationProfile: (profile) => setCurrentProfile(profile),
    clearError: () => setError(null)
  }), [
    robotJoints,
    robotJointValues,
    isAnimating,
    animationProgress,
    recordingStates,
    playbackStates,
    availableTrajectories,
    error,
    isLoading,
    isScanning,
    setJointValue,
    setJointValues,
    getJointInfo,
    getJointLimits,
    isRobotReady,
    resetJoints,
    animate,
    animateWithMotionProfile,
    playTrajectory,
    startRecording,
    stopRecording,
    stopPlayback,
    scanTrajectories,
    loadTrajectoryFromFile,
    saveTrajectoryToFile,
    deleteTrajectoryFromFile,
    getRobotTrajectories,
    analyzeTrajectory,
    createTrajectoryVisualization,
    calculateCameraPosition,
    getTrajectoryVisualization,
    currentProfile
  ]);
  
  return (
    <TrajectoryContext.Provider value={value}>
      {children}
    </TrajectoryContext.Provider>
  );
};

export const useTrajectoryContext = () => {
  const context = useContext(TrajectoryContext);
  if (!context) {
    throw new Error('useTrajectoryContext must be used within TrajectoryProvider');
  }
  return context;
};

export default TrajectoryContext;