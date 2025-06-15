// src/contexts/TrajectoryContext.jsx - REWRITTEN FOR NEW ARCHITECTURE
import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { useRobotContext } from './RobotContext';
import { useJointContext } from './JointContext';
import { useTCPContext } from './TCPContext';
import EventBus from '../utils/EventBus';

const TrajectoryContext = createContext(null);

export const TrajectoryProvider = ({ children }) => {
  // Get access to joints and TCP systems
  const { activeRobotId } = useRobotContext();
  const { getJointValues, setJointValues, isRobotAnimating } = useJointContext();
  const { getCurrentEndEffectorPoint, getCurrentEndEffectorOrientation, recalculateEndEffector } = useTCPContext();
  
  // ========== STATE ==========
  const [trajectories, setTrajectories] = useState(new Map()); // Map<robotId, Map<trajectoryName, trajectory>>
  const [recordingStates, setRecordingStates] = useState(new Map()); // Map<robotId, recordingState>
  const [playbackStates, setPlaybackStates] = useState(new Map()); // Map<robotId, playbackState>
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // ========== REFS ==========
  const recordingIntervalsRef = useRef(new Map());
  const playbackFramesRef = useRef(new Map());

  // ========== TRAJECTORY STORAGE ==========
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

  // ========== RECORDING: Direct data capture from hooks ==========
  const captureFrameData = useCallback((robotId) => {
    // Get joint values directly from JointContext
    const jointValues = getJointValues(robotId);
    
    // Get end effector data directly from TCPContext
    const endEffectorPosition = getCurrentEndEffectorPoint(robotId);
    const endEffectorOrientation = getCurrentEndEffectorOrientation(robotId);
    
    // Validate we have data
    const hasValidJoints = jointValues && Object.keys(jointValues).length > 0;
    const hasValidEndEffector = endEffectorPosition && 
      (endEffectorPosition.x !== 0 || endEffectorPosition.y !== 0 || endEffectorPosition.z !== 0);
    
    if (!hasValidJoints) {
      console.warn(`[TrajectoryContext] No joint data for robot ${robotId}`);
      return null;
    }
    
    return {
      jointValues,
      endEffectorPosition: hasValidEndEffector ? endEffectorPosition : null,
      endEffectorOrientation: hasValidEndEffector ? endEffectorOrientation : null
    };
  }, [getJointValues, getCurrentEndEffectorPoint, getCurrentEndEffectorOrientation]);

  const startRecording = useCallback((trajectoryName, robotId, options = {}) => {
    if (!robotId || !trajectoryName) {
      setError('Invalid recording parameters');
      return false;
    }

    const interval = options.interval || 100;

    // Stop existing recording for this robot
    stopRecording(robotId);

    console.log(`[TrajectoryContext] Starting recording "${trajectoryName}" for robot ${robotId}`);

    // Create recording state
    const recordingState = {
      trajectoryName,
      robotId,
      startTime: Date.now(),
      frames: [],
      endEffectorPath: [],
      isRecording: true
    };

    setRecordingStates(prev => new Map(prev).set(robotId, recordingState));

    // Set up recording interval
    const intervalId = setInterval(() => {
      const state = recordingStates.get(robotId);
      if (!state || !state.isRecording) {
        clearInterval(intervalId);
        recordingIntervalsRef.current.delete(robotId);
        return;
      }

      const currentTime = Date.now() - state.startTime;
      
      // Capture data directly from hooks
      const frameData = captureFrameData(robotId);
      
      if (frameData && frameData.jointValues) {
        // Store joint frame
        state.frames.push({
          timestamp: currentTime,
          jointValues: frameData.jointValues
        });
        
        // Store end effector frame if available
        if (frameData.endEffectorPosition) {
          state.endEffectorPath.push({
            timestamp: currentTime,
            position: frameData.endEffectorPosition,
            orientation: frameData.endEffectorOrientation || { x: 0, y: 0, z: 0, w: 1 }
          });
        }
        
        // Emit recording update event
        EventBus.emit('trajectory:frame-recorded', {
          robotId,
          trajectoryName,
          frameCount: state.frames.length,
          hasEndEffector: !!frameData.endEffectorPosition
        });
      }
    }, interval);

    recordingIntervalsRef.current.set(robotId, intervalId);
    
    // Emit recording started event
    EventBus.emit('trajectory:recording-started', {
      robotId,
      trajectoryName
    });
    
    return true;
  }, [captureFrameData, recordingStates]);

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

    // Emit recording stopped event
    EventBus.emit('trajectory:recording-stopped', {
      robotId,
      trajectoryName: trajectory.name,
      frameCount: trajectory.frameCount
    });

    console.log(`[TrajectoryContext] Saved trajectory "${trajectory.name}" with ${trajectory.frameCount} frames`);
    return trajectory;
  }, [recordingStates, saveTrajectory]);

  // ========== PLAYBACK: Direct control via hooks ==========
  const applyFrameData = useCallback((robotId, frame) => {
    if (!frame || !frame.jointValues) return false;
    
    // Apply joint values directly through JointContext
    const success = setJointValues(robotId, frame.jointValues);
    
    if (success) {
      // Force TCP recalculation after joint update
      setTimeout(() => {
        recalculateEndEffector(robotId);
      }, 10);
    }
    
    return success;
  }, [setJointValues, recalculateEndEffector]);

  const playTrajectory = useCallback((trajectoryName, robotId, options = {}) => {
    const trajectory = getTrajectory(trajectoryName, robotId);
    if (!trajectory || !trajectory.frames || trajectory.frames.length === 0) {
      setError('Invalid trajectory or no frames to play');
      return false;
    }

    // Check if robot is animating
    if (isRobotAnimating(robotId)) {
      setError('Robot is currently animating');
      return false;
    }

    const { speed = 1.0, loop = false, onComplete = () => {}, onFrame = () => {} } = options;

    // Stop existing playback for this robot
    stopPlayback(robotId);

    console.log(`[TrajectoryContext] Starting playback "${trajectoryName}" for robot ${robotId}`);

    // Create playback state
    const playbackState = {
      trajectory,
      robotId,
      startTime: Date.now(),
      speed,
      loop,
      onComplete,
      onFrame,
      isPlaying: true,
      currentFrameIndex: 0
    };

    setPlaybackStates(prev => new Map(prev).set(robotId, playbackState));
    
    // Emit playback started event
    EventBus.emit('trajectory:playback-started', {
      robotId,
      trajectoryName,
      frameCount: trajectory.frameCount
    });
    
    // Playback loop
    const playFrame = () => {
      const state = playbackStates.get(robotId);
      if (!state || !state.isPlaying) {
        console.log(`[TrajectoryContext] Playback stopped for ${robotId}`);
        return;
      }

      const elapsed = (Date.now() - state.startTime) * state.speed;
      const totalDuration = state.trajectory.duration;
      const progress = Math.min(elapsed / totalDuration, 1);

      // Find current frame based on timestamp
      let targetFrameIndex = 0;
      for (let i = 0; i < state.trajectory.frames.length; i++) {
        if (state.trajectory.frames[i].timestamp <= elapsed) {
          targetFrameIndex = i;
        } else {
          break;
        }
      }

      // Apply frame if we have one
      if (targetFrameIndex < state.trajectory.frames.length) {
        const frame = state.trajectory.frames[targetFrameIndex];
        const endEffectorFrame = state.trajectory.endEffectorPath?.[targetFrameIndex];
        
        // Apply joint values through hooks
        const applied = applyFrameData(robotId, frame);
        
        if (applied) {
          // Call frame callback
          state.onFrame(frame, endEffectorFrame, progress);
          
          // Emit frame played event
          EventBus.emit('trajectory:frame-played', {
            robotId,
            trajectoryName: state.trajectory.name,
            frameIndex: targetFrameIndex,
            progress,
            hasEndEffector: !!endEffectorFrame
          });
        }
      }

      // Check if finished
      if (progress >= 1) {
        if (state.loop) {
          // Reset for loop
          state.startTime = Date.now();
          state.currentFrameIndex = 0;
          console.log(`[TrajectoryContext] Looping playback for ${robotId}`);
        } else {
          // End playback
          console.log(`[TrajectoryContext] Playback completed for ${robotId}`);
          const onComplete = state.onComplete;
          stopPlayback(robotId);
          onComplete();
          
          // Emit playback completed event
          EventBus.emit('trajectory:playback-completed', {
            robotId,
            trajectoryName: state.trajectory.name
          });
          
          return;
        }
      }

      // Schedule next frame
      requestAnimationFrame(playFrame);
    };

    // Start playback
    requestAnimationFrame(playFrame);
    return true;
  }, [getTrajectory, isRobotAnimating, playbackStates, applyFrameData]);

  const stopPlayback = useCallback((robotId) => {
    const playbackState = playbackStates.get(robotId);
    if (!playbackState) return false;

    console.log(`[TrajectoryContext] Stopping playback for robot ${robotId}`);

    // Clear playback state
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
  }, [playbackStates]);

  // ========== STATE QUERIES ==========
  const isRecording = useCallback((robotId) => {
    const recordingState = recordingStates.get(robotId);
    return recordingState && recordingState.isRecording;
  }, [recordingStates]);

  const isPlaying = useCallback((robotId) => {
    const playbackState = playbackStates.get(robotId);
    return playbackState && playbackState.isPlaying;
  }, [playbackStates]);

  const getPlaybackProgress = useCallback((robotId) => {
    const playbackState = playbackStates.get(robotId);
    if (!playbackState || !playbackState.trajectory) return 0;
    
    const elapsed = (Date.now() - playbackState.startTime) * playbackState.speed;
    return Math.min(elapsed / playbackState.trajectory.duration, 1);
  }, [playbackStates]);

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

  // ========== CLEANUP ==========
  useEffect(() => {
    return () => {
      // Clear all intervals
      recordingIntervalsRef.current.forEach(clearInterval);
      recordingIntervalsRef.current.clear();
    };
  }, []);

  // ========== CONTEXT VALUE ==========
  const value = {
    // Core Storage
    getTrajectoryNames,
    getTrajectory,
    saveTrajectory,
    deleteTrajectory,
    
    // Recording (now uses hooks directly)
    startRecording,
    stopRecording,
    isRecording,
    
    // Playback (now uses hooks directly)
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
    clearError: () => setError(null),
    hasTrajectories: (robotId) => {
      const robotTrajectories = trajectories.get(robotId);
      return robotTrajectories && robotTrajectories.size > 0;
    },
    getTrajectoryCount: (robotId) => {
      const robotTrajectories = trajectories.get(robotId);
      return robotTrajectories ? robotTrajectories.size : 0;
    },
    
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