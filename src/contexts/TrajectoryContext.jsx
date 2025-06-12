// src/contexts/TrajectoryContext.jsx - OPTIMIZED HYBRID APPROACH
import React, { createContext, useContext, useState, useRef, useCallback } from 'react';

const TrajectoryContext = createContext(null);

export const TrajectoryProvider = ({ children }) => {
  // ========== DIRECT STATE (UI concerns - no EventBus overhead) ==========
  const [trajectories, setTrajectories] = useState(new Map()); // Map<robotId, Map<trajectoryName, trajectory>>
  const [recordingStates, setRecordingStates] = useState(new Map()); // Map<robotId, recordingState>
  const [playbackStates, setPlaybackStates] = useState(new Map()); // Map<robotId, playbackState>
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // ========== EVENTBUS FOR CORE OPERATIONS ONLY ==========
  const recordingIntervalsRef = useRef(new Map());
  const playbackFramesRef = useRef(new Map());
  const playbackStatesRef = useRef(new Map()); // Ref for animation access

  // ========== DIRECT STATE HELPERS (no events) ==========
  const getRobotTrajectories = useCallback((robotId) => {
    if (!trajectories.has(robotId)) {
      setTrajectories(prev => new Map(prev).set(robotId, new Map()));
    }
    return trajectories.get(robotId);
  }, [trajectories]);

  // ========== PURE FUNCTIONS (no EventBus) ==========
  const getTrajectoryNames = useCallback((robotId) => {
    const robotTrajectories = getRobotTrajectories(robotId);
    return Array.from(robotTrajectories.keys());
  }, [getRobotTrajectories]);

  const getTrajectory = useCallback((trajectoryName, robotId) => {
    const robotTrajectories = getRobotTrajectories(robotId);
    return robotTrajectories.get(trajectoryName);
  }, [getRobotTrajectories]);

  const saveTrajectory = useCallback((trajectory, robotId) => {
    setTrajectories(prev => {
      const newMap = new Map(prev);
      if (!newMap.has(robotId)) {
        newMap.set(robotId, new Map());
      }
      newMap.get(robotId).set(trajectory.name, trajectory);
      return newMap;
    });
  }, []);

  const deleteTrajectory = useCallback((trajectoryName, robotId) => {
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
    return true;
  }, []);

  // ========== DIRECT STATE QUERIES (no EventBus) ==========
  const isRecording = useCallback((robotId) => {
    const recordingState = recordingStates.get(robotId);
    return recordingState && recordingState.isRecording;
  }, [recordingStates]);

  const isPlaying = useCallback((robotId) => {
    const playbackState = playbackStatesRef.current.get(robotId);
    return playbackState && playbackState.isPlaying;
  }, []);

  const getPlaybackProgress = useCallback((robotId) => {
    const playbackState = playbackStatesRef.current.get(robotId);
    if (!playbackState || !playbackState.trajectory) return 0;
    
    const elapsed = (Date.now() - playbackState.startTime) * playbackState.speed;
    return Math.min(elapsed / playbackState.trajectory.duration, 1);
  }, []);

  const hasTrajectories = useCallback((robotId) => {
    const robotTrajectories = trajectories.get(robotId);
    return robotTrajectories && robotTrajectories.size > 0;
  }, [trajectories]);

  const getTrajectoryCount = useCallback((robotId) => {
    const robotTrajectories = trajectories.get(robotId);
    return robotTrajectories ? robotTrajectories.size : 0;
  }, [trajectories]);

  // ========== RECORDING: EventBus for data capture, direct state for UI ==========
  const startRecording = useCallback((trajectoryName, robotId, dataCallback, interval = 100) => {
    if (!robotId || !trajectoryName || !dataCallback) {
      setError('Invalid recording parameters');
      return false;
    }

    // Stop existing recording for this robot
    stopRecording(robotId);

    console.log(`[TrajectoryContext] Starting recording "${trajectoryName}" for robot ${robotId}`);

    // Direct state for UI
    const recordingState = {
      trajectoryName,
      robotId,
      startTime: Date.now(),
      frames: [],
      endEffectorPath: [],
      isRecording: true,
      dataCallback
    };

    setRecordingStates(prev => new Map(prev).set(robotId, recordingState));

    // EventBus ONLY for high-frequency data capture
    const intervalId = setInterval(() => {
      if (recordingState.isRecording) {
        const currentTime = Date.now() - recordingState.startTime;
        
        // Get data from callback (provided by hook)
        const frameData = dataCallback();
        if (frameData) {
          // Direct state update (no events)
          recordingState.frames.push({
            timestamp: currentTime,
            jointValues: frameData.jointValues || {}
          });
          
          // Store end effector frame if available
          if (frameData.endEffectorPosition) {
            recordingState.endEffectorPath.push({
              timestamp: currentTime,
              position: frameData.endEffectorPosition,
              orientation: frameData.endEffectorOrientation || { x: 0, y: 0, z: 0, w: 1 }
            });
          }
          
          console.log(`[TrajectoryContext] Recorded frame ${recordingState.frames.length} for ${robotId}`);
        }
      }
    }, interval);

    recordingIntervalsRef.current.set(robotId, intervalId);
    return true;
  }, []);

  const stopRecording = useCallback((robotId) => {
    const recordingState = recordingStates.get(robotId);
    if (!recordingState) return null;

    console.log(`[TrajectoryContext] Stopping recording for robot ${robotId}`);

    // Clear interval
    const intervalId = recordingIntervalsRef.current.get(robotId);
    if (intervalId) {
      clearInterval(intervalId);
      recordingIntervalsRef.current.delete(robotId);
    }

    // Create trajectory (direct state)
    const trajectory = {
      name: recordingState.trajectoryName,
      robotId: recordingState.robotId,
      frames: recordingState.frames,
      endEffectorPath: recordingState.endEffectorPath,
      duration: Date.now() - recordingState.startTime,
      recordedAt: new Date().toISOString(),
      frameCount: recordingState.frames.length
    };

    // Save trajectory (direct state)
    saveTrajectory(trajectory, robotId);

    // Clear recording state (direct state)
    setRecordingStates(prev => {
      const newMap = new Map(prev);
      newMap.delete(robotId);
      return newMap;
    });

    console.log(`[TrajectoryContext] Saved trajectory "${trajectory.name}" with ${trajectory.frameCount} frames`);
    return trajectory;
  }, [recordingStates, saveTrajectory]);

  // ========== PLAYBACK: EventBus for frame application, direct state for UI ==========
  const playTrajectory = useCallback((trajectoryName, robotId, applyCallback, options = {}) => {
    const trajectory = getTrajectory(trajectoryName, robotId);
    if (!trajectory || !applyCallback) {
      setError('Invalid playback parameters');
      return false;
    }

    const { speed = 1.0, loop = false, onComplete = () => {}, onFrame = () => {} } = options;

    // Stop existing playback for this robot
    stopPlayback(robotId);

    console.log(`[TrajectoryContext] Starting playback "${trajectoryName}" for robot ${robotId}`);

    // Direct state for UI
    const playbackState = {
      trajectory,
      robotId,
      startTime: Date.now(),
      speed,
      loop,
      onComplete,
      onFrame,
      applyCallback,
      isPlaying: true
    };

    setPlaybackStates(prev => new Map(prev).set(robotId, playbackState));
    playbackStatesRef.current.set(robotId, playbackState);
    
    // EventBus ONLY for frame application (async timing)
    const playFrame = () => {
      const state = playbackStatesRef.current.get(robotId);
      if (!state || !state.isPlaying) {
        console.log(`[TrajectoryContext] Playback stopped or state missing for ${robotId}`);
        return;
      }

      const elapsed = (Date.now() - state.startTime) * state.speed;
      const totalDuration = state.trajectory.duration;
      const progress = Math.min(elapsed / totalDuration, 1);

      // Find current frame
      let targetFrameIndex = 0;
      for (let i = 0; i < state.trajectory.frames.length; i++) {
        if (state.trajectory.frames[i].timestamp <= elapsed) {
          targetFrameIndex = i;
        } else {
          break;
        }
      }

      if (targetFrameIndex < state.trajectory.frames.length) {
        const frame = state.trajectory.frames[targetFrameIndex];
        const endEffectorFrame = state.trajectory.endEffectorPath?.[targetFrameIndex];
        
        console.log(`[TrajectoryContext] Playing frame ${targetFrameIndex}/${state.trajectory.frames.length}`);
        
        // Apply frame via callback (EventBus alternative)
        try {
          state.applyCallback(frame, endEffectorFrame);
        } catch (error) {
          console.error(`[TrajectoryContext] Error applying frame:`, error);
        }
        
        // Call frame callback (direct function call)
        state.onFrame(frame, endEffectorFrame, progress);
      }

      // Check if finished
      if (progress >= 1) {
        if (state.loop) {
          // Reset for loop (direct state)
          state.startTime = Date.now();
          playbackStatesRef.current.set(robotId, state);
          console.log(`[TrajectoryContext] Looping playback for ${robotId}`);
        } else {
          // End playback (direct state)
          console.log(`[TrajectoryContext] Playback completed for ${robotId}`);
          const onComplete = state.onComplete;
          stopPlayback(robotId);
          onComplete(); // Direct function call
          return;
        }
      }

      // Schedule next frame (EventBus alternative - direct scheduling)
      const frameId = requestAnimationFrame(playFrame);
      playbackFramesRef.current.set(robotId, frameId);
    };

    // Start the first frame
    playFrame();
    return true;
  }, [getTrajectory]);

  const stopPlayback = useCallback((robotId) => {
    const playbackState = playbackStates.get(robotId);
    if (!playbackState) return false;

    console.log(`[TrajectoryContext] Stopping playback for robot ${robotId}`);

    // Cancel animation frame
    const frameId = playbackFramesRef.current.get(robotId);
    if (frameId) {
      cancelAnimationFrame(frameId);
      playbackFramesRef.current.delete(robotId);
    }

    // Clear playback state (direct state)
    setPlaybackStates(prev => {
      const newMap = new Map(prev);
      newMap.delete(robotId);
      return newMap;
    });
    
    playbackStatesRef.current.delete(robotId);
    return true;
  }, [playbackStates]);

  // ========== IMPORT/EXPORT (direct state) ==========
  const exportTrajectory = useCallback((trajectoryName, robotId) => {
    const trajectory = getTrajectory(trajectoryName, robotId);
    if (!trajectory) return null;
    return JSON.stringify(trajectory, null, 2);
  }, [getTrajectory]);

  const importTrajectory = useCallback((jsonData, robotId) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const trajectory = JSON.parse(jsonData);
      
      if (!trajectory.name || !trajectory.frames) {
        throw new Error('Invalid trajectory format');
      }

      trajectory.robotId = robotId;
      trajectory.importedAt = new Date().toISOString();
      
      saveTrajectory(trajectory, robotId);
      return trajectory;
    } catch (error) {
      setError(`Import failed: ${error.message}`);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [saveTrajectory]);

  // ========== ANALYSIS (pure computation) ==========
  const analyzeTrajectory = useCallback((trajectoryName, robotId) => {
    const trajectory = getTrajectory(trajectoryName, robotId);
    if (!trajectory) return null;

    const analysis = {
      name: trajectory.name,
      robotId: trajectory.robotId,
      frameCount: trajectory.frames.length,
      duration: trajectory.duration,
      jointStats: {},
      endEffectorStats: {
        totalDistance: 0,
        maxVelocity: 0,
        averageVelocity: 0,
        bounds: {
          min: { x: Infinity, y: Infinity, z: Infinity },
          max: { x: -Infinity, y: -Infinity, z: -Infinity }
        }
      }
    };

    // Joint analysis
    if (trajectory.frames.length > 0) {
      const jointNames = Object.keys(trajectory.frames[0].jointValues || {});
      
      jointNames.forEach(jointName => {
        const values = trajectory.frames.map(frame => frame.jointValues[jointName] || 0);
        analysis.jointStats[jointName] = {
          min: Math.min(...values),
          max: Math.max(...values),
          range: Math.max(...values) - Math.min(...values),
          final: values[values.length - 1]
        };
      });
    }

    // End effector analysis
    if (trajectory.endEffectorPath && trajectory.endEffectorPath.length > 1) {
      let totalDistance = 0;
      const velocities = [];
      
      for (let i = 0; i < trajectory.endEffectorPath.length; i++) {
        const pos = trajectory.endEffectorPath[i].position;
        
        // Update bounds
        analysis.endEffectorStats.bounds.min.x = Math.min(analysis.endEffectorStats.bounds.min.x, pos.x);
        analysis.endEffectorStats.bounds.min.y = Math.min(analysis.endEffectorStats.bounds.min.y, pos.y);
        analysis.endEffectorStats.bounds.min.z = Math.min(analysis.endEffectorStats.bounds.min.z, pos.z);
        analysis.endEffectorStats.bounds.max.x = Math.max(analysis.endEffectorStats.bounds.max.x, pos.x);
        analysis.endEffectorStats.bounds.max.y = Math.max(analysis.endEffectorStats.bounds.max.y, pos.y);
        analysis.endEffectorStats.bounds.max.z = Math.max(analysis.endEffectorStats.bounds.max.z, pos.z);
        
        // Calculate distance and velocity
        if (i > 0) {
          const prevPos = trajectory.endEffectorPath[i - 1].position;
          const distance = Math.sqrt(
            Math.pow(pos.x - prevPos.x, 2) +
            Math.pow(pos.y - prevPos.y, 2) +
            Math.pow(pos.z - prevPos.z, 2)
          );
          totalDistance += distance;
          
          const timeDelta = trajectory.endEffectorPath[i].timestamp - trajectory.endEffectorPath[i - 1].timestamp;
          if (timeDelta > 0) {
            const velocity = distance / (timeDelta / 1000);
            velocities.push(velocity);
          }
        }
      }
      
      analysis.endEffectorStats.totalDistance = totalDistance;
      analysis.endEffectorStats.maxVelocity = velocities.length > 0 ? Math.max(...velocities) : 0;
      analysis.endEffectorStats.averageVelocity = velocities.length > 0 ? 
        velocities.reduce((sum, v) => sum + v, 0) / velocities.length : 0;
    }

    return analysis;
  }, [getTrajectory]);

  // ========== UTILITY ==========
  const clearError = useCallback(() => setError(null), []);

  // ========== CLEANUP ==========
  React.useEffect(() => {
    return () => {
      recordingIntervalsRef.current.forEach(clearInterval);
      playbackFramesRef.current.forEach(cancelAnimationFrame);
      recordingIntervalsRef.current.clear();
      playbackFramesRef.current.clear();
      playbackStatesRef.current.clear();
    };
  }, []);

  // ========== CONTEXT VALUE (same interface, optimized internals) ==========
  const value = {
    // Core Storage (direct state)
    getTrajectoryNames,
    getTrajectory,
    saveTrajectory,
    deleteTrajectory,
    
    // Recording (hybrid: EventBus for capture, direct state for UI)
    startRecording,
    stopRecording,
    isRecording,
    
    // Playback (hybrid: EventBus for application, direct state for UI)
    playTrajectory,
    stopPlayback,
    isPlaying,
    getPlaybackProgress,
    
    // Import/Export (direct state)
    exportTrajectory,
    importTrajectory,
    
    // Analysis (pure computation)
    analyzeTrajectory,
    
    // Utils (direct state)
    clearError,
    hasTrajectories,
    getTrajectoryCount,
    
    // State (direct state)
    isLoading,
    error
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