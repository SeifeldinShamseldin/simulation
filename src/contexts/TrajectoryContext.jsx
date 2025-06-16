// src/contexts/TrajectoryContext.jsx - Direct File System Save
import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { useJointContext } from './JointContext';
import EventBus from '../utils/EventBus';
import { useRobotManager } from './hooks/useRobotManager';

const TrajectoryContext = createContext(null);

export const TrajectoryProvider = ({ children }) => {
  // Only need JointContext for playback
  const { setJointValues, isRobotAnimating } = useJointContext();
  const { getRobotById, categories } = useRobotManager();
  
  // ========== STATE ==========
  const [recordingStates, setRecordingStates] = useState(new Map()); // Map<robotId, recordingState>
  const [playbackStates, setPlaybackStates] = useState(new Map()); // Map<robotId, playbackState>
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // ========== FILE SYSTEM STATE ==========
  const [availableTrajectories, setAvailableTrajectories] = useState([]);
  const [isScanning, setIsScanning] = useState(false);

  // ========== REFS ==========
  const recordingDataRef = useRef(new Map()); // Map<robotId, { jointData, tcpData }>
  const playbackStatesRef = useRef(new Map()); // FIX: Add ref for playback states
  const lastFrameTimeRef = useRef(new Map()); // Map<robotId, lastFrameTimestamp>

  // ========== FILE SYSTEM OPERATIONS ==========
  const scanTrajectories = useCallback(async () => {
    try {
      setIsScanning(true);
      setError(null);
      
      const response = await fetch('/api/trajectory/scan');
      const result = await response.json();
      
      if (result.success) {
        setAvailableTrajectories(result.trajectories || []);
        console.log(`[TrajectoryContext] Found ${result.trajectories.length} trajectories`);
      } else {
        setError(result.message || 'Failed to scan trajectories');
      }
    } catch (error) {
      console.error('[TrajectoryContext] Error scanning trajectories:', error);
      setError('Failed to scan trajectories');
    } finally {
      setIsScanning(false);
    }
  }, []);

  // Get robot info for file path
  const getRobotInfo = useCallback((robotId) => {
    // Extract the base robot ID (e.g., 'crx10ial' from 'crx10ial_1750085029868')
    const baseRobotId = robotId.split('_')[0];

    // Find the robot's category to get the manufacturer
    let manufacturer = 'unknown';
    let model = baseRobotId.toLowerCase();
    
    for (const category of categories) {
      if (category.robots.some(robot => robot.id === baseRobotId)) {
        manufacturer = category.id;
        const fullRobotData = getRobotById(baseRobotId);
        model = fullRobotData?.name?.toLowerCase() || baseRobotId.toLowerCase();
        break;
      }
    }

    return { manufacturer, model };
  }, [categories, getRobotById]);

  // Save trajectory to file system
  const saveTrajectoryToFile = useCallback(async (trajectory, robotId) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const { manufacturer, model } = getRobotInfo(robotId);
      
      const response = await fetch('/api/trajectory/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          manufacturer,
          model,
          name: trajectory.name,
          data: trajectory
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        console.log(`[TrajectoryContext] Saved trajectory to: ${result.path}`);
        
        // Refresh available trajectories
        await scanTrajectories();
        
    return true;
      } else {
        setError(result.message || 'Failed to save trajectory');
        return false;
      }
    } catch (error) {
      console.error('[TrajectoryContext] Error saving trajectory:', error);
      setError('Failed to save trajectory to file');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [getRobotInfo, scanTrajectories]);

  // Load trajectory from file system
  const loadTrajectoryFromFile = useCallback(async (manufacturer, model, name) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch(`/api/trajectory/load/${manufacturer}/${model}/${name}`);
      const result = await response.json();
      
      if (result.success) {
        console.log(`[TrajectoryContext] Loaded trajectory: ${result.trajectory.name}`);
        return result.trajectory;
      } else {
        setError(result.message || 'Failed to load trajectory');
        return null;
      }
    } catch (error) {
      console.error('[TrajectoryContext] Error loading trajectory:', error);
      setError('Failed to load trajectory from file');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Delete trajectory from file system
  const deleteTrajectoryFromFile = useCallback(async (manufacturer, model, name) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch(`/api/trajectory/delete/${manufacturer}/${model}/${name}`, {
        method: 'DELETE'
      });
      
      const result = await response.json();
      
      if (result.success) {
        console.log(`[TrajectoryContext] Deleted trajectory: ${name}`);
        
        // Refresh available trajectories
        await scanTrajectories();
        
        return true;
      } else {
        setError(result.message || 'Failed to delete trajectory');
        return false;
      }
    } catch (error) {
      console.error('[TrajectoryContext] Error deleting trajectory:', error);
      setError('Failed to delete trajectory from file');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [scanTrajectories]);

  // Get available trajectories for a robot
  const getRobotTrajectories = useCallback((robotId) => {
    if (!robotId) return [];
    
    const { manufacturer, model } = getRobotInfo(robotId);
    
    return availableTrajectories.filter(traj => 
      traj.manufacturer === manufacturer && traj.model === model
    );
  }, [availableTrajectories, getRobotInfo]);

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
  }, []);

  const stopRecording = useCallback(async (robotId) => {
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

    // Clear recording state
    setRecordingStates(prev => {
      const newMap = new Map(prev);
      newMap.delete(robotId);
      return newMap;
    });
    
    // Clear recording data
    recordingDataRef.current.delete(robotId);
    lastFrameTimeRef.current.delete(robotId);

    // Save trajectory to file system if we have frames
    if (trajectory.frameCount > 0) {
      const saved = await saveTrajectoryToFile(trajectory, robotId);
      if (!saved) {
        console.error('[TrajectoryContext] Failed to save trajectory to file');
      }
    }

    // Emit recording stopped event
    EventBus.emit('trajectory:recording-stopped', {
      robotId,
      trajectoryName: trajectory.name,
      frameCount: trajectory.frameCount
    });

    console.log(`[TrajectoryContext] Saved trajectory "${trajectory.name}" with ${trajectory.frameCount} frames`);
    return trajectory;
  }, [recordingStates, saveTrajectoryToFile]);

  // ========== PLAYBACK VIA EVENTS ==========
  const playTrajectory = useCallback(async (trajectoryInfo, robotId, options = {}) => {
    // Load trajectory from file
    const trajectory = await loadTrajectoryFromFile(
      trajectoryInfo.manufacturer,
      trajectoryInfo.model,
      trajectoryInfo.name
    );
    
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

    console.log(`[TrajectoryContext] Starting playback "${trajectory.name}" for robot ${robotId}`);

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

    // Store in both state and ref
    setPlaybackStates(prev => new Map(prev).set(robotId, playbackState));
    playbackStatesRef.current.set(robotId, playbackState);
    
    // Emit playback started event
    EventBus.emit('trajectory:playback-started', {
      robotId,
      trajectoryName: trajectory.name,
      frameCount: trajectory.frameCount
    });
    
    // Create playback function with proper closure handling
    const createPlaybackLoop = (robotIdParam) => {
      const playFrame = () => {
        // Get state from ref instead of state variable
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
            
            // Update the ref state
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
  }, [loadTrajectoryFromFile, isRobotAnimating, setJointValues]);

  const stopPlayback = useCallback((robotId) => {
    const playbackState = playbackStatesRef.current.get(robotId);
    if (!playbackState) return false;

    console.log(`[TrajectoryContext] Stopping playback for robot ${robotId}`);

    // Clear from both state and ref
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
    const playbackState = playbackStatesRef.current.get(robotId);
    return playbackState && playbackState.isPlaying;
  }, []);

  const getPlaybackProgress = useCallback((robotId) => {
    const playbackState = playbackStatesRef.current.get(robotId);
    if (!playbackState || !playbackState.trajectory) return 0;
    
    const elapsed = (Date.now() - playbackState.startTime) * playbackState.speed;
    return Math.min(elapsed / playbackState.trajectory.duration, 1);
  }, []);

  // ========== ANALYSIS ==========
  const analyzeTrajectory = useCallback(async (trajectoryInfo) => {
    try {
      const trajectory = await loadTrajectoryFromFile(
        trajectoryInfo.manufacturer,
        trajectoryInfo.model,
        trajectoryInfo.name
      );
      
      if (!trajectory) return null;

      const analysis = {
        name: trajectory.name,
        robotId: trajectory.robotId,
        frameCount: trajectory.frameCount,
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
    } catch (error) {
      console.error('[TrajectoryContext] Error analyzing trajectory:', error);
      setError('Failed to analyze trajectory');
      return null;
    }
  }, [loadTrajectoryFromFile]);

  // Initialize by scanning trajectories
  useEffect(() => {
    scanTrajectories();
  }, [scanTrajectories]);

  // ========== CLEANUP ==========
  useEffect(() => {
    return () => {
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
    // Recording
    startRecording,
    stopRecording,
    isRecording,
    
    // Playback
    playTrajectory,
    stopPlayback,
    isPlaying,
    getPlaybackProgress,
    
    // File System Operations
    availableTrajectories,
    isScanning,
    scanTrajectories,
    deleteTrajectory: deleteTrajectoryFromFile,
    getRobotTrajectories,
    
    // Analysis
    analyzeTrajectory,
    
    // Utils
    clearError: () => setError(null),
    
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