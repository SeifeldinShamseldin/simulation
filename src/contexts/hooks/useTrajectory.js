// src/contexts/hooks/useTrajectory.js - Direct File System Hook
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useJoints } from './useJoints';
import { useTCP } from './useTCP';
import { useRobotManager } from './useRobotManager';
import { useJointContext } from '../JointContext';
import EventBus from '../../utils/EventBus';
import useAnimate from './useAnimate';

// Debug utility to reduce console pollution
const DEBUG = process.env.NODE_ENV === 'development';
const log = DEBUG ? console.log : () => {};

export const useTrajectory = (robotId = null) => {
  const { setJointValues, isAnimating, jointValues } = useJoints(robotId);
  const { currentEndEffectorPoint, currentEndEffectorOrientation } = useTCP(robotId);
  const { getRobotById, categories } = useRobotManager();
  const { animateToValues } = useAnimate();
  
  // Get getJointValues directly from JointContext
  const { animateToJointValues, getJointValues: getJointValuesFromContext } = useJointContext();
  
  // ========== RECORDING STATE ==========  
  const [isRecording, setIsRecording] = useState(false);
  const [recordingName, setRecordingName] = useState(null);
  const [frameCount, setFrameCount] = useState(0);
  
  // ========== PLAYBACK STATE ==========  
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTrajectory, setCurrentTrajectory] = useState(null);
  const [playbackEndEffectorPoint, setPlaybackEndEffectorPoint] = useState({ x: 0, y: 0, z: 0 });
  const [playbackEndEffectorOrientation, setPlaybackEndEffectorOrientation] = useState({ x: 0, y: 0, z: 0, w: 1 });
  
  // ========== FILE SYSTEM STATE ==========  
  const [availableTrajectories, setAvailableTrajectories] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState(null);
  
  // ========== REFS ==========  
  const recordingDataRef = useRef({
    name: null,
    robotId: null,
    startTime: null,
    frames: [],
    endEffectorPath: []
  });
  const playbackStateRef = useRef(null);
  const animationFrameRef = useRef(null);
  
  // ========== ROBOT INFO HELPER ==========  
  const robotInfoCache = useRef(new Map());
  
  const getRobotInfo = useCallback((robotId) => {
    if (!robotId) return { manufacturer: 'unknown', model: 'unknown' };
    
    // Check cache first
    if (robotInfoCache.current.has(robotId)) {
      return robotInfoCache.current.get(robotId);
    }
    
    const baseRobotId = robotId.split('_')[0];
    let manufacturer = 'unknown';
    let model = baseRobotId.toLowerCase();
    
    for (const category of categories || []) {
      if (category.robots?.some(robot => robot.id === baseRobotId)) {
        manufacturer = category.id;
        const fullRobotData = getRobotById(baseRobotId);
        model = fullRobotData?.name?.toLowerCase() || baseRobotId.toLowerCase();
        break;
      }
    }
    
    const result = { manufacturer, model };
    robotInfoCache.current.set(robotId, result);
    return result;
  }, [categories, getRobotById]);
  
  // ========== FILE SYSTEM OPERATIONS ==========  
  const scanTrajectories = useCallback(async () => {
    try {
      setIsScanning(true);
      setError(null);
      
      const response = await fetch('/api/trajectory/scan');
      const result = await response.json();
      
      if (result.success) {
        setAvailableTrajectories(result.trajectories || []);
        log(`[useTrajectory] Found ${result.trajectories?.length || 0} trajectories`);
      } else {
        setError(result.message || 'Failed to scan trajectories');
      }
    } catch (error) {
      console.error('[useTrajectory] Error scanning trajectories:', error);
      setError('Failed to scan trajectories');
    } finally {
      setIsScanning(false);
    }
  }, []);
  
  // Memoize robot trajectories for current robot
  const robotTrajectories = useMemo(() => {
    if (!robotId) return [];
    
    const { manufacturer, model } = getRobotInfo(robotId);
    
    return availableTrajectories.filter(traj => 
      traj.manufacturer === manufacturer && traj.model === model
    );
  }, [availableTrajectories, robotId, getRobotInfo]);
  
  // ========== RECORDING IMPLEMENTATION ==========  
  const recordingThrottleRef = useRef(0);
  const FRAME_THROTTLE_MS = 16; // ~60fps
  
  useEffect(() => {
    if (!isRecording || !robotId) return;
    
    const handleJointChange = (data) => {
      if (data.robotId !== robotId) return;
      
      const currentTime = Date.now();
      
      // Improved throttling
      if (currentTime - recordingThrottleRef.current < FRAME_THROTTLE_MS) return;
      recordingThrottleRef.current = currentTime;
      
      const elapsed = currentTime - recordingDataRef.current.startTime;
      const eventJointValues = data.values || jointValues;
      
      // Record frame
      recordingDataRef.current.frames.push({
        timestamp: elapsed,
        jointValues: { ...eventJointValues }
      });
      
      // Record end effector if available (optimized check)
      const hasEndEffector = currentEndEffectorPoint.x !== 0 || 
                            currentEndEffectorPoint.y !== 0 || 
                            currentEndEffectorPoint.z !== 0;
      
      if (hasEndEffector) {
        recordingDataRef.current.endEffectorPath.push({
          timestamp: elapsed,
          position: { ...currentEndEffectorPoint },
          orientation: { ...currentEndEffectorOrientation }
        });
      }
      
      setFrameCount(recordingDataRef.current.frames.length);
      
      // Emit frame recorded event
      EventBus.emit('trajectory:frame-recorded', {
        robotId,
        frameCount: recordingDataRef.current.frames.length,
        hasEndEffector
      });
    };
    
    const unsubscribe = EventBus.on('robot:joints-changed', handleJointChange);
    return () => unsubscribe();
  }, [isRecording, robotId, jointValues, currentEndEffectorPoint, currentEndEffectorOrientation]);
  
  const startRecording = useCallback((name) => {
    if (!robotId || isRecording) return false;
    
    log(`[useTrajectory] Starting recording "${name}" for robot ${robotId}`);
    
    // Get initial state - FIXED: Use getJointValues from context
    const initialJoints = getJointValuesFromContext(robotId) || {};
    
    // Initialize recording
    recordingDataRef.current = {
      name,
      robotId,
      startTime: Date.now(),
      frames: [{
        timestamp: 0,
        jointValues: { ...initialJoints }
      }],
      endEffectorPath: [{
        timestamp: 0,
        position: { ...currentEndEffectorPoint },
        orientation: { ...currentEndEffectorOrientation }
      }]
    };
    
    setIsRecording(true);
    setRecordingName(name);
    setFrameCount(1);
    
    log(`[useTrajectory] Recording started with ${Object.keys(initialJoints).length} joints`);
    return true;
  }, [robotId, isRecording, getJointValuesFromContext, currentEndEffectorPoint, currentEndEffectorOrientation]);
  
  const stopRecording = useCallback(async () => {
    if (!isRecording) return null;
    
    setIsRecording(false);
    
    const trajectory = {
      ...recordingDataRef.current,
      duration: Date.now() - recordingDataRef.current.startTime,
      frameCount: recordingDataRef.current.frames.length,
      recordedAt: new Date().toISOString()
    };
    
    log(`[useTrajectory] Stopped recording with ${trajectory.frameCount} frames`);
    
    // Save trajectory
    try {
      const { manufacturer, model } = getRobotInfo(robotId);
      
      const response = await fetch('/api/trajectory/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manufacturer,
          model,
          name: trajectory.name,
          data: trajectory
        })
      });
      
      if (!response.ok) throw new Error('Failed to save');
      
      log(`[useTrajectory] Saved trajectory "${trajectory.name}"`);
      
      // Refresh available trajectories
      await scanTrajectories();
    } catch (error) {
      console.error('[useTrajectory] Save error:', error);
      setError('Failed to save trajectory');
    }
    
    // Emit recording stopped event
    EventBus.emit('trajectory:recording-stopped', {
      robotId,
      trajectoryName: trajectory.name,
      frameCount: trajectory.frameCount
    });
    
    // Reset
    setRecordingName(null);
    setFrameCount(0);
    
    return trajectory;
  }, [isRecording, robotId, getRobotInfo, scanTrajectories]);
  
  // ========== PLAYBACK IMPLEMENTATION ==========  
  const loadTrajectory = useCallback(async (manufacturer, model, name) => {
    try {
      const response = await fetch(`/api/trajectory/load/${manufacturer}/${model}/${name}`);
      const result = await response.json();
      
      if (result.success) {
        return result.trajectory;
      }
      throw new Error(result.message || 'Failed to load');
    } catch (error) {
      console.error('[useTrajectory] Load error:', error);
      setError('Failed to load trajectory');
      return null;
    }
  }, []);
  
  const playTrajectory = useCallback(async (trajectoryInfo, options = {}) => {
    if (!robotId) {
      console.warn('[useTrajectory] Cannot play trajectory: missing robotId');
      return false;
    }

    // Handle both trajectory metadata objects and full trajectory objects
    let trajectory;
    
    if (trajectoryInfo.frames && Array.isArray(trajectoryInfo.frames)) {
      // Direct trajectory object provided
      trajectory = trajectoryInfo;
    } else if (trajectoryInfo.manufacturer && trajectoryInfo.model && trajectoryInfo.name) {
      // Trajectory metadata provided - load the full trajectory
      trajectory = await loadTrajectory(
        trajectoryInfo.manufacturer,
        trajectoryInfo.model,
        trajectoryInfo.name
      );
    } else {
      console.warn('[useTrajectory] Cannot play trajectory: invalid trajectory info provided');
      return false;
    }

    if (!trajectory || !trajectory.frames || trajectory.frames.length === 0) {
      console.warn('[useTrajectory] Cannot play trajectory: missing trajectory, frames, or empty frames');
      return false;
    }

    // Stop any existing playback
    stopPlayback();
    
    const {
      speed = 1.0,
      loop = false,
      onComplete = () => {},
      onFrame = () => {},
      animateToStart = true,
      animationDuration = 2000,
      animationProfile = 'trapezoidal',
      enablePreAnimation = true
    } = options;

    log(`[useTrajectory] Playing trajectory "${trajectory.name}" for robot ${robotId}`);

    // Track if pre-animation happened
    let hadPreAnimation = false;
    
    // Find first valid frame for playback (skip empty frames)
    let firstValidFrameIndex = 0;
    let firstValidFrame = null;
    for (let i = 0; i < trajectory.frames.length; i++) {
      const frame = trajectory.frames[i];
      if (frame.jointValues && Object.keys(frame.jointValues).length > 0) {
        firstValidFrameIndex = i;
        firstValidFrame = frame;
        break;
      }
    }
    
    if (!firstValidFrame) {
      console.warn('[useTrajectory] No valid frames with joint values found');
      return false;
    }
    
    console.log('[useTrajectory] First valid frame:', {
      index: firstValidFrameIndex,
      jointValues: firstValidFrame.jointValues,
      timestamp: firstValidFrame.timestamp
    });
    
    // Pre-animation logic - use the SAME first valid frame
    if (enablePreAnimation) {
      const targetJointValues = firstValidFrame.jointValues; // Use the SAME frame
      
      // Get current joint values
      let currentJointValues = getJointValuesFromContext(robotId);
      
      // If no joint values found, try to request them through event
      if (!currentJointValues || Object.keys(currentJointValues).length === 0) {
        EventBus.emit('trajectory:request-state', { robotId });
        await new Promise(resolve => setTimeout(resolve, 100)); // Give time for response
        
        // Try again after request
        currentJointValues = getJointValuesFromContext(robotId);
        if (!currentJointValues || Object.keys(currentJointValues).length === 0) {
          // Last resort - use the state jointValues
          currentJointValues = jointValues || {};
        }
      }
      
      console.log('[useTrajectory] Pre-animation comparison:', {
        current: currentJointValues,
        target: targetJointValues
      });
      
      // Check if movement is needed
      let needsMovement = false;
      const movements = {};
      
      Object.keys(targetJointValues).forEach(jointName => {
        const current = currentJointValues[jointName] || 0;
        const target = targetJointValues[jointName] || 0;
        const difference = Math.abs(current - target);
        movements[jointName] = { current, target, difference };
        if (difference > 0.001) { // Tolerance
          needsMovement = true;
        }
      });
      
      if (needsMovement) {
        hadPreAnimation = true;
        
        console.log('[useTrajectory] Pre-animation needed:', movements);
        
        // Emit pre-animation started event
        EventBus.emit('trajectory:pre-animation-started', {
          robotId,
          trajectoryName: trajectory.name,
          currentPosition: currentJointValues,
          targetPosition: targetJointValues
        });
        
        try {
          const animationResult = await animateToValues(robotId, targetJointValues, {
            duration: animationDuration,
            motionProfile: animationProfile,
            tolerance: 0.001,
            animationSpeed: 1.0,
            onProgress: (progressData) => {
              // Emit progress events
              EventBus.emit('trajectory:pre-animation-progress', {
                robotId,
                trajectoryName: trajectory.name,
                progress: progressData.progress
              });
            }
          });
          
          if (animationResult && animationResult.success) {
            console.log('[useTrajectory] Pre-animation completed successfully');
            
            // Emit pre-animation completed event
            EventBus.emit('trajectory:pre-animation-completed', {
              robotId,
              trajectoryName: trajectory.name
            });
            
            // Small delay before starting trajectory
            await new Promise(resolve => setTimeout(resolve, 500));
          } else {
            console.warn('[useTrajectory] Pre-animation failed, continuing with playback');
          }
        } catch (error) {
          console.error('[useTrajectory] Error during pre-animation:', error);
          // Continue with playback anyway
        }
      } else {
        console.log('[useTrajectory] No pre-animation needed - robot already at target position');
      }
    }
    
    // Initialize playback state
    playbackStateRef.current = {
      trajectory,
      startTime: Date.now() + (hadPreAnimation ? 500 : 0), // Add delay if pre-animated
      speed,
      loop,
      onComplete,
      onFrame,
      frameIndex: firstValidFrameIndex, // Start from first valid frame
      isPlaying: true,
      hadPreAnimation,
      lastProgress: 0,
      skipFirstFrame: hadPreAnimation // Skip first frame if pre-animation was used
    };
    
    setIsPlaying(true);
    setCurrentTrajectory(trajectory);
    setProgress(0);
    
    // Emit playback started event
    EventBus.emit('trajectory:playback-started', {
      robotId,
      trajectoryName: trajectory.name,
      frameCount: trajectory.frameCount,
      hadPreAnimation
    });
    
    // Start playback loop
    const playFrame = () => {
      const state = playbackStateRef.current;
      if (!state || !state.isPlaying) {
        log('[useTrajectory] Playback stopped');
        return;
      }
      
      const elapsed = (Date.now() - state.startTime) * state.speed;
      const progress = Math.min(elapsed / state.trajectory.duration, 1);
      
      // Optimized frame finding - binary search for better performance
      let frameIndex = state.frameIndex;
      const frames = state.trajectory.frames;
      
      // Only search if we need to advance
      if (elapsed > frames[frameIndex]?.timestamp) {
        // Binary search for the correct frame
        let left = frameIndex;
        let right = frames.length - 1;
        
        while (left <= right) {
          const mid = Math.floor((left + right) / 2);
          if (frames[mid].timestamp <= elapsed) {
            frameIndex = mid;
            left = mid + 1;
          } else {
            right = mid - 1;
          }
        }
      }
      
      // Apply frame if changed and valid, and not skipping first frame
      if (frameIndex !== state.frameIndex && frameIndex < frames.length && !state.skipFirstFrame) {
        const frame = frames[frameIndex];
        const endEffectorFrame = state.trajectory.endEffectorPath?.[frameIndex];
        
        // Skip frames with empty joint values
        if (frame.jointValues && Object.keys(frame.jointValues).length > 0) {
          // Apply joint values
          const success = setJointValues(frame.jointValues);
          if (success) {
            state.frameIndex = frameIndex;
            
            // Update playback end effector state only if changed
            if (endEffectorFrame) {
              setPlaybackEndEffectorPoint(endEffectorFrame.position);
              setPlaybackEndEffectorOrientation(endEffectorFrame.orientation);
            }
            
            // Call frame callback
            if (state.onFrame) {
              state.onFrame(frame, endEffectorFrame, progress);
            }
            
            // Emit frame played event
            EventBus.emit('trajectory:frame-played', {
              robotId,
              trajectoryName: state.trajectory.name,
              frameIndex,
              progress,
              hasEndEffector: !!endEffectorFrame
            });
          }
        }
      }
      
      // Clear skipFirstFrame flag after first frame
      if (state.skipFirstFrame) {
        state.skipFirstFrame = false;
      }
      
      // Update progress only if significantly changed
      if (Math.abs(progress - state.lastProgress) > 0.01) {
        setProgress(progress);
        state.lastProgress = progress;
      }
      
      // Check completion
      if (progress >= 1) {
        if (state.loop) {
          // Reset for loop
          state.startTime = Date.now();
          state.frameIndex = 0;
          state.lastProgress = 0;
          setProgress(0);
        } else {
          // Complete
          stopPlayback();
          if (state.onComplete) {
            state.onComplete();
          }
          
          // Emit playback completed event
          EventBus.emit('trajectory:playback-completed', {
            robotId,
            trajectoryName: state.trajectory.name
          });
          return;
        }
      }
      
      // Continue
      animationFrameRef.current = requestAnimationFrame(playFrame);
    };
    
    animationFrameRef.current = requestAnimationFrame(playFrame);
    return true;
  }, [robotId, isPlaying, isAnimating, setJointValues, loadTrajectory, jointValues, animateToValues, getJointValuesFromContext]);
  
  const stopPlayback = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    if (playbackStateRef.current) {
      playbackStateRef.current.isPlaying = false;
    }
    
    setIsPlaying(false);
    setProgress(0);
    setCurrentTrajectory(null);
    
    // Emit playback stopped event
    if (robotId && currentTrajectory) {
      EventBus.emit('trajectory:playback-stopped', {
        robotId,
        trajectoryName: currentTrajectory.name
      });
    }
    
    log('[useTrajectory] Playback stopped');
  }, [robotId, currentTrajectory]);
  
  const deleteTrajectory = useCallback(async (manufacturer, model, name) => {
    try {
      const response = await fetch(`/api/trajectory/delete/${manufacturer}/${model}/${name}`, {
        method: 'DELETE'
      });
      
      const result = await response.json();
      
      if (result.success) {
        log(`[useTrajectory] Deleted trajectory: ${name}`);
        await scanTrajectories();
        return true;
      } else {
        setError(result.message || 'Failed to delete trajectory');
        return false;
      }
    } catch (error) {
      console.error('[useTrajectory] Error deleting trajectory:', error);
      setError('Failed to delete trajectory');
      return false;
    }
  }, [scanTrajectories]);
  
  // Add analyzeTrajectory function
  const analyzeTrajectory = useCallback(async (trajectoryInfo) => {
    if (!trajectoryInfo) return null;
    
    try {
      const response = await fetch(`/api/trajectory/analyze/${trajectoryInfo.manufacturer}/${trajectoryInfo.model}/${trajectoryInfo.name}`);
      const result = await response.json();
      
      if (result.success) {
        log(`[useTrajectory] Analyzed trajectory: ${trajectoryInfo.name}`);
        return result.analysis;
      } else {
        console.warn(`[useTrajectory] Analysis failed for trajectory: ${trajectoryInfo.name}`);
        return null;
      }
    } catch (error) {
      console.error('[useTrajectory] Error analyzing trajectory:', error);
      return null;
    }
  }, []);
  
  // ========== VISUALIZATION METHODS ==========
  
  const createTrajectoryVisualization = useCallback((pathData) => {
    if (!pathData || !Array.isArray(pathData)) {
      return null;
    }

    const points = pathData.map(p => p.position);
    const colors = [];
    
    // Create gradient colors
    for (let i = 0; i < points.length; i++) {
      const t = i / (points.length - 1);
      colors.push({
        r: 1 - t,
        g: t,
        b: 0.3
      });
    }

    // Create waypoints
    const waypointInterval = Math.max(1, Math.floor(points.length / 10));
    const waypoints = [];
    for (let i = waypointInterval; i < points.length - 1; i += waypointInterval) {
      waypoints.push({
        position: points[i],
        index: i
      });
    }

    return {
      smoothPoints: points,
      colors,
      waypoints,
      startPoint: points[0],
      endPoint: points[points.length - 1],
      bounds: calculateBounds(points)
    };
  }, []);

  const calculateBounds = useCallback((points) => {
    if (!points || points.length === 0) {
      return {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 0, y: 0, z: 0 }
      };
    }

    const bounds = points.reduce((acc, point) => {
      return {
        min: {
          x: Math.min(acc.min.x, point.x),
          y: Math.min(acc.min.y, point.y),
          z: Math.min(acc.min.z, point.z)
        },
        max: {
          x: Math.max(acc.max.x, point.x),
          y: Math.max(acc.max.y, point.y),
          z: Math.max(acc.max.z, point.z)
        }
      };
    }, {
      min: { x: Infinity, y: Infinity, z: Infinity },
      max: { x: -Infinity, y: -Infinity, z: -Infinity }
    });

    return bounds;
  }, []);

  const calculateCameraPosition = useCallback((bounds) => {
    if (!bounds) {
      return {
        position: { x: 2, y: 2, z: 2 },
        target: { x: 0, y: 0, z: 0 }
      };
    }

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

    // Ensure minimum distance even for small trajectories
    const distance = Math.max(size * 2.5, 1);
    
    return {
      position: {
        x: center.x + distance * 0.7,
        y: center.y + distance * 0.7,
        z: center.z + distance * 0.7
      },
      target: center
    };
  }, []);

  const getTrajectoryVisualization = useCallback(async (trajectoryInfo) => {
    if (!trajectoryInfo || !robotId) {
      return null;
    }

    try {
      // Load trajectory data
      const trajectory = await loadTrajectory(
        trajectoryInfo.manufacturer,
        trajectoryInfo.model,
        trajectoryInfo.name
      );
      
      if (!trajectory) {
        console.warn(`[getTrajectoryVisualization] Failed to load trajectory "${trajectoryInfo.name}"`);
        return null;
      }

      const pathData = trajectory.endEffectorPath || [];
      
      // Get analysis
      const analysis = await analyzeTrajectory(trajectoryInfo);
      
      // Create visualization data
      const visualization = createTrajectoryVisualization(pathData);
      
      if (!visualization) {
        return null;
      }

      return {
        trajectoryData: trajectory,
        analysis,
        visualization,
        stats: {
          frameCount: analysis?.frameCount || 0,
          totalDistance: analysis?.endEffectorStats?.totalDistance || 0,
          duration: analysis?.duration / 1000 || 0,
          pathPoints: pathData.length
        }
      };
    } catch (error) {
      console.error('[getTrajectoryVisualization] Error:', error);
      return null;
    }
  }, [robotId, loadTrajectory, analyzeTrajectory, createTrajectoryVisualization]);
  
  // ========== CLEANUP EFFECTS ==========
  useEffect(() => {
    // Cleanup on unmount or robotId change
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      
      if (playbackStateRef.current) {
        playbackStateRef.current.isPlaying = false;
      }
      
      // Clear cache
      robotInfoCache.current.clear();
    };
  }, [robotId]);
  
  // Auto-scan trajectories on mount
  useEffect(() => {
    scanTrajectories();
  }, [scanTrajectories]);
  
  // Memoize the return object to prevent unnecessary re-renders
  const returnValue = useMemo(() => ({
    // Recording methods
    startRecording,
    stopRecording,
    isRecording,
    recordingName,
    frameCount,
    
    // Playback methods
    playTrajectory,
    stopPlayback,
    isPlaying,
    progress,
    currentTrajectory,
    playbackEndEffectorPoint,
    playbackEndEffectorOrientation,
    
    // File system methods
    scanTrajectories,
    loadTrajectory,
    deleteTrajectory,
    analyzeTrajectory,
    
    // File system state
    availableTrajectories,
    trajectories: robotTrajectories,
    isScanning,
    
    // Visualization methods
    createTrajectoryVisualization,
    calculateBounds,
    calculateCameraPosition,
    getTrajectoryVisualization,
    
    // Robot info helper
    getRobotInfo,
    
    // Computed values
    canRecord: !!robotId && !isAnimating && !isPlaying,
    canPlay: !!robotId && !isAnimating && !isRecording,
    hasFrames: frameCount > 0,
    hasTrajectories: robotTrajectories.length > 0,
    count: robotTrajectories.length,
    
    // Error handling
    error,
    setError
  }), [
    // Recording dependencies
    startRecording, stopRecording, isRecording, recordingName, frameCount,
    
    // Playback dependencies
    playTrajectory, stopPlayback, isPlaying, progress, currentTrajectory,
    playbackEndEffectorPoint, playbackEndEffectorOrientation,
    
    // File system dependencies
    scanTrajectories, loadTrajectory, deleteTrajectory, analyzeTrajectory,
    availableTrajectories, robotTrajectories, isScanning,
    
    // Visualization dependencies
    createTrajectoryVisualization, calculateBounds, calculateCameraPosition, getTrajectoryVisualization,
    
    // Robot info dependency
    getRobotInfo,
    
    // Computed value dependencies
    robotId, isAnimating, isPlaying, isRecording, frameCount, robotTrajectories.length,
    
    // Error dependencies
    error
  ]);
  
  return returnValue;
};

// Export specialized hooks that use the main hook
export const useTrajectoryRecording = (robotId = null) => {
  const trajectory = useTrajectory(robotId);
  
  return {
    robotId: trajectory.robotId,
    isRecording: trajectory.isRecording,
    startRecording: trajectory.startRecording,
    stopRecording: trajectory.stopRecording,
    recordingName: trajectory.recordingName,
    frameCount: trajectory.frameCount,
    canRecord: trajectory.canRecord,
    hasFrames: trajectory.hasFrames
  };
};

export const useTrajectoryPlayback = (robotId = null) => {
  const trajectory = useTrajectory(robotId);
  
  return {
    robotId: trajectory.robotId,
    isPlaying: trajectory.isPlaying,
    progress: trajectory.progress,
    currentTrajectory: trajectory.currentTrajectory,
    playTrajectory: trajectory.playTrajectory,
    stopPlayback: trajectory.stopPlayback,
    canPlay: trajectory.canPlay,
    playbackEndEffectorPoint: trajectory.playbackEndEffectorPoint,
    playbackEndEffectorOrientation: trajectory.playbackEndEffectorOrientation
  };
};

export const useTrajectoryManagement = (robotId = null) => {
  const trajectory = useTrajectory(robotId);
  
  return {
    robotId: trajectory.robotId,
    trajectories: trajectory.trajectories,
    deleteTrajectory: trajectory.deleteTrajectory,
    scanTrajectories: trajectory.scanTrajectories,
    hasTrajectories: trajectory.hasTrajectories,
    count: trajectory.count,
    isScanning: trajectory.isScanning,
    
    // Add these missing methods that are needed
    loadTrajectory: trajectory.loadTrajectory,
    analyzeTrajectory: trajectory.analyzeTrajectory,
    
    // You might also want to add for completeness
    error: trajectory.error,
    clearError: trajectory.setError
  };
};

export const useTrajectoryVisualization = (robotId = null) => {
  const trajectory = useTrajectory(robotId);
  const [visualizationData, setVisualizationData] = useState(null);
  const [isLoadingVis, setIsLoadingVis] = useState(false);
  const [visError, setVisError] = useState(null);
  
  // Load and prepare visualization data
  const loadVisualization = useCallback(async (trajectoryInfo) => {
    if (!trajectoryInfo || !robotId) {
      setVisualizationData(null);
      return null;
    }
    
    setIsLoadingVis(true);
    setVisError(null);
    
    try {
      // Use the context method to get visualization data
      const visData = await trajectory.getTrajectoryVisualization(trajectoryInfo);
      
      if (visData) {
        setVisualizationData(visData);
        log('[useTrajectoryVisualization] Loaded visualization with', 
          visData.visualization?.smoothPoints?.length || 0, 'smooth points');
      } else {
        setVisError('Failed to create visualization data');
      }
      
      return visData;
    } catch (error) {
      console.error('[useTrajectoryVisualization] Error:', error);
      setVisError(error.message);
      return null;
    } finally {
      setIsLoadingVis(false);
    }
  }, [robotId, trajectory]);
  
  // Clear visualization data
  const clearVisualization = useCallback(() => {
    setVisualizationData(null);
    setVisError(null);
  }, []);
  
  // Get camera configuration for current visualization
  const getCameraConfig = useCallback(() => {
    if (!visualizationData?.visualization?.bounds) {
      return {
        position: { x: 2, y: 2, z: 2 },
        target: { x: 0, y: 0, z: 0 }
      };
    }
    
    return trajectory.calculateCameraPosition(visualizationData.visualization.bounds);
  }, [visualizationData, trajectory]);
  
  return {
    // State
    visualizationData,
    isLoading: isLoadingVis,
    error: visError,
    
    // Visualization data accessors
    trajectoryPath: visualizationData?.visualization || null,
    smoothPoints: visualizationData?.visualization?.smoothPoints || [],
    pathColors: visualizationData?.visualization?.colors || [],
    startPoint: visualizationData?.visualization?.startPoint || null,
    endPoint: visualizationData?.visualization?.endPoint || null,
    waypoints: visualizationData?.visualization?.waypoints || [],
    bounds: visualizationData?.visualization?.bounds || null,
    
    // Statistics
    stats: visualizationData?.stats || {
      frameCount: 0,
      duration: 0,
      pathPoints: 0,
      totalDistance: 0
    },
    
    // Methods
    loadVisualization,
    clearVisualization,
    getCameraConfig,
    
    // Has valid visualization data
    hasVisualizationData: !!(visualizationData?.visualization?.smoothPoints?.length > 0),
    
    // Access to base trajectory methods
    trajectories: trajectory.trajectories,
    scanTrajectories: trajectory.scanTrajectories
  };
};

export default useTrajectory;