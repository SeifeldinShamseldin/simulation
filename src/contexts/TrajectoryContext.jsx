// src/contexts/TrajectoryContext.jsx - Core Trajectory Logic Context
import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { useJoints } from './hooks/useJoints';
import { useTCP } from './hooks/useTCP';
import { useRobotSelection } from './hooks/useRobot';
import EventBus from '../utils/EventBus';

const TrajectoryContext = createContext(null);

export const TrajectoryProvider = ({ children }) => {
  // Dependencies
  const { activeId: activeRobotId } = useRobotSelection();
  
  // State
  const [trajectories, setTrajectories] = useState(new Map()); // Map<robotId, Map<trajectoryName, trajectory>>
  const [recordingStates, setRecordingStates] = useState(new Map()); // Map<robotId, recordingState>
  const [playbackStates, setPlaybackStates] = useState(new Map()); // Map<robotId, playbackState>
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Refs for intervals and animation frames
  const recordingIntervalsRef = useRef(new Map()); // Map<robotId, intervalId>
  const playbackFramesRef = useRef(new Map()); // Map<robotId, animationFrameId>

  // ========== ROBOT-SPECIFIC TRAJECTORIES MANAGEMENT ==========
  
  const getRobotTrajectories = useCallback((robotId) => {
    if (!robotId) return new Map();
    if (!trajectories.has(robotId)) {
      setTrajectories(prev => new Map(prev).set(robotId, new Map()));
    }
    return trajectories.get(robotId) || new Map();
  }, [trajectories]);

  const getTrajectoryNames = useCallback((robotId) => {
    if (!robotId) return [];
    const robotTrajectories = getRobotTrajectories(robotId);
    return robotTrajectories ? Array.from(robotTrajectories.keys()) : [];
  }, [getRobotTrajectories]);

  const getTrajectory = useCallback((trajectoryName, robotId) => {
    if (!robotId || !trajectoryName) return null;
    const robotTrajectories = getRobotTrajectories(robotId);
    return robotTrajectories.get(trajectoryName);
  }, [getRobotTrajectories]);

  // ========== RECORDING FUNCTIONALITY ==========
  
  const startRecording = useCallback((trajectoryName, robotId, options = {}) => {
    if (!robotId || !trajectoryName) {
      console.error('[TrajectoryContext] Robot ID and trajectory name required');
      return false;
    }

    const { interval = 100 } = options;

    // Stop any existing recording for this robot
    if (recordingStates.has(robotId)) {
      stopRecording(robotId);
    }

    console.log(`[TrajectoryContext] Starting recording "${trajectoryName}" for robot ${robotId}`);

    // Create recording state
    const recordingState = {
      trajectoryName,
      robotId,
      interval,
      startTime: Date.now(),
      frames: [],
      endEffectorPath: [],
      isRecording: true
    };

    // Start recording interval
    const intervalId = setInterval(() => {
      recordFrame(robotId);
    }, interval);

    // Store states
    setRecordingStates(prev => new Map(prev).set(robotId, recordingState));
    recordingIntervalsRef.current.set(robotId, intervalId);

    // Emit event
    EventBus.emit('trajectory:recording-started', {
      robotId,
      trajectoryName,
      interval
    });

    return true;
  }, [recordingStates]);

  const recordFrame = useCallback((robotId) => {
    const recordingState = recordingStates.get(robotId);
    if (!recordingState || !recordingState.isRecording) return;

    console.log(`[TrajectoryContext] Recording frame for robot ${robotId}`);

    // This will be called by the hook implementations
    // The actual joint values and end effector data will be passed via events
    EventBus.emit('trajectory:request-frame-data', {
      robotId,
      timestamp: Date.now() - recordingState.startTime
    });
  }, [recordingStates]);

  // Listen for frame data from hooks
  useEffect(() => {
    const handleFrameData = (data) => {
      const { robotId, timestamp, jointValues, endEffectorPosition, endEffectorOrientation } = data;
      
      const recordingState = recordingStates.get(robotId);
      if (!recordingState || !recordingState.isRecording) return;

      // Add frame
      recordingState.frames.push({
        timestamp,
        jointValues: jointValues || {}
      });

      // Add end effector position
      if (endEffectorPosition) {
        recordingState.endEffectorPath.push({
          timestamp,
          position: endEffectorPosition,
          orientation: endEffectorOrientation || { x: 0, y: 0, z: 0, w: 1 }
        });
      }

      // Update recording state
      setRecordingStates(prev => new Map(prev).set(robotId, recordingState));

      // Emit update event
      EventBus.emit('trajectory:recording-update', {
        robotId,
        trajectoryName: recordingState.trajectoryName,
        currentTime: timestamp,
        frameCount: recordingState.frames.length,
        endEffectorPosition
      });

      console.log(`[TrajectoryContext] Recorded frame ${recordingState.frames.length} for ${robotId}`);
    };

    const unsubscribe = EventBus.on('trajectory:frame-data', handleFrameData);
    return () => unsubscribe();
  }, [recordingStates]);

  const stopRecording = useCallback((robotId) => {
    if (!robotId) return null;

    const recordingState = recordingStates.get(robotId);
    if (!recordingState) return null;

    console.log(`[TrajectoryContext] Stopping recording for robot ${robotId}`);

    // Clear interval
    const intervalId = recordingIntervalsRef.current.get(robotId);
    if (intervalId) {
      clearInterval(intervalId);
      recordingIntervalsRef.current.delete(robotId);
    }

    // Create trajectory object
    const trajectory = {
      name: recordingState.trajectoryName,
      robotId: recordingState.robotId,
      frames: recordingState.frames,
      endEffectorPath: recordingState.endEffectorPath,
      duration: Date.now() - recordingState.startTime,
      recordedAt: new Date().toISOString(),
      frameCount: recordingState.frames.length
    };

    // Save trajectory
    setTrajectories(prev => {
      const newMap = new Map(prev);
      if (!newMap.has(robotId)) {
        newMap.set(robotId, new Map());
      }
      newMap.get(robotId).set(trajectory.name, trajectory);
      return newMap;
    });

    // Clear recording state
    setRecordingStates(prev => {
      const newMap = new Map(prev);
      newMap.delete(robotId);
      return newMap;
    });

    // Emit events
    EventBus.emit('trajectory:recording-stopped', {
      robotId,
      trajectory
    });

    console.log(`[TrajectoryContext] Saved trajectory "${trajectory.name}" with ${trajectory.frameCount} frames`);
    return trajectory;
  }, [recordingStates]);

  const isRecording = useCallback((robotId) => {
    if (!robotId) return false;
    const recordingState = recordingStates.get(robotId);
    return recordingState && recordingState.isRecording;
  }, [recordingStates]);

  // ========== PLAYBACK FUNCTIONALITY ==========
  
  const playTrajectory = useCallback((trajectoryName, robotId, options = {}) => {
    if (!robotId || !trajectoryName) {
      console.error('[TrajectoryContext] Robot ID and trajectory name required for playback');
      return false;
    }

    const trajectory = getTrajectory(trajectoryName, robotId);
    if (!trajectory) {
      console.error(`[TrajectoryContext] Trajectory "${trajectoryName}" not found for robot ${robotId}`);
      return false;
    }

    const {
      speed = 1.0,
      loop = false,
      onComplete = () => {},
      onFrame = () => {}
    } = options;

    // Stop any existing playback for this robot
    if (playbackStates.has(robotId)) {
      stopPlayback(robotId);
    }

    console.log(`[TrajectoryContext] Starting playback "${trajectoryName}" for robot ${robotId}`);

    // Create playback state
    const playbackState = {
      trajectory,
      robotId,
      currentFrameIndex: 0,
      startTime: Date.now(),
      speed,
      loop,
      onComplete,
      onFrame,
      isPlaying: true
    };

    setPlaybackStates(prev => new Map(prev).set(robotId, playbackState));

    // Start playback animation
    playbackFrame(robotId);

    // Emit event
    EventBus.emit('trajectory:playback-started', {
      robotId,
      trajectoryName,
      frameCount: trajectory.frames.length
    });

    return true;
  }, [getTrajectory, playbackStates]);

  const playbackFrame = useCallback((robotId) => {
    const playbackState = playbackStates.get(robotId);
    if (!playbackState || !playbackState.isPlaying) return;

    const {
      trajectory,
      startTime,
      speed,
      loop,
      onComplete,
      onFrame
    } = playbackState;

    if (!trajectory || !trajectory.frames || trajectory.frames.length === 0) {
      console.error('[TrajectoryContext] Invalid trajectory data');
      stopPlayback(robotId);
      return;
    }

    const elapsed = (Date.now() - startTime) * speed;
    
    // Find appropriate frame
    let targetFrameIndex = 0;
    for (let i = 0; i < trajectory.frames.length; i++) {
      if (trajectory.frames[i].timestamp <= elapsed) {
        targetFrameIndex = i;
      } else {
        break;
      }
    }

    if (targetFrameIndex < trajectory.frames.length) {
      const frame = trajectory.frames[targetFrameIndex];
      const endEffectorFrame = trajectory.endEffectorPath?.[targetFrameIndex];
      
      // Emit joint values to be applied by hooks
      EventBus.emit('trajectory:apply-frame', {
        robotId,
        frame,
        endEffectorFrame,
        frameIndex: targetFrameIndex
      });

      // Call frame callback
      onFrame(frame, endEffectorFrame);
    }

    // Update progress
    const progress = targetFrameIndex / (trajectory.frames.length - 1);
    
    // Emit progress update
    EventBus.emit('trajectory:playback-update', {
      robotId,
      trajectoryName: trajectory.name,
      progress,
      currentFrame: targetFrameIndex,
      totalFrames: trajectory.frames.length,
      endEffectorPosition: trajectory.endEffectorPath?.[targetFrameIndex]?.position
    });

    // Check if finished
    if (targetFrameIndex >= trajectory.frames.length - 1) {
      if (loop) {
        // Reset for loop
        playbackState.startTime = Date.now();
        playbackState.currentFrameIndex = 0;
      } else {
        // End playback
        stopPlayback(robotId);
        onComplete();
        return;
      }
    }

    // Schedule next frame
    const frameId = requestAnimationFrame(() => playbackFrame(robotId));
    playbackFramesRef.current.set(robotId, frameId);
  }, [playbackStates]);

  const stopPlayback = useCallback((robotId) => {
    if (!robotId) return false;

    const playbackState = playbackStates.get(robotId);
    if (!playbackState) return false;

    console.log(`[TrajectoryContext] Stopping playback for robot ${robotId}`);

    // Cancel animation frame
    const frameId = playbackFramesRef.current.get(robotId);
    if (frameId) {
      cancelAnimationFrame(frameId);
      playbackFramesRef.current.delete(robotId);
    }

    // Clear playback state
    setPlaybackStates(prev => {
      const newMap = new Map(prev);
      newMap.delete(robotId);
      return newMap;
    });

    // Emit event
    EventBus.emit('trajectory:playback-stopped', { robotId });

    return true;
  }, [playbackStates]);

  const isPlaying = useCallback((robotId) => {
    if (!robotId) return false;
    const playbackState = playbackStates.get(robotId);
    return playbackState && playbackState.isPlaying;
  }, [playbackStates]);

  const getPlaybackProgress = useCallback((robotId) => {
    if (!robotId) return 0;
    const playbackState = playbackStates.get(robotId);
    if (!playbackState || !playbackState.trajectory) return 0;
    
    const elapsed = (Date.now() - playbackState.startTime) * playbackState.speed;
    const totalDuration = playbackState.trajectory.duration;
    return Math.min(elapsed / totalDuration, 1);
  }, [playbackStates]);

  // ========== IMPORT/EXPORT FUNCTIONALITY ==========
  
  const exportTrajectory = useCallback((trajectoryName, robotId) => {
    if (!robotId || !trajectoryName) return null;
    
    const trajectory = getTrajectory(trajectoryName, robotId);
    if (!trajectory) return null;
    
    return JSON.stringify(trajectory, null, 2);
  }, [getTrajectory]);

  const importTrajectory = useCallback((jsonData, robotId) => {
    if (!robotId) {
      setError('Robot ID required for import');
      return null;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      const trajectory = JSON.parse(jsonData);
      
      // Validate trajectory data
      if (!trajectory.name || !trajectory.frames) {
        throw new Error('Invalid trajectory format');
      }

      // Update robot ID to current robot
      trajectory.robotId = robotId;
      trajectory.importedAt = new Date().toISOString();

      // Save trajectory
      setTrajectories(prev => {
        const newMap = new Map(prev);
        if (!newMap.has(robotId)) {
          newMap.set(robotId, new Map());
        }
        newMap.get(robotId).set(trajectory.name, trajectory);
        return newMap;
      });

      console.log(`[TrajectoryContext] Imported trajectory "${trajectory.name}" for robot ${robotId}`);
      return trajectory;
    } catch (error) {
      console.error('[TrajectoryContext] Error importing trajectory:', error);
      setError(`Import failed: ${error.message}`);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deleteTrajectory = useCallback((trajectoryName, robotId) => {
    if (!robotId || !trajectoryName) return false;
    
    setTrajectories(prev => {
      const newMap = new Map(prev);
      const robotTrajectories = newMap.get(robotId);
      if (robotTrajectories) {
        robotTrajectories.delete(trajectoryName);
        if (robotTrajectories.size === 0) {
          newMap.delete(robotId);
        }
      }
      return newMap;
    });

    console.log(`[TrajectoryContext] Deleted trajectory "${trajectoryName}" for robot ${robotId}`);
    return true;
  }, []);

  // ========== CLEANUP ==========
  
  useEffect(() => {
    return () => {
      // Cleanup on unmount
      recordingIntervalsRef.current.forEach((intervalId) => {
        clearInterval(intervalId);
      });
      playbackFramesRef.current.forEach((frameId) => {
        cancelAnimationFrame(frameId);
      });
      recordingIntervalsRef.current.clear();
      playbackFramesRef.current.clear();
    };
  }, []);

  // ========== ERROR HANDLING ==========
  
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // ========== CONTEXT VALUE ==========
  
  const value = {
    // State
    trajectories,
    recordingStates,
    playbackStates,
    isLoading,
    error,
    
    // Trajectory Management
    getTrajectoryNames,
    getTrajectory,
    deleteTrajectory,
    
    // Recording
    startRecording,
    stopRecording,
    isRecording,
    
    // Playback
    playTrajectory,
    stopPlayback,
    isPlaying,
    getPlaybackProgress,
    
    // Import/Export
    exportTrajectory,
    importTrajectory,
    
    // Utils
    clearError,
    
    // Computed
    hasTrajectories: (robotId) => {
      const robotTrajectories = trajectories.get(robotId);
      return robotTrajectories && robotTrajectories.size > 0;
    },
    getTrajectoryCount: (robotId) => {
      const robotTrajectories = trajectories.get(robotId);
      return robotTrajectories ? robotTrajectories.size : 0;
    }
  };

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