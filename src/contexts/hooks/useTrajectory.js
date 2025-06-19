// src/contexts/hooks/useTrajectory.js - Direct File System Hook
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useJoints } from './useJoints';
import { useTCP } from './useTCP';
import { useRobotManager } from './useRobotManager';
import { useJointContext } from '../JointContext';
import EventBus from '../../utils/EventBus';
import * as THREE from 'three';
import { useViewer } from '../ViewerContext';

// Debug utility to reduce console pollution
const DEBUG = process.env.NODE_ENV === 'development';
const log = DEBUG ? console.log : () => {};

export const useTrajectory = (robotId = null) => {
  const { setJointValues, isAnimating, jointValues } = useJoints(robotId);
  const { currentEndEffectorPoint, currentEndEffectorOrientation } = useTCP(robotId);
  const { getRobotById, categories } = useRobotManager();
  
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
          const animationResult = await animateToJointValues(robotId, targetJointValues, {
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
  }, [robotId, isPlaying, isAnimating, setJointValues, loadTrajectory, jointValues, animateToJointValues, getJointValuesFromContext]);
  
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

// --- Playback Trajectory Line Visualization Hook ---
export const usePlaybackTrajectoryLine = (robotId = null) => {
  const { isViewerReady, getScene } = useViewer();
  const { loadTrajectory, createTrajectoryVisualization, getRobotInfo } = useTrajectory(robotId);
  const lineRef = useRef(null);
  const waypointsRef = useRef([]);
  const orientationFramesRef = useRef([]);
  const currentMarkerRef = useRef(null);
  const activePlaybackRef = useRef(null);
  const storedTrajectoryRef = useRef(null);
  const activeRobotIdRef = useRef(null);

  useEffect(() => {
    if (!isViewerReady) return;
    const scene = getScene();
    if (!scene) return;

    // --- Event Handlers ---
    const handlePlaybackStarted = async (data) => {
      const { robotId, trajectoryName, hadPreAnimation, frameCount } = data;
      const prevActiveRobotId = activeRobotIdRef.current;
      if (prevActiveRobotId && prevActiveRobotId !== robotId) {
        cleanup(prevActiveRobotId);
      } else if (!prevActiveRobotId && getScene()) {
        const scene = getScene();
        const allVisObjects = scene.children.filter(child =>
          child.name.startsWith('playback_trajectory_line_') ||
          child.name.startsWith('waypoint_sphere_') ||
          child.name.startsWith('orientation_frame_') ||
          child.name.startsWith('trajectory_marker_')
        );
        allVisObjects.forEach(obj => {
          scene.remove(obj);
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) obj.material.dispose();
          if (obj.isGroup) {
            obj.children.forEach(child => {
              if (child.geometry) child.geometry.dispose();
              if (child.material) child.material.dispose();
            });
          }
        });
      }
      activeRobotIdRef.current = robotId;
      activePlaybackRef.current = { robotId, trajectoryName };
      if (robotId && trajectoryName) {
        try {
          const { manufacturer, model } = getRobotInfo(robotId);
          const trajectory = await loadTrajectory(manufacturer, model, trajectoryName);
          if (trajectory) {
            handleTrajectoryDataAvailable({ trajectory, robotId });
          }
        } catch (error) {
          // error
        }
      }
    };

    const handleTrajectoryDataAvailable = async (data) => {
      const { trajectory, robotId } = data;
      if (activePlaybackRef.current?.robotId !== robotId) return;
      if (!trajectory || !trajectory.endEffectorPath || trajectory.endEffectorPath.length < 2) return;
      storedTrajectoryRef.current = trajectory;
      const visualization = createTrajectoryVisualization(trajectory.endEffectorPath);
      if (!visualization || !visualization.smoothPoints) return;
      const scene = getScene();
      if (!scene) return;
      createFullVisualization(trajectory, visualization, scene, robotId);
    };

    const createFullVisualization = (trajectory, visualization, scene, robotId) => {
      const points = visualization.smoothPoints.map(p => new THREE.Vector3(p.x, p.y, p.z));
      const colors = [];
      visualization.colors.forEach(color => {
        colors.push(color.r, color.g, color.b);
      });
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      const material = new THREE.LineBasicMaterial({ vertexColors: true, linewidth: 3, opacity: 0.9, transparent: true });
      const line = new THREE.Line(geometry, material);
      line.name = `playback_trajectory_line_${robotId}`;
      scene.add(line);
      lineRef.current = line;
      if (visualization.waypoints) {
        visualization.waypoints.forEach((waypoint, index) => {
          const sphereGeometry = new THREE.SphereGeometry(0.01, 8, 8);
          const sphereMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(index / visualization.waypoints.length, 1, 0.5) });
          const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
          sphere.name = `waypoint_sphere_${robotId}_${index}`;
          sphere.position.set(waypoint.position.x, waypoint.position.y, waypoint.position.z);
          scene.add(sphere);
          waypointsRef.current.push(sphere);
        });
      }
      createOrientationFrames(trajectory, scene, robotId);
      const markerGeometry = new THREE.SphereGeometry(0.025, 16, 16);
      const markerMaterial = new THREE.MeshPhongMaterial({ color: 0xffff00, emissive: 0xffff00, emissiveIntensity: 0.5 });
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.name = `trajectory_marker_${robotId}`;
      if (points.length > 0) marker.position.copy(points[0]);
      scene.add(marker);
      currentMarkerRef.current = marker;
    };

    const createOrientationFrames = (trajectory, scene, robotId) => {
      if (!scene) return;
      const endEffectorPath = trajectory.endEffectorPath;
      if (!endEffectorPath || !Array.isArray(endEffectorPath) || endEffectorPath.length < 2) return;
      const hasOrientationData = endEffectorPath.some(point => point && point.orientation && typeof point.orientation.x === 'number' && typeof point.orientation.y === 'number' && typeof point.orientation.z === 'number' && typeof point.orientation.w === 'number');
      const totalPoints = endEffectorPath.length;
      const desiredFrameCount = 20;
      const frameInterval = Math.max(1, Math.floor(totalPoints / desiredFrameCount));
      orientationFramesRef.current.forEach(frameGroup => {
        scene.remove(frameGroup);
        frameGroup.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
        });
      });
      orientationFramesRef.current = [];
      const calculateOrientationFromPath = (index) => {
        if (index >= totalPoints - 1) return calculateOrientationFromPath(index - 1);
        const current = endEffectorPath[index].position;
        const next = endEffectorPath[index + 1].position;
        const direction = new THREE.Vector3(next.x - current.x, next.y - current.y, next.z - current.z);
        direction.normalize();
        const up = new THREE.Vector3(0, 1, 0);
        if (Math.abs(direction.y) > 0.999) up.set(1, 0, 0);
        const matrix = new THREE.Matrix4();
        matrix.lookAt(new THREE.Vector3(0, 0, 0), direction, up);
        const quaternion = new THREE.Quaternion();
        quaternion.setFromRotationMatrix(matrix);
        return quaternion;
      };
      for (let i = 0; i < totalPoints; i += frameInterval) {
        const pathPoint = endEffectorPath[i];
        if (!pathPoint || !pathPoint.position || typeof pathPoint.position.x !== 'number' || typeof pathPoint.position.y !== 'number' || typeof pathPoint.position.z !== 'number') continue;
        const frameGroup = new THREE.Group();
        frameGroup.name = `orientation_frame_${robotId}_${i}`;
        frameGroup.position.set(pathPoint.position.x, pathPoint.position.y, pathPoint.position.z);
        let quaternion;
        if (hasOrientationData && pathPoint.orientation && typeof pathPoint.orientation.x === 'number' && typeof pathPoint.orientation.y === 'number' && typeof pathPoint.orientation.z === 'number' && typeof pathPoint.orientation.w === 'number') {
          quaternion = new THREE.Quaternion(pathPoint.orientation.x, pathPoint.orientation.y, pathPoint.orientation.z, pathPoint.orientation.w);
          quaternion.normalize();
        } else {
          quaternion = calculateOrientationFromPath(i);
        }
        frameGroup.quaternion.copy(quaternion);
        const axisLength = 0.05;
        const axisThickness = 1.5;
        const xDir = new THREE.Vector3(1, 0, 0);
        const xOrigin = new THREE.Vector3(0, 0, 0);
        const xArrow = new THREE.ArrowHelper(xDir, xOrigin, axisLength, 0xff0000, axisLength * 0.3, axisLength * 0.2);
        xArrow.line.material.linewidth = axisThickness;
        frameGroup.add(xArrow);
        const yDir = new THREE.Vector3(0, 1, 0);
        const yArrow = new THREE.ArrowHelper(yDir, xOrigin, axisLength, 0x00ff00, axisLength * 0.3, axisLength * 0.2);
        yArrow.line.material.linewidth = axisThickness;
        frameGroup.add(yArrow);
        const zDir = new THREE.Vector3(0, 0, 1);
        const zArrow = new THREE.ArrowHelper(zDir, xOrigin, axisLength, 0x0000ff, axisLength * 0.3, axisLength * 0.2);
        zArrow.line.material.linewidth = axisThickness;
        frameGroup.add(zArrow);
        scene.add(frameGroup);
        orientationFramesRef.current.push(frameGroup);
      }
      if (scene.parent && scene.parent.type === 'Scene') {
        scene.updateMatrixWorld(true);
      }
    };

    const handleEndEffectorUpdate = (data) => {
      if (!currentMarkerRef.current || !data.endEffectorPoint) return;
      const { x, y, z } = data.endEffectorPoint;
      currentMarkerRef.current.position.set(x, y, z);
    };

    const handlePlaybackStopped = () => {
      if (activeRobotIdRef.current) {
        cleanup(activeRobotIdRef.current);
      } else {
        const scene = getScene();
        if (scene) {
          const allVisObjects = scene.children.filter(child =>
            child.name.startsWith('playback_trajectory_line_') ||
            child.name.startsWith('waypoint_sphere_') ||
            child.name.startsWith('orientation_frame_') ||
            child.name.startsWith('trajectory_marker_')
          );
          allVisObjects.forEach(obj => {
            scene.remove(obj);
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
            if (obj.isGroup) {
              obj.children.forEach(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
              });
            }
          });
        }
      }
    };

    const cleanup = (targetRobotId) => {
      const scene = getScene();
      if (!scene) return;
      const objectsToRemove = [];
      scene.children.forEach(child => {
        if (child.name.startsWith(`playback_trajectory_line_${targetRobotId}`) ||
            child.name.startsWith(`waypoint_sphere_${targetRobotId}`) ||
            child.name.startsWith(`orientation_frame_${targetRobotId}`) ||
            child.name.startsWith(`trajectory_marker_${targetRobotId}`)) {
          objectsToRemove.push(child);
        }
      });
      objectsToRemove.forEach(obj => {
        scene.remove(obj);
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
        if (obj.isGroup) {
          obj.children.forEach(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
          });
        }
      });
      if (lineRef.current?.name?.startsWith(`playback_trajectory_line_${targetRobotId}`)) {
        lineRef.current = null;
      }
      waypointsRef.current = waypointsRef.current.filter(wp => !wp.name.startsWith(`waypoint_sphere_${targetRobotId}`));
      orientationFramesRef.current = orientationFramesRef.current.filter(of => !of.name.startsWith(`orientation_frame_${targetRobotId}`));
      if (currentMarkerRef.current?.name?.startsWith(`trajectory_marker_${targetRobotId}`)) {
        currentMarkerRef.current = null;
      }
      if (activeRobotIdRef.current === targetRobotId) {
        activePlaybackRef.current = null;
        storedTrajectoryRef.current = null;
        activeRobotIdRef.current = null;
      }
    };

    const unsubscribes = [
      EventBus.on('trajectory:playback-started', handlePlaybackStarted),
      EventBus.on('tcp:endeffector-updated', handleEndEffectorUpdate),
      EventBus.on('trajectory:playback-stopped', handlePlaybackStopped),
      EventBus.on('trajectory:playback-completed', handlePlaybackStopped)
    ];

    return () => {
      unsubscribes.forEach(unsub => unsub());
      if (activeRobotIdRef.current) {
        cleanup(activeRobotIdRef.current);
      }
    };
  }, [isViewerReady, getScene, loadTrajectory, createTrajectoryVisualization, getRobotInfo, robotId]);

  return null;
};

export default useTrajectory;