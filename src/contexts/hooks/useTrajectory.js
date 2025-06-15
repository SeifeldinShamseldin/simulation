// src/contexts/hooks/useTrajectory.js - SIMPLIFIED FOR NEW ARCHITECTURE
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
      EventBus.on('trajectory:frame-played', handleFramePlayed),
      EventBus.on('trajectory:playback-started', handlePlaybackStarted),
      EventBus.on('trajectory:playback-stopped', handlePlaybackStopped),
      EventBus.on('trajectory:playback-completed', handlePlaybackStopped),
      EventBus.on('trajectory:recording-started', () => setLastRecordedFrame(null)),
      EventBus.on('trajectory:recording-stopped', () => setLastRecordedFrame(null))
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
    
    return context.startRecording(trajectoryName, targetRobotId, options);
  }, [targetRobotId, context]);

  const stopRecording = useCallback(() => {
    if (!targetRobotId) return null;
    
    return context.stopRecording(targetRobotId);
  }, [targetRobotId, context]);

  const isRecording = useCallback(() => {
    if (!targetRobotId) return false;
    return context.isRecording(targetRobotId);
  }, [targetRobotId, context]);

  // ========== PLAYBACK METHODS ==========
  const playTrajectory = useCallback((trajectoryName, options = {}) => {
    if (!targetRobotId) {
      console.warn('[useTrajectory] No robot ID available for playback');
      return false;
    }

    console.log(`[useTrajectory] Playing trajectory "${trajectoryName}" for robot ${targetRobotId}`);
    
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
    
    return context.playTrajectory(trajectoryName, targetRobotId, enhancedOptions);
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
    return context.getTrajectoryNames(targetRobotId);
  }, [targetRobotId, context]);

  const getTrajectory = useCallback((trajectoryName) => {
    if (!targetRobotId) return null;
    return context.getTrajectory(trajectoryName, targetRobotId);
  }, [targetRobotId, context]);

  const deleteTrajectory = useCallback((trajectoryName) => {
    if (!targetRobotId) return false;
    return context.deleteTrajectory(trajectoryName, targetRobotId);
  }, [targetRobotId, context]);

  const exportTrajectory = useCallback((trajectoryName) => {
    if (!targetRobotId) return null;
    return context.exportTrajectory(trajectoryName, targetRobotId);
  }, [targetRobotId, context]);

  const importTrajectory = useCallback((jsonData) => {
    if (!targetRobotId) return null;
    return context.importTrajectory(jsonData, targetRobotId);
  }, [targetRobotId, context]);

  const analyzeTrajectory = useCallback((trajectoryName) => {
    if (!targetRobotId) return null;
    return context.analyzeTrajectory(trajectoryName, targetRobotId);
  }, [targetRobotId, context]);

  // ========== RETURN INTERFACE ==========
  return {
    // Robot identification
    robotId: targetRobotId,
    
    // Recording
    isRecording: isRecording(),
    startRecording,
    stopRecording,
    lastRecordedFrame,
    
    // Playback
    isPlaying: isPlaying(),
    playbackStatus,
    playTrajectory,
    stopPlayback,
    progress: getPlaybackProgress(),
    
    // Trajectory management
    trajectories: getTrajectories(),
    getTrajectory,
    deleteTrajectory,
    hasTrajectories: context.hasTrajectories(targetRobotId),
    count: context.getTrajectoryCount(targetRobotId),
    
    // Import/Export
    exportTrajectory,
    importTrajectory,
    
    // Analysis
    analyzeTrajectory,
    
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

// ========== SPECIALIZED HOOKS (simplified) ==========

export const useTrajectoryRecording = (robotId = null) => {
  const trajectory = useTrajectory(robotId);
  
  return {
    robotId: trajectory.robotId,
    isRecording: trajectory.isRecording,
    startRecording: trajectory.startRecording,
    stopRecording: trajectory.stopRecording,
    lastRecordedFrame: trajectory.lastRecordedFrame,
    canRecord: trajectory.canRecord,
    // Simplified - no need for current state since TrajectoryContext handles it
    currentState: null
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
    currentPosition: trajectory.playbackStatus.currentPosition,
    canPlay: trajectory.canPlay
  };
};

export const useTrajectoryManagement = (robotId = null) => {
  const trajectory = useTrajectory(robotId);
  
  return {
    robotId: trajectory.robotId,
    trajectories: trajectory.trajectories,
    getTrajectory: trajectory.getTrajectory,
    deleteTrajectory: trajectory.deleteTrajectory,
    hasTrajectories: trajectory.hasTrajectories,
    count: trajectory.count,
    exportTrajectory: trajectory.exportTrajectory,
    importTrajectory: trajectory.importTrajectory,
    analyzeTrajectory: trajectory.analyzeTrajectory
  };
};

export default useTrajectory;