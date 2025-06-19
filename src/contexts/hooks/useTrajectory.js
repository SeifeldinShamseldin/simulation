// Migration hook to maintain compatibility with existing useTrajectory usage
// This allows gradual migration from the old hook to the new context

import { useTrajectoryContext } from '../TrajectoryContext';
import { useRobotContext } from '../RobotContext';
import { useAnimationContext } from '../AnimationContext';

/**
 * Compatibility hook that mirrors the old useTrajectory API
 * but uses the new TrajectoryContext under the hood
 * 
 * @param {string|null} robotId - Optional robot ID to override context
 * @returns {Object} Trajectory API matching the old hook interface
 */
export const useTrajectory = (robotId = null) => {
  const context = useTrajectoryContext();
  const { getRobot } = useRobotContext();
  const { isAnimating } = useAnimationContext();
  
  // If a specific robotId is passed, we need to handle it differently
  // For now, we'll use the context's robotId and log a warning if they differ
  if (robotId && robotId !== context.robotId) {
    console.warn(
      `[useTrajectory] Specified robotId (${robotId}) differs from context robotId (${context.robotId}). ` +
      `Using context robotId. Consider updating to use TrajectoryContext directly.`
    );
  }
  
  // Helper function for getting robot info
  const getRobotInfo = (id) => {
    const robot = getRobot(id || context.robotId);
    if (!robot) {
      return { manufacturer: 'unknown', model: 'unknown' };
    }
    return {
      manufacturer: robot.manufacturer || 'unknown',
      model: robot.model || robot.name || 'unknown'
    };
  };
  
  // Return the same interface as the old useTrajectory hook
  return {
    // State
    robotId: context.robotId,
    isRecording: context.isRecording,
    isPlaying: context.isPlaying,
    isScanning: context.isScanning,
    recordingName: context.recordingName,
    frameCount: context.frameCount,
    progress: context.progress,
    currentTrajectory: context.currentTrajectory,
    playbackEndEffectorPoint: context.playbackEndEffectorPoint,
    playbackEndEffectorOrientation: context.playbackEndEffectorOrientation,
    
    // Recording
    startRecording: context.startRecording,
    stopRecording: context.stopRecording,
    
    // Playback
    playTrajectory: context.playTrajectory,
    stopPlayback: context.stopPlayback,
    
    // File operations
    scanTrajectories: context.scanTrajectories,
    loadTrajectory: context.loadTrajectory,
    deleteTrajectory: context.deleteTrajectory,
    analyzeTrajectory: context.analyzeTrajectory,
    getRobotTrajectories: context.getRobotTrajectories,
    
    // Visualization
    createTrajectoryVisualization: context.createTrajectoryVisualization,
    calculateBounds: context.calculateBounds,
    calculateCameraPosition: context.calculateCameraPosition,
    getTrajectoryVisualization: context.getTrajectoryVisualization,
    
    // Get specific robot info (compatibility method)
    getRobotInfo,
    
    // Computed values
    canRecord: context.canRecord,
    canPlay: context.canPlay,
    hasFrames: context.hasFrames,
    hasTrajectories: context.hasTrajectories,
    count: context.count,
    
    // Error handling
    error: context.error,
    setError: () => {}, // Deprecated - use clearError
    clearError: context.clearError,
    
    // Access to trajectory lists (compatibility)
    trajectories: context.getRobotTrajectories(),
    availableTrajectories: context.availableTrajectories,
    
    // Additional compatibility properties
    isAnimating,
    visualizationData: context.currentTrajectory ? {
      visualization: {
        smoothPoints: context.currentTrajectory.endEffectorPath?.map(p => p.position) || []
      }
    } : null
  };
};

/**
 * Migration helper for usePlaybackTrajectoryLine
 * This functionality is now built into the TrajectoryContext
 */
export const usePlaybackTrajectoryLine = (robotId = null) => {
  // The line visualization is now handled automatically by TrajectoryContext
  // This hook is kept for compatibility but doesn't need to do anything
  return null;
};

// Export the specialized hooks from TrajectoryContext for convenience
export {
  useTrajectoryRecording,
  useTrajectoryPlayback,
  useTrajectoryManagement,
  useTrajectoryVisualization
} from '../TrajectoryContext';

export default useTrajectory;