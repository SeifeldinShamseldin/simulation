// src/contexts/hooks/useTrajectory.js
// Complete facade hook that aggregates all trajectory-related functionality

import { 
  useTrajectoryContext,
  useTrajectoryRecording as useContextRecording,
  useTrajectoryPlayback as useContextPlayback,
  useTrajectoryManagement as useContextManagement,
  useTrajectoryVisualization as useContextVisualization
} from '../TrajectoryContext';

import { useRobotContext } from '../RobotContext';
import { useRobotManager, useRobotSelection } from './useRobotManager';
import { useJoints } from './useJoints';
import { useTCP } from './useTCP';
import { useAnimationContext } from '../AnimationContext';
import EventBus from '../../utils/EventBus';

/**
 * Complete trajectory hook that provides all functionality needed for trajectory operations
 * Acts as a facade to aggregate data from multiple contexts
 * 
 * @param {string|null} robotIdOverride - Optional robot ID to override context
 * @returns {Object} Complete trajectory API with all necessary data and functions
 */
export const useTrajectory = (robotIdOverride = null) => {
  // Get core trajectory context
  const trajectoryContext = useTrajectoryContext();
  
  // Get robot-related data
  const { activeId: contextRobotId } = useRobotSelection();
  const { getRobot, isRobotLoaded, categories, getRobotById } = useRobotManager();
  const { getRobotTrajectories: getAllRobotTrajectories } = useRobotContext();
  
  // Determine which robot ID to use
  const robotId = robotIdOverride || trajectoryContext.robotId || contextRobotId;
  
  // Get robot instance and state
  const robot = getRobot(robotId);
  const isReady = isRobotLoaded(robotId);
  
  // Get joint control functions
  const { 
    jointValues, 
    updateJoints: updateJoints
  } = useJoints(robotId);
  
  // Get TCP state
  const tcp = useTCP(robotId);
  const { 
    endEffector: { hasValid: hasValidEndEffector, isUsing: isUsingTCP },
    utils: { getCurrentEndEffectorPoint: currentEndEffectorPoint, getCurrentEndEffectorOrientation: currentEndEffectorOrientation },
    tool: { offset: tcpOffset }
  } = tcp;
  
  // Get animation state
  const { isAnimating } = useAnimationContext();
  
  // Get specialized trajectory hooks
  const recording = useContextRecording();
  const playback = useContextPlayback();
  const management = useContextManagement();
  const visualization = useContextVisualization();
  
  // Robot state helpers
  const hasJoints = robot && robot.joints && Object.keys(robot.joints).length > 0;
  const canOperate = isReady && hasJoints && robotId;
  
  // Get robot info for file organization
  const getRobotInfo = () => {
    if (!robotId) return { manufacturer: 'unknown', model: 'unknown' };
    
    const baseRobotId = robotId.split('_')[0];
    let manufacturer = 'unknown';
    let model = baseRobotId.toLowerCase();
    
    for (const category of categories || []) {
      if (category.robots?.some(r => r.id === baseRobotId)) {
        manufacturer = category.id;
        const fullRobotData = getRobotById(baseRobotId);
        model = fullRobotData?.name?.toLowerCase() || baseRobotId.toLowerCase();
        break;
      }
    }
    
    return { manufacturer, model };
  };
  
  // Get current trajectory state
  const getCurrentTrajectoryState = () => {
    const endEffectorPosition = currentEndEffectorPoint;
    const endEffectorOrientation = currentEndEffectorOrientation;
    
    return {
      timestamp: Date.now(),
      jointValues,
      endEffector: {
        position: endEffectorPosition,
        orientation: endEffectorOrientation
      },
      tcpState: {
        isUsing: isUsingTCP,
        hasValid: hasValidEndEffector,
        offset: tcpOffset
      }
    };
  };
  
  // Enhanced recording functions
  const startRecordingWithValidation = (name) => {
    if (!canOperate) {
      console.warn('[useTrajectory] Cannot start recording - robot not ready');
      return false;
    }
    
    if (!name || name.trim() === '') {
      console.warn('[useTrajectory] Recording name is required');
      return false;
    }
    
    // Emit event for other components
    EventBus.emit('trajectory:recording-started', {
      robotId,
      name,
      robotInfo: getRobotInfo()
    });
    
    return recording.startRecording(name);
  };
  
  const stopRecordingWithSave = async () => {
    const result = await recording.stopRecording();
    
    if (result) {
      // Emit completion event
      EventBus.emit('trajectory:recording-stopped', {
        robotId,
        trajectoryName: result.name,
        frameCount: result.frames?.length || 0
      });
      
      // Refresh trajectories list
      await management.scanTrajectories();
    }
    
    return result;
  };
  
  // Enhanced playback functions
  const playTrajectoryWithValidation = async (trajectoryInfo, options = {}) => {
    if (!canOperate) {
      console.warn('[useTrajectory] Cannot play trajectory - robot not ready');
      return false;
    }
    
    if (isAnimating || recording.isRecording) {
      console.warn('[useTrajectory] Cannot play - robot is busy');
      return false;
    }
    
    // Emit start event
    EventBus.emit('trajectory:playback-started', {
      robotId,
      trajectory: trajectoryInfo,
      options
    });
    
    const success = await playback.playTrajectory(trajectoryInfo, options);
    
    if (!success) {
      EventBus.emit('trajectory:playback-failed', {
        robotId,
        trajectory: trajectoryInfo
      });
    }
    
    return success;
  };
  
  const stopPlaybackWithCleanup = () => {
    playback.stopPlayback();
    
    EventBus.emit('trajectory:playback-stopped', {
      robotId,
      progress: playback.progress
    });
  };
  
  // Get filtered trajectories for current robot
  const getRobotTrajectories = () => {
    const { manufacturer, model } = getRobotInfo();
    return management.availableTrajectories.filter(traj => 
      traj.manufacturer === manufacturer && traj.model === model
    );
  };
  
  // Visualization helpers
  const createVisualization = (trajectoryData) => {
    if (!trajectoryData) return null;
    
    const vis = visualization.createTrajectoryVisualization(trajectoryData);
    
    // Add camera bounds calculation
    if (vis && trajectoryData.endEffectorPath) {
      vis.bounds = visualization.calculateBounds(trajectoryData.endEffectorPath);
      vis.cameraPosition = visualization.calculateCameraPosition(vis.bounds);
    }
    
    return vis;
  };
  
  // Return complete API
  return {
    // Robot state
    robotId,
    robot,
    isReady,
    hasJoints,
    canOperate,
    robotInfo: getRobotInfo(),
    
    // Recording API
    recording: {
      isRecording: recording.isRecording,
      canRecord: recording.canRecord && canOperate && !isAnimating,
      recordingName: recording.recordingName,
      frameCount: recording.frameCount,
      startRecording: startRecordingWithValidation,
      stopRecording: stopRecordingWithSave,
      getCurrentState: getCurrentTrajectoryState
    },
    
    // Playback API
    playback: {
      isPlaying: playback.isPlaying,
      canPlay: playback.canPlay && canOperate && !isAnimating,
      progress: playback.progress,
      currentTrajectory: playback.currentTrajectory,
      playbackEndEffectorPoint: playback.playbackEndEffectorPoint,
      playTrajectory: playTrajectoryWithValidation,
      stopPlayback: stopPlaybackWithCleanup
    },
    
    // Management API
    management: {
      trajectories: getRobotTrajectories(),
      allTrajectories: management.availableTrajectories,
      isScanning: management.isScanning,
      scanTrajectories: management.scanTrajectories,
      deleteTrajectory: management.deleteTrajectory,
      analyzeTrajectory: management.analyzeTrajectory,
      count: getRobotTrajectories().length,
      totalCount: management.count
    },
    
    // Joint and TCP state
    joints: {
      values: jointValues,
      update: updateJoints
    },
    
    tcp: {
      hasValidEndEffector,
      isUsingTCP,
      currentPosition: currentEndEffectorPoint,
      currentOrientation: currentEndEffectorOrientation,
      offset: tcpOffset
    },
    
    // Visualization API
    visualization: {
      create: createVisualization,
      calculateBounds: visualization.calculateBounds,
      calculateCameraPosition: visualization.calculateCameraPosition,
      currentVisualization: playback.currentTrajectory ? 
        createVisualization(playback.currentTrajectory) : null
    },
    
    // Animation state
    animation: {
      isAnimating,
      isActive: isAnimating || recording.isRecording || playback.isPlaying
    },
    
    // Error handling
    error: trajectoryContext.error || management.error,
    clearError: trajectoryContext.clearError,
    
    // Status helpers
    status: {
      canRecord: recording.canRecord && canOperate && !isAnimating,
      canPlay: playback.canPlay && canOperate && !isAnimating,
      isBusy: isAnimating || recording.isRecording || playback.isPlaying,
      message: recording.isRecording ? `Recording: ${recording.frameCount} frames` :
               playback.isPlaying ? `Playing: ${Math.round(playback.progress * 100)}%` :
               isAnimating ? 'Animating...' :
               'Ready'
    }
  };
};

// Export as default
export default useTrajectory;