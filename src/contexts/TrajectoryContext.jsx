// src/contexts/TrajectoryContext.jsx - FIXED PLAYBACK CLOSURE ISSUE
import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { useJointContext } from './JointContext';
import EventBus from '../utils/EventBus';

const TrajectoryContext = createContext(null);

export const TrajectoryProvider = ({ children }) => {
  // Only need JointContext for playback
  const { setJointValues, isRobotAnimating } = useJointContext();
  
  // ========== STATE ==========
  const [trajectories, setTrajectories] = useState(new Map()); // Map<robotId, Map<trajectoryName, trajectory>>
  const [recordingStates, setRecordingStates] = useState(new Map()); // Map<robotId, recordingState>
  const [playbackStates, setPlaybackStates] = useState(new Map()); // Map<robotId, playbackState>
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // ========== REFS ==========
  const recordingDataRef = useRef(new Map()); // Map<robotId, { jointData, tcpData }>
  const playbackStatesRef = useRef(new Map()); // FIX: Add ref for playback states
  const playbackFramesRef = useRef(new Map());
  const lastFrameTimeRef = useRef(new Map()); // Map<robotId, lastFrameTimestamp>
  const recordingIntervalsRef = useRef(new Map()); // Map<robotId, intervalId>

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

  // ========== EVENT-DRIVEN RECORDING ==========
  
  // Listen for joint and TCP updates
  useEffect(() => {
    // Handler for joint changes
    const handleJointChange = (data) => {
      const { robotId, jointName, value, allValues } = data;
      
      // Check if we're recording this robot
      const recordingState = recordingStates.get(robotId);
      if (!recordingState || !recordingState.isRecording) return;
      
      console.log(`[TrajectoryContext] Joint update for ${robotId}:`, { jointName, value, allValues });
      
      // Update current joint data for this robot
      if (!recordingDataRef.current.has(robotId)) {
        recordingDataRef.current.set(robotId, { jointData: {}, tcpData: null });
      }
      
      const robotData = recordingDataRef.current.get(robotId);
      
      // Update with all joint values if provided, otherwise update single joint
      if (allValues) {
        robotData.jointData = { ...allValues };
      } else {
        robotData.jointData[jointName] = value;
      }
      
      // Check if we should record this frame (avoid duplicates)
      const currentTime = Date.now() - recordingState.startTime;
      const lastFrameTime = lastFrameTimeRef.current.get(robotId) || 0;
      
      // Only record if enough time has passed (minimum 16ms = ~60fps)
      if (currentTime - lastFrameTime >= 16) {
        // Store frame
        recordingState.frames.push({
          timestamp: currentTime,
          jointValues: { ...robotData.jointData }
        });
        
        // Store end effector frame if available
        if (robotData.tcpData && robotData.tcpData.position) {
          recordingState.endEffectorPath.push({
            timestamp: currentTime,
            position: { ...robotData.tcpData.position },
            orientation: { ...robotData.tcpData.orientation }
          });
        }
        
        recordingState.frameCount = recordingState.frames.length;
        lastFrameTimeRef.current.set(robotId, currentTime);
        
        // Emit frame recorded event
        EventBus.emit('trajectory:frame-recorded', {
          robotId,
          trajectoryName: recordingState.trajectoryName,
          frameCount: recordingState.frameCount,
          hasEndEffector: !!robotData.tcpData
        });
      }
    };
    
    // Handler for TCP updates
    const handleTCPUpdate = (data) => {
      const { robotId, endEffectorPoint, endEffectorOrientation } = data;
      
      // Check if we're recording this robot
      const recordingState = recordingStates.get(robotId);
      if (!recordingState || !recordingState.isRecording) return;
      
      console.log(`[TrajectoryContext] TCP update for ${robotId}:`, { endEffectorPoint, endEffectorOrientation });
      
      // Update current TCP data for this robot
      if (!recordingDataRef.current.has(robotId)) {
        recordingDataRef.current.set(robotId, { jointData: {}, tcpData: null });
      }
      
      const robotData = recordingDataRef.current.get(robotId);
      robotData.tcpData = {
        position: endEffectorPoint,
        orientation: endEffectorOrientation || { x: 0, y: 0, z: 0, w: 1 }
      };
    };
    
    // Subscribe to events
    const unsubscribes = [
      EventBus.on('robot:joint-changed', handleJointChange),
      EventBus.on('robot:joints-changed', handleJointChange),
      EventBus.on('tcp:endeffector-updated', handleTCPUpdate)
    ];
    
    return () => unsubscribes.forEach(unsub => unsub());
  }, [recordingStates]);

  const startRecording = useCallback((trajectoryName, robotId, options = {}) => {
    if (!robotId || !trajectoryName) {
      setError('Invalid recording parameters');
      return false;
    }

    // Stop existing recording for this robot
    stopRecording(robotId);

    console.log(`[TrajectoryContext] Starting recording "${trajectoryName}" for robot ${robotId}`);

    // Initialize recording data storage
    recordingDataRef.current.set(robotId, { jointData: {}, tcpData: null });
    lastFrameTimeRef.current.set(robotId, 0);

    // Create recording state
    const recordingState = {
      trajectoryName,
      robotId,
      startTime: Date.now(),
      frames: [],
      endEffectorPath: [],
      isRecording: true,
      frameCount: 0
    };

    setRecordingStates(prev => new Map(prev).set(robotId, recordingState));

    // Request initial state
    EventBus.emit('trajectory:request-state', { robotId });

    // Emit recording started event
    EventBus.emit('trajectory:recording-started', {
      robotId,
      trajectoryName
    });
    
    return true;
  }, [recordingStates]);

  const stopRecording = useCallback((robotId) => {
    const recordingState = recordingStates.get(robotId);
    if (!recordingState) return null;

    console.log(`[TrajectoryContext] Stopping recording for robot ${robotId}`);

    // Mark as not recording first
    recordingState.isRecording = false;

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

    // Save trajectory only if we have frames
    if (trajectory.frameCount > 0) {
      saveTrajectory(trajectory, robotId);
    }

    // Clear recording state
    setRecordingStates(prev => {
      const newMap = new Map(prev);
      newMap.delete(robotId);
      return newMap;
    });
    
    // Clear recording data
    recordingDataRef.current.delete(robotId);
    lastFrameTimeRef.current.delete(robotId);

    // Emit recording stopped event
    EventBus.emit('trajectory:recording-stopped', {
      robotId,
      trajectoryName: trajectory.name,
      frameCount: trajectory.frameCount
    });

    console.log(`[TrajectoryContext] Saved trajectory "${trajectory.name}" with ${trajectory.frameCount} frames`);
    return trajectory;
  }, [recordingStates, saveTrajectory]);

  // ========== PLAYBACK VIA EVENTS - FIXED ==========
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
      currentFrameIndex: 0,
      lastFrameTime: Date.now()
    };

    // FIX: Store in both state and ref
    setPlaybackStates(prev => new Map(prev).set(robotId, playbackState));
    playbackStatesRef.current.set(robotId, playbackState);
    
    // Emit playback started event
    EventBus.emit('trajectory:playback-started', {
      robotId,
      trajectoryName,
      frameCount: trajectory.frameCount
    });
    
    // FIX: Create playback function with proper closure handling
    const createPlaybackLoop = (robotIdParam) => {
      const playFrame = () => {
        // FIX: Get state from ref instead of state variable
        const state = playbackStatesRef.current.get(robotIdParam);
        if (!state || !state.isPlaying) {
          console.log(`[TrajectoryContext] Playback stopped for ${robotIdParam}`);
          return;
        }

        const currentTime = Date.now();
        const elapsed = (currentTime - state.startTime) * state.speed;
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

        // Apply frame if we have one and enough time has passed
        if (targetFrameIndex < state.trajectory.frames.length && 
            currentTime - state.lastFrameTime >= 16) { // ~60fps
          const frame = state.trajectory.frames[targetFrameIndex];
          const endEffectorFrame = state.trajectory.endEffectorPath?.[targetFrameIndex];
          
          console.log(`[TrajectoryContext] Applying frame ${targetFrameIndex} at progress ${progress.toFixed(2)}`);
          
          // Apply joint values through JointContext
          const applied = setJointValues(robotIdParam, frame.jointValues);
          
          if (applied) {
            // Force TCP recalculation by emitting joint change event
            EventBus.emit('robot:joints-changed', {
              robotId: robotIdParam,
              robotName: robotIdParam,
              values: frame.jointValues
            });
            
            // Call frame callback
            state.onFrame(frame, endEffectorFrame, progress);
            
            // Emit frame played event
            EventBus.emit('trajectory:frame-played', {
              robotId: robotIdParam,
              trajectoryName: state.trajectory.name,
              frameIndex: targetFrameIndex,
              progress,
              hasEndEffector: !!endEffectorFrame
            });

            // Update last frame time
            state.lastFrameTime = currentTime;
            
            // FIX: Update the ref state
            playbackStatesRef.current.set(robotIdParam, state);
          } else {
            console.warn(`[TrajectoryContext] Failed to apply joint values for frame ${targetFrameIndex}`);
          }
        }

        // Check if finished
        if (progress >= 1) {
          if (state.loop) {
            // Reset for loop
            state.startTime = Date.now();
            state.currentFrameIndex = 0;
            state.lastFrameTime = Date.now();
            playbackStatesRef.current.set(robotIdParam, state);
            console.log(`[TrajectoryContext] Looping playback for ${robotIdParam}`);
          } else {
            // End playback
            console.log(`[TrajectoryContext] Playback completed for ${robotIdParam}`);
            const onComplete = state.onComplete;
            stopPlayback(robotIdParam);
            onComplete();
            
            // Emit playback completed event
            EventBus.emit('trajectory:playback-completed', {
              robotId: robotIdParam,
              trajectoryName: state.trajectory.name
            });
            
            return;
          }
        }

        // Schedule next frame
        requestAnimationFrame(playFrame);
      };
      
      return playFrame;
    };

    // Start playback with fixed closure
    const playbackLoop = createPlaybackLoop(robotId);
    requestAnimationFrame(playbackLoop);
    
    return true;
  }, [getTrajectory, isRobotAnimating, setJointValues]);

  const stopPlayback = useCallback((robotId) => {
    const playbackState = playbackStatesRef.current.get(robotId);
    if (!playbackState) return false;

    console.log(`[TrajectoryContext] Stopping playback for robot ${robotId}`);

    // FIX: Clear from both state and ref
    playbackStatesRef.current.delete(robotId);
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
  }, []);

  // ========== STATE QUERIES ==========
  const isRecording = useCallback((robotId) => {
    const recordingState = recordingStates.get(robotId);
    return recordingState && recordingState.isRecording;
  }, [recordingStates]);

  const isPlaying = useCallback((robotId) => {
    // FIX: Check ref instead of state
    const playbackState = playbackStatesRef.current.get(robotId);
    return playbackState && playbackState.isPlaying;
  }, []);

  const getPlaybackProgress = useCallback((robotId) => {
    // FIX: Use ref instead of state
    const playbackState = playbackStatesRef.current.get(robotId);
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

  // ========== CLEANUP ==========
  useEffect(() => {
    return () => {
      // Clear all recording intervals
      if (recordingIntervalsRef.current) {
        recordingIntervalsRef.current.forEach((intervalId) => {
          clearInterval(intervalId);
        });
        recordingIntervalsRef.current.clear();
      }
      
      // Clear all playback animation frames
      playbackStatesRef.current.forEach((state) => {
        if (state.animationFrame) {
          cancelAnimationFrame(state.animationFrame);
        }
      });
      playbackStatesRef.current.clear();
    };
  }, []);

  // ========== CONTEXT VALUE ==========
  const value = {
    // Core Storage
    getTrajectoryNames,
    getTrajectory,
    saveTrajectory,
    deleteTrajectory,
    
    // Recording (event-driven)
    startRecording,
    stopRecording,
    isRecording,
    
    // Playback (event-driven)
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