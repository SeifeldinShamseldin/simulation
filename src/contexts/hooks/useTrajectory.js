// src/contexts/hooks/useTrajectory.js - Direct File System Hook
import { useCallback, useState, useEffect } from 'react';
import { useTrajectoryContext } from '../TrajectoryContext';
import { useRobotSelection } from './useRobotManager';
import EventBus from '../../utils/EventBus';

export const useTrajectory = (robotId = null) => {
  const context = useTrajectoryContext();
  const { activeId: activeRobotId } = useRobotSelection();
  
  // Use provided robotId or fall back to active robot
  const targetRobotId = robotId || activeRobotId;
  
  // Local state for UI feedback
  const [lastRecordedFrame, setLastRecordedFrame] = useState(null);
  const [playbackStatus, setPlaybackStatus] = useState({ 
    isPlaying: false, 
    progress: 0,
    currentPosition: null 
  });
  const [recordingState, setRecordingState] = useState({
    isRecording: false,
    trajectoryName: null,
    frameCount: 0,
    startTime: null
  });

  // ========== EVENT LISTENERS FOR UI UPDATES ==========
  useEffect(() => {
    if (!targetRobotId) return;

    // Listen for recording updates
    const handleFrameRecorded = (data) => {
      if (data.robotId === targetRobotId) {
        setLastRecordedFrame({
          timestamp: Date.now(),
          frameCount: data.frameCount,
          hasEndEffector: data.hasEndEffector
        });
        
        // Update recording state
        setRecordingState(prev => ({
          ...prev,
          frameCount: data.frameCount
        }));
      }
    };

    // Listen for recording state changes
    const handleRecordingStarted = (data) => {
      if (data.robotId === targetRobotId) {
        setRecordingState({
          isRecording: true,
          trajectoryName: data.trajectoryName,
          frameCount: 0,
          startTime: Date.now()
        });
        setLastRecordedFrame(null);
      }
    };

    const handleRecordingStopped = (data) => {
      if (data.robotId === targetRobotId) {
        setRecordingState({
          isRecording: false,
          trajectoryName: null,
          frameCount: data.frameCount,
          startTime: null
        });
        setLastRecordedFrame(null);
      }
    };

    // Listen for playback updates
    const handleFramePlayed = (data) => {
      if (data.robotId === targetRobotId) {
        setPlaybackStatus(prev => ({
          ...prev,
          progress: data.progress
        }));
      }
    };

    const handlePlaybackStarted = (data) => {
      if (data.robotId === targetRobotId) {
        setPlaybackStatus({
          isPlaying: true,
          progress: 0,
          currentPosition: null
        });
      }
    };

    const handlePlaybackStopped = (data) => {
      if (data.robotId === targetRobotId) {
        setPlaybackStatus({
          isPlaying: false,
          progress: 0,
          currentPosition: null
        });
      }
    };

    const unsubscribes = [
      EventBus.on('trajectory:frame-recorded', handleFrameRecorded),
      EventBus.on('trajectory:recording-started', handleRecordingStarted),
      EventBus.on('trajectory:recording-stopped', handleRecordingStopped),
      EventBus.on('trajectory:frame-played', handleFramePlayed),
      EventBus.on('trajectory:playback-started', handlePlaybackStarted),
      EventBus.on('trajectory:playback-stopped', handlePlaybackStopped),
      EventBus.on('trajectory:playback-completed', handlePlaybackStopped)
    ];

    return () => unsubscribes.forEach(unsub => unsub());
  }, [targetRobotId]);

  // ========== RECORDING METHODS ==========
  const startRecording = useCallback((trajectoryName, options = {}) => {
    if (!targetRobotId) {
      console.warn('[useTrajectory] No robot ID available for recording');
      return false;
    }

    console.log(`[useTrajectory] Starting recording "${trajectoryName}" for robot ${targetRobotId}`);
    
    // Request initial state before starting recording
    EventBus.emit('trajectory:request-state', { robotId: targetRobotId });
    
    // Start recording with context
    const success = context.startRecording(trajectoryName, targetRobotId, options);
    
    if (success) {
      // Update local state
      setRecordingState({
        isRecording: true,
        trajectoryName,
        frameCount: 0,
        startTime: Date.now()
      });
    }
    
    return success;
  }, [targetRobotId, context]);

  const stopRecording = useCallback(async () => {
    if (!targetRobotId) return null;
    
    const trajectory = await context.stopRecording(targetRobotId);
    
    if (trajectory) {
      console.log(`[useTrajectory] Recording completed: ${trajectory.frameCount} frames`);
    }
    
    return trajectory;
  }, [targetRobotId, context]);

  const isRecording = useCallback(() => {
    return recordingState.isRecording;
  }, [recordingState.isRecording]);

  // ========== PLAYBACK METHODS ==========
  const playTrajectory = useCallback((trajectoryInfo, options = {}) => {
    if (!targetRobotId) {
      console.warn('[useTrajectory] No robot ID available for playback');
      return false;
    }

    console.log(`[useTrajectory] Playing trajectory "${trajectoryInfo.name}" for robot ${targetRobotId}`);
    
    // Enhance options with local callbacks
    const enhancedOptions = {
      ...options,
      onFrame: (frame, endEffectorFrame, progress) => {
        // Update local state
        if (endEffectorFrame && endEffectorFrame.position) {
          setPlaybackStatus(prev => ({
            ...prev,
            currentPosition: endEffectorFrame.position
          }));
        }
        
        // Call original callback if provided
        if (options.onFrame) {
          options.onFrame(frame, endEffectorFrame, progress);
        }
      }
    };
    
    return context.playTrajectory(trajectoryInfo, targetRobotId, enhancedOptions);
  }, [targetRobotId, context]);

  const stopPlayback = useCallback(() => {
    if (!targetRobotId) return false;
    
    return context.stopPlayback(targetRobotId);
  }, [targetRobotId, context]);

  const isPlaying = useCallback(() => {
    if (!targetRobotId) return false;
    return context.isPlaying(targetRobotId);
  }, [targetRobotId, context]);

  const getPlaybackProgress = useCallback(() => {
    if (!targetRobotId) return 0;
    return context.getPlaybackProgress(targetRobotId);
  }, [targetRobotId, context]);

  // ========== TRAJECTORY MANAGEMENT ==========
  const getTrajectories = useCallback(() => {
    if (!targetRobotId) return [];
    return context.getRobotTrajectories(targetRobotId);
  }, [targetRobotId, context]);

  const deleteTrajectory = useCallback((manufacturer, model, name) => {
    return context.deleteTrajectory(manufacturer, model, name);
  }, [context]);

  const analyzeTrajectory = useCallback((trajectoryInfo) => {
    return context.analyzeTrajectory(trajectoryInfo);
  }, [context]);

  // ========== RETURN INTERFACE ==========
  return {
    // Robot identification
    robotId: targetRobotId,
    
    // Recording
    isRecording: isRecording(),
    startRecording,
    stopRecording,
    lastRecordedFrame,
    recordingState,
    
    // Playback
    isPlaying: isPlaying(),
    playbackStatus,
    playTrajectory,
    stopPlayback,
    progress: getPlaybackProgress(),
    
    // Trajectory management
    trajectories: getTrajectories(),
    deleteTrajectory,
    count: getTrajectories().length,
    hasTrajectories: getTrajectories().length > 0,
    
    // Analysis
    analyzeTrajectory,
    
    // File System Operations
    availableTrajectories: context.availableTrajectories,
    isScanning: context.isScanning,
    scanTrajectories: context.scanTrajectories,
    
    // Context state
    isLoading: context.isLoading,
    error: context.error,
    clearError: context.clearError,
    
    // State checks
    canRecord: !!targetRobotId,
    canPlay: !!targetRobotId,
    isReady: !!targetRobotId
  };
};

// ========== SPECIALIZED HOOKS ==========

export const useTrajectoryRecording = (robotId = null) => {
  const trajectory = useTrajectory(robotId);
  
  return {
    robotId: trajectory.robotId,
    isRecording: trajectory.isRecording,
    startRecording: trajectory.startRecording,
    stopRecording: trajectory.stopRecording,
    lastRecordedFrame: trajectory.lastRecordedFrame,
    recordingState: trajectory.recordingState,
    canRecord: trajectory.canRecord
  };
};

export const useTrajectoryPlayback = (robotId = null) => {
  const trajectory = useTrajectory(robotId);
  
  return {
    robotId: trajectory.robotId,
    isPlaying: trajectory.isPlaying,
    playbackStatus: trajectory.playbackStatus,
    playTrajectory: trajectory.playTrajectory,
    stopPlayback: trajectory.stopPlayback,
    progress: trajectory.progress,
    canPlay: trajectory.canPlay
  };
};

export const useTrajectoryManagement = (robotId = null) => {
  const trajectory = useTrajectory(robotId);
  
  return {
    robotId: trajectory.robotId,
    trajectories: trajectory.trajectories,
    deleteTrajectory: trajectory.deleteTrajectory,
    analyzeTrajectory: trajectory.analyzeTrajectory,
    hasTrajectories: trajectory.hasTrajectories,
    count: trajectory.count,
    scanTrajectories: trajectory.scanTrajectories,
    isScanning: trajectory.isScanning
  };
};

export default useTrajectory;