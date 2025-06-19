// src/contexts/hooks/useTrajectory.js - Direct File System Hook
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useJoints } from './useJoints';
import { useTCP } from './useTCP';
import { useRobotManager } from './useRobotManager';
import { useJointContext } from '../JointContext';
import EventBus from '../../utils/EventBus';
import { useTrajectoryContext } from '../TrajectoryContext';
import { useRobotSelection } from './useRobotManager';

// Debug utility to reduce console pollution
const DEBUG = process.env.NODE_ENV === 'development';
const log = DEBUG ? console.log : () => {};

export const useTrajectory = () => {
  const context = useTrajectoryContext();
  const { activeId: robotId } = useRobotSelection();
  
  // Get recording and playback states
  const recordingState = context.recordingStates.get(robotId);
  const playbackState = context.playbackStates.get(robotId);
  
  // Simple data getters
  const jointValues = useMemo(() => 
    context.getJointValues(robotId), [context, robotId]);
  
  const isAnimating = useMemo(() => 
    context.isAnimating.get(robotId) || false, [context.isAnimating, robotId]);
  
  const animationProgress = useMemo(() => 
    context.animationProgress.get(robotId) || 0, [context.animationProgress, robotId]);
  
  const isRecording = useMemo(() => 
    context.isRecording(robotId), [context, robotId]);
  
  const isPlaying = useMemo(() => 
    context.isPlaying(robotId), [context, robotId]);
  
  // Get robot trajectories for this robot
  const trajectories = useMemo(() => 
    context.getRobotTrajectories(robotId), [context, robotId]);
      
  // Simple function wrappers that just pass through to context
  const setJointValue = useCallback((jointName, value) => 
    context.setJointValue(robotId, jointName, value), [context, robotId]);
  
  const setJointValues = useCallback((values) => 
    context.setJointValues(robotId, values), [context, robotId]);
      
  const animateJoints = useCallback((targetValues, options) => 
    context.animateWithMotionProfile(robotId, targetValues, options), [context, robotId]);
  
  const playTrajectory = useCallback((trajectoryInfo, options) => 
    context.playTrajectory(trajectoryInfo, robotId, options), [context, robotId]);
  
  const startRecording = useCallback((name) => 
    context.startRecording(name, robotId), [context, robotId]);
  
  const stopRecording = useCallback(() => 
    context.stopRecording(robotId), [context, robotId]);
  
  const stopPlayback = useCallback(() => 
    context.stopPlayback(robotId), [context, robotId]);
  
  const stopAnimation = useCallback(() => 
    context.stopAnimation(robotId), [context, robotId]);
  
  const deleteTrajectory = useCallback((manufacturer, model, name) =>
    context.deleteTrajectoryFromFile(manufacturer, model, name), [context]);
  
  const loadTrajectory = useCallback((manufacturer, model, name) =>
    context.loadTrajectoryFromFile(manufacturer, model, name), [context]);
  
  return {
    // State
    robotId,
    jointValues,
    isAnimating,
    animationProgress,
    isRecording,
    isPlaying,
    
    // Recording state
    recordingName: recordingState?.trajectoryName || null,
    frameCount: recordingState?.frames?.length || 0,
    
    // Playback state
    progress: playbackState ? Math.min((Date.now() - playbackState.startTime) / playbackState.trajectory.duration, 1) : 0,
    currentTrajectory: playbackState?.trajectory || null,
    
    // Functions
    setJointValue,
    setJointValues,
    animateJoints,
    playTrajectory,
    startRecording,
    stopRecording,
    stopPlayback,
    stopAnimation,
    
    // File operations
    scanTrajectories: context.scanTrajectories,
    loadTrajectory,
    analyzeTrajectory: context.analyzeTrajectory,
    deleteTrajectory,
    trajectories,
    hasTrajectories: trajectories.length > 0,
    count: trajectories.length,
    isScanning: context.isScanning,
    error: context.error,
    clearError: context.clearError,
    
    // Robot state
    canRecord: context.isRobotReady(robotId) && !isPlaying && !isAnimating,
    canPlay: context.isRobotReady(robotId) && !isRecording && !isAnimating,
    hasFrames: recordingState?.frames?.length > 0,
    
    // Direct context access for advanced usage
    context,
    getRobotInfo: context.getRobotInfo,
    
    // Visualization
    getTrajectoryVisualization: context.getTrajectoryVisualization,
    calculateCameraPosition: context.calculateCameraPosition
  };
};

export const useTrajectoryVisualization = (robotId = null) => {
  const trajectory = useTrajectory();
  const [visualizationData, setVisualizationData] = useState(null);
  const [isLoadingVis, setIsLoadingVis] = useState(false);
  const [visError, setVisError] = useState(null);
  
  // Load and prepare visualization data
  const loadVisualization = useCallback(async (trajectoryInfo) => {
    if (!trajectoryInfo || !robotId) {
      setVisualizationData(null);
      return null;
    }
    setIsLoadingVis(true);
    setVisError(null);
    try {
      // Use the context method to get visualization data
      const visData = await trajectory.getTrajectoryVisualization(trajectoryInfo);
      if (visData) {
        setVisualizationData(visData);
        log('[useTrajectoryVisualization] Loaded visualization with', 
          visData.visualization?.smoothPoints?.length || 0, 'smooth points');
      } else {
        setVisError('Failed to create visualization data');
      }
      return visData;
    } catch (error) {
      console.error('[useTrajectoryVisualization] Error:', error);
      setVisError(error.message);
      return null;
    } finally {
      setIsLoadingVis(false);
    }
  }, [robotId, trajectory]);
  
  // Clear visualization data
  const clearVisualization = useCallback(() => {
    setVisualizationData(null);
    setVisError(null);
  }, []);
  
  // Get camera configuration for current visualization
  const getCameraConfig = useCallback(() => {
    if (!visualizationData?.visualization?.bounds) {
      return {
        position: { x: 2, y: 2, z: 2 },
        target: { x: 0, y: 0, z: 0 }
      };
    }
    return trajectory.calculateCameraPosition(visualizationData.visualization.bounds);
  }, [visualizationData, trajectory]);
  
  return {
    // State
    visualizationData,
    isLoading: isLoadingVis,
    error: visError,
    
    // Visualization data accessors
    trajectoryPath: visualizationData?.visualization || null,
    smoothPoints: visualizationData?.visualization?.smoothPoints || [],
    pathColors: visualizationData?.visualization?.colors || [],
    startPoint: visualizationData?.visualization?.startPoint || null,
    endPoint: visualizationData?.visualization?.endPoint || null,
    waypoints: visualizationData?.visualization?.waypoints || [],
    bounds: visualizationData?.visualization?.bounds || null,
    
    // Statistics
    stats: visualizationData?.stats || {
      frameCount: 0,
      duration: 0,
      pathPoints: 0,
      totalDistance: 0
    },
    
    // Methods
    loadVisualization,
    clearVisualization,
    getCameraConfig,
    
    // Has valid visualization data
    hasVisualizationData: !!(visualizationData?.visualization?.smoothPoints?.length > 0),
    
    // Access to base trajectory methods
    trajectories: trajectory.trajectories,
    scanTrajectories: trajectory.scanTrajectories
  };
};

export const useTrajectoryManagement = (robotId = null) => {
  const trajectory = useTrajectory();
  return {
    robotId: trajectory.robotId,
    trajectories: trajectory.trajectories,
    deleteTrajectory: trajectory.deleteTrajectory,
    scanTrajectories: trajectory.scanTrajectories,
    hasTrajectories: trajectory.hasTrajectories,
    count: trajectory.count,
    isScanning: trajectory.isScanning,
    loadTrajectory: trajectory.loadTrajectory,
    analyzeTrajectory: trajectory.analyzeTrajectory,
    error: trajectory.error,
    clearError: trajectory.clearError
  };
};

export const useTrajectoryPlayback = (robotId = null) => {
  const trajectory = useTrajectory();
  return {
    robotId: trajectory.robotId,
    isPlaying: trajectory.isPlaying,
    progress: trajectory.progress,
    currentTrajectory: trajectory.currentTrajectory,
    playTrajectory: trajectory.playTrajectory,
    stopPlayback: trajectory.stopPlayback,
    canPlay: trajectory.canPlay,
    playbackEndEffectorPoint: trajectory.playbackEndEffectorPoint,
    playbackEndEffectorOrientation: trajectory.playbackEndEffectorOrientation
  };
};

export const useTrajectoryRecording = (robotId = null) => {
  const trajectory = useTrajectory();
  return {
    robotId: trajectory.robotId,
    isRecording: trajectory.isRecording,
    startRecording: trajectory.startRecording,
    stopRecording: trajectory.stopRecording,
    recordingName: trajectory.recordingName,
    frameCount: trajectory.frameCount,
    canRecord: trajectory.canRecord,
    hasFrames: trajectory.hasFrames
  };
};

export default useTrajectory;