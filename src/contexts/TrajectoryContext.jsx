// src/contexts/TrajectoryContext.jsx - CLEAN CORE LOGIC ONLY
import React, { createContext, useContext, useState, useRef, useCallback } from 'react';

const TrajectoryContext = createContext(null);

export const TrajectoryProvider = ({ children }) => {
  // ========== CORE STATE ==========
  const [trajectories, setTrajectories] = useState(new Map()); // Map<robotId, Map<trajectoryName, trajectory>>
  const [recordingStates, setRecordingStates] = useState(new Map()); // Map<robotId, recordingState>
  const [playbackStates, setPlaybackStates] = useState(new Map()); // Map<robotId, playbackState>
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Recording intervals and playback frames
  const recordingIntervalsRef = useRef(new Map());
  const playbackFramesRef = useRef(new Map());
  const playbackStatesRef = useRef(new Map()); // 🚨 FIX: Add ref for animation access

  // ========== ROBOT TRAJECTORY STORAGE ==========
  
  const getRobotTrajectories = useCallback((robotId) => {
    if (!trajectories.has(robotId)) {
      setTrajectories(prev => new Map(prev).set(robotId, new Map()));
    }
    return trajectories.get(robotId);
  }, [trajectories]);

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

  // ========== RECORDING LOGIC ==========
  
  const startRecording = useCallback((trajectoryName, robotId, dataCallback, interval = 100) => {
    if (!robotId || !trajectoryName || !dataCallback) {
      setError('Invalid recording parameters');
      return false;
    }

    // Stop existing recording for this robot
    stopRecording(robotId);

    console.log(`[TrajectoryContext] Starting recording "${trajectoryName}" for robot ${robotId}`);

    const recordingState = {
      trajectoryName,
      robotId,
      startTime: Date.now(),
      frames: [],
      endEffectorPath: [],
      isRecording: true,
      dataCallback
    };

    // Start recording interval
    const intervalId = setInterval(() => {
      if (recordingState.isRecording) {
        const currentTime = Date.now() - recordingState.startTime;
        
        // Get data from callback (provided by hook)
        const frameData = dataCallback();
        if (frameData) {
          // Store joint frame
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

    setRecordingStates(prev => new Map(prev).set(robotId, recordingState));
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

    // Create trajectory
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
    saveTrajectory(trajectory, robotId);

    // Clear recording state
    setRecordingStates(prev => {
      const newMap = new Map(prev);
      newMap.delete(robotId);
      return newMap;
    });

    console.log(`[TrajectoryContext] Saved trajectory "${trajectory.name}" with ${trajectory.frameCount} frames`);
    return trajectory;
  }, [recordingStates, saveTrajectory]);

  const isRecording = useCallback((robotId) => {
    const recordingState = recordingStates.get(robotId);
    return recordingState && recordingState.isRecording;
  }, [recordingStates]);

  // ========== PLAYBACK LOGIC ==========
  
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
    console.log(`[TrajectoryContext] Trajectory info:`, {
      frames: trajectory.frames.length,
      duration: trajectory.duration,
      speed: speed,
      firstFrame: trajectory.frames[0],
      lastFrame: trajectory.frames[trajectory.frames.length - 1]
    });

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
    playbackStatesRef.current.set(robotId, playbackState); // 🚨 FIX: Sync with ref
    
    // Start playback animation immediately
    console.log(`[TrajectoryContext] Starting playback animation for ${robotId}`);
    
    // Start playback animation
    const playFrame = () => {
      const state = playbackStatesRef.current.get(robotId); // 🚨 FIX: Use ref instead of state
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
        
        console.log(`[TrajectoryContext] Playing frame ${targetFrameIndex}/${state.trajectory.frames.length}:`, {
          timestamp: frame.timestamp,
          elapsed: elapsed.toFixed(0),
          progress: (progress * 100).toFixed(1) + '%',
          jointValues: frame.jointValues
        });
        
        // 🚨 FIX: Apply frame via callback (provided by hook)
        try {
          state.applyCallback(frame, endEffectorFrame);
          console.log(`[TrajectoryContext] ✅ Successfully applied frame ${targetFrameIndex}`);
        } catch (error) {
          console.error(`[TrajectoryContext] ❌ Error applying frame ${targetFrameIndex}:`, error);
        }
        
        // Call frame callback
        state.onFrame(frame, endEffectorFrame, progress);
      }

      // Check if finished
      if (progress >= 1) {
        if (state.loop) {
          // Reset for loop
          state.startTime = Date.now();
          playbackStatesRef.current.set(robotId, state); // 🚨 FIX: Update ref with new start time
          console.log(`[TrajectoryContext] Looping playback for ${robotId}`);
        } else {
          // End playback
          console.log(`[TrajectoryContext] Playback completed for ${robotId}`);
          
          // Stop playback and call completion callback
          const onComplete = state.onComplete;
          stopPlayback(robotId);
          onComplete();
          return;
        }
      }

      // Schedule next frame
      const frameId = requestAnimationFrame(playFrame);
      playbackFramesRef.current.set(robotId, frameId);
    };

    // Start the first frame
    playFrame();
    
    return true;
  }, [getTrajectory, playbackStates]);

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

    // Clear playback state
    setPlaybackStates(prev => {
      const newMap = new Map(prev);
      newMap.delete(robotId);
      return newMap;
    });
    
    // 🚨 FIX: Also clean up ref
    playbackStatesRef.current.delete(robotId);

    return true;
  }, [playbackStates]);

  const isPlaying = useCallback((robotId) => {
    const playbackState = playbackStatesRef.current.get(robotId); // 🚨 FIX: Use ref for consistency
    return playbackState && playbackState.isPlaying;
  }, []);

  const getPlaybackProgress = useCallback((robotId) => {
    const playbackState = playbackStatesRef.current.get(robotId); // 🚨 FIX: Use ref for consistency
    if (!playbackState || !playbackState.trajectory) return 0;
    
    const elapsed = (Date.now() - playbackState.startTime) * playbackState.speed;
    return Math.min(elapsed / playbackState.trajectory.duration, 1);
  }, []);

  // ========== IMPORT/EXPORT ==========
  
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

  // ========== ANALYSIS ==========
  
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
  
  const hasTrajectories = useCallback((robotId) => {
    const robotTrajectories = trajectories.get(robotId);
    return robotTrajectories && robotTrajectories.size > 0;
  }, [trajectories]);
  
  const getTrajectoryCount = useCallback((robotId) => {
    const robotTrajectories = trajectories.get(robotId);
    return robotTrajectories ? robotTrajectories.size : 0;
  }, [trajectories]);

  // ========== CLEANUP ==========
  
  React.useEffect(() => {
    return () => {
      recordingIntervalsRef.current.forEach(clearInterval);
      playbackFramesRef.current.forEach(cancelAnimationFrame);
      recordingIntervalsRef.current.clear();
      playbackFramesRef.current.clear();
      playbackStatesRef.current.clear(); // 🚨 FIX: Clean up ref too
    };
  }, []);

  // ========== CONTEXT VALUE ==========
  
  const value = {
    // Core Storage
    getTrajectoryNames,
    getTrajectory,
    saveTrajectory,
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
    
    // Analysis
    analyzeTrajectory,
    
    // Utils
    clearError,
    hasTrajectories,
    getTrajectoryCount,
    
    // State
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