// src/contexts/hooks/useTrajectory.js - DATA TRANSFER HOOK ONLY
import { useCallback, useState } from 'react';
import { useTrajectoryContext } from '../TrajectoryContext';
import { useJoints } from './useJoints';
import { useTCP } from './useTCP';
import { useRobotSelection } from './useRobot';
import { useRobotControl } from './useRobotControl'; // 🚨 ADD: Direct robot access

export const useTrajectory = (robotId = null) => {
  const context = useTrajectoryContext();
  const { activeId: activeRobotId } = useRobotSelection();
  
  // Use provided robotId or fall back to active robot
  const targetRobotId = robotId || activeRobotId;
  
  // Get joint and TCP data for the target robot
  const {
    jointValues,
    setJointValues,
    setJointValue, // 🚨 ADD: Individual joint setter
    hasJoints,
    getJointValues: getCurrentJointValues // Get the live joint values method
  } = useJoints(targetRobotId);
  
  const {
    currentEndEffectorPoint,
    currentEndEffectorOrientation,
    hasValidEndEffector,
    isUsingTCP
  } = useTCP(targetRobotId);

  // 🚨 ADD: Direct robot control access for both recording and playback
  const { 
    getJointValues: getRobotJointValues,
    setJointValues: setRobotJointValues // 🚨 ADD: For playback fallback
  } = useRobotControl();

  // Local state for UI feedback
  const [lastRecordedFrame, setLastRecordedFrame] = useState(null);
  const [playbackStatus, setPlaybackStatus] = useState({ isPlaying: false, progress: 0 });

  // ========== DATA COLLECTION CALLBACK (for recording) ==========
  
  const getFrameData = useCallback(() => {
    if (!targetRobotId || !hasJoints) return null;
    
    // 🚨 FIX: Try multiple methods to get LIVE joint values
    let liveJointValues = {};
    
    // Method 1: Try useJoints getCurrentJointValues
    if (getCurrentJointValues) {
      liveJointValues = getCurrentJointValues();
      console.log(`[useTrajectory] Got joint values from useJoints:`, liveJointValues);
    }
    
    // Method 2: Fallback to useRobotControl if useJoints failed
    if (!liveJointValues || Object.keys(liveJointValues).length === 0) {
      if (getRobotJointValues) {
        liveJointValues = getRobotJointValues();
        console.log(`[useTrajectory] Got joint values from useRobotControl:`, liveJointValues);
      }
    }
    
    // Method 3: Last resort - use cached jointValues (what was causing the bug)
    if (!liveJointValues || Object.keys(liveJointValues).length === 0) {
      liveJointValues = jointValues || {};
      console.warn(`[useTrajectory] Using cached joint values (may be stale):`, liveJointValues);
    }
    
    console.log(`[useTrajectory] Final joint values for recording:`, liveJointValues);
    
    const frameData = {
      jointValues: liveJointValues,
      endEffectorPosition: hasValidEndEffector ? currentEndEffectorPoint : null,
      endEffectorOrientation: hasValidEndEffector ? currentEndEffectorOrientation : null
    };
    
    // Update UI feedback with live values
    setLastRecordedFrame({
      timestamp: Date.now(),
      jointCount: Object.keys(frameData.jointValues).length,
      hasEndEffector: !!frameData.endEffectorPosition,
      isUsingTCP,
      sampleJoint: Object.values(frameData.jointValues)[0], // Show a sample value for debugging
      allJointValues: frameData.jointValues // Show all values for debugging
    });
    
    return frameData;
  }, [targetRobotId, hasJoints, getCurrentJointValues, getRobotJointValues, jointValues, hasValidEndEffector, currentEndEffectorPoint, currentEndEffectorOrientation, isUsingTCP]);

  // ========== DATA APPLICATION CALLBACK (for playback) ==========
  
  const applyFrameData = useCallback((frame, endEffectorFrame) => {
    if (!targetRobotId || !hasJoints || !frame) {
      console.warn(`[useTrajectory] Cannot apply frame - robotId: ${targetRobotId}, hasJoints: ${hasJoints}, frame: ${!!frame}`);
      return;
    }
    
    // 🚨 FIX: Apply joint values using multiple methods like recording
    if (frame.jointValues && Object.keys(frame.jointValues).length > 0) {
      console.log(`[useTrajectory] Applying joint values for playback:`, frame.jointValues);
      
      // Method 1: Try useJoints setJointValues
      let success = false;
      if (setJointValues) {
        success = setJointValues(frame.jointValues);
        console.log(`[useTrajectory] useJoints.setJointValues result: ${success}`);
      }
      
      // Method 2: Try useRobotControl setJointValues as fallback
      if (!success && setRobotJointValues) {
        try {
          success = setRobotJointValues(frame.jointValues);
          console.log(`[useTrajectory] useRobotControl.setJointValues result: ${success}`);
        } catch (error) {
          console.error(`[useTrajectory] useRobotControl.setJointValues failed:`, error);
        }
      }
      
      // Method 3: Apply individual joint values as last resort
      if (!success) {
        console.log(`[useTrajectory] Applying individual joint values as fallback`);
        let individualSuccess = true;
        Object.entries(frame.jointValues).forEach(([jointName, value]) => {
          try {
            // Try individual joint setting from useJoints
            if (setJointValue) {
              const result = setJointValue(jointName, value);
              console.log(`[useTrajectory] Set ${jointName} = ${value}: ${result}`);
              if (!result) individualSuccess = false;
            }
          } catch (error) {
            console.error(`[useTrajectory] Failed to set joint ${jointName}:`, error);
            individualSuccess = false;
          }
        });
        success = individualSuccess;
      }
      
      if (success) {
        console.log(`[useTrajectory] ✅ Successfully applied joint values to robot ${targetRobotId}`);
      } else {
        console.error(`[useTrajectory] ❌ Failed to apply joint values for robot ${targetRobotId}`);
      }
    }
    
    // Update playback status for UI
    if (endEffectorFrame && endEffectorFrame.position) {
      setPlaybackStatus(prev => ({
        ...prev,
        currentPosition: endEffectorFrame.position
      }));
    }
  }, [targetRobotId, hasJoints, setJointValues, setRobotJointValues, setJointValue]);

  // ========== RECORDING METHODS ==========
  
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
    
    const success = context.startRecording(
      trajectoryName, 
      targetRobotId, 
      getFrameData, // Pass data collection callback
      options.interval || 100
    );

    if (success) {
      setLastRecordedFrame(null);
    }

    return success;
  }, [targetRobotId, hasJoints, context, getFrameData]);

  const stopRecording = useCallback(() => {
    if (!targetRobotId) return null;
    
    const trajectory = context.stopRecording(targetRobotId);
    if (trajectory) {
      setLastRecordedFrame(null);
    }
    
    return trajectory;
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

    if (!hasJoints) {
      console.warn('[useTrajectory] Robot has no joints for playback');
      return false;
    }

    console.log(`[useTrajectory] Playing trajectory "${trajectoryName}" for robot ${targetRobotId}`);
    
    setPlaybackStatus({ isPlaying: true, progress: 0 });
    
    return context.playTrajectory(
      trajectoryName, 
      targetRobotId, 
      applyFrameData, // Pass data application callback
      {
        ...options,
        onComplete: () => {
          setPlaybackStatus({ isPlaying: false, progress: 0 });
          if (options.onComplete) options.onComplete();
        },
        onFrame: (frame, endEffectorFrame, progress) => {
          setPlaybackStatus(prev => ({ ...prev, progress }));
          if (options.onFrame) options.onFrame(frame, endEffectorFrame, progress);
        }
      }
    );
  }, [targetRobotId, hasJoints, context, applyFrameData]);

  const stopPlayback = useCallback(() => {
    if (!targetRobotId) return false;
    
    const success = context.stopPlayback(targetRobotId);
    if (success) {
      setPlaybackStatus({ isPlaying: false, progress: 0 });
    }
    
    return success;
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

  // ========== STATE CHECKS ==========
  
  const hasTrajectories = useCallback(() => {
    if (!targetRobotId) return false;
    return context.hasTrajectories(targetRobotId);
  }, [targetRobotId, context]);

  const getTrajectoryCount = useCallback(() => {
    if (!targetRobotId) return 0;
    return context.getTrajectoryCount(targetRobotId);
  }, [targetRobotId, context]);

  // ========== RETURN COMPLETE INTERFACE ==========
  
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
    getPlaybackProgress: getPlaybackProgress(),
    
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
    
    // Current robot state
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
    isReady: !!(targetRobotId && hasJoints)
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
    canPlay
  } = useTrajectory(robotId);
  
  return {
    robotId: targetRobotId,
    isPlaying,
    playbackStatus,
    playTrajectory,
    stopPlayback,
    progress: getPlaybackProgress,
    currentPosition: playbackStatus.currentPosition || { x: 0, y: 0, z: 0 },
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