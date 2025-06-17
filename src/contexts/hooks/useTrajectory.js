// src/contexts/hooks/useTrajectory.js - Direct File System Hook
import { useState, useCallback, useRef, useEffect } from 'react';
import { useJoints } from './useJoints';
import { useTCP } from './useTCP';
import { useRobotManager } from './useRobotManager';
import EventBus from '../../utils/EventBus';

export const useTrajectory = (robotId = null) => {
  const { getJointValues, setJointValues, isAnimating } = useJoints(robotId);
  const { currentEndEffectorPoint, currentEndEffectorOrientation } = useTCP(robotId);
  const { getRobotById, categories } = useRobotManager();
  
  // ========== RECORDING STATE ==========  
  const [isRecording, setIsRecording] = useState(false);
  const [recordingName, setRecordingName] = useState(null);
  const [frameCount, setFrameCount] = useState(0);
  
  // ========== PLAYBACK STATE ==========  
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTrajectory, setCurrentTrajectory] = useState(null);
  const [playbackEndEffectorPoint, setPlaybackEndEffectorPoint] = useState({ x: 0, y: 0, z: 0 });
  const [playbackEndEffectorOrientation, setPlaybackEndEffectorOrientation] = useState({ x: 0, y: 0, z: 0, w: 1 });
  
  // ========== FILE SYSTEM STATE ==========  
  const [availableTrajectories, setAvailableTrajectories] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState(null);
  
  // ========== REFS ==========  
  const recordingDataRef = useRef({
    name: null,
    robotId: null,
    startTime: null,
    frames: [],
    endEffectorPath: []
  });
  const lastFrameTimeRef = useRef(0);
  const playbackStateRef = useRef(null);
  const animationFrameRef = useRef(null);
  
  // ========== ROBOT INFO HELPER ==========  
  const getRobotInfo = useCallback((robotId) => {
    if (!robotId) return { manufacturer: 'unknown', model: 'unknown' };
    
    const baseRobotId = robotId.split('_')[0];
    let manufacturer = 'unknown';
    let model = baseRobotId.toLowerCase();
    
    for (const category of categories || []) {
      if (category.robots?.some(robot => robot.id === baseRobotId)) {
        manufacturer = category.id;
        const fullRobotData = getRobotById(baseRobotId);
        model = fullRobotData?.name?.toLowerCase() || baseRobotId.toLowerCase();
        break;
      }
    }
    
    return { manufacturer, model };
  }, [categories, getRobotById]);
  
  // ========== FILE SYSTEM OPERATIONS ==========  
  const scanTrajectories = useCallback(async () => {
    try {
      setIsScanning(true);
      setError(null);
      
      const response = await fetch('/api/trajectory/scan');
      const result = await response.json();
      
      if (result.success) {
        setAvailableTrajectories(result.trajectories || []);
        console.log(`[useTrajectory] Found ${result.trajectories?.length || 0} trajectories`);
      } else {
        setError(result.message || 'Failed to scan trajectories');
      }
    } catch (error) {
      console.error('[useTrajectory] Error scanning trajectories:', error);
      setError('Failed to scan trajectories');
    } finally {
      setIsScanning(false);
    }
  }, []);
  
  const getRobotTrajectories = useCallback(() => {
    if (!robotId) return [];
    
    const { manufacturer, model } = getRobotInfo(robotId);
    
    return availableTrajectories.filter(traj => 
      traj.manufacturer === manufacturer && traj.model === model
    );
  }, [availableTrajectories, robotId, getRobotInfo]);
  
  // ========== RECORDING IMPLEMENTATION ==========  
  useEffect(() => {
    if (!isRecording || !robotId) return;
    
    const handleJointChange = (data) => {
      if (data.robotId !== robotId) return;
      
      const currentTime = Date.now();
      const elapsed = currentTime - recordingDataRef.current.startTime;
      
      // Throttle to ~60fps
      if (currentTime - lastFrameTimeRef.current < 16) return;
      
      const jointValues = data.values || getJointValues();
      
      // Record frame
      recordingDataRef.current.frames.push({
        timestamp: elapsed,
        jointValues: { ...jointValues }
      });
      
      // Record end effector if available
      if (currentEndEffectorPoint.x !== 0 || 
          currentEndEffectorPoint.y !== 0 || 
          currentEndEffectorPoint.z !== 0) {
        recordingDataRef.current.endEffectorPath.push({
          timestamp: elapsed,
          position: { ...currentEndEffectorPoint },
          orientation: { ...currentEndEffectorOrientation }
        });
      }
      
      lastFrameTimeRef.current = currentTime;
      setFrameCount(recordingDataRef.current.frames.length);
      
      console.log(`[useTrajectory] Recorded frame ${recordingDataRef.current.frames.length} for ${robotId}`);
      
      // Emit frame recorded event
      EventBus.emit('trajectory:frame-recorded', {
        robotId,
        frameCount: recordingDataRef.current.frames.length,
        hasEndEffector: recordingDataRef.current.endEffectorPath.length > 0
      });
    };
    
    const unsubscribe = EventBus.on('robot:joints-changed', handleJointChange);
    return () => unsubscribe();
  }, [isRecording, robotId, getJointValues, currentEndEffectorPoint, currentEndEffectorOrientation]);
  
  const startRecording = useCallback((name) => {
    if (!robotId || isRecording) return false;
    
    console.log(`[useTrajectory] Starting recording "${name}" for robot ${robotId}`);
    
    // Get initial state, ensuring getJointValues is a function
    const initialJoints = typeof getJointValues === 'function' ? getJointValues() : {};
    
    // Initialize recording
    recordingDataRef.current = {
      name,
      robotId,
      startTime: Date.now(),
      frames: [{
        timestamp: 0,
        jointValues: { ...initialJoints }
      }],
      endEffectorPath: [{
        timestamp: 0,
        position: { ...currentEndEffectorPoint },
        orientation: { ...currentEndEffectorOrientation }
      }]
    };
    
    setIsRecording(true);
    setRecordingName(name);
    setFrameCount(1);
    lastFrameTimeRef.current = Date.now();
    
    // Emit recording started event
    EventBus.emit('trajectory:recording-started', {
      robotId,
      trajectoryName: name
    });
    
    return true;
  }, [robotId, isRecording, getJointValues, currentEndEffectorPoint, currentEndEffectorOrientation]);
  
  const stopRecording = useCallback(async () => {
    if (!isRecording) return null;
    
    setIsRecording(false);
    
    const trajectory = {
      ...recordingDataRef.current,
      duration: Date.now() - recordingDataRef.current.startTime,
      frameCount: recordingDataRef.current.frames.length,
      recordedAt: new Date().toISOString()
    };
    
    console.log(`[useTrajectory] Stopped recording with ${trajectory.frameCount} frames`);
    
    // Save trajectory
    try {
      const { manufacturer, model } = getRobotInfo(robotId);
      
      const response = await fetch('/api/trajectory/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manufacturer,
          model,
          name: trajectory.name,
          data: trajectory
        })
      });
      
      if (!response.ok) throw new Error('Failed to save');
      
      console.log(`[useTrajectory] Saved trajectory "${trajectory.name}"`);
      
      // Refresh available trajectories
      await scanTrajectories();
    } catch (error) {
      console.error('[useTrajectory] Save error:', error);
      setError('Failed to save trajectory');
    }
    
    // Emit recording stopped event
    EventBus.emit('trajectory:recording-stopped', {
      robotId,
      trajectoryName: trajectory.name,
      frameCount: trajectory.frameCount
    });
    
    // Reset
    setRecordingName(null);
    setFrameCount(0);
    
    return trajectory;
  }, [isRecording, robotId, getRobotInfo, scanTrajectories]);
  
  // ========== PLAYBACK IMPLEMENTATION ==========  
  const loadTrajectory = useCallback(async (manufacturer, model, name) => {
    try {
      const response = await fetch(`/api/trajectory/load/${manufacturer}/${model}/${name}`);
      const result = await response.json();
      
      if (result.success) {
        return result.trajectory;
      }
      throw new Error(result.message || 'Failed to load');
    } catch (error) {
      console.error('[useTrajectory] Load error:', error);
      setError('Failed to load trajectory');
      return null;
    }
  }, []);
  
  const playTrajectory = useCallback(async (trajectoryInfo, options = {}) => {
    if (!robotId || isPlaying || isAnimating) {
      console.warn('[useTrajectory] Cannot play - robot busy or not ready');
      return false;
    }
    
    const trajectory = await loadTrajectory(
      trajectoryInfo.manufacturer,
      trajectoryInfo.model,
      trajectoryInfo.name
    );
    
    if (!trajectory || !trajectory.frames || trajectory.frames.length === 0) {
      console.error('[useTrajectory] Invalid trajectory');
      return false;
    }
    
    const { speed = 1.0, loop = false, onComplete = () => {}, onFrame = () => {} } = options;
    
    console.log(`[useTrajectory] Starting playback of "${trajectory.name}" for ${robotId}`);
    
    // Initialize playback state
    playbackStateRef.current = {
      trajectory,
      startTime: Date.now(),
      speed,
      loop,
      onComplete,
      onFrame,
      frameIndex: 0,
      isPlaying: true
    };
    
    setIsPlaying(true);
    setCurrentTrajectory(trajectory);
    setProgress(0);
    
    // Emit playback started event
    EventBus.emit('trajectory:playback-started', {
      robotId,
      trajectoryName: trajectory.name,
      frameCount: trajectory.frameCount
    });
    
    // Start playback loop
    const playFrame = () => {
      const state = playbackStateRef.current;
      if (!state || !state.isPlaying) {
        console.log('[useTrajectory] Playback stopped');
        return;
      }
      
      const elapsed = (Date.now() - state.startTime) * state.speed;
      const progress = Math.min(elapsed / state.trajectory.duration, 1);
      
      // Find current frame
      let frameIndex = 0;
      for (let i = 0; i < state.trajectory.frames.length; i++) {
        if (state.trajectory.frames[i].timestamp <= elapsed) {
          frameIndex = i;
        } else {
          break;
        }
      }
      
      // Apply frame if changed
      if (frameIndex !== state.frameIndex && frameIndex < state.trajectory.frames.length) {
        const frame = state.trajectory.frames[frameIndex];
        const endEffectorFrame = state.trajectory.endEffectorPath?.[frameIndex];
        
        // Apply joint values
        const success = setJointValues(frame.jointValues);
        if (success) {
          console.log(`[useTrajectory] Applied frame ${frameIndex}/${state.trajectory.frames.length}`);
          state.frameIndex = frameIndex;
          
          // Update playback end effector state
          if (endEffectorFrame) {
            setPlaybackEndEffectorPoint(endEffectorFrame.position);
            setPlaybackEndEffectorOrientation(endEffectorFrame.orientation);
          } else {
            setPlaybackEndEffectorPoint({ x: 0, y: 0, z: 0 });
            setPlaybackEndEffectorOrientation({ x: 0, y: 0, z: 0, w: 1 });
          }
          
          // Call frame callback
          state.onFrame(frame, endEffectorFrame, progress);
          
          // Emit frame played event
          EventBus.emit('trajectory:frame-played', {
            robotId,
            trajectoryName: state.trajectory.name,
            frameIndex,
            progress,
            hasEndEffector: !!endEffectorFrame
          });
        }
      }
      
      setProgress(progress);
      
      // Check completion
      if (progress >= 1) {
        if (state.loop) {
          // Reset for loop
          state.startTime = Date.now();
          state.frameIndex = 0;
          setProgress(0);
        } else {
          // Complete
          stopPlayback();
          state.onComplete();
          
          // Emit playback completed event
          EventBus.emit('trajectory:playback-completed', {
            robotId,
            trajectoryName: state.trajectory.name
          });
          return;
        }
      }
      
      // Continue
      animationFrameRef.current = requestAnimationFrame(playFrame);
    };
    
    animationFrameRef.current = requestAnimationFrame(playFrame);
    return true;
  }, [robotId, isPlaying, isAnimating, setJointValues, loadTrajectory]);
  
  const stopPlayback = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    if (playbackStateRef.current) {
      playbackStateRef.current.isPlaying = false;
    }
    
    setIsPlaying(false);
    setProgress(0);
    setCurrentTrajectory(null);
    
    // Emit playback stopped event
    if (robotId && currentTrajectory) {
      EventBus.emit('trajectory:playback-stopped', {
        robotId,
        trajectoryName: currentTrajectory.name
      });
    }
    
    console.log('[useTrajectory] Playback stopped');
  }, [robotId, currentTrajectory]);
  
  const deleteTrajectory = useCallback(async (manufacturer, model, name) => {
    try {
      const response = await fetch(`/api/trajectory/delete/${manufacturer}/${model}/${name}`, {
        method: 'DELETE'
      });
      
      const result = await response.json();
      
      if (result.success) {
        console.log(`[useTrajectory] Deleted trajectory: ${name}`);
        await scanTrajectories();
        return true;
      } else {
        setError(result.message || 'Failed to delete trajectory');
        return false;
      }
    } catch (error) {
      console.error('[useTrajectory] Error deleting trajectory:', error);
      setError('Failed to delete trajectory');
      return false;
    }
  }, [scanTrajectories]);
  
  // Add analyzeTrajectory function
  const analyzeTrajectory = useCallback(async (trajectoryInfo) => {
    if (!trajectoryInfo) return null;
    
    try {
      const response = await fetch(`/api/trajectory/analyze/${trajectoryInfo.manufacturer}/${trajectoryInfo.model}/${trajectoryInfo.name}`);
      const result = await response.json();
      
      if (result.success) {
        console.log(`[useTrajectory] Analyzed trajectory: ${trajectoryInfo.name}`);
        return result.analysis;
      } else {
        console.warn(`[useTrajectory] Analysis failed for trajectory: ${trajectoryInfo.name}`);
        return null;
      }
    } catch (error) {
      console.error('[useTrajectory] Error analyzing trajectory:', error);
      return null;
    }
  }, []);
  
  // ========== VISUALIZATION METHODS ==========
  
  const createTrajectoryVisualization = useCallback((pathData) => {
    if (!pathData || !Array.isArray(pathData)) {
      return null;
    }

    const points = pathData.map(p => p.position);
    const colors = [];
    
    // Create gradient colors
    for (let i = 0; i < points.length; i++) {
      const t = i / (points.length - 1);
      colors.push({
        r: 1 - t,
        g: t,
        b: 0.3
      });
    }

    // Create waypoints
    const waypointInterval = Math.max(1, Math.floor(points.length / 10));
    const waypoints = [];
    for (let i = waypointInterval; i < points.length - 1; i += waypointInterval) {
      waypoints.push({
        position: points[i],
        index: i
      });
    }

    return {
      smoothPoints: points,
      colors,
      waypoints,
      startPoint: points[0],
      endPoint: points[points.length - 1],
      bounds: calculateBounds(points)
    };
  }, []);

  const calculateBounds = useCallback((points) => {
    if (!points || points.length === 0) {
      return {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 0, y: 0, z: 0 }
      };
    }

    const bounds = points.reduce((acc, point) => {
      return {
        min: {
          x: Math.min(acc.min.x, point.x),
          y: Math.min(acc.min.y, point.y),
          z: Math.min(acc.min.z, point.z)
        },
        max: {
          x: Math.max(acc.max.x, point.x),
          y: Math.max(acc.max.y, point.y),
          z: Math.max(acc.max.z, point.z)
        }
      };
    }, {
      min: { x: Infinity, y: Infinity, z: Infinity },
      max: { x: -Infinity, y: -Infinity, z: -Infinity }
    });

    return bounds;
  }, []);

  const calculateCameraPosition = useCallback((bounds) => {
    if (!bounds) {
      return {
        position: { x: 2, y: 2, z: 2 },
        target: { x: 0, y: 0, z: 0 }
      };
    }

    const center = {
      x: (bounds.min.x + bounds.max.x) / 2,
      y: (bounds.min.y + bounds.max.y) / 2,
      z: (bounds.min.z + bounds.max.z) / 2
    };

    const size = Math.max(
      bounds.max.x - bounds.min.x,
      bounds.max.y - bounds.min.y,
      bounds.max.z - bounds.min.z
    );

    // Ensure minimum distance even for small trajectories
    const distance = Math.max(size * 2.5, 1);
    
    return {
      position: {
        x: center.x + distance * 0.7,
        y: center.y + distance * 0.7,
        z: center.z + distance * 0.7
      },
      target: center
    };
  }, []);

  const getTrajectoryVisualization = useCallback(async (trajectoryInfo) => {
    if (!trajectoryInfo || !robotId) {
      return null;
    }

    try {
      // Load trajectory data
      const trajectory = await loadTrajectory(
        trajectoryInfo.manufacturer,
        trajectoryInfo.model,
        trajectoryInfo.name
      );
      
      if (!trajectory) {
        console.warn(`[getTrajectoryVisualization] Failed to load trajectory "${trajectoryInfo.name}"`);
        return null;
      }

      const pathData = trajectory.endEffectorPath || [];
      
      // Get analysis
      const analysis = await analyzeTrajectory(trajectoryInfo);
      
      // Create visualization data
      const visualization = createTrajectoryVisualization(pathData);
      
      if (!visualization) {
        return null;
      }

      return {
        trajectoryData: trajectory,
        analysis,
        visualization,
        stats: {
          frameCount: analysis?.frameCount || 0,
          totalDistance: analysis?.endEffectorStats?.totalDistance || 0,
          duration: analysis?.duration / 1000 || 0,
          pathPoints: pathData.length
        }
      };
    } catch (error) {
      console.error('[getTrajectoryVisualization] Error:', error);
      return null;
    }
  }, [robotId, loadTrajectory, analyzeTrajectory, createTrajectoryVisualization]);
  
  // Initialize by scanning trajectories
  useEffect(() => {
    scanTrajectories();
  }, [scanTrajectories]);
  
  // ========== COMPREHENSIVE CLEANUP ON UNMOUNT ==========
  useEffect(() => {
    return () => {
      console.log('[useTrajectory] Cleaning up resources on unmount');
      
      // ✅ Clean up animation frame
      if (animationFrameRef.current) {
        console.log('[useTrajectory] Cancelling animation frame');
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      
      // ✅ Clean up playback state
      if (playbackStateRef.current) {
        console.log('[useTrajectory] Cleaning up playback state');
        playbackStateRef.current.isPlaying = false;
        playbackStateRef.current = null;
      }
      
      // ✅ Clean up recording data
      if (recordingDataRef.current) {
        console.log('[useTrajectory] Cleaning up recording data');
        recordingDataRef.current.frames = [];
        recordingDataRef.current.endEffectorPath = [];
        recordingDataRef.current.name = null;
        recordingDataRef.current.robotId = null;
        recordingDataRef.current.startTime = null;
      }
      
      // ✅ Clean up last frame time
      lastFrameTimeRef.current = 0;
      
      // ✅ Stop any ongoing recording
      if (isRecording) {
        console.log('[useTrajectory] Stopping ongoing recording during cleanup');
        setIsRecording(false);
        setRecordingName(null);
        setFrameCount(0);
      }
      
      // ✅ Stop any ongoing playback
      if (isPlaying) {
        console.log('[useTrajectory] Stopping ongoing playback during cleanup');
        setIsPlaying(false);
        setProgress(0);
        setCurrentTrajectory(null);
      }
      
      // ✅ Clear any errors
      setError(null);
      
      console.log('[useTrajectory] Cleanup completed');
    };
  }, []); // Empty dependency array - only runs on unmount
  
  return {
    // Robot identification
    robotId,
    
    // Recording state
    isRecording,
    recordingName,
    frameCount,
    
    // Playback state
    isPlaying,
    progress,
    currentTrajectory,
    playbackEndEffectorPoint,
    playbackEndEffectorOrientation,
    
    // File system state
    availableTrajectories,
    trajectories: getRobotTrajectories(),
    isScanning,
    
    // Recording methods
    startRecording,
    stopRecording,
    
    // Playback methods
    playTrajectory,
    stopPlayback,
    
    // File system methods
    scanTrajectories,
    deleteTrajectory,
    loadTrajectory,
    analyzeTrajectory,
    
    // Visualization methods
    createTrajectoryVisualization,
    calculateCameraPosition,
    getTrajectoryVisualization,
    
    // Info
    canRecord: !!robotId && !isPlaying,
    canPlay: !!robotId && !isAnimating && !isRecording,
    hasFrames: frameCount > 0,
    hasTrajectories: getRobotTrajectories().length > 0,
    count: getRobotTrajectories().length,
    
    // Error handling
    error,
    clearError: () => setError(null)
  };
};

// Export specialized hooks that use the main hook
export const useTrajectoryRecording = (robotId = null) => {
  const trajectory = useTrajectory(robotId);
  
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

export const useTrajectoryPlayback = (robotId = null) => {
  const trajectory = useTrajectory(robotId);
  
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

export const useTrajectoryManagement = (robotId = null) => {
  const trajectory = useTrajectory(robotId);
  
  return {
    robotId: trajectory.robotId,
    trajectories: trajectory.trajectories,
    deleteTrajectory: trajectory.deleteTrajectory,
    scanTrajectories: trajectory.scanTrajectories,
    hasTrajectories: trajectory.hasTrajectories,
    count: trajectory.count,
    isScanning: trajectory.isScanning,
    
    // Add these missing methods that are needed
    loadTrajectory: trajectory.loadTrajectory,
    analyzeTrajectory: trajectory.analyzeTrajectory,
    
    // You might also want to add for completeness
    error: trajectory.error,
    clearError: trajectory.clearError
  };
};

export const useTrajectoryVisualization = (robotId = null) => {
  const trajectory = useTrajectory(robotId);
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
        console.log('[useTrajectoryVisualization] Loaded visualization with', 
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

export default useTrajectory;