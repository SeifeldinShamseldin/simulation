// src/contexts/hooks/useTrajectory.js - Direct File System Hook
import { useState, useCallback, useRef, useEffect } from 'react';
import { useJoints } from './useJoints';
import { useTCP } from './useTCP';
import { useRobotManager } from './useRobotManager';
import EventBus from '../../utils/EventBus';

export const useTrajectory = (robotId = null) => {
  const { getJointValues, setJointValues, isAnimating } = useJoints(robotId);
  const { currentEndEffectorPoint, currentEndEffectorOrientation } = useTCP(robotId);
  const { getRobotById, categories } = useRobotManager();
  
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
  const lastFrameTimeRef = useRef(0);
  const playbackStateRef = useRef(null);
  const animationFrameRef = useRef(null);
  
  // ========== ROBOT INFO HELPER ==========  
  const getRobotInfo = useCallback((robotId) => {
    if (!robotId) return { manufacturer: 'unknown', model: 'unknown' };
    
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
    
    return { manufacturer, model };
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
        console.log(`[useTrajectory] Found ${result.trajectories?.length || 0} trajectories`);
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
  
  const getRobotTrajectories = useCallback(() => {
    if (!robotId) return [];
    
    const { manufacturer, model } = getRobotInfo(robotId);
    
    return availableTrajectories.filter(traj => 
      traj.manufacturer === manufacturer && traj.model === model
    );
  }, [availableTrajectories, robotId, getRobotInfo]);
  
  // ========== RECORDING IMPLEMENTATION ==========  
  useEffect(() => {
    if (!isRecording || !robotId) return;
    
    const handleJointChange = (data) => {
      if (data.robotId !== robotId) return;
      
      const currentTime = Date.now();
      const elapsed = currentTime - recordingDataRef.current.startTime;
      
      // Throttle to ~60fps
      if (currentTime - lastFrameTimeRef.current < 16) return;
      
      const jointValues = data.values || getJointValues();
      
      // Record frame
      recordingDataRef.current.frames.push({
        timestamp: elapsed,
        jointValues: { ...jointValues }
      });
      
      // Record end effector if available
      if (currentEndEffectorPoint.x !== 0 || 
          currentEndEffectorPoint.y !== 0 || 
          currentEndEffectorPoint.z !== 0) {
        recordingDataRef.current.endEffectorPath.push({
          timestamp: elapsed,
          position: { ...currentEndEffectorPoint },
          orientation: { ...currentEndEffectorOrientation }
        });
      }
      
      lastFrameTimeRef.current = currentTime;
      setFrameCount(recordingDataRef.current.frames.length);
      
      console.log(`[useTrajectory] Recorded frame ${recordingDataRef.current.frames.length} for ${robotId}`);
      
      // Emit frame recorded event
      EventBus.emit('trajectory:frame-recorded', {
        robotId,
        frameCount: recordingDataRef.current.frames.length,
        hasEndEffector: recordingDataRef.current.endEffectorPath.length > 0
      });
    };
    
    const unsubscribe = EventBus.on('robot:joints-changed', handleJointChange);
    return () => unsubscribe();
  }, [isRecording, robotId, getJointValues, currentEndEffectorPoint, currentEndEffectorOrientation]);
  
  const startRecording = useCallback((name) => {
    if (!robotId || isRecording) return false;
    
    console.log(`[useTrajectory] Starting recording "${name}" for robot ${robotId}`);
    
    // Get initial state, ensuring getJointValues is a function
    const initialJoints = typeof getJointValues === 'function' ? getJointValues() : {};
    
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
    lastFrameTimeRef.current = Date.now();
    
    // Emit recording started event
    EventBus.emit('trajectory:recording-started', {
      robotId,
      trajectoryName: name
    });
    
    return true;
  }, [robotId, isRecording, getJointValues, currentEndEffectorPoint, currentEndEffectorOrientation]);
  
  const stopRecording = useCallback(async () => {
    if (!isRecording) return null;
    
    setIsRecording(false);
    
    const trajectory = {
      ...recordingDataRef.current,
      duration: Date.now() - recordingDataRef.current.startTime,
      frameCount: recordingDataRef.current.frames.length,
      recordedAt: new Date().toISOString()
    };
    
    console.log(`[useTrajectory] Stopped recording with ${trajectory.frameCount} frames`);
    
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
      
      console.log(`[useTrajectory] Saved trajectory "${trajectory.name}"`);
      
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
    if (!robotId || isPlaying || isAnimating) {
      console.warn('[useTrajectory] Cannot play - robot busy or not ready');
      return false;
    }
    
    const trajectory = await loadTrajectory(
      trajectoryInfo.manufacturer,
      trajectoryInfo.model,
      trajectoryInfo.name
    );
    
    if (!trajectory || !trajectory.frames || trajectory.frames.length === 0) {
      console.error('[useTrajectory] Invalid trajectory');
      return false;
    }
    
    const { speed = 1.0, loop = false, onComplete = () => {}, onFrame = () => {} } = options;
    
    console.log(`[useTrajectory] Starting playback of "${trajectory.name}" for ${robotId}`);
    
    // Initialize playback state
    playbackStateRef.current = {
      trajectory,
      startTime: Date.now(),
      speed,
      loop,
      onComplete,
      onFrame,
      frameIndex: 0,
      isPlaying: true
    };
    
    setIsPlaying(true);
    setCurrentTrajectory(trajectory);
    setProgress(0);
    
    // Emit playback started event
    EventBus.emit('trajectory:playback-started', {
      robotId,
      trajectoryName: trajectory.name,
      frameCount: trajectory.frameCount
    });
    
    // Start playback loop
    const playFrame = () => {
      const state = playbackStateRef.current;
      if (!state || !state.isPlaying) {
        console.log('[useTrajectory] Playback stopped');
        return;
      }
      
      const elapsed = (Date.now() - state.startTime) * state.speed;
      const progress = Math.min(elapsed / state.trajectory.duration, 1);
      
      // Find current frame
      let frameIndex = 0;
      for (let i = 0; i < state.trajectory.frames.length; i++) {
        if (state.trajectory.frames[i].timestamp <= elapsed) {
          frameIndex = i;
        } else {
          break;
        }
      }
      
      // Apply frame if changed
      if (frameIndex !== state.frameIndex && frameIndex < state.trajectory.frames.length) {
        const frame = state.trajectory.frames[frameIndex];
        const endEffectorFrame = state.trajectory.endEffectorPath?.[frameIndex];
        
        // Apply joint values
        const success = setJointValues(frame.jointValues);
        if (success) {
          console.log(`[useTrajectory] Applied frame ${frameIndex}/${state.trajectory.frames.length}`);
          state.frameIndex = frameIndex;
          
          // Update playback end effector state
          if (endEffectorFrame) {
            setPlaybackEndEffectorPoint(endEffectorFrame.position);
            setPlaybackEndEffectorOrientation(endEffectorFrame.orientation);
          } else {
            setPlaybackEndEffectorPoint({ x: 0, y: 0, z: 0 });
            setPlaybackEndEffectorOrientation({ x: 0, y: 0, z: 0, w: 1 });
          }
          
          // Call frame callback
          state.onFrame(frame, endEffectorFrame, progress);
          
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
      
      setProgress(progress);
      
      // Check completion
      if (progress >= 1) {
        if (state.loop) {
          // Reset for loop
          state.startTime = Date.now();
          state.frameIndex = 0;
          setProgress(0);
        } else {
          // Complete
          stopPlayback();
          state.onComplete();
          
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
  }, [robotId, isPlaying, isAnimating, setJointValues, loadTrajectory]);
  
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
    
    console.log('[useTrajectory] Playback stopped');
  }, [robotId, currentTrajectory]);
  
  const deleteTrajectory = useCallback(async (manufacturer, model, name) => {
    try {
      const response = await fetch(`/api/trajectory/delete/${manufacturer}/${model}/${name}`, {
        method: 'DELETE'
      });
      
      const result = await response.json();
      
      if (result.success) {
        console.log(`[useTrajectory] Deleted trajectory: ${name}`);
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
  
  // Initialize by scanning trajectories
  useEffect(() => {
    scanTrajectories();
  }, [scanTrajectories]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);
  
  return {
    // Robot identification
    robotId,
    
    // Recording state
    isRecording,
    recordingName,
    frameCount,
    
    // Playback state
    isPlaying,
    progress,
    currentTrajectory,
    playbackEndEffectorPoint,
    playbackEndEffectorOrientation,
    
    // File system state
    availableTrajectories,
    trajectories: getRobotTrajectories(),
    isScanning,
    
    // Recording methods
    startRecording,
    stopRecording,
    
    // Playback methods
    playTrajectory,
    stopPlayback,
    
    // File system methods
    scanTrajectories,
    deleteTrajectory,
    
    // Info
    canRecord: !!robotId && !isPlaying,
    canPlay: !!robotId && !isAnimating && !isRecording,
    hasFrames: frameCount > 0,
    hasTrajectories: getRobotTrajectories().length > 0,
    count: getRobotTrajectories().length,
    
    // Error handling
    error,
    clearError: () => setError(null)
  };
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
    isScanning: trajectory.isScanning
  };
};

export default useTrajectory;