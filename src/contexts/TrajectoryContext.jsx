// TrajectoryContext.jsx - Optimized version

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import EventBus from '../utils/EventBus';
import { useRobotContext } from './RobotContext';
import { debugTrajectory } from '../utils/DebugSystem';

const TrajectoryContext = createContext(null);

export const TrajectoryProvider = ({ children }) => {
  // Get robot context
  const { 
    workspaceRobot: robotId, 
    getWorkspaceRobot,
    loadedRobots,
    isViewerReady,
    isRobotReady
  } = useRobotContext();
  
  // State
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [recordingName, setRecordingName] = useState('');
  const [frameCount, setFrameCount] = useState(0);
  const [progress, setProgress] = useState(0);
  const [currentTrajectory, setCurrentTrajectory] = useState(null);
  const [availableTrajectories, setAvailableTrajectories] = useState([]);
  const [error, setError] = useState(null);
  const [playbackEndEffectorPoint, setPlaybackEndEffectorPoint] = useState({ x: 0, y: 0, z: 0 });
  const [playbackEndEffectorOrientation, setPlaybackEndEffectorOrientation] = useState({ x: 0, y: 0, z: 0, w: 1 });
  const [currentEndEffectorPoint, setCurrentEndEffectorPoint] = useState({ x: 0, y: 0, z: 0 });
  const [currentEndEffectorOrientation, setCurrentEndEffectorOrientation] = useState({ x: 0, y: 0, z: 0, w: 1 });

  // Refs
  const recordingStartTimeRef = useRef(0);
  const frameCountRef = useRef(0);
  const frameBufferRef = useRef([]);
  const endEffectorBufferRef = useRef([]);
  const playbackStateRef = useRef(null);

  /**
   * Get robot info from loaded robots
   */
  const getRobotInfo = useCallback(() => {
    if (!robotId || !loadedRobots) return null;
    
    const robot = loadedRobots.find(r => r.id === robotId);
    if (!robot) return null;
    
    return {
      robotId: robot.id,
      robotName: robot.name,
      manufacturer: robot.manufacturer?.toLowerCase() || 'unknown',
      model: robot.robotId || robot.model || 'unknown'
    };
  }, [robotId, loadedRobots]);

  /**
   * Build trajectory info for API calls
   */
  const buildTrajectoryInfo = useCallback((name) => {
    const robotInfo = getRobotInfo();
    if (!robotInfo) return null;
    
    return {
      manufacturer: robotInfo.manufacturer,
      model: robotInfo.model,
      name
    };
  }, [getRobotInfo]);

  /**
   * Scan available trajectories
   */
  const scanTrajectories = useCallback(async () => {
    const robotInfo = getRobotInfo();
    if (!robotInfo) {
      setAvailableTrajectories([]);
      return;
    }

    setIsScanning(true);
    setError(null);

    try {
      const response = await fetch(`/api/trajectory/scan?manufacturer=${robotInfo.manufacturer}&model=${robotInfo.model}`);
      const result = await response.json();
      
      if (result.success) {
        setAvailableTrajectories(result.trajectories || []);
        debugTrajectory(`[TrajectoryContext] Found ${result.trajectories?.length || 0} trajectories for ${robotInfo.manufacturer} ${robotInfo.model}`);
      } else {
        throw new Error(result.message || 'Failed to scan trajectories');
      }
    } catch (error) {
      console.error('[TrajectoryContext] Scan error:', error);
      setError(error.message);
      setAvailableTrajectories([]);
    } finally {
      setIsScanning(false);
    }
  }, [getRobotInfo]);

  /**
   * Load trajectory data
   */
  const loadTrajectory = useCallback(async (trajectoryInfo) => {
    try {
      const response = await fetch('/api/trajectory/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trajectoryInfo })
      });

      const result = await response.json();
      if (result.success) {
        return result.trajectory;
      }
      throw new Error(result.message || 'Failed to load trajectory');
    } catch (error) {
      console.error('[TrajectoryContext] Load error:', error);
      setError(error.message);
      return null;
    }
  }, []);

  /**
   * Start recording
   */
  const startRecording = useCallback(async (name) => {
    if (!robotId || isRecording || isPlaying) return false;
    
    debugTrajectory('[TrajectoryContext] Starting recording:', name);
    
    setRecordingName(name);
    setIsRecording(true);
    setFrameCount(0);
    setError(null);
    
    // Reset buffers
    frameBufferRef.current = [];
    endEffectorBufferRef.current = [];
    frameCountRef.current = 0;
    recordingStartTimeRef.current = Date.now();
    
    // Emit event
    EventBus.emit('trajectory:recording-started', { robotId, name });
    
    return true;
  }, [robotId, isRecording, isPlaying]);

  /**
   * Stop recording and save
   */
  const stopRecording = useCallback(async () => {
    if (!isRecording || !robotId) return null;
    
    const frames = [...frameBufferRef.current];
    const endEffectorPath = [...endEffectorBufferRef.current];
    const duration = Date.now() - recordingStartTimeRef.current;
    
    debugTrajectory('[TrajectoryContext] Stopping recording. Frames:', frames.length, 'Duration:', duration);

    // Get robot info
    const robotInfo = getRobotInfo();
    if (!robotInfo) {
      setError('No robot info available');
      setIsRecording(false);
      return null;
    }

    // Build trajectory info
    const trajectoryInfo = buildTrajectoryInfo(recordingName);
    if (!trajectoryInfo) {
      setError('Failed to build trajectory info');
      setIsRecording(false);
      return null;
    }

    // Create trajectory data
    const trajectoryData = {
      frames,
      endEffectorPath,
      frameCount: frames.length,
      duration,
      metadata: {
        robotId: robotInfo.robotId,
        robotName: robotInfo.robotName,
        manufacturer: robotInfo.manufacturer,
        model: robotInfo.model,
        recordedAt: new Date().toISOString(),
        version: '1.0'
      }
    };

    try {
      const response = await fetch('/api/trajectory/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trajectoryInfo,
          trajectoryData
        })
      });

      const result = await response.json();
      if (result.success) {
        debugTrajectory('[TrajectoryContext] Trajectory saved successfully');
        await scanTrajectories();
        
        EventBus.emit('trajectory:recording-stopped', {
          robotId,
          name: recordingName,
          frameCount: frames.length,
          duration
        });
      } else {
        throw new Error(result.message || 'Failed to save trajectory');
      }
    } catch (error) {
      console.error('[TrajectoryContext] Save error:', error);
      setError(error.message);
    } finally {
      setIsRecording(false);
      setRecordingName('');
      setFrameCount(0);
    }

    return trajectoryData;
  }, [isRecording, robotId, recordingName, getRobotInfo, buildTrajectoryInfo, scanTrajectories]);

  /**
   * Delete trajectory
   */
  const deleteTrajectory = useCallback(async (trajectoryName) => {
    const trajectoryInfo = buildTrajectoryInfo(trajectoryName);
    if (!trajectoryInfo) {
      setError('No robot info available');
      return false;
    }

    try {
      const response = await fetch('/api/trajectory/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trajectoryInfo })
      });

      const result = await response.json();
      if (result.success) {
        await scanTrajectories();
        
        // Clear selected trajectory if it was deleted
        if (currentTrajectory?.name === trajectoryName) {
          setCurrentTrajectory(null);
        }
        
        return true;
      }
      throw new Error(result.message || 'Failed to delete trajectory');
    } catch (error) {
      console.error('[TrajectoryContext] Delete error:', error);
      setError(error.message);
      return false;
    }
  }, [buildTrajectoryInfo, scanTrajectories, currentTrajectory]);

  /**
   * Play trajectory
   */
  const playTrajectory = useCallback(async (trajectoryName) => {
    if (!robotId || isRecording || isPlaying) return false;

    const trajectoryInfo = buildTrajectoryInfo(trajectoryName);
    if (!trajectoryInfo) {
      setError('No robot info available');
      return false;
    }

    const trajectory = await loadTrajectory(trajectoryInfo);
    if (!trajectory) return false;

    debugTrajectory('[TrajectoryContext] Starting playback:', trajectoryName);
    
    setIsPlaying(true);
    setCurrentTrajectory(trajectory);
    setProgress(0);
    
    // Initialize playback state
    playbackStateRef.current = {
      isPlaying: true,
      startTime: Date.now(),
      frameIndex: 0,
      trajectory
    };

    // Start playback loop
    const playbackLoop = () => {
      if (!playbackStateRef.current?.isPlaying) return;
      
      const state = playbackStateRef.current;
      const elapsed = Date.now() - state.startTime;
      const progress = Math.min(elapsed / state.trajectory.duration, 1);
      
      setProgress(progress);
      
      // Find current frame
      const frameTime = elapsed;
      let frameIndex = 0;
      
      for (let i = 0; i < state.trajectory.frames.length; i++) {
        if (state.trajectory.frames[i].timestamp > frameTime) break;
        frameIndex = i;
      }
      
      // Apply frame
      const frame = state.trajectory.frames[frameIndex];
      if (frame) {
        EventBus.emit('trajectory:apply-frame', {
          robotId: state.trajectory.metadata?.robotId || robotId,
          joints: frame.joints,
          timestamp: frame.timestamp
        });
      }
      
      // Update end effector visualization
      if (state.trajectory.endEffectorPath && state.trajectory.endEffectorPath[frameIndex]) {
        const endEffector = state.trajectory.endEffectorPath[frameIndex];
        setPlaybackEndEffectorPoint(endEffector.position);
        setPlaybackEndEffectorOrientation(endEffector.orientation);
      }
      
      if (progress < 1) {
        requestAnimationFrame(playbackLoop);
      } else {
        stopPlayback();
        EventBus.emit('trajectory:playback-complete', { robotId, name: trajectoryName });
      }
    };
    
    requestAnimationFrame(playbackLoop);
    EventBus.emit('trajectory:playback-started', { robotId, name: trajectoryName });
    
    return true;
  }, [robotId, isRecording, isPlaying, buildTrajectoryInfo, loadTrajectory]);

  /**
   * Stop playback
   */
  const stopPlayback = useCallback(() => {
    if (playbackStateRef.current) {
      playbackStateRef.current.isPlaying = false;
      playbackStateRef.current = null;
    }
    
    setIsPlaying(false);
    setProgress(0);
    setCurrentTrajectory(null);
    setPlaybackEndEffectorPoint({ x: 0, y: 0, z: 0 });
    setPlaybackEndEffectorOrientation({ x: 0, y: 0, z: 0, w: 1 });
    
    EventBus.emit('trajectory:playback-stopped', { robotId });
  }, [robotId]);

  /**
   * Analyze trajectory
   */
  const analyzeTrajectory = useCallback(async (trajectoryName) => {
    const trajectoryInfo = buildTrajectoryInfo(trajectoryName);
    if (!trajectoryInfo) return null;

    try {
      const response = await fetch('/api/trajectory/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trajectoryInfo })
      });

      const result = await response.json();
      if (result.success) {
        return result.analysis;
      }
      return null;
    } catch (error) {
      console.error('[TrajectoryContext] Analyze error:', error);
      return null;
    }
  }, [buildTrajectoryInfo]);

  /**
   * Get trajectories for current robot
   */
  const getRobotTrajectories = useCallback(() => {
    return availableTrajectories;
  }, [availableTrajectories]);

  /**
   * Create trajectory visualization
   */
  const createTrajectoryVisualization = useCallback((trajectory) => {
    if (!trajectory?.endEffectorPath) return null;
    
    const points = trajectory.endEffectorPath.map(p => p.position);
    return {
      points,
      frameCount: trajectory.frames?.length || 0,
      duration: trajectory.duration || 0
    };
  }, []);

  /**
   * Calculate bounds
   */
  const calculateBounds = useCallback((trajectory) => {
    if (!trajectory?.endEffectorPath) return null;
    
    const bounds = new THREE.Box3();
    trajectory.endEffectorPath.forEach(point => {
      bounds.expandByPoint(new THREE.Vector3(
        point.position.x,
        point.position.y,
        point.position.z
      ));
    });
    
    return bounds;
  }, []);

  /**
   * Calculate camera position
   */
  const calculateCameraPosition = useCallback((bounds) => {
    if (!bounds) return null;
    
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = maxDim * 2.5;
    
    return {
      position: {
        x: center.x + distance,
        y: center.y + distance,
        z: center.z + distance
      },
      target: center
    };
  }, []);

  // Listen for joint changes during recording
  useEffect(() => {
    if (!isRecording || !robotId) return;

    const handleJointChange = ({ robotId: eventRobotId, joints, timestamp }) => {
      if (eventRobotId !== robotId) return;
      
      const elapsed = Date.now() - recordingStartTimeRef.current;
      
      frameBufferRef.current.push({
        timestamp: elapsed,
        joints: { ...joints }
      });
      
      frameCountRef.current++;
      setFrameCount(frameCountRef.current);
      
      // Record end effector position
      if (currentEndEffectorPoint.x !== 0 || 
          currentEndEffectorPoint.y !== 0 || 
          currentEndEffectorPoint.z !== 0) {
        endEffectorBufferRef.current.push({
          timestamp: elapsed,
          position: { ...currentEndEffectorPoint },
          orientation: { ...currentEndEffectorOrientation }
        });
      }

      EventBus.emit('trajectory:frame-recorded', {
        robotId,
        frameCount: frameCountRef.current,
        hasEndEffector: endEffectorBufferRef.current.length > 0
      });
    };

    const unsubscribe = EventBus.on('robot:joints-changed', handleJointChange);
    return () => unsubscribe();
  }, [isRecording, robotId, currentEndEffectorPoint, currentEndEffectorOrientation]);

  // Listen for end effector updates
  useEffect(() => {
    const handleEndEffectorUpdate = ({ position, orientation }) => {
      setCurrentEndEffectorPoint(position);
      setCurrentEndEffectorOrientation(orientation);
    };

    const unsubscribe = EventBus.on('robot:end-effector-updated', handleEndEffectorUpdate);
    return () => unsubscribe();
  }, []);

  // Scan trajectories on mount and when robot changes
  useEffect(() => {
    if (isViewerReady && robotId) {
      scanTrajectories();
    }
  }, [isViewerReady, robotId, scanTrajectories]);

  // Context value
  const value = {
    // State
    robotId,
    isRecording,
    isPlaying,
    isScanning,
    recordingName,
    frameCount,
    progress,
    currentTrajectory,
    availableTrajectories,
    error,
    playbackEndEffectorPoint,
    playbackEndEffectorOrientation,
    
    // Actions
    startRecording,
    stopRecording,
    playTrajectory,
    stopPlayback,
    scanTrajectories,
    loadTrajectory,
    deleteTrajectory,
    analyzeTrajectory,
    getRobotTrajectories,
    createTrajectoryVisualization,
    calculateBounds,
    calculateCameraPosition,
    getRobotInfo,
    
    // Computed
    canRecord: !!robotId && !isRecording && !isPlaying,
    canPlay: !!robotId && !isRecording && !isPlaying,
    hasFrames: frameCount > 0,
    hasTrajectories: availableTrajectories.length > 0,
    
    // Error handling
    clearError: () => setError(null),
    isRobotReady
  };

  return (
    <TrajectoryContext.Provider value={value}>
      {children}
    </TrajectoryContext.Provider>
  );
};

// Export hooks
export const useTrajectoryContext = () => {
  const context = useContext(TrajectoryContext);
  if (!context) {
    throw new Error('useTrajectoryContext must be used within TrajectoryProvider');
  }
  return context;
};

export const useTrajectoryRecording = () => {
  const context = useTrajectoryContext();
  return {
    isRecording: context.isRecording,
    startRecording: context.startRecording,
    stopRecording: context.stopRecording,
    recordingName: context.recordingName,
    frameCount: context.frameCount,
    canRecord: context.canRecord,
  };
};

export const useTrajectoryPlayback = () => {
  const context = useTrajectoryContext();
  return {
    isPlaying: context.isPlaying,
    playTrajectory: context.playTrajectory,
    stopPlayback: context.stopPlayback,
    progress: context.progress,
    currentTrajectory: context.currentTrajectory,
    playbackEndEffectorPoint: context.playbackEndEffectorPoint,
    canPlay: context.canPlay,
  };
};

export const useTrajectoryManagement = () => {
  const context = useTrajectoryContext();
  return {
    trajectories: context.getRobotTrajectories(),
    deleteTrajectory: context.deleteTrajectory,
    scanTrajectories: context.scanTrajectories,
    analyzeTrajectory: context.analyzeTrajectory,
    isScanning: context.isScanning,
    error: context.error,
    count: context.availableTrajectories.length,
    availableTrajectories: context.availableTrajectories,
  };
};

export const useTrajectoryVisualization = () => {
  const context = useTrajectoryContext();
  return {
    createTrajectoryVisualization: context.createTrajectoryVisualization,
    calculateBounds: context.calculateBounds,
    calculateCameraPosition: context.calculateCameraPosition,
  };
};

export default TrajectoryContext;