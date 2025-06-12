// src/contexts/hooks/useTrajectory.js - Data Transfer Hook with Joint/TCP Integration
import { useCallback, useEffect, useState } from 'react';
import { useTrajectoryContext } from '../TrajectoryContext';
import { useJoints } from './useJoints';
import { useTCP } from './useTCP';
import { useRobotSelection } from './useRobot';
import EventBus from '../../utils/EventBus';

export const useTrajectory = (robotId = null) => {
  const context = useTrajectoryContext();
  const { activeId: activeRobotId } = useRobotSelection();
  
  // Use provided robotId or fall back to active robot
  const targetRobotId = robotId || activeRobotId;
  
  // Get joint and TCP data for the target robot
  const {
    jointValues,
    setJointValues,
    jointInfo,
    hasJoints
  } = useJoints(targetRobotId);
  
  const {
    currentEndEffectorPoint,
    currentEndEffectorOrientation,
    hasValidEndEffector,
    isUsingTCP,
    getEndEffectorInfo
  } = useTCP(targetRobotId);

  // Local state for UI feedback
  const [lastRecordedFrame, setLastRecordedFrame] = useState(null);
  const [playbackStatus, setPlaybackStatus] = useState('idle'); // idle, playing, paused
  const [currentPlaybackPosition, setCurrentPlaybackPosition] = useState({ x: 0, y: 0, z: 0 });

  // ========== INTEGRATION EFFECTS ==========
  
  // Listen for frame data requests from context and provide joint/TCP data
  useEffect(() => {
    const handleFrameDataRequest = (data) => {
      if (data.robotId !== targetRobotId) return;
      
      console.log(`[useTrajectory] Providing frame data for robot ${targetRobotId}`);
      
      // Get current joint values
      const currentJointValues = jointValues;
      
      // Get current end effector data
      const endEffectorPosition = currentEndEffectorPoint;
      const endEffectorOrientation = currentEndEffectorOrientation;
      
      // Send data back to context
      EventBus.emit('trajectory:frame-data', {
        robotId: targetRobotId,
        timestamp: data.timestamp,
        jointValues: currentJointValues,
        endEffectorPosition,
        endEffectorOrientation
      });
      
      // Update local state for UI feedback
      setLastRecordedFrame({
        timestamp: data.timestamp,
        jointValues: currentJointValues,
        endEffectorPosition,
        endEffectorOrientation,
        frameTime: new Date().toISOString()
      });
    };

    const unsubscribe = EventBus.on('trajectory:request-frame-data', handleFrameDataRequest);
    return () => unsubscribe();
  }, [targetRobotId, jointValues, currentEndEffectorPoint, currentEndEffectorOrientation]);

  // Listen for frame application during playback and apply to robot
  useEffect(() => {
    const handleApplyFrame = (data) => {
      if (data.robotId !== targetRobotId) return;
      
      console.log(`[useTrajectory] Applying frame to robot ${targetRobotId}`);
      
      const { frame, endEffectorFrame } = data;
      
      // Apply joint values using useJoints
      if (frame && frame.jointValues) {
        const success = setJointValues(frame.jointValues);
        if (!success) {
          console.warn(`[useTrajectory] Failed to apply joint values for robot ${targetRobotId}`);
        }
      }
      
      // Update playback position for UI feedback
      if (endEffectorFrame && endEffectorFrame.position) {
        setCurrentPlaybackPosition(endEffectorFrame.position);
      }
    };

    const unsubscribe = EventBus.on('trajectory:apply-frame', handleApplyFrame);
    return () => unsubscribe();
  }, [targetRobotId, setJointValues]);

  // Listen for playback status updates
  useEffect(() => {
    const handlePlaybackStarted = (data) => {
      if (data.robotId === targetRobotId) {
        setPlaybackStatus('playing');
        console.log(`[useTrajectory] Playback started for robot ${targetRobotId}`);
      }
    };

    const handlePlaybackStopped = (data) => {
      if (data.robotId === targetRobotId) {
        setPlaybackStatus('idle');
        setCurrentPlaybackPosition({ x: 0, y: 0, z: 0 });
        console.log(`[useTrajectory] Playback stopped for robot ${targetRobotId}`);
      }
    };

    const handlePlaybackUpdate = (data) => {
      if (data.robotId === targetRobotId && data.endEffectorPosition) {
        setCurrentPlaybackPosition(data.endEffectorPosition);
      }
    };

    const unsubscribeStarted = EventBus.on('trajectory:playback-started', handlePlaybackStarted);
    const unsubscribeStopped = EventBus.on('trajectory:playback-stopped', handlePlaybackStopped);
    const unsubscribeUpdate = EventBus.on('trajectory:playback-update', handlePlaybackUpdate);
    
    return () => {
      unsubscribeStarted();
      unsubscribeStopped();
      unsubscribeUpdate();
    };
  }, [targetRobotId]);

  // ========== ROBOT-SPECIFIC METHODS ==========
  
  const startRecording = useCallback((trajectoryName, options = {}) => {
    if (!targetRobotId) {
      console.warn('[useTrajectory] No robot ID available for recording');
      return false;
    }

    if (!hasJoints) {
      console.warn('[useTrajectory] Robot has no joints to record');
      return false;
    }

    console.log(`[useTrajectory] Starting recording "${trajectoryName}" for robot ${targetRobotId}`);
    
    const success = context.startRecording(trajectoryName, targetRobotId, {
      interval: options.interval || 100,
      ...options
    });

    if (success) {
      setLastRecordedFrame(null); // Reset frame tracking
    }

    return success;
  }, [targetRobotId, hasJoints, context]);

  const stopRecording = useCallback(() => {
    if (!targetRobotId) return null;
    
    console.log(`[useTrajectory] Stopping recording for robot ${targetRobotId}`);
    
    const trajectory = context.stopRecording(targetRobotId);
    if (trajectory) {
      setLastRecordedFrame(null); // Clear frame tracking
    }
    
    return trajectory;
  }, [targetRobotId, context]);

  const playTrajectory = useCallback((trajectoryName, options = {}) => {
    if (!targetRobotId) {
      console.warn('[useTrajectory] No robot ID available for playback');
      return false;
    }

    if (!hasJoints) {
      console.warn('[useTrajectory] Robot has no joints for playback');
      return false;
    }

    console.log(`[useTrajectory] Playing trajectory "${trajectoryName}" for robot ${targetRobotId}`);
    
    return context.playTrajectory(trajectoryName, targetRobotId, {
      onComplete: () => {
        setPlaybackStatus('idle');
        setCurrentPlaybackPosition({ x: 0, y: 0, z: 0 });
        if (options.onComplete) options.onComplete();
      },
      onFrame: (frame, endEffectorFrame) => {
        if (options.onFrame) options.onFrame(frame, endEffectorFrame);
      },
      ...options
    });
  }, [targetRobotId, hasJoints, context]);

  const stopPlayback = useCallback(() => {
    if (!targetRobotId) return false;
    
    console.log(`[useTrajectory] Stopping playback for robot ${targetRobotId}`);
    
    const success = context.stopPlayback(targetRobotId);
    if (success) {
      setPlaybackStatus('idle');
      setCurrentPlaybackPosition({ x: 0, y: 0, z: 0 });
    }
    
    return success;
  }, [targetRobotId, context]);

  // ========== DATA GETTERS ==========
  
  const getTrajectories = useCallback(() => {
    if (!targetRobotId) return [];
    return context.getTrajectoryNames(targetRobotId);
  }, [targetRobotId, context]);

  const getTrajectory = useCallback((trajectoryName) => {
    if (!targetRobotId) return null;
    return context.getTrajectory(trajectoryName, targetRobotId);
  }, [targetRobotId, context]);

  const exportTrajectory = useCallback((trajectoryName) => {
    if (!targetRobotId) return null;
    return context.exportTrajectory(trajectoryName, targetRobotId);
  }, [targetRobotId, context]);

  const importTrajectory = useCallback((jsonData) => {
    if (!targetRobotId) return null;
    return context.importTrajectory(jsonData, targetRobotId);
  }, [targetRobotId, context]);

  const deleteTrajectory = useCallback((trajectoryName) => {
    if (!targetRobotId) return false;
    return context.deleteTrajectory(trajectoryName, targetRobotId);
  }, [targetRobotId, context]);

  // ========== STATE CHECKS ==========
  
  const isRecording = useCallback(() => {
    if (!targetRobotId) return false;
    return context.isRecording(targetRobotId);
  }, [targetRobotId, context]);

  const isPlaying = useCallback(() => {
    if (!targetRobotId) return false;
    return context.isPlaying(targetRobotId);
  }, [targetRobotId, context]);

  const getPlaybackProgress = useCallback(() => {
    if (!targetRobotId) return 0;
    return context.getPlaybackProgress(targetRobotId);
  }, [targetRobotId, context]);

  const hasTrajectories = useCallback(() => {
    if (!targetRobotId) return false;
    return context.hasTrajectories(targetRobotId);
  }, [targetRobotId, context]);

  const getTrajectoryCount = useCallback(() => {
    if (!targetRobotId) return 0;
    return context.getTrajectoryCount(targetRobotId);
  }, [targetRobotId, context]);

  // ========== ENHANCED TRAJECTORY ANALYSIS ==========
  
  const analyzeTrajectory = useCallback((trajectoryName) => {
    const trajectory = getTrajectory(trajectoryName);
    if (!trajectory) return null;

    const analysis = {
      name: trajectory.name,
      robotId: trajectory.robotId,
      frameCount: trajectory.frames.length,
      duration: trajectory.duration,
      
      // Joint analysis
      jointStats: {},
      
      // End effector analysis
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

    // Analyze joints
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

    // Analyze end effector path
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
            const velocity = distance / (timeDelta / 1000); // m/s
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

  // ========== RETURN OBJECT ==========
  
  return {
    // Robot identification
    robotId: targetRobotId,
    
    // Recording state and controls
    isRecording: isRecording(),
    startRecording,
    stopRecording,
    lastRecordedFrame,
    
    // Playback state and controls
    isPlaying: isPlaying(),
    playbackStatus,
    playTrajectory,
    stopPlayback,
    getPlaybackProgress: getPlaybackProgress(),
    currentPlaybackPosition,
    
    // Trajectory management
    trajectories: getTrajectories(),
    getTrajectory,
    deleteTrajectory,
    hasTrajectories: hasTrajectories(),
    trajectoryCount: getTrajectoryCount(),
    
    // Import/Export
    exportTrajectory,
    importTrajectory,
    
    // Analysis
    analyzeTrajectory,
    
    // Robot capabilities
    hasJoints,
    hasValidEndEffector,
    isUsingTCP,
    jointInfo,
    endEffectorInfo: getEndEffectorInfo(),
    
    // Current robot state (for recording context)
    currentJointValues: jointValues,
    currentEndEffectorPosition: currentEndEffectorPoint,
    currentEndEffectorOrientation: currentEndEffectorOrientation,
    
    // Context state
    isLoading: context.isLoading,
    error: context.error,
    clearError: context.clearError,
    
    // State checks
    canRecord: !!(targetRobotId && hasJoints),
    canPlay: !!(targetRobotId && hasJoints),
    isReady: !!(targetRobotId && hasJoints),
    
    // Convenience methods
    resetToOrigin: () => {
      if (hasJoints && jointInfo.length > 0) {
        const resetValues = {};
        jointInfo.forEach(joint => {
          resetValues[joint.name] = 0;
        });
        return setJointValues(resetValues);
      }
      return false;
    }
  };
};

// ========== SPECIALIZED HOOKS ==========

export const useTrajectoryRecording = (robotId = null) => {
  const {
    robotId: targetRobotId,
    isRecording,
    startRecording,
    stopRecording,
    lastRecordedFrame,
    canRecord,
    currentJointValues,
    currentEndEffectorPosition
  } = useTrajectory(robotId);
  
  return {
    robotId: targetRobotId,
    isRecording,
    startRecording,
    stopRecording,
    lastRecordedFrame,
    canRecord,
    currentState: {
      joints: currentJointValues,
      endEffector: currentEndEffectorPosition
    }
  };
};

export const useTrajectoryPlayback = (robotId = null) => {
  const {
    robotId: targetRobotId,
    isPlaying,
    playbackStatus,
    playTrajectory,
    stopPlayback,
    getPlaybackProgress,
    currentPlaybackPosition,
    canPlay
  } = useTrajectory(robotId);
  
  return {
    robotId: targetRobotId,
    isPlaying,
    playbackStatus,
    playTrajectory,
    stopPlayback,
    progress: getPlaybackProgress,
    currentPosition: currentPlaybackPosition,
    canPlay
  };
};

export const useTrajectoryManagement = (robotId = null) => {
  const {
    robotId: targetRobotId,
    trajectories,
    getTrajectory,
    deleteTrajectory,
    hasTrajectories,
    trajectoryCount,
    exportTrajectory,
    importTrajectory,
    analyzeTrajectory
  } = useTrajectory(robotId);
  
  return {
    robotId: targetRobotId,
    trajectories,
    getTrajectory,
    deleteTrajectory,
    hasTrajectories,
    count: trajectoryCount,
    exportTrajectory,
    importTrajectory,
    analyzeTrajectory
  };
};

export default useTrajectory;